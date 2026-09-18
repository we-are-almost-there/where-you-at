from typing import Literal

from pydantic import BaseModel, Field


# 카카오 로그인 (POST /api/auth/kakao) ─────────────────
class KakaoLoginRequest(BaseModel):
    code: str = Field(min_length=1, max_length=512)


# 회원 정보 (GET /api/me, 로그인 응답) ──────────────────
class UserOut(BaseModel):
    # 카카오 회원번호(kakao_id)는 화면에서 쓸 곳이 없어 내보내지 않는다.
    id: int
    nickname: str | None


class LoginResponse(BaseModel):
    access_token: str
    token_type: Literal["bearer"] = "bearer"
    user: UserOut
