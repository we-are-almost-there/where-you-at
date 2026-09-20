"""
Cloudflare R2 이미지 저장소 (S3 호환 API)

프로필 사진과 기록 카드 이미지를 비공개 버킷 하나에 폴더로 나눠 둔다. 얼굴이 담길 수 있는 사진이라
링크만 알면 누구나 볼 수 있는 공개 버킷은 쓰지 않는다. 둘 다 비공개이고 같은 서버가 다루므로
버킷을 나눠도 얻는 것이 없다.

프로필 사진과 기록 카드는 서버를 거쳐 올린다.
  올리기: 서버가 요청 본문 크기와 실제 이미지 디코딩을 확인 → avatars/ 또는 record-cards/에 저장
  보기:   서버가 짧게 유효한 사전 서명 GET URL을 응답에 넣어 줌

이전 업로드 방식의 임시 파일은 uploads/ 수명 주기 규칙(1일 뒤 삭제)과 회원 탈퇴 처리로 정리한다.
현재 API는 업로드 URL을 발급하지 않고 서버에서 검증한 파일만 put()으로 저장한다.

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
    # 이전 업로드 방식의 임시 폴더. 남아 있는 파일을 회원 탈퇴 때도 정리한다.
    UPLOAD = "uploads"
    AVATAR = "avatars"
    RECORD_CARD = "record-cards"


class StorageError(Exception):
    """R2 요청이 실패했다. 설정 오류이거나 R2 쪽 문제다."""


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
