"""
Cloudflare R2 이미지 저장소 (S3 호환 API)

프로필 사진과 기록 카드 이미지를 비공개 버킷 하나에 폴더로 나눠 둔다. 얼굴이 담길 수 있는 사진이라
링크만 알면 누구나 볼 수 있는 공개 버킷은 쓰지 않는다. 둘 다 비공개이고 같은 서버가 다루므로
버킷을 나눠도 얻는 것이 없다.

프로필 사진과 기록 카드는 서버를 거쳐 올린다.
  올리기: 서버가 요청 본문 크기와 실제 이미지 디코딩을 확인 → avatars/ 또는 record-cards/에 저장
  보기:   서버가 짧게 유효한 사전 서명 GET URL을 응답에 넣어 줌

presign_upload()와 promote()는 공용 임시 업로드 유틸리티로 남겨 둔다.
프로필 사진·기록 카드 API와 check_r2는 서버에서 put()으로 저장한다.

사전 서명 URL은 만료 전까지 여러 번 쓸 수 있다. 올린 키를 그대로 저장하면 검증한 뒤에도 같은 URL로
덮어쓸 수 있으므로, 업로드 URL은 임시 키에만 발급하고 최종 키에는 서버만 쓴다. 복사할 때 head()로 읽은
ETag를 조건으로 걸어, 검증과 복사 사이에 바뀐 파일은 복사하지 않는다. 남은 임시 파일은 버킷 수명 주기
규칙(uploads/ 접두어, 1일 뒤 삭제)이 치운다.

키는 "{폴더}/{user_id}/{난수}.{확장자}"로 만든다. 회원 탈퇴 때 delete_user_objects()로 폴더마다
그 사용자의 파일을 한 번에 지우기 위해서다.
"""

import uuid
from dataclasses import dataclass
from enum import Enum
from functools import lru_cache
from io import BytesIO

import boto3
from botocore.client import Config
from botocore.exceptions import BotoCoreError, ClientError
from PIL import Image, UnidentifiedImageError

from ..core.config import settings

# 올릴 수 있는 이미지 형식과 저장할 확장자.
IMAGE_EXTENSIONS = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
}

# 업로드 URL은 발급 직후 바로 쓰므로 짧게 둔다.
UPLOAD_URL_EXPIRES_SECONDS = 5 * 60
# 보기 URL은 페이지를 켜 둔 동안 이미지가 깨지지 않을 만큼 둔다. 만료되면 화면이 기본 이미지로 대체한다.
DOWNLOAD_URL_EXPIRES_SECONDS = 60 * 60
# 브라우저 자르기 결과와 같은 크기만 받아, 작은 압축 파일이 디코딩 때 큰 메모리를 차지하지 못하게 한다.
AVATAR_IMAGE_SIZE = (512, 512)
# 현재 카드의 최대 캔버스는 1080×1920. 디코딩 전에 메모리 사용량을 제한한다.
MAX_CARD_IMAGE_PIXELS = 4_000_000


def decoded_card_content_type(data: bytes) -> str | None:
    """카드의 실제 형식·픽셀 수·전체 디코딩을 확인한다. 애니메이션은 받지 않는다."""
    formats = {"JPEG": "image/jpeg", "PNG": "image/png", "WEBP": "image/webp"}
    try:
        with Image.open(BytesIO(data)) as image:
            content_type = formats.get(image.format or "")
            if (content_type is None or image.width * image.height > MAX_CARD_IMAGE_PIXELS
                    or getattr(image, "n_frames", 1) != 1):
                return None
            image.verify()
        with Image.open(BytesIO(data)) as image:
            image.load()
        return content_type
    except (Image.DecompressionBombError, Image.DecompressionBombWarning,
            UnidentifiedImageError, OSError, SyntaxError, ValueError):
        return None


class Folder(Enum):
    # 브라우저가 올리는 임시 폴더. 검증 전 파일이라 화면에 쓰지 않는다.
    UPLOAD = "uploads"
    AVATAR = "avatars"
    RECORD_CARD = "record-cards"


class StorageError(Exception):
    """R2 요청이 실패했다. 설정 오류이거나 R2 쪽 문제다."""


class UploadChangedError(StorageError):
    """검증한 뒤 임시 파일이 바뀌었거나 사라져 최종 키로 옮기지 않았다."""


@dataclass(frozen=True)
class ObjectInfo:
    size: int
    content_type: str
    etag: str


def is_configured() -> bool:
    return bool(
        settings.r2_account_id
        and settings.r2_access_key_id
        and settings.r2_secret_access_key
        and settings.r2_bucket
    )


@lru_cache(maxsize=1)
def _client():
    return boto3.client(
        "s3",
        endpoint_url=f"https://{settings.r2_account_id}.r2.cloudflarestorage.com",
        aws_access_key_id=settings.r2_access_key_id,
        aws_secret_access_key=settings.r2_secret_access_key,
        # R2는 리전 대신 "auto"를 쓴다.
        region_name="auto",
        config=Config(
            signature_version="s3v4",
            connect_timeout=5,
            read_timeout=10,
            retries={"max_attempts": 2, "mode": "standard"},
        ),
    )


def new_key(folder: Folder, user_id: int, content_type: str) -> str:
    """사용자별 새 파일 키. 허용하지 않는 형식이면 ValueError."""
    ext = IMAGE_EXTENSIONS.get(content_type)
    if ext is None:
        raise ValueError(f"허용하지 않는 이미지 형식: {content_type}")
    return f"{folder.value}/{user_id}/{uuid.uuid4().hex}.{ext}"


def decoded_image_content_type(data: bytes) -> str | None:
    """전체 픽셀을 실제로 디코딩해 유효한 지원 이미지의 MIME 타입을 돌려준다.

    요청 Content-Type이나 파일 시그니처만으로 판정하지 않는다. 헤더 뒤에 임의 데이터를 붙인 파일,
    잘린 파일, 지나치게 큰 압축 이미지는 R2에 저장하기 전에 거부한다.
    """
    formats = {"JPEG": "image/jpeg", "PNG": "image/png", "WEBP": "image/webp"}
    try:
        with Image.open(BytesIO(data)) as image:
            content_type = formats.get(image.format or "")
            if content_type is None or image.size != AVATAR_IMAGE_SIZE:
                return None
            image.load()
            return content_type
    except (Image.DecompressionBombError, UnidentifiedImageError, OSError, SyntaxError, ValueError):
        return None


def put(key: str, data: bytes, content_type: str) -> None:
    """서버에서 검증한 파일을 비공개 버킷에 저장한다."""
    try:
        _client().put_object(Bucket=settings.r2_bucket, Key=key, Body=data, ContentType=content_type)
    except (BotoCoreError, ClientError) as exc:
        raise StorageError("파일 저장 실패") from exc


def presign_upload(key: str, content_type: str) -> str:
    """브라우저가 PUT으로 올릴 URL. Content-Type을 서명에 넣어, 올릴 때 같은 헤더를 보내야 한다.

    임시 폴더(uploads/) 키에만 발급한다. 최종 키에 발급하면 검증 뒤 덮어쓸 수 있다.
    """
    if not key.startswith(f"{Folder.UPLOAD.value}/"):
        raise ValueError(f"업로드 URL은 {Folder.UPLOAD.value}/ 키에만 발급한다: {key}")
    try:
        return _client().generate_presigned_url(
            "put_object",
            Params={"Bucket": settings.r2_bucket, "Key": key, "ContentType": content_type},
            ExpiresIn=UPLOAD_URL_EXPIRES_SECONDS,
        )
    except (BotoCoreError, ClientError) as exc:
        raise StorageError("업로드 URL 발급 실패") from exc


def presign_download(key: str) -> str:
    try:
        return _client().generate_presigned_url(
            "get_object",
            Params={"Bucket": settings.r2_bucket, "Key": key},
            ExpiresIn=DOWNLOAD_URL_EXPIRES_SECONDS,
        )
    except (BotoCoreError, ClientError) as exc:
        raise StorageError("보기 URL 발급 실패") from exc


def head(key: str) -> ObjectInfo | None:
    """올라간 파일의 크기와 형식. 파일이 없으면 None."""
    try:
        res = _client().head_object(Bucket=settings.r2_bucket, Key=key)
    except ClientError as exc:
        if exc.response.get("Error", {}).get("Code") in ("404", "NoSuchKey", "NotFound"):
            return None
        raise StorageError("파일 정보 조회 실패") from exc
    except BotoCoreError as exc:
        raise StorageError("파일 정보 조회 실패") from exc
    return ObjectInfo(size=res["ContentLength"], content_type=res.get("ContentType", ""), etag=res["ETag"])


def promote(upload_key: str, folder: Folder, info: ObjectInfo) -> str:
    """임시 파일을 매번 새로운 최종 키로 복사하고, 임시 파일은 최선 노력으로 지운다.

    info.etag와 같은 파일일 때만 복사한다. 그 사이 바뀌었거나 사라졌으면 UploadChangedError.
    복사 성공 뒤 삭제가 실패해도 최종 키를 반환한다. 남은 임시 파일은 uploads/ 수명 주기로 정리한다.
    """
    prefix, user_id, _ = upload_key.split("/", 2)
    if prefix != Folder.UPLOAD.value or folder is Folder.UPLOAD:
        raise ValueError(f"임시 키를 최종 폴더로만 옮길 수 있다: {upload_key} → {folder.value}")
    # 같은 임시 키를 다시 업로드·승격해도 기존 카드가 참조하는 객체는 덮어쓰지 않는다.
    final_key = new_key(folder, int(user_id), info.content_type)
    try:
        _client().copy_object(
            Bucket=settings.r2_bucket,
            Key=final_key,
            CopySource={"Bucket": settings.r2_bucket, "Key": upload_key},
            CopySourceIfMatch=info.etag,
        )
    except ClientError as exc:
        if exc.response.get("Error", {}).get("Code") in ("PreconditionFailed", "412", "NoSuchKey", "404"):
            raise UploadChangedError("검증 뒤 임시 파일이 바뀌었다") from exc
        raise StorageError("파일 옮기기 실패") from exc
    except BotoCoreError as exc:
        raise StorageError("파일 옮기기 실패") from exc
    try:
        delete(upload_key)
    except StorageError as exc:
        print(f"[WARN] 승격 후 임시 파일 삭제 실패(uploads/ 수명 주기로 정리): {upload_key} {exc}")
    return final_key


def delete(key: str) -> None:
    """파일을 지운다. 이미 없어도 성공으로 본다."""
    try:
        _client().delete_object(Bucket=settings.r2_bucket, Key=key)
    except (BotoCoreError, ClientError) as exc:
        raise StorageError("파일 삭제 실패") from exc


def delete_user_objects(user_id: int) -> None:
    """회원 탈퇴 때 모든 폴더에서 그 사용자의 파일을 지운다."""
    try:
        paginator = _client().get_paginator("list_objects_v2")
        for prefix in user_prefixes(user_id):
            for page in paginator.paginate(Bucket=settings.r2_bucket, Prefix=prefix):
                objects = [{"Key": obj["Key"]} for obj in page.get("Contents", [])]
                if not objects:
                    continue
                res = _client().delete_objects(
                    Bucket=settings.r2_bucket, Delete={"Objects": objects, "Quiet": True}
                )
                if res.get("Errors"):
                    raise StorageError(f"일부 파일 삭제 실패 ({len(res['Errors'])}건)")
    except (BotoCoreError, ClientError) as exc:
        raise StorageError("사용자 파일 삭제 실패") from exc


def user_prefixes(user_id: int) -> tuple[str, ...]:
    """회원별 객체를 찾거나 수동 정리할 때 사용하는 모든 prefix."""
    return tuple(f"{folder.value}/{user_id}/" for folder in Folder)
