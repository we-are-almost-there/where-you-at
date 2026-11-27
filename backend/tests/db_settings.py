"""테스트 전용 PostgreSQL 접속 정보를 읽는다.

DB 통합 테스트는 접속 정보가 없으면 건너뛴다. CI는 REQUIRE_DB_TESTS=1로 실행해, 접속 정보가 빠졌을 때
조용히 건너뛰지 않고 테스트 모듈을 불러오는 단계에서 실패하게 한다.
"""
import os


def read_test_dsn(name):
    value = os.environ.get(name)
    if not value and os.environ.get("REQUIRE_DB_TESTS"):
        raise RuntimeError(f"REQUIRE_DB_TESTS가 켜져 있는데 {name}이 없습니다")
    return value
