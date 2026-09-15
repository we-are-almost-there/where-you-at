import re
from typing import Literal

from pydantic import BaseModel, Field, field_validator

# 문의 유형. 바꾸면 sql/01_schema.sql inquiry 테이블의 category check와 프론트 문의 폼도 함께 바꾼다.
INQUIRY_CATEGORIES = ("코스 탐색", "대회 행사", "방문 혜택", "자전거 대여", "정보 오류 신고", "기타")
InquiryCategory = Literal["코스 탐색", "대회 행사", "방문 혜택", "자전거 대여", "정보 오류 신고", "기타"]

CONTENT_MIN_LENGTH = 10
CONTENT_MAX_LENGTH = 2000

# email-validator 의존성을 늘리지 않으려고 형식만 본다(@ 앞뒤 글자와 도메인의 점).
# 실제로 받을 수 있는 주소인지는 답장을 보내 봐야 알 수 있어, 여기서 더 엄격하게 막아도 얻는 게 적다.
_EMAIL_PATTERN = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


# 접수 (POST /api/inquiries) ───────────────────────────
class InquiryCreate(BaseModel):
    category: InquiryCategory
    email: str = Field(max_length=254)
    content: str
    agreed: bool
    # 스팸 방지용 숨긴 입력칸(허니팟). 화면에서는 보이지 않아 사람은 비워 두고, 폼을 자동으로 채우는 봇만 값을 넣는다.
    website: str = ""

    @field_validator("email")
    @classmethod
    def check_email(cls, value: str) -> str:
        value = value.strip()
        if not _EMAIL_PATTERN.match(value):
            raise ValueError("이메일 형식이 올바르지 않습니다.")
        return value

    @field_validator("content")
    @classmethod
    def check_content(cls, value: str) -> str:
        value = value.strip()
        if not CONTENT_MIN_LENGTH <= len(value) <= CONTENT_MAX_LENGTH:
            raise ValueError(f"문의 내용은 {CONTENT_MIN_LENGTH}자 이상 {CONTENT_MAX_LENGTH}자 이하로 적어 주세요.")
        return value

    @field_validator("agreed")
    @classmethod
    def check_agreed(cls, value: bool) -> bool:
        # 동의 없이 개인정보(이메일)를 저장하면 안 되므로 서버에서도 한 번 더 막는다.
        if value is not True:
            raise ValueError("개인정보 수집·이용에 동의해야 문의를 보낼 수 있습니다.")
        return value


class InquiryCreated(BaseModel):
    # 문의 번호는 돌려주지 않는다. 이용자가 쓸 곳이 없고, 순번이 드러나면 접수량을 짐작할 수 있다.
    received: bool = True
