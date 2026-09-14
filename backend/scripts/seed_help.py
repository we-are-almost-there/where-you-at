from app.db.supabase import execute_sql_file

if __name__ == "__main__":
    # execute_sql_file은 실패해도 예외를 올리지 않는다. 반환값으로 실패를 확인해 종료 코드 1로 끝내,
    # 시드가 반영되지 않았는데 명령이 성공한 것처럼 보이지 않게 한다.
    if not execute_sql_file("sql/04_help_seed.sql"):
        raise SystemExit(1)
