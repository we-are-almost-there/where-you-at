from psycopg2.extras import RealDictCursor


# 코스가 실제로 존재하는 지역만 반환한다 (빈 시군구로 드롭다운이 지저분해지는 것 방지).
# region.region_code(5자리 시군구)와 course.region_code를 조인. sido 정렬로 프론트 그룹핑 편의 제공.
_REGIONS_WITH_COURSE_SQL = """
SELECT DISTINCT r.region_code, r.name, r.sido, r.is_population_drop
FROM region r
JOIN course c ON c.region_code = r.region_code
{where}
ORDER BY r.region_code
"""


def list_regions_with_courses(conn, sido: str | None = None) -> list[dict]:
    """코스를 보유한 지역 목록을 반환한다. sido(시도명) 지정 시 해당 시도로 필터."""
    where = ""
    params: list = []
    if sido:
        where = "WHERE r.sido = %s"
        params.append(sido)
    sql = _REGIONS_WITH_COURSE_SQL.format(where=where)
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(sql, params)
        return cur.fetchall()


# 두루누비 sigun("부산 중구")의 시도 약어 → region 테이블의 정식 sido 명
_SIDO_MAP = {
    "서울": "서울특별시",
    "부산": "부산광역시",
    "대구": "대구광역시",
    "인천": "인천광역시",
    "광주": "전남광주통합특별시",  # 행정구역 개편: 광주·전남 통합
    "대전": "대전광역시",
    "울산": "울산광역시",
    "세종": "세종특별자치시",
    "경기": "경기도",
    "강원": "강원특별자치도",
    "충북": "충청북도",
    "충남": "충청남도",
    "전북": "전북특별자치도",
    "전남": "전남광주통합특별시",  # 행정구역 개편: 광주·전남 통합
    "경북": "경상북도",
    "경남": "경상남도",
    "제주": "제주특별자치도",
}


# 행정표준코드 시도 접두(2자리) → region 테이블의 정식 시도명
_CODE2_SIDO = {
    "11": "서울특별시",
    "26": "부산광역시",
    "27": "대구광역시",
    "28": "인천광역시",
    "12": "전남광주통합특별시",  # 광주·전남 통합 신규 코드(구 29 광주·46 전남 폐지)
    "30": "대전광역시",
    "31": "울산광역시",
    "36": "세종특별자치시",
    "41": "경기도",
    "43": "충청북도",
    "44": "충청남도",
    "47": "경상북도",
    "48": "경상남도",
    "50": "제주특별자치도",
    "51": "강원특별자치도",
    "52": "전북특별자치도",
}

# 정식 시도명 → 축약형 (부산광역시 → 부산). _SIDO_MAP(축약→정식)의 역방향.
_SIDO_ABBR = {full: abbr for abbr, full in _SIDO_MAP.items()}
_SIDO_FULL_SET = set(_CODE2_SIDO.values())


def parse_sido_sigungu(address: str | None) -> tuple[str, str] | None:
    """주소 → (정식 시도, 시군구 lookup명). DB 무관 순수 함수. 판별 실패 시 None.

    수집·백필의 주소는 항상 시도로 시작한다(축약 "부산"/"경남" 또는 정식). 그 다음 토큰이
    도면 시/군("창원시","고성군"), 광역시면 구("동구")로, region 테이블 name과 같은 단위다.
    "경남 창원시 진해구"의 진해구는 시(창원시)로 자연히 흡수된다(parts[1]만 쓰므로).
    """
    if not address:
        return None
    parts = address.split()
    if len(parts) < 2:
        return None
    sido = _SIDO_MAP.get(parts[0], parts[0])  # 축약→정식, 이미 정식이면 그대로
    if sido not in _SIDO_FULL_SET:
        return None
    return sido, parts[1]


def region_code_from_address(conn, address: str | None) -> str | None:
    """출발지 주소에서 region 테이블의 region_code를 역산 (외부 API 불필요).

    region_code(두루누비 sigun 유래)가 실제 출발지와 어긋나는 문제를 바로잡는 데 쓴다.
    매칭 실패 시 None → 호출부가 기존 방식(sigun)으로 폴백하게 한다.
    """
    parsed = parse_sido_sigungu(address)
    if not parsed:
        return None
    sido, name = parsed
    with conn.cursor() as cur:
        cur.execute(
            "SELECT region_code FROM region WHERE name = %s AND sido = %s",
            (name, sido),
        )
        row = cur.fetchone()
    return row[0] if row else None


def normalize_address(address: str | None, region_code: str | None) -> str | None:
    """start_address의 시도 표기를 공식명칭으로 통일한다.
    두루누비/카카오 주소가 "부산 …"(축약), "창원시 …"(시도 누락)처럼 제각각이라
    region_code 앞 2자리로 정식 시도명을 판정해 앞부분을 교체하거나 보강한다.
    이미 "부산광역시 …"면 그대로, 매핑 실패(코드 미상)면 원본을 유지한다.

    앞 토큰이 region_code가 가리키는 '자기 시도'의 축약/정식명일 때만 교체한다.
    (전역 시도 집합으로 판정하면 "경기도 광주시"의 "광주"를 광주광역시로 오인해 시를 지운다.)
    """
    if not address or not region_code:
        return address
    sido = _CODE2_SIDO.get(region_code[:2])
    if not sido:
        return address
    first, _, rest = address.partition(" ")
    if first == sido or first == _SIDO_ABBR.get(sido):  # 앞 토큰이 자기 시도 → 공식명으로 교체
        return f"{sido} {rest}".strip()
    return f"{sido} {address}"  # 시도 누락 → 공식명 앞에 보강


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
