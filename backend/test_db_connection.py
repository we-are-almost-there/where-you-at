from app.db.supabase import get_db_connection

def test_db():
    print("🔌 Supabase 연결 테스트를 시작합니다...")
    
    # 우리가 만든 연결 통로(함수) 불러오기
    conn = get_db_connection()
    
    if conn:
        try:
            # 커서(명령어를 전달하는 객체) 생성
            cursor = conn.cursor()
            
            # DB에게 던질 아주 간단한 질문 (버전 확인)
            cursor.execute("SELECT version();")
            
            # DB의 답변 가져오기
            db_version = cursor.fetchone()
            
            print("\n========================================")
            print("✅ Supabase DB 연결 대성공! 🎉")
            print(f"📦 접속된 DB 정보: {db_version[0]}")
            print("========================================\n")
            
        except Exception as e:
            print(f"❌ 쿼리 실행 실패: {e}")
            
        finally:
            # 확인이 끝났으니 통로 닫기
            cursor.close()
            conn.close()
            print("🔒 DB 연결을 안전하게 종료했습니다.")
    else:
        print("❌ 연결에 실패했습니다. .env 파일의 5가지 항목을 다시 확인해 주세요.")

if __name__ == "__main__":
    test_db()