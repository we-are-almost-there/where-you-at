"""nearby_spot 캐시 관리.

backend 폴더에서 실행:
    python -m scripts.refresh_nearby_cache --clean-expired
    python -m scripts.refresh_nearby_cache --course-id 5
    python -m scripts.refresh_nearby_cache --warm-all
"""

import argparse
import logging
from time import perf_counter

from app.crud.nearby import list_nearby_spots
from app.db.supabase import get_db_connection

logger = logging.getLogger(__name__)

_CATEGORIES = (
    "attraction",
    "restaurant",
    "accommodation",
    "bicycle",
)
_ROUTE_TYPES = ("trail", "bicycle")

_EXPIRING_COMBINATIONS_SQL = """
WITH available_routes AS (
    SELECT DISTINCT course_id, route_type
    FROM course_waypoint
    WHERE lat IS NOT NULL AND lng IS NOT NULL
      AND route_type = ANY(%s::text[])
), cache_expiry AS (
    SELECT base_id, route_type, nearby_type, min(expires_at) AS expires_at
    FROM nearby_spot
    WHERE base_type = 'course'
    GROUP BY base_id, route_type, nearby_type
)
SELECT c.id, r.route_type, cat.category
FROM course c
JOIN available_routes r ON r.course_id = c.id
CROSS JOIN unnest(%s::text[]) AS cat(category)
LEFT JOIN cache_expiry ns
    ON ns.base_id = c.id::text AND ns.route_type = r.route_type
    AND ns.nearby_type = cat.category
WHERE ns.expires_at IS NULL
    OR ns.expires_at <= now() + (%s * interval '1 hour')
ORDER BY c.id, r.route_type, cat.category
"""


class CourseNotFoundError(ValueError):
    """사용자가 지정한 코스가 존재하지 않는다."""


def positive_course_id(value: str) -> int:
    course_id = int(value)
    if course_id < 1:
        raise argparse.ArgumentTypeError("코스 ID는 1 이상이어야 합니다.")
    return course_id


def clean_expired(conn) -> int:
    """만료된 캐시 행을 삭제한다. 0건 결과를 나타내는 표시 행도 포함한다."""
    with conn.cursor() as cur:
        cur.execute("DELETE FROM nearby_spot WHERE expires_at <= now()")
        deleted = cur.rowcount
    conn.commit()
    return deleted


def warm_course(conn, course_id: int, *, force_refresh=False, combinations=None) -> None:
    """기본적으로 유효한 캐시는 재사용하고, 누락·만료된 캐시는 생성한다.

    force_refresh=True이면 유효한 캐시도 다시 계산해 교체한다.
    이때 경로가 없다고 확인된 조합의 기존 캐시는 삭제하며 빈 결과는 저장하지 않는다.
    combinations를 지정하면 전달된 (route_type, category) 조합만 처리한다.
    지정하지 않으면 모든 경로·카테고리 조합을 처리한다.
    """
    if combinations is None:
        combinations = [(route, category) for route in _ROUTE_TYPES for category in _CATEGORIES]
    for route_type, category in combinations:
        started = perf_counter()
        total, _, _ = list_nearby_spots(
            conn,
            course_id,
            category,
            route_type,
            page=1,
            size=1,
            strict_cache=True,
            force_refresh=force_refresh,
        )

        if total == 0:
            result = "조회 완료: 0건 (경로가 없으면 빈 결과 캐시를 생성하지 않음)"
        else:
            result = f"캐시 조회 또는 생성 완료: {total}건"

        print(
            f"course_id={course_id} "
            f"route_type={route_type} "
            f"category={category} -> {result}"
            f" elapsed_ms={(perf_counter() - started) * 1000:.1f}"
        )


def refresh_course(conn, course_id: int) -> None:
    """기존 캐시를 먼저 삭제하지 않고 강제 재계산한 뒤 조합별로 원자적으로 교체한다.

    경로가 없다고 확인된 조합의 기존 캐시는 삭제한다. 조회 오류 시에는 보존한다.
    """
    with conn.cursor() as cur:
        cur.execute(
            "SELECT 1 FROM course WHERE id = %s",
            (course_id,),
        )
        if cur.fetchone() is None:
            raise CourseNotFoundError(f"존재하지 않는 코스입니다: {course_id}")

    conn.commit()

    warm_course(conn, course_id, force_refresh=True)


def warm_all(*, refresh_before_hours=None) -> int:
    """실패 코스는 기록하고 다음 코스를 처리한다. 연결 생성·종료도 여기서 관리한다.

    실패 코스의 일부 조합은 이미 저장됐을 수 있다. 재연결이 실패하면 남은
    코스는 미처리로 집계하며, 실패 또는 미처리가 있으면 종료 코드 1을 반환한다.
    """
    started = perf_counter()
    conn = get_db_connection()
    if conn is None:
        logger.error("DB 연결 실패: 코스 목록을 조회하지 못했습니다.")
        return 1

    try:
        with conn.cursor() as cur:
            selected = {}
            if refresh_before_hours is None:
                cur.execute("SELECT id FROM course ORDER BY id")
                course_ids = [row[0] for row in cur.fetchall()]
            else:
                cur.execute(_EXPIRING_COMBINATIONS_SQL,
                            (list(_ROUTE_TYPES), list(_CATEGORIES), refresh_before_hours))
                for course_id, route_type, category in cur.fetchall():
                    selected.setdefault(course_id, []).append((route_type, category))
                course_ids = list(selected)
                print(f"갱신 대상 조합: {sum(map(len, selected.values()))}건")
        conn.commit()  # 목록 조회 트랜잭션을 끝내고 코스별 작업을 시작한다.

        succeeded = 0
        failed_ids = []
        unprocessed_ids = []

        for index, course_id in enumerate(course_ids):
            print(f"[{index + 1}/{len(course_ids)}] 코스 {course_id}")
            try:
                if refresh_before_hours is None:
                    warm_course(conn, course_id)
                else:
                    warm_course(conn, course_id, force_refresh=True, combinations=selected[course_id])
                conn.commit()  # 캐시 히트만 있었어도 코스별 조회 트랜잭션을 종료한다.
            except Exception:
                failed_ids.append(course_id)
                logger.exception(
                    "코스 %s 워밍업 실패 (일부 조합은 저장됐을 수 있음)",
                    course_id,
                )
                failed_conn, conn = conn, None
                try:
                    failed_conn.close()
                except Exception:
                    logger.exception("실패한 DB 연결 종료 중 오류 발생")

                if index + 1 < len(course_ids):
                    try:
                        conn = get_db_connection()
                    except Exception:
                        logger.exception("DB 재연결 중 오류 발생")
                    if conn is None:
                        unprocessed_ids = course_ids[index + 1:]
                        logger.error("DB 재연결 실패: 남은 코스 처리를 중단합니다.")
                        break
            else:
                succeeded += 1

        print(
            f"워밍업 결과: 전체 {len(course_ids)}건, 성공 {succeeded}건, "
            f"실패 {len(failed_ids)}건, 미처리 {len(unprocessed_ids)}건"
        )
        if failed_ids:
            print(f"실패 코스 ID: {failed_ids}")
        if unprocessed_ids:
            print(f"미처리 코스 ID: {unprocessed_ids}")
        print(f"total_seconds={perf_counter() - started:.3f}")
        return 1 if failed_ids or unprocessed_ids else 0
    except Exception:
        logger.exception("전체 워밍업을 완료하지 못했습니다.")
        return 1
    finally:
        if conn is not None:
            conn.close()


def main() -> int:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    parser = argparse.ArgumentParser(description=__doc__)
    actions = parser.add_mutually_exclusive_group()

    actions.add_argument(
        "--clean-expired",
        action="store_true",
        help="만료된 캐시 삭제",
    )
    actions.add_argument(
        "--course-id",
        type=positive_course_id,
        help=(
            "기존 캐시를 먼저 삭제하지 않고 특정 코스를 강제 재계산. "
            "경로가 없다고 확인된 조합의 기존 캐시는 삭제하며 조회 오류 시에는 보존"
        ),
    )
    actions.add_argument(
        "--refresh-expiring",
        type=float,
        metavar="HOURS",
        help="만료까지 HOURS 이하인 캐시와 누락 캐시를 재계산",
    )
    actions.add_argument(
        "--warm-all",
        action="store_true",
        help="전체 코스 캐시 워밍업 (유효한 캐시 유지)",
    )
    args = parser.parse_args()

    if not (
        args.clean_expired
        or args.course_id is not None
        or args.warm_all
        or args.refresh_expiring is not None
    ):
        parser.print_help()
        return 0

    if args.warm_all:
        return warm_all()
    if args.refresh_expiring is not None:
        if not 0 < args.refresh_expiring <= 720:
            parser.error("HOURS는 0보다 크고 720 이하여야 합니다.")
        return warm_all(refresh_before_hours=args.refresh_expiring)

    conn = get_db_connection()
    if conn is None:
        logger.error("DB 연결 실패: 캐시 작업을 실행하지 못했습니다.")
        return 1

    try:
        if args.clean_expired:
            deleted = clean_expired(conn)
            print(f"만료된 캐시 {deleted}건 삭제 완료")
        elif args.course_id is not None:
            refresh_course(conn, args.course_id)

        print("작업 완료")
        return 0
    except CourseNotFoundError as error:
        logger.error("%s", error)
        return 1
    except Exception:
        # CLI 최상위에서 오류를 기록하고 실패 종료한다.
        # 일부 작업은 이미 커밋됐을 수 있으며 전체 작업을 되돌리지는 않는다.
        logger.exception("캐시 작업 실패")
        return 1
    finally:
        conn.close()


if __name__ == "__main__":
    raise SystemExit(main())
