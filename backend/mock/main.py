from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from typing import Optional
from data.courses import COURSES

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── 엔드포인트 ────────────────────────────────────────────
@app.get("/api/courses")
def get_courses(
    region: Optional[str] = None,
    type: Optional[str] = None,
    difficulty: Optional[str] = None,
    keyword: Optional[str] = None,
    sort: Optional[str] = None,
    page: int = Query(...),
    size: int = Query(...),
):
    result = COURSES[:]

    if region:
        result = [c for c in result if c["region_code"] == region]
    if type:
        result = [c for c in result if c["type"] == type]
    if difficulty:
        result = [c for c in result if c["difficulty"] == difficulty]
    if keyword:
        result = [c for c in result if keyword in c["title"] or keyword in c["description"]]
    if sort == "distance":
        result.sort(key=lambda c: c["distance"])
    elif sort == "estimated_time":
        result.sort(key=lambda c: c["estimated_time"])

    total = len(result)
    start = (page - 1) * size
    end = start + size
    paged = result[start:end]

    return {
        "total_count": total,
        "page": page,
        "size": size,
        "courses": [
            {
                "id": c["id"],
                "title": c["title"],
                "type": c["type"],
                "distance": c["distance"],
                "difficulty": c["difficulty"],
                "start_address": c["start_address"],
                "image_url": c["image_url"],
                "estimated_time": c["estimated_time"],
            }
            for c in paged
        ],
    }


@app.get("/api/courses/{id}")
def get_course(id: int):
    course = next((c for c in COURSES if c["id"] == id), None)
    if not course:
        return {"error": "Course not found"}, 404
    return course


@app.get("/api/courses/{id}/gpx")
def get_course_gpx(id: int):
    course = next((c for c in COURSES if c["id"] == id), None)
    if not course:
        return {"error": "Course not found"}, 404

    # bounds 기반으로 waypoint 생성
    b = course["bounds"]
    waypoints = [
        {
            "lat": round(b["min_lat"] + (b["max_lat"] - b["min_lat"]) * t, 6),
            "lng": round(b["min_lng"] + (b["max_lng"] - b["min_lng"]) * t, 6),
        }
        for t in [i / 19 for i in range(20)]
    ]
    return {"course_id": id, "waypoints": waypoints}

