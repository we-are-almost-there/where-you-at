import re

from fastapi import APIRouter, Depends, HTTPException

from ...crud import user as user_crud
from ...deps import CurrentUser, db_connection, get_current_user, unauthorized_error
from ...schemas.user import (
    AvatarUploadCompleteRequest,
    AvatarUploadRequest,
    AvatarUploadTicket,
    UserOut,
    UserUpdate,
)
from ...services import kakao_oauth, profile, storage

router = APIRouter(prefix="/api/me", tags=["me"])

AVATAR_MAX_BYTES = 5 * 1024 * 1024


@router.get("", response_model=UserOut)
def read_me(current_user: CurrentUser = Depends(get_current_user)):
    """로그인한 회원 정보."""
    return profile.user_out(current_user)


@router.patch("", response_model=UserOut)
def update_me(body: UserUpdate, current_user: CurrentUser = Depends(get_current_user)):
    """프로필(닉네임·한 줄 소개) 수정. 보낸 칸만 바꾼다. 인증 뒤 회원 행이 사라졌으면(탈퇴) 401로 로그인을 다시 받게 한다.

    인증(get_current_user)은 세션을 확인하려고 DB에 한 번 연결한다. 수정용 연결은 get_db 의존성이 아니라 본문에서 연다.
    의존성은 본문 검증보다 먼저 풀려서, get_db를 쓰면 값이 잘못된 요청도 연결을 하나 더 잡는다.
    """
    with db_connection() as conn:
        user = user_crud.update_profile(conn, current_user.id, body.changes())
    if user is None:
        raise unauthorized_error()
    return profile.user_out(user)


def _storage_unavailable() -> HTTPException:
    return HTTPException(status_code=503, detail="지금은 사진을 올릴 수 없습니다. 잠시 후 다시 시도해 주세요.")


def _discard_upload(key: str) -> None:
    try:
        storage.delete(key)
    except storage.StorageError:
        # uploads/ 수명 주기 규칙이 하루 뒤 정리한다.
        pass


@router.post("/avatar/upload-url", response_model=AvatarUploadTicket)
def create_avatar_upload(body: AvatarUploadRequest, current_user: CurrentUser = Depends(get_current_user)):
    """브라우저가 R2 임시 경로에 직접 올릴 사전 서명 URL을 발급한다."""
    if not storage.is_configured():
        raise _storage_unavailable()
    upload_key = storage.new_key(storage.Folder.UPLOAD, current_user.id, body.content_type)
    try:
        upload_url = storage.presign_upload(upload_key, body.content_type)
    except storage.StorageError:
        raise _storage_unavailable()
    return AvatarUploadTicket(upload_url=upload_url, upload_key=upload_key, max_bytes=AVATAR_MAX_BYTES)


@router.post("/avatar/complete", response_model=UserOut)
def complete_avatar_upload(
    body: AvatarUploadCompleteRequest,
    current_user: CurrentUser = Depends(get_current_user),
):
    """임시 파일을 확인해 avatars/로 옮기고 회원의 현재 사진으로 지정한다."""
    if not storage.is_configured():
        raise _storage_unavailable()

    # 다른 회원의 임시 키나 서버가 발급하지 않은 모양의 키를 조회·승격하지 않는다.
    pattern = rf"^uploads/{current_user.id}/[0-9a-f]{{32}}\.(jpg|png|webp)$"
    if re.fullmatch(pattern, body.upload_key) is None:
        raise HTTPException(status_code=400, detail="올바르지 않은 업로드입니다. 사진을 다시 선택해 주세요.")

    try:
        info = storage.head(body.upload_key)
    except storage.StorageError:
        raise _storage_unavailable()
    if info is None:
        raise HTTPException(status_code=400, detail="업로드한 사진을 찾을 수 없습니다. 사진을 다시 선택해 주세요.")

    expected_extension = storage.IMAGE_EXTENSIONS.get(info.content_type)
    if expected_extension is None or not body.upload_key.endswith(f".{expected_extension}"):
        _discard_upload(body.upload_key)
        raise HTTPException(status_code=400, detail="JPG, PNG, WEBP 사진만 올릴 수 있습니다.")
    if info.size <= 0:
        _discard_upload(body.upload_key)
        raise HTTPException(status_code=400, detail="빈 파일은 올릴 수 없습니다.")
    if info.size > AVATAR_MAX_BYTES:
        _discard_upload(body.upload_key)
        raise HTTPException(status_code=413, detail="프로필 사진은 5MB 이하만 올릴 수 있습니다.")

    try:
        avatar_key = storage.promote(body.upload_key, storage.Folder.AVATAR, info)
    except storage.UploadChangedError:
        raise HTTPException(status_code=409, detail="업로드가 변경되었습니다. 사진을 다시 선택해 주세요.")
    except storage.StorageError:
        raise _storage_unavailable()

    try:
        with db_connection() as conn:
            user, previous_key = user_crud.set_avatar(conn, current_user.id, avatar_key)
    except Exception:
        # DB에 연결하지 못했다면 새 최종 파일이 고아로 남지 않게 되돌린다.
        try:
            storage.delete(avatar_key)
        except storage.StorageError:
            pass
        raise
    if user is None:
        _discard_upload(avatar_key)
        raise unauthorized_error()

    if previous_key and previous_key != avatar_key:
        try:
            storage.delete(previous_key)
        except storage.StorageError as exc:
            # 새 사진 저장은 이미 끝났다. 이전 파일 정리 실패 때문에 성공을 실패로 바꾸지 않는다.
            print(f"[WARN] 이전 프로필 사진 삭제 실패: user_id={current_user.id} {type(exc).__name__}")
    return profile.user_out(user)


@router.delete("/avatar", response_model=UserOut)
def delete_avatar(current_user: CurrentUser = Depends(get_current_user)):
    """현재 프로필 사진을 기본 이미지로 되돌리고 기존 R2 객체를 지운다."""
    with db_connection() as conn:
        user, previous_key = user_crud.set_avatar(conn, current_user.id, None)
    if user is None:
        raise unauthorized_error()

    if previous_key and storage.is_configured():
        try:
            storage.delete(previous_key)
        except storage.StorageError as exc:
            # DB에서는 이미 연결을 끊었다. 삭제 실패가 화면의 되돌리기를 실패로 보이게 하지는 않는다.
            print(f"[WARN] 프로필 사진 삭제 실패(직접 삭제 필요): user_id={current_user.id} {type(exc).__name__}")
    return profile.user_out(user)


@router.delete("", status_code=204)
def delete_me(current_user: CurrentUser = Depends(get_current_user)):
    """회원 탈퇴. 카카오 연결을 해제한 뒤 회원 행을 지운다. 회원에 딸린 데이터는 on delete cascade로 함께 지워진다.

    - 카카오 연결 해제가 실패하면 행을 남기고 502를 돌려준다. 다시 요청하면 처음부터 진행된다.
    - 다만 휴면이거나 없는 계정(-103)은 다시 요청해도 해제되지 않는다. 이때는 경고만 남기고 행을 지운다.
      개인정보 보유 기간을 "탈퇴 시까지"로 안내하므로, 해제할 수 없는 카카오 연결 때문에 우리 데이터 삭제까지
      막지는 않는다.
    - 연결 해제 뒤 행 삭제가 실패해도, 다시 요청하면 카카오가 "이미 해제됨"(-101)을 돌려줘 삭제까지 진행된다.
    - 카카오 응답을 기다리는 동안 DB 연결을 붙잡지 않도록, 조회와 삭제 때만 따로 연결한다.
    - 회원 행이 삭제되면 로그인 세션도 함께 삭제되어, 이미 지운 회원의 토큰은 모든 인증 API에서 401이다.
    """
    if not kakao_oauth.is_unlink_configured():
        print("[ERROR] KAKAO_LOGIN_ADMIN_KEY가 비어 있어 탈퇴를 처리할 수 없습니다.")
        raise HTTPException(status_code=503, detail="지금은 탈퇴할 수 없습니다. 잠시 후 다시 시도해 주세요.")

    try:
        kakao_oauth.unlink_user(current_user.kakao_id)
    except kakao_oauth.KakaoUnlinkUnavailableError as e:
        print(f"[WARN] 카카오 연결 해제를 건너뛰고 탈퇴를 진행합니다: {e}")
    except kakao_oauth.KakaoUpstreamError as e:
        print(f"[ERROR] 카카오 연결 해제 실패: {e}")
        raise HTTPException(status_code=502, detail="탈퇴를 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.")

    with db_connection() as conn:
        user_crud.delete_user(conn, current_user.id)

    if storage.is_configured():
        try:
            storage.delete_user_objects(current_user.id)
        except storage.StorageError as exc:
            # 회원 행과 세션 삭제는 끝났다. 탈퇴 자체를 실패로 되돌릴 수 없으므로 운영 로그로 후속 정리한다.
            print(f"[ERROR] 탈퇴 회원 R2 파일 삭제 실패(직접 삭제 필요): user_id={current_user.id} {type(exc).__name__}")
