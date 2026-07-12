from fastapi import APIRouter

from .routers import courses, support

api_router = APIRouter()
api_router.include_router(courses.router)
api_router.include_router(support.router)
