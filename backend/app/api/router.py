from fastapi import APIRouter

from .routers import courses, regions, tour_spots, support, bicycle_facilities, races, notices, faqs

api_router = APIRouter()
api_router.include_router(courses.router)
api_router.include_router(regions.router)
api_router.include_router(tour_spots.router)
api_router.include_router(support.router)
api_router.include_router(bicycle_facilities.router)
api_router.include_router(races.router)
api_router.include_router(notices.router)
api_router.include_router(faqs.router)
