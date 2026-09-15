from fastapi import APIRouter, Depends, HTTPException, Query

from ...deps import get_db
from ...crud import course as crud
from ...crud import nearby as nearby_crud
from ...schemas.course import (
    CourseListResponse,
    CourseStart,
    CourseDetail,
    RouteDetail,
    Bounds,
    GpxResponse,
)
from ...schemas.nearby import NearbyListResponse

router = APIRouter(prefix="/api/courses", tags=["courses"])


@router.get("", response_model=CourseListResponse)
def get_courses(
    # 2자리(시도) 또는 5자리(시군구) 법정동 코드만 허용. 그 외 값은 422로 걸러 조용한 오필터를 막는다.
    region: str | None = Query(None, pattern=r"^\d{2}(\d{3})?$"),
    type: str | None = None,
    distance: str | None = None,
    difficulty: str | None = None,
    keyword: str | None = None,
    sort: str | None = None,
    page: int = Query(1, ge=1),
    # 이용자 위치를 서버로 받지 않으므로 '가까운 순'은 브라우저가 필터에 맞는 코스 전체를 받아 정렬한다.
    # 그래서 한 번에 전체를 받을 수 있게 상한을 코스 수(약 300개)보다 넉넉히 둔다.
    size: int = Query(20, ge=1, le=500),
    conn=Depends(get_db),
):
    total, rows = crud.list_courses(
        conn,
        region=region,
        type=type,
        difficulty=difficulty,
        keyword=keyword,
        distance=distance,
        sort=sort,
        page=page,
        size=size,
    )
    return {"total_count": total, "page": page, "size": size, "courses": rows}


# /{id}보다 먼저 선언해야 "starts"가 id 경로로 잡히지 않는다.
@router.get("/starts", response_model=list[CourseStart])
def get_course_starts(conn=Depends(get_db)):
    """도보 경로가 있는 모든 코스의 출발점과 카드 정보. 홈 '가까운 코스'를 브라우저에서 고르는 데 쓴다.

    이용자 위치를 서버로 보내지 않기 위해, 위치와 상관없이 항상 같은 전체 목록을 준다.
    목록(GET /api/courses)과 달리 썸네일 경로 좌표를 빼 크기를 줄였다.
    """
    return crud.list_course_starts(conn)


@router.get("/{id}", response_model=CourseDetail)
def get_course(id: int, conn=Depends(get_db)):
    row = crud.get_course_detail(conn, id)
    if not row:
        raise HTTPException(status_code=404, detail="Course not found")

    routes = [
        RouteDetail(
            route_type=rt["route_type"],
            distance=rt["distance"],
            estimated_time=rt["estimated_time"],
            difficulty=rt["difficulty"],
            start_lat=rt["start_lat"],
            start_lng=rt["start_lng"],
            bounds=Bounds(
                min_lat=rt["min_lat"],
                max_lat=rt["max_lat"],
                min_lng=rt["min_lng"],
                max_lng=rt["max_lng"],
            ),
        )
        for rt in row["routes"]
    ]

    return CourseDetail(
        id=row["id"],
        title=row["title"],
        description=row["description"],
        start_address=row["start_address"],
        region_code=row["region_code"],
        image_url=row["image_url"],
        original_gpx_url=row["original_gpx_url"],
        is_population_drop_zone=row["is_population_drop_zone"],
        routes=routes,
    )


@router.get("/{id}/gpx", response_model=GpxResponse)
def get_course_gpx(id: int, route_type: str = "trail", conn=Depends(get_db)):
    """코스 전체 경로 좌표 (상세 지도용). route_type으로 도보/자전거 구분."""
    # 없는 코스와 "경로가 아직 안 들어온 코스"를 구분한다.
    # 확인 없이 빈 배열을 주면 클라이언트가 둘을 똑같이 처리해 잘못된 id를 눈치채지 못한다.
    if not crud.course_exists(conn, id):
        raise HTTPException(status_code=404, detail="Course not found")

    waypoints = crud.get_waypoints(conn, id, route_type)
    return {"course_id": id, "route_type": route_type, "waypoints": waypoints}



@router.get("/{id}/nearby", response_model=NearbyListResponse)
def get_course_nearby(
    id: int,
    category: str = Query(..., pattern="^(attraction|restaurant|accommodation|bicycle)$"),
    route_type: str = Query("trail", pattern="^(trail|bicycle)$"),
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=50),
    conn=Depends(get_db),
):
    """코스 주변 시설 조회. (구 nearby.py에서 이관)"""
    if not crud.course_exists(conn, id):
        raise HTTPException(status_code=404, detail="Course not found")

    total, spots, version = nearby_crud.list_nearby_spots(
        conn, id, category, route_type, page, size
    )
    return {
        "total_count": total,
        "spots": spots,
        "list_version": version,
    }
