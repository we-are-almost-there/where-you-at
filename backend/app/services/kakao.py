import httpx
from ..core.config import settings

# 카카오 로컬 - 좌표를 주소로 변환
_COORD2ADDRESS_URL = "https://dapi.kakao.com/v2/local/geo/coord2address.json"
_COORD2REGION_URL = "https://dapi.kakao.com/v2/local/geo/coord2regioncode.json"


def coord2address(lat: float, lng: float) -> str | None:
    """위경도를 도로명 주소(없으면 지번 주소)로 변환한다.

    지번/도로명 주소가 없는 좌표(둑·교차로 등 필지 미부여 구역)는
    행정동 주소(coord2regioncode)로 fallback한다.

    REST API 키가 없거나 결과가 없으면 None을 반환한다.
    카카오 API는 x=경도(lng), y=위도(lat) 순서를 받는다.
    """
    if not settings.kakao_rest_api_key:
        return None

    headers = {"Authorization": f"KakaoAK {settings.kakao_rest_api_key}"}
    params = {"x": lng, "y": lat}

    resp = httpx.get(_COORD2ADDRESS_URL, params=params, headers=headers, timeout=10)
    resp.raise_for_status()
    docs = resp.json().get("documents", [])
    if docs:
        doc = docs[0]
        road = doc.get("road_address")
        if road and road.get("address_name"):
            return road["address_name"]
        addr = doc.get("address")
        if addr:
            return addr["address_name"]

    # 지번/도로명이 없으면 행정동(법정동 B → 행정동 H) 주소로 fallback
    resp = httpx.get(_COORD2REGION_URL, params=params, headers=headers, timeout=10)
    resp.raise_for_status()
    regions = resp.json().get("documents", [])
    for region in regions:
        if region.get("region_type") == "B" and region.get("address_name"):
            return region["address_name"]
    return regions[0]["address_name"] if regions else None
