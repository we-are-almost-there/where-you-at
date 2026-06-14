from fastapi import FastAPI, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from typing import Optional
from data.courses import COURSES
from data.tour_spots import TOUR_SPOTS
from data.facilities import FACILITIES
from data.events import EVENTS
from data.supports import SUPPORTS
from data.regions import REGIONS
import math

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── 거리 계산 유틸 ────────────────────────────────────────
def haversine(lat1, lng1, lat2, lng2) -> int:
    R = 6371000
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlng / 2) ** 2
    return int(R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a)))


# ── nearby 공통 유틸 ──────────────────────────────────────
def _get_nearby(lat: float, lng: float, type: Optional[str], radius: int = 5000):
    result = []
    if not type or type in ("attraction", "restaurant", "accommodation"):
        for s in TOUR_SPOTS:
            d = haversine(lat, lng, s["lat"], s["lng"])
            if d <= radius and (not type or s["category"] == type):
                result.append({**s, "nearby_type": s["category"], "distance_m": d})
    if not type or type == "bicycle":
        for f in FACILITIES:
            d = haversine(lat, lng, f["lat"], f["lng"])
            if d <= radius:
                result.append({**f, "nearby_type": "bicycle", "distance_m": d})
    return result


# ── courses ────────────────────────────────────────────
@app.get("/api/courses")
def get_courses(
    region: Optional[str] = None,
    type: Optional[str] = None,
    difficulty: Optional[str] = None,
    keyword: Optional[str] = None,
    sort: Optional[str] = None,
    page: int = Query(1),
    size: int = Query(20),
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

@app.get("/api/courses/{id}/gpx")
def get_course_gpx(id: int):
    course = next((c for c in COURSES if c["id"] == id), None)
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")

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


@app.get("/api/courses/{id}/nearby")
def get_course_nearby(id: int, type: Optional[str] = None):
    course = next((c for c in COURSES if c["id"] == id), None)
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    center_lat = (course["bounds"]["min_lat"] + course["bounds"]["max_lat"]) / 2
    center_lng = (course["bounds"]["min_lng"] + course["bounds"]["max_lng"]) / 2
    return _get_nearby(center_lat, center_lng, type)


@app.get("/api/courses/{id}")
def get_course(id: int):
    course = next((c for c in COURSES if c["id"] == id), None)
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    return course

# ── nearby ────────────────────────────────────────────────
@app.get("/api/nearby/tourspots")
def get_nearby_tourspots(
    lat: float = Query(...),
    lng: float = Query(...),
    radius: int = Query(5000),
    category: Optional[str] = None,
    page: int = Query(1),
    size: int = Query(20),
):
    result = [
        {**s, "distance_m": haversine(lat, lng, s["lat"], s["lng"])}
        for s in TOUR_SPOTS
        if haversine(lat, lng, s["lat"], s["lng"]) <= radius
        and (not category or s["category"] == category)
    ]
    result.sort(key=lambda x: x["distance_m"])
    start = (page - 1) * size
    return result[start:start + size]


@app.get("/api/nearby/facilities")
def get_nearby_facilities(
    lat: float = Query(...),
    lng: float = Query(...),
    radius: int = Query(5000),
    type: Optional[str] = None,
    repair_available: Optional[bool] = None,
    page: int = Query(1),
    size: int = Query(20),
):
    result = []
    for f in FACILITIES:
        d = haversine(lat, lng, f["lat"], f["lng"])
        if d > radius:
            continue
        if type and f["type"] != type:
            continue
        if repair_available is not None and f["repair_available"] != repair_available:
            continue
        result.append({**f, "distance_m": d})
    result.sort(key=lambda x: x["distance_m"])
    start = (page - 1) * size
    return result[start:start + size]

# ── events ────────────────────────────────────────────────
@app.get("/api/events")
def get_events(
    region: Optional[str] = None,
    type: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    page: int = Query(1),
    size: int = Query(20),
):
    result = EVENTS[:]
    if region:
        result = [e for e in result if e["region_code"] == region]
    if type:
        result = [e for e in result if e["type"] == type]
    if date_from:
        result = [e for e in result if e["start_date"] >= date_from]
    if date_to:
        result = [e for e in result if e["end_date"] <= date_to]
    total = len(result)
    start = (page - 1) * size
    paged = result[start:start + size]
    return {
        "total_count": total,
        "page": page,
        "size": size,
        "events": [
            {
                "id": e["id"],
                "name": e["name"],
                "type": e["type"],
                "start_date": e["start_date"],
                "end_date": e["end_date"],
                "location": e["location_name"],
                "lat": e["lat"],
                "lng": e["lng"],
            }
            for e in paged
        ],
    }


@app.get("/api/events/{id}/nearby")
def get_event_nearby(id: int, type: Optional[str] = None):
    event = next((e for e in EVENTS if e["id"] == id), None)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    return _get_nearby(event["lat"], event["lng"], type)


@app.get("/api/events/{id}")
def get_event(id: int):
    event = next((e for e in EVENTS if e["id"] == id), None)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")  
    return event


# ── regions ───────────────────────────────────────────────
@app.get("/api/regions")
def get_regions(
    sido: Optional[str] = None,
    is_population_drop: Optional[bool] = None,
):
    result = REGIONS[:]
    if sido:
        result = [r for r in result if r["sido"] == sido]
    if is_population_drop is not None:
        result = [r for r in result if r["is_population_drop"] == is_population_drop]
    return result


# ── support ───────────────────────────────────────────────
@app.get("/api/support")
def get_supports(region_code: Optional[str] = None):
    result = SUPPORTS[:]

    if region_code:
        sido_code = region_code[:2]

        result = [
            s for s in result
            if s.get("region_code") == region_code
            or s.get("region_code") == sido_code
        ]

    return [
        {
            "id": s["id"],
            "title": s["title"],
            "agency": s["agency"],
            "summary": s["summary"],
            "max_amount": s["max_amount"],
            "end_date": s["end_date"],
        }
        for s in result
    ]

@app.get("/api/support/{id}")
def get_support(id: int):
    support = next((s for s in SUPPORTS if s["id"] == id), None)
    if not support:
        raise HTTPException(status_code=404, detail="Support not found")
    return support


@app.post("/api/support/calculate")
def calculate_refund(body: dict):
    region_code = body.get("region_code", "")
    spent = body.get("spent_by_category", {})

    total_spent = sum(spent.values())
    refund_rate = 0.2
    expected_refund = int(total_spent * refund_rate)

    sido_code = region_code[:2]

    support = next(
        (
            s for s in SUPPORTS
            if s.get("region_code") == region_code
            or s.get("region_code") == sido_code
        ),
        None,
    )

    tips = []
    if support:
        tips = support.get("tips") or []

    return {
        "expected_refund": expected_refund,
        "calculation_basis": [
            {"item": k, "amount": v, "description": f"{int(refund_rate * 100)}% 환급"}
            for k, v in spent.items()
        ],
        "tips": tips,
    }