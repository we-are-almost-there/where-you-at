import argparse

from app.db.supabase import execute_sql_file


def main(argv=None):
    parser = argparse.ArgumentParser(description="공지·FAQ 시드 적용", allow_abbrev=False)
    state = parser.add_mutually_exclusive_group()
    state.add_argument(
        "--record-features", action="store_true",
        help="프론트 연동 배포 후, 기능 활성화 직전에 기록 저장 FAQ만 적용",
    )
    state.add_argument(
        "--no-record-features", action="store_true",
        help="기능 비활성화 후 기록 저장 FAQ 두 건을 공개 전 안내로 복구",
    )
    args = parser.parse_args(argv)
    path = "sql/help_record_features.sql" if args.record_features else "sql/04_help_seed.sql"
    if args.no_record_features:
        path = "sql/help_record_features_disabled.sql"
    # execute_sql_file은 실패해도 예외를 올리지 않는다. 반환값으로 실패를 확인해 종료 코드 1로 끝내,
    # 시드가 반영되지 않았는데 명령이 성공한 것처럼 보이지 않게 한다.
    if not execute_sql_file(path):
        raise SystemExit(1)


if __name__ == "__main__":
    main()
