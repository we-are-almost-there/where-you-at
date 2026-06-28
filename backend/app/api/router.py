from fastapi import APIRouter

from .routers import courses

api_router = APIRouter()
api_router.include_router(courses.router)
