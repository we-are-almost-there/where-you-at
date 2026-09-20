from datetime import datetime
from typing import Literal

from pydantic import BaseModel


class SigunguStampOut(BaseModel):
    sigungu_code: str
    status: Literal["LOCKED", "AVAILABLE", "STAMPED"]
    stamped_at: datetime | None


class SigunguStampCreated(SigunguStampOut):
    created: bool
