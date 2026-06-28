import httpx
from ..core.config import settings

# 공공데이터포털 두루누비 API
_BASE_URL = "https://apis.data.go.kr/B551011/Durunubi"


def fetch_course_list(page: int = 1, size: int = 100) -> list[dict]:
    """두루누비 API에서 코스 목록을 가져온다.
    Returns: crsIdx, crsKorNm, crsLevel, crsDstnc, gpxDownloadUrl 등이 담긴 dict 리스트
    """
    params = {
        "serviceKey": settings.durunubi_api_key,
        "numOfRows": size,
        "pageNo": page,
        "MobileOS": "ETC",
        "MobileApp": "where-you-at",
        "_type": "json",
    }
    resp = httpx.get(f"{_BASE_URL}/courseList", params=params, timeout=15)
    resp.raise_for_status()

    body = resp.json().get("response", {}).get("body", {})
    items = body.get("items")
    # 데이터가 없는 페이지는 items가 빈 문자열("")로 와서 .get()이 깨지므로 방어
    if not items or isinstance(items, str):
        return []
    item = items.get("item", [])
    # API는 결과가 1개이면 dict, 복수이면 list를 반환함
    return item if isinstance(item, list) else [item]


def fetch_all_courses() -> dict[str, dict]:
    """모든 페이지를 순회해 코스를 crsIdx 기준 dict로 반환한다."""
    courses: dict[str, dict] = {}
    page = 1
    while True:
        rows = fetch_course_list(page=page, size=100)
        if not rows:
            break
        for row in rows:
            courses[row["crsIdx"]] = row
        page += 1
    return courses


def fetch_gpx(url: str) -> str:
    """GPX 파일 URL에서 XML 문자열을 다운로드해 반환한다."""
    resp = httpx.get(url, timeout=30, follow_redirects=True)
    resp.raise_for_status()
    return resp.text


if __name__ == "__main__":
    import sys, json
    # 사용법: python -m app.services.durunubi [gpx_url]
    # 예시 1) 코스 목록 조회 (API 키 필요)
    if settings.durunubi_api_key:
        courses = fetch_course_list(page=1, size=5)
        print(f"[courseList] {len(courses)}개 수신")
        print(json.dumps(courses[0], ensure_ascii=False, indent=2))
    else:
        print("[courseList] DURUNUBI_API_KEY 미설정")

    # 예시 2) GPX 다운로드 (URL을 인자로 전달하거나 mock 데이터의 첫 번째 URL 사용)
    gpx_url = (
        sys.argv[1]
        if len(sys.argv) > 1
        else "https://www.durunubi.kr/editImgUp.do"
            "?filePath=/data/koreamobility/course/summap/T_CRS_MNG0000005117.gpx"
    )
    print(f"\n[fetch_gpx] {gpx_url}")
    try:
        xml = fetch_gpx(gpx_url)
        print(f"  수신 성공: {len(xml)} chars")
        print(f"  첫 200자: {xml[:200]}")
    except Exception as e:
        print(f"  실패: {e}")
