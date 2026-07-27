import sys, os
_BACKEND = os.path.dirname(os.path.dirname(__file__))
sys.path.insert(0, _BACKEND)

from app.db.supabase import get_db_connection
from app.crud.nearby import list_nearby_spots

CATEGORIES = ["attraction", "restaurant", "accommodation", "bicycle"]
ROUTE_TYPES = ["trail", "bicycle"]

def main():
    conn = get_db_connection()
    with conn.cursor() as cur:
        cur.execute("SELECT id FROM course")
        course_ids = [row[0] for row in cur.fetchall()]

    for course_id in course_ids:
        for route_type in ROUTE_TYPES:
            for category in CATEGORIES:
                total, _ = list_nearby_spots(conn, course_id, category, route_type)
                print(f"course {course_id} / {route_type} / {category}: {total}건 캐시 완료")

    conn.close()

if __name__ == "__main__":
    main()