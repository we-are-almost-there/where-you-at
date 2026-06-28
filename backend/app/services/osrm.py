import httpx

_BASE_URL = "https://router.project-osrm.org/route/v1/bike"
_SAMPLE_COUNT = 50


def fetch_bicycle_route(waypoints: list[dict]) -> tuple[list[dict], float]:
    """GPX waypoints를 샘플링해 OSRM 자전거 경로 좌표와 총 거리(m)를 반환한다.

    Returns: ([{"lat", "lng", "sequence_order"}, ...], distance_m)
    경로가 없으면 ([], 0.0).
    """
    if len(waypoints) < 2:
        return [], 0.0

    sampled = _sample(waypoints, _SAMPLE_COUNT)
    coords = ";".join(f"{wp['lng']},{wp['lat']}" for wp in sampled)

    resp = httpx.get(
        f"{_BASE_URL}/{coords}",
        params={"overview": "full", "geometries": "geojson"},
        timeout=15,
    )
    resp.raise_for_status()

    data = resp.json()
    if data.get("code") != "Ok":
        return [], 0.0

    route = data["routes"][0]
    coordinates = route["geometry"]["coordinates"]
    wps = [
        {"lat": lat, "lng": lng, "sequence_order": i + 1}
        for i, (lng, lat) in enumerate(coordinates)
    ]
    return wps, route["distance"]


def _sample(waypoints: list[dict], n: int) -> list[dict]:
    if len(waypoints) <= n:
        return waypoints
    step = len(waypoints) / n
    return [waypoints[int(i * step)] for i in range(n)]
