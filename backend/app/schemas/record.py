from datetime import datetime, timedelta, timezone
from typing import Literal

from pydantic import BaseModel, Field, field_validator

# 하루 넘게 걸리는 코스는 없다. 7일이면 GPS를 켜 둔 채 잊은 경우까지 넉넉히 받는다.
MAX_DURATION_MS = 7 * 24 * 60 * 60 * 1000
# 기기 시계 오차를 감안해 약간의 미래는 허용한다.
MAX_FUTURE_SKEW = timedelta(minutes=10)


class RunRecordCreate(BaseModel):
    """따라가기 완주 기록 저장 요청. TrackingRecord에서 뽑은 값."""

    course_id: int
    route_type: Literal["trail", "bicycle"]
    # numeric(7, 3)에 들어가는 범위. inf/nan은 저장·직렬화에서 500이 되므로 막는다.
    distance_km: float = Field(..., gt=0, le=1000, allow_inf_nan=False)
    duration_ms: int = Field(..., gt=0, le=MAX_DURATION_MS)
    # numeric(8, 2)에 들어가는 범위(최대 999999.99). 거리가 너무 짧으면 프론트가 null로 보낸다.
    pace_sec_per_km: float | None = Field(None, gt=0, lt=1_000_000, allow_inf_nan=False)
    finished_at: datetime

    @field_validator("finished_at")
    @classmethod
    def finished_at_must_be_aware_and_not_future(cls, value: datetime) -> datetime:
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("finished_at에는 시간대가 있어야 합니다.")
        if value > datetime.now(timezone.utc) + MAX_FUTURE_SKEW:
            raise ValueError("finished_at이 미래 시각입니다.")
        return value


class RunRecordOut(BaseModel):
    id: int
    course_id: int
    course_name: str
    route_type: Literal["trail", "bicycle"]
    distance_km: float
    duration_ms: int
    pace_sec_per_km: float | None
    finished_at: datetime


class RunRecordListResponse(BaseModel):
    total_count: int
    records: list[RunRecordOut]


class RecordCardUploadRequest(BaseModel):
    """기록 카드 이미지 업로드 URL 발급 요청."""

    content_type: Literal["image/jpeg", "image/png", "image/webp"]


class RecordCardUploadResponse(BaseModel):
    # 브라우저가 upload_url로 PUT(같은 Content-Type 헤더)한 뒤, upload_key를 카드 저장 요청에 넣는다.
    upload_key: str
    upload_url: str


class RecordCardCreate(BaseModel):
    record_id: int
    upload_key: str = Field(..., max_length=200)


class RecordCardOut(BaseModel):
    id: int
    record: RunRecordOut
    # 보기 URL 발급에 실패하면 null. 프론트가 수치로 그린 기본 카드로 대체한다.
    image_url: str | None
    created_at: datetime


class RecordCardListResponse(BaseModel):
    total_count: int
    cards: list[RecordCardOut]
