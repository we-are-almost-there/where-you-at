"""기존 course.region_code를 start_address 기반으로 교정한다.

region_code(두루누비 sigun 유래)가 실제 출발지와 어긋난 데이터를 바로잡는다.
기본은 dry-run(쓰기 없음). 실제 반영하려면:  python scripts/backfill_region.py --apply

결과 상세는 UTF-8로 scripts/_backfill_out.txt 에 기록(터미널 한글 깨짐 회피).
"""
import sys

sys.path.insert(0, ".")
from app.db.supabase import get_db_connection
from app.crud.region import region_code_from_address

apply = "--apply" in sys.argv


def main() -> None:
    conn = get_db_connection()
    with conn.cursor() as cur:
        cur.execute("SELECT id, course_title, start_address, region_code FROM course ORDER BY id")
        rows = cur.fetchall()

    changes = []      # (id, title, addr, old, new)
    unresolved = []   # (id, title, addr, old)  주소 역산 실패
    for cid, title, addr, old_rc in rows:
        new_rc = region_code_from_address(conn, addr)
        if new_rc is None:
            unresolved.append((cid, title, addr, old_rc))
        elif new_rc != old_rc:
            changes.append((cid, title, addr, old_rc, new_rc))

    lines = ["[변경 대상]"]
    for cid, title, addr, old, new in changes:
        lines.append(f"  id={cid:3d} {old} -> {new}  ({title} / {addr})")
    lines.append("")
    lines.append("[주소 역산 실패(변경 안 함, 기존 유지)]")
    for cid, title, addr, old in unresolved:
        lines.append(f"  id={cid:3d} rc={old} addr={addr}  ({title})")
    lines.append("")
    lines.append(f"총 {len(rows)}개 · 변경 {len(changes)} · 역산실패 {len(unresolved)} · "
                f"{'APPLIED' if apply else 'DRY-RUN(미반영)'}")
    with open("scripts/_backfill_out.txt", "w", encoding="utf-8") as f:
        f.write("\n".join(lines))

    if apply and changes:
        with conn.cursor() as cur:
            for cid, _, _, _, new in changes:
                cur.execute("UPDATE course SET region_code = %s WHERE id = %s", (new, cid))
        conn.commit()

    print(f"done: changes={len(changes)} unresolved={len(unresolved)} "
        f"{'APPLIED' if apply else 'DRY-RUN'}")


if __name__ == "__main__":
    main()
