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
            port=os.getenv("DB_PORT")
        )
        return conn
    except Exception as e:
        print(f"[ERROR] DB 연결 실패: {e}")
        return None

def execute_sql_file(file_path):
    """SQL 파일을 읽어서 DB에서 실행하는 함수"""
    conn = get_db_connection()
    if not conn:
        return

    try:
        with conn.cursor() as cursor:
            print(f"[DEBUG] {file_path} 실행 중...")
            with open(file_path, "r", encoding="utf-8") as f:
                sql_script = f.read()
            
            # SQL 파일 실행
            cursor.execute(sql_script)
            conn.commit()
            print(f"[DEBUG] {file_path} 실행 완료!")
    except Exception as e:
        conn.rollback()
        print(f"[ERROR] SQL 실행 중 에러 발생: {e}")
    finally:
        conn.close()