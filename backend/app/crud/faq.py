"""
faq 테이블 조회 CRUD 함수

race.py와 같은 psycopg2 raw SQL + RealDictCursor 패턴.
"""

from psycopg2.extras import RealDictCursor


def get_faqs(conn):
    """공개된 FAQ 전체 조회.

    페이지네이션은 두지 않는다. FAQ는 수십 건 이내이고 화면에서 카테고리별로 한꺼번에
    펼쳐 보여주므로 나눠 받을 이유가 없다.

    정렬은 카테고리 순서(faq_category.sort_order) → 카테고리 안의 순서(faq.sort_order)다.
    같은 카테고리의 행이 붙어서 나오므로 프론트는 위에서부터 이름이 바뀌는 곳마다 묶으면 된다.
    응답에는 category_id 대신 카테고리 이름을 넣어, 테이블을 나누기 전과 같은 형태를 유지한다.
    """
    query = """
        select f.id, c.name as category, f.question, f.answer
        from faq f
        join faq_category c on c.id = f.category_id
        where f.is_published
        order by c.sort_order, c.id, f.sort_order, f.id
    """
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(query)
        return cur.fetchall()
