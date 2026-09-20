from fastapi import APIRouter, Depends, HTTPException, Request
from starlette.concurrency import run_in_threadpool

from ...crud import user as user_crud
from ...deps import CurrentUser, db_connection, get_current_user, unauthorized_error
from ...schemas.user import UserOut, UserUpdate
from ...services import account_deletion, kakao_oauth, profile, slack_notify, storage
from ...services.rate_limit import SlidingWindowLimiter

router = APIRouter(prefix="/api/me", tags=["me"])

AVATAR_MAX_BYTES = 5 * 1024 * 1024
# 인증 회원 한 명이 짧은 시간에 R2 쓰기 비용을 과도하게 만들지 못하게 한다.
# 메모리 기반 제한의 배포상 한계는 services/rate_limit.py에 적어 두었다.
avatar_upload_limiter = SlidingWindowLimiter(max_requests=10, window_seconds=60)


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


async def _avatar_body(request: Request) -> bytes:
    """요청 본문을 스트리밍으로 읽되 제한을 넘는 순간 중단한다."""
    content_length = request.headers.get("content-length")
    if content_length is not None:
        try:
            declared_size = int(content_length)
        except ValueError:
            raise HTTPException(status_code=400, detail="올바르지 않은 파일 크기입니다.")
        if declared_size > AVATAR_MAX_BYTES:
            raise HTTPException(status_code=413, detail="프로필 사진은 5MB 이하만 올릴 수 있습니다.")

    chunks: list[bytes] = []
    size = 0
    async for chunk in request.stream():
        size += len(chunk)
        if size > AVATAR_MAX_BYTES:
            raise HTTPException(status_code=413, detail="프로필 사진은 5MB 이하만 올릴 수 있습니다.")
        chunks.append(chunk)
    if size == 0:
        raise HTTPException(status_code=400, detail="빈 파일은 올릴 수 없습니다.")
    return b"".join(chunks)


@router.put("/avatar", response_model=UserOut)
async def upload_avatar(request: Request, current_user: CurrentUser = Depends(get_current_user)):
    """크기와 실제 파일 형식을 서버에서 확인한 뒤 avatars/에 저장한다."""
    if not avatar_upload_limiter.allow(str(current_user.id)):
        raise HTTPException(
            status_code=429,
            detail="사진 변경 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.",
            headers={"Retry-After": "60"},
        )
    if not storage.is_configured():
        raise _storage_unavailable()

    declared_type = request.headers.get("content-type", "").split(";", 1)[0].strip().lower()
    if declared_type not in storage.IMAGE_EXTENSIONS:
        raise HTTPException(status_code=400, detail="JPG, PNG, WEBP 사진만 올릴 수 있습니다.")

    data = await _avatar_body(request)
    return await run_in_threadpool(_store_avatar, current_user.id, data, declared_type)


def _store_avatar(user_id: int, data: bytes, declared_type: str) -> UserOut:
    """이미지를 검증하고 R2·DB에 반영하는 동기 작업. async 라우터는 이 함수를 스레드풀에서 실행한다."""
    detected_type = storage.decoded_image_content_type(data)
    if detected_type is None or detected_type != declared_type:
        raise HTTPException(status_code=400, detail="파일 형식과 확장자가 맞는 JPG, PNG, WEBP 사진만 올려 주세요.")

    avatar_key = storage.new_key(storage.Folder.AVATAR, user_id, detected_type)
    try:
        # 외부 R2 호출 중에는 DB 연결이나 행 잠금을 보유하지 않는다. 탈퇴가 먼저 끝나더라도
        # 아래 짧은 트랜잭션에서 회원 부재를 확인하고 방금 올린 객체를 되돌릴 수 있다.
        storage.put(avatar_key, data, detected_type)
    except storage.StorageError:
        raise _storage_unavailable()

    try:
        with db_connection() as conn:
            # 탈퇴는 같은 잠금을 R2 정리부터 DB 삭제까지 유지한다. 업로드가 먼저 잠그면 탈퇴가
            # 새 객체까지 지우고, 탈퇴가 먼저 끝나면 여기서 회원 부재를 확인해 새 객체를 되돌린다.
            locked_user = user_crud.lock_user_for_update(conn, user_id)
            if locked_user is None:
                conn.rollback()
                raise unauthorized_error()
            previous_key = locked_user["avatar_key"]
            user = user_crud.set_avatar_locked(conn, user_id, avatar_key)
            conn.commit()
    except Exception:
        # 탈퇴가 먼저 끝났거나 DB 반영에 실패하면 새 최종 파일이 고아로 남지 않게 되돌린다.
        try:
            storage.delete(avatar_key)
        except storage.StorageError as exc:
            print(f"[WARN] 반영 실패한 프로필 사진 삭제 실패: user_id={user_id} {type(exc).__name__}")
        raise
    if previous_key and previous_key != avatar_key:
        try:
            storage.delete(previous_key)
        except storage.StorageError as exc:
            # 새 사진 저장은 이미 끝났다. 이전 파일 정리 실패 때문에 성공을 실패로 바꾸지 않는다.
            print(f"[WARN] 이전 프로필 사진 삭제 실패: user_id={user_id} {type(exc).__name__}")
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
    """회원 탈퇴. 카카오 연결 해제 뒤 R2 객체를 지우고, 마지막에 회원 행을 지운다.

    - 카카오 연결 해제가 실패하면 행을 남기고 502를 돌려준다. 다시 요청하면 처음부터 진행된다.
    - 다만 휴면이거나 없는 계정(-103)은 다시 요청해도 해제되지 않는다. 이때는 경고만 남기고 행을 지운다.
      개인정보 보유 기간을 "탈퇴 시까지"로 안내하므로, 해제할 수 없는 카카오 연결 때문에 우리 데이터 삭제까지
      막지는 않는다.
    - 연결 해제 뒤 행 삭제가 실패해도, 다시 요청하면 카카오가 "이미 해제됨"(-101)을 돌려줘 삭제까지 진행된다.
    - R2 정리가 실패하면 회원 행과 세션을 남기고 502를 돌려줘 같은 user_id로 다시 정리할 수 있게 한다.
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

    try:
        account_deletion.delete_account(current_user.id)
    except account_deletion.ObjectCleanupError as exc:
        prefixes = ", ".join(storage.user_prefixes(current_user.id))
        print(
            f"[ERROR] 수동 탈퇴 R2 정리 실패(회원 유지): user_id={current_user.id} "
            f"prefixes={prefixes} {type(exc.__cause__ or exc).__name__}"
        )
        slack_notify.notify_account_deletion_failure(
            current_user.id,
            source="수동 탈퇴",
            stage="R2 객체 정리",
        )
        raise HTTPException(status_code=502, detail="탈퇴 파일 정리를 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.")
