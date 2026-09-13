from pydantic import BaseModel


# 목록 (GET /api/faqs) ────────────────────────────────
class Faq(BaseModel):
    id: int
    category: str
    question: str
    answer: str
