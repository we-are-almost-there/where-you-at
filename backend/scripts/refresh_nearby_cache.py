"""nearby_spot 캐시 관리.

backend 폴더에서 실행:
    python -m scripts.refresh_nearby_cache --clean-expired
    python -m scripts.refresh_nearby_cache --course-id 5
    python -m scripts.refresh_nearby_cache --warm-all
"""

import argparse
import logging

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


def warm_course(conn, course_id: int) -> None:
    """유효한 캐시는 사용하고, 없는 캐시는 생성한다."""
    for route_type in _ROUTE_TYPES:
        for category in _CATEGORIES:
            total, _, _ = list_nearby_spots(
                conn,
                course_id,
                category,
                route_type,
                page=1,
                size=1,
                strict_cache=True,
            )

            if total == 0:
                result = "조회 완료: 0건 (경로가 없으면 빈 결과 캐시를 생성하지 않음)"
            else:
                result = f"캐시 조회 또는 생성 완료: {total}건"

            print(
                f"course_id={course_id} "
                f"route_type={route_type} "
                f"category={category} -> {result}"
            )


def refresh_course(conn, course_id: int) -> None:
    """대상 코스의 캐시를 삭제한 뒤 다시 조회·생성한다."""
    with conn.cursor() as cur:
        cur.execute(
            "SELECT 1 FROM course WHERE id = %s",
            (course_id,),
        )
        if cur.fetchone() is None:
            raise CourseNotFoundError(f"존재하지 않는 코스입니다: {course_id}")

        cur.execute(
            """
            DELETE FROM nearby_spot
            WHERE base_type = 'course' AND base_id = %s
            """,
            (str(course_id),),
        )
    conn.commit()

    warm_course(conn, course_id)


def warm_all() -> int:
    """실패 코스는 기록하고 다음 코스를 처리한다. 연결 생성·종료도 여기서 관리한다.

    실패 코스의 일부 조합은 이미 저장됐을 수 있다. 재연결이 실패하면 남은
    코스는 미처리로 집계하며, 실패 또는 미처리가 있으면 종료 코드 1을 반환한다.
    """
    conn = get_db_connection()
    if conn is None:
        logger.error("DB 연결 실패: 코스 목록을 조회하지 못했습니다.")
        return 1

    try:
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM course ORDER BY id")
            course_ids = [row[0] for row in cur.fetchall()]
        conn.commit()  # 목록 조회 트랜잭션을 끝내고 코스별 작업을 시작한다.

        succeeded = 0
        failed_ids = []
        unprocessed_ids = []

        for index, course_id in enumerate(course_ids):
            print(f"[{index + 1}/{len(course_ids)}] 코스 {course_id}")
            try:
                warm_course(conn, course_id)
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
        help="특정 코스 캐시 삭제 후 재계산",
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
    ):
        parser.print_help()
        return 0

    if args.warm_all:
        return warm_all()

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
