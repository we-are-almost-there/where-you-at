from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class RunRecordCreate(BaseModel):
    """따라가기 완주 기록 저장 요청. TrackingRecord에서 뽑은 값."""

    course_id: int
    route_type: Literal["trail", "bicycle"]
    distance_km: float = Field(..., gt=0, le=1000)
    duration_ms: int = Field(..., gt=0)
    # 거리가 너무 짧으면 프론트가 null로 보낸다.
    pace_sec_per_km: float | None = Field(None, gt=0)
    finished_at: datetime


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
