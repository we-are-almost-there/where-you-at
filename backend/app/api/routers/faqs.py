from fastapi import APIRouter, Depends

from ...crud import faq as faq_crud
from ...deps import get_db
from ...schemas.faq import Faq

router = APIRouter(prefix="/api/faqs", tags=["faqs"])


@router.get("", response_model=list[Faq])
def list_faqs(conn=Depends(get_db)):
    return faq_crud.get_faqs(conn)
