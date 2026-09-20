"""회원 정보를 API 응답으로 바꾸는 공통 코드."""

from collections.abc import Mapping

from ..schemas.user import UserOut
from . import storage


def _value(user, name: str):
    return user.get(name) if isinstance(user, Mapping) else getattr(user, name)


def user_out(user) -> UserOut:
    """R2 내부 키를 노출하지 않고, 비공개 사진의 임시 보기 URL만 붙인다.

    사진 URL 발급 실패가 로그인이나 마이페이지 전체를 막지는 않게 기본 이미지로 내린다.
    """
    avatar_key = _value(user, "avatar_key")
    avatar_url = None
    if avatar_key and storage.is_configured():
        try:
            avatar_url = storage.presign_download(avatar_key)
        except storage.StorageError as exc:
            print(f"[WARN] 프로필 사진 보기 URL 발급 실패: user_id={_value(user, 'id')} {type(exc).__name__}")
    return UserOut(
        id=_value(user, "id"),
        nickname=_value(user, "nickname"),
        bio=_value(user, "bio"),
        avatar_url=avatar_url,
    )
