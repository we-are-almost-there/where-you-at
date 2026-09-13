from datetime import datetime

from pydantic import BaseModel


# 목록 (GET /api/notices) ─────────────────────────────
class NoticeSummary(BaseModel):
    id: int
    title: str
    is_pinned: bool
    published_at: datetime


class NoticeListResponse(BaseModel):
    total: int
    page: int
    per_page: int
    items: list[NoticeSummary]


# 상세 (GET /api/notices/{id}) ────────────────────────
class NoticeDetail(NoticeSummary):
    content: str
