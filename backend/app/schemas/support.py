from pydantic import BaseModel, Field


# 목록 (GET /api/support) ─────────────────────────────
class SupportSummary(BaseModel):
    id: int
    title: str
    agency: str | None
    summary: str | None
    max_amount: int | None
    end_date: str | None


# 상세 (GET /api/support/{id}) ────────────────────────
class ChecklistItem(BaseModel):
    id: int
    content: str
    is_essential: bool


class SupportDetail(BaseModel):
    id: int
    title: str
    description: str | None
    apply_url: str | None
    checklist: list[ChecklistItem]


# 계산 (POST /api/support/calculate) ──────────────────
class CalculateRequest(BaseModel):
    region_code: str
    spent_by_category: dict[str, int]
    stay_duration: int = Field(ge=0)


class CalculationBasis(BaseModel):
    item: str
    amount: int
    description: str


class CalculateResponse(BaseModel):
    expected_refund: int
    calculation_basis: list[CalculationBasis]
    tips: list[str]