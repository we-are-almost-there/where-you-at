from fastapi import APIRouter

from .routers import courses, tour_spots

api_router = APIRouter()
api_router.include_router(courses.router)
api_router.include_router(tour_spots.router)
