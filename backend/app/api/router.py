from fastapi import APIRouter

from .routers import courses, regions, tour_spots, support, nearby,  bicycle_facilities

api_router = APIRouter()
api_router.include_router(courses.router)
api_router.include_router(regions.router)
api_router.include_router(tour_spots.router)
api_router.include_router(support.router)
api_router.include_router(nearby.router)
api_router.include_router(bicycle_facilities.router)