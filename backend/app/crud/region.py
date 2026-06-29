# 두루누비 sigun("부산 중구")의 시도 약어 → region 테이블의 정식 sido 명
_SIDO_MAP = {
    "서울": "서울특별시",
    "부산": "부산광역시",
    "대구": "대구광역시",
    "인천": "인천광역시",
    "광주": "광주광역시",
    "대전": "대전광역시",
    "울산": "울산광역시",
    "세종": "세종특별자치시",
    "경기": "경기도",
    "강원": "강원특별자치도",
    "충북": "충청북도",
    "충남": "충청남도",
    "전북": "전북특별자치도",
    "전남": "전라남도",
    "경북": "경상북도",
    "경남": "경상남도",
    "제주": "제주특별자치도",
}


def get_region_code(conn, sigun: str | None) -> str | None:
    """두루누비 sigun("부산 중구")을 region 테이블의 region_code로 변환한다.

    매칭 실패 시 None을 반환한다 (region_code는 NULL 허용).
    """
    if not sigun:
        return None

    parts = sigun.split()
    if len(parts) < 2:
        return None
    sido_abbr, gu = parts[0], parts[1]
    sido = _SIDO_MAP.get(sido_abbr)
    if not sido:
        return None

    with conn.cursor() as cur:
        cur.execute(
            "SELECT region_code FROM region WHERE name = %s AND sido = %s",
            (gu, sido),
        )
        row = cur.fetchone()
    return row[0] if row else None
