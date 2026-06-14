from app.db.supabase import get_db_connection

def seed_region():
    print("[DEBUG] region 데이터 적재 시작...")
    conn = get_db_connection()
    if not conn:
        print("[ERROR] DB 연결 실패")
        return

    try:
        cursor = conn.cursor()
        # region_seed.sql 읽어서 실행
        with open('sql/02_region_seed.sql', encoding='utf-8') as f:
            cursor.execute(f.read())
        conn.commit()

        # 적재 확인
        cursor.execute("select count(*) from region;")
        total = cursor.fetchone()[0]
        cursor.execute("select count(*) from region where is_population_drop = true;")
        pop = cursor.fetchone()[0]

        print(f"[DEBUG] region 적재 완료! 총 {total}개 (인구감소지역 {pop}곳)")
    except Exception as e:
        print(f"[ERROR] 적재 실패: {e}")
        conn.rollback()
    finally:
        cursor.close()
        conn.close()
        print("[DEBUG] 연결 종료")

if __name__ == "__main__":
    seed_region()