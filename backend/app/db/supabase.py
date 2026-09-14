import os
import psycopg2
from psycopg2.extras import RealDictCursor
from dotenv import load_dotenv


load_dotenv()

def get_db_connection():
    """Supabase PostgreSQL DB에 연결하는 함수"""
    try:
        conn = psycopg2.connect(
            host=os.getenv("DB_HOST"),
            database=os.getenv("DB_NAME"),
            user=os.getenv("DB_USER"),
            password=os.getenv("DB_PASSWORD"),
            port=os.getenv("DB_PORT"),
            # 연결 거부(포트 닫힘)는 즉시 실패하지만, 패킷이 드롭되는 상황
            # (Supabase 일시정지·방화벽 변경·네트워크 분리)에서는 SYN 재시도로
            # 리눅스 기준 130초쯤 블록한다. 이 함수를 부르는 readiness와 get_db가
            # sync라 그동안 anyio 스레드풀(기본 40) 슬롯을 하나씩 물고 있고,
            # 슬롯이 다 차면 DB를 쓰지 않는 /health까지 스케줄되지 못해
            # liveness가 실패한다 — 헬스체크를 나눠서 막으려던 바로 그 상황이다.
            connect_timeout=3,
        )
        return conn
    except Exception as e:
        print(f"[ERROR] DB 연결 실패: {e}")
        return None

def execute_sql_file(file_path):
    """SQL 파일을 읽어서 DB에서 실행하는 함수. 성공하면 True, 연결 실패나 실행 오류면 False.

    실패 원인은 출력만 하고 예외는 올리지 않는다. 실패를 종료 코드로 알려야 하는 스크립트는
    반환값을 확인한다(scripts/seed_help.py). 반환값을 쓰지 않는 기존 호출부는 동작이 그대로다.
    """
    conn = get_db_connection()
    if not conn:
        return False

    try:
        with conn.cursor() as cursor:
            print(f"[DEBUG] {file_path} 실행 중...")
            with open(file_path, "r", encoding="utf-8") as f:
                sql_script = f.read()

            # SQL 파일 실행
            cursor.execute(sql_script)
            conn.commit()
            print(f"[DEBUG] {file_path} 실행 완료!")
        return True
    except Exception as e:
        conn.rollback()
        print(f"[ERROR] SQL 실행 중 에러 발생: {e}")
        return False
    finally:
        conn.close()
