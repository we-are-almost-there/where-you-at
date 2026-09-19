from datetime import datetime
from typing import Literal

from pydantic import BaseModel

from .course import CourseSummary


class SavedCourse(CourseSummary):
    """찜한 코스 하나. 코스 탐색과 같은 카드를 그리므로 코스 목록 항목에 찜 정보만 더한다."""

    # 찜한 종목. 항목 안의 routes[].route_type(코스가 가진 경로들)과 달리, 이 회원이 어느 종목으로 찜했는지다.
    route_type: str
    saved_at: datetime


class SavedCourseListResponse(BaseModel):
    courses: list[SavedCourse]


class SavedCourseKey(BaseModel):
    """하트 상태를 그리는 데 쓰는 가벼운 항목. 썸네일 좌표가 없어 목록 화면이 가볍게 받는다."""

    course_id: int
    route_type: str


class SavedCourseCreate(BaseModel):
    course_id: int
    route_type: Literal["trail", "bicycle"]
