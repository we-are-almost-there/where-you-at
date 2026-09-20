import re
import unicodedata
from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator

NICKNAME_MAX_LENGTH = 20
BIO_MAX_LENGTH = 40


# 카카오 로그인 (POST /api/auth/kakao) ─────────────────
class KakaoLoginRequest(BaseModel):
    code: str = Field(min_length=1, max_length=512)


# 회원 정보 (GET /api/me, 로그인 응답) ──────────────────
class UserOut(BaseModel):
    # 카카오 회원번호(kakao_id)는 화면에서 쓸 곳이 없어 내보내지 않는다.
    id: int
    nickname: str | None
    bio: str | None = None
    # 비공개 R2 객체의 짧게 유효한 보기 URL. 사진이 없거나 URL 발급에 실패하면 null.
    avatar_url: str | None = Field(default=None, exclude_if=lambda value: value is None)


class LoginResponse(BaseModel):
    access_token: str
    token_type: Literal["bearer"] = "bearer"
    user: UserOut


# 프로필 사진 업로드 (POST /api/me/avatar/*) ───────────
AvatarContentType = Literal["image/jpeg", "image/png", "image/webp"]


class AvatarUploadRequest(BaseModel):
    content_type: AvatarContentType


class AvatarUploadTicket(BaseModel):
    upload_url: str
    upload_key: str
    max_bytes: int


class AvatarUploadCompleteRequest(BaseModel):
    upload_key: str = Field(min_length=1, max_length=200)


# 프로필 수정 (PATCH /api/me) ──────────────────────────
_SPACES = re.compile(r" {2,}")

# isprintable()이 막는 서식 문자(Cf) 가운데 결합 이모지에 꼭 필요한 것. 막으면 "개발자(사람+노트북)", "무지개 깃발", "스코틀랜드 깃발" 같은 이모지가 422가 된다.
# - U+200D ZWJ: 여러 이모지를 하나로 잇는다.
# - U+E0020~U+E007F 태그 문자: 지역 깃발 이모지를 만든다.
# 그 밖의 서식 문자(U+200B 폭 없는 공백, U+202E 같은 글자 방향 제어 등)는 보이지 않게 이름을 꾸미거나 뒤집는 데
# 쓰일 수 있어 계속 막는다. 프론트(features/mypage/oneLineText.ts)도 같은 기준으로 입력을 거른다.
_ALLOWED_FORMAT_CHARS = {chr(0x200D), *map(chr, range(0xE0020, 0xE0080))}


def _normalize_spaces(value: str) -> str:
    """줄바꿈 없는 공백(U+00A0)·전각 공백(U+3000) 같은 공백 문자(Zs)를 일반 공백으로 바꾼다. 웹에서 복사해 붙이면 흔히 섞인다."""
    return "".join(" " if unicodedata.category(ch) == "Zs" else ch for ch in value)


def _one_line(value: str) -> str:
    """공백 문자를 일반 공백으로 바꾸고, 앞뒤 공백을 지우고, 가운데 연속 공백을 한 칸으로 줄인다.

    화면(HTML)은 연속 공백을 한 칸으로 그리므로, 저장값·화면·글자 수가 같아지도록 저장할 때 맞춘다.
    줄바꿈·탭 같은 제어 문자와 결합 이모지에 쓰이지 않는 서식 문자는 막는다. 헤더·카드에 한 줄로 그리는 값이라서다.
    """
    value = _SPACES.sub(" ", _normalize_spaces(value).strip())
    if any(not ch.isprintable() and ch not in _ALLOWED_FORMAT_CHARS for ch in value):
        raise ValueError("쓸 수 없는 문자가 있습니다.")
    return value


class UserUpdate(BaseModel):
    """보낸 칸만 바꾼다. 둘 다 빠지면 422."""

    nickname: str | None = None
    # 빈 문자열이면 소개를 지운다(null로 저장).
    bio: str | None = None

    @field_validator("nickname")
    @classmethod
    def check_nickname(cls, value: str | None) -> str:
        if value is None:
            raise ValueError("닉네임은 비울 수 없습니다.")
        value = _one_line(value)
        if not 1 <= len(value) <= NICKNAME_MAX_LENGTH:
            raise ValueError(f"닉네임은 1자 이상 {NICKNAME_MAX_LENGTH}자 이하로 적어 주세요.")
        return value

    @field_validator("bio")
    @classmethod
    def check_bio(cls, value: str | None) -> str | None:
        value = _one_line(value or "")
        if len(value) > BIO_MAX_LENGTH:
            raise ValueError(f"한 줄 소개는 {BIO_MAX_LENGTH}자 이하로 적어 주세요.")
        return value or None

    @model_validator(mode="after")
    def check_any_field(self):
        if not self.model_fields_set:
            raise ValueError("바꿀 항목이 없습니다.")
        return self

    def changes(self) -> dict:
        """요청에 들어 있던 칸만. bio를 빈 값으로 보내 지운 경우도 포함한다."""
        return {name: getattr(self, name) for name in self.model_fields_set}
