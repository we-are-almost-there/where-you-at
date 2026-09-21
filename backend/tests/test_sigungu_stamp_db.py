"""별도 PostgreSQL에서 상태 계산·경합·탈퇴를 확인한다.

SIGUNGU_TEST_DATABASE_URL에 테스트 전용 DB를 지정한다. 운영 연결 설정은 사용하지 않는다.
각 테스트는 무작위 스키마만 만들고 정리한다.
"""

import os
import unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from threading import Barrier
from uuid import uuid4

import psycopg2
from psycopg2 import sql

from app.crud.sigungu_stamp import create_stamp, list_stamps
from app.sigungu_codes import SIGUNGU_CODES

TEST_DSN = os.environ.get("SIGUNGU_TEST_DATABASE_URL")


@unittest.skipUnless(TEST_DSN, "SIGUNGU_TEST_DATABASE_URL이 지정되지 않았습니다")
class SigunguStampDatabaseTest(unittest.TestCase):
    def setUp(self):
        self.schema = "stamp_test_" + uuid4().hex
        self.admin = psycopg2.connect(TEST_DSN)
        self.admin.autocommit = True
        with self.admin.cursor() as cur:
            cur.execute(sql.SQL("create schema {}").format(sql.Identifier(self.schema)))
        self.addCleanup(self.clean_schema)
        self.conn = self.connect()
        self.addCleanup(self.conn.close)
        with self.conn.cursor() as cur:
            cur.execute("""
                create table app_user (id bigint primary key);
                create table region (region_code varchar(10) unique);
                create table course (id bigint primary key, region_code varchar(10));
                create table run_record (user_id bigint, course_id bigint);
                insert into app_user values (7), (8);
                insert into course values (1, '51110'), (2, null), (3, '51130');
            """)
            cur.executemany("insert into region values (%s)", [(code,) for code in SIGUNGU_CODES])
            migration = Path(__file__).resolve().parents[1] / "sql/13_user_sigungu_stamps.sql"
            # 운영 SQL의 public 한정자만 격리 스키마로 바꿔 같은 DDL을 검증한다.
            cur.execute(migration.read_text("utf-8").replace("public.", self.schema + "."))
        self.conn.commit()

    def connect(self):
        conn = psycopg2.connect(TEST_DSN)
        with conn.cursor() as cur:
            cur.execute(sql.SQL("set search_path to {}").format(sql.Identifier(self.schema)))
        conn.commit()
        return conn

    def clean_schema(self):
        with self.admin.cursor() as cur:
            cur.execute(sql.SQL("drop schema {} cascade").format(sql.Identifier(self.schema)))
        self.admin.close()

    def complete(self, user=7, course=1):
        with self.conn.cursor() as cur:
            cur.execute("insert into run_record values (%s, %s, true)", (user, course))
        self.conn.commit()

    def states(self):
        return {row["sigungu_code"]: row for row in list_stamps(self.conn, user_id=7)}

    def test_locked_other_user_and_null_region(self):
        self.complete(user=8)
        self.complete(course=2)
        rows = self.states()
        self.assertEqual(set(rows), set(SIGUNGU_CODES))
        self.assertTrue(all(row["status"] == "LOCKED" and row["stamped_at"] is None for row in rows.values()))
        self.assertEqual(create_stamp(self.conn, user_id=7, code="51110"), (None, False, 409))

    def test_available_stamped_and_repeat(self):
        # 이전 클라이언트가 완주 여부 없이 저장한 기록은 스탬프 자격이 없다.
        with self.conn.cursor() as cur:
            cur.execute("insert into run_record (user_id, course_id) values (7, 1)")
        self.conn.commit()
        self.assertEqual(self.states()["51110"]["status"], "LOCKED")
        self.assertEqual(create_stamp(self.conn, user_id=7, code="51110"), (None, False, 409))
        self.complete()
        self.assertEqual(self.states()["51110"]["status"], "AVAILABLE")
        first, created, status = create_stamp(self.conn, user_id=7, code="51110")
        self.assertEqual((created, status), (True, 201))
        second, created, status = create_stamp(self.conn, user_id=7, code="51110")
        self.assertEqual((created, status), (False, 200))
        self.assertEqual(first, second)
        self.assertEqual(self.states()["51110"]["status"], "STAMPED")
        with self.conn.cursor() as cur:
            cur.execute("delete from run_record")
        self.conn.commit()
        self.assertEqual(self.states()["51110"]["status"], "STAMPED")

    def test_concurrent_requests_keep_one_row(self):
        self.complete()
        barrier = Barrier(2)

        def stamp():
            conn = self.connect()
            try:
                barrier.wait(timeout=10)
                return create_stamp(conn, user_id=7, code="51110")
            finally:
                conn.close()

        with ThreadPoolExecutor(max_workers=2) as executor:
            futures = [executor.submit(stamp) for _ in range(2)]
            results = [future.result(timeout=20) for future in futures]
        self.assertEqual(sorted(result[2] for result in results), [200, 201])
        self.assertEqual(results[0][0], results[1][0])
        with self.conn.cursor() as cur:
            cur.execute("select count(*) from user_sigungu_stamps")
            self.assertEqual(cur.fetchone()[0], 1)

    def test_user_deletion_cascades_and_rls_enabled(self):
        self.complete()
        create_stamp(self.conn, user_id=7, code="51110")
        with self.conn.cursor() as cur:
            cur.execute("delete from app_user where id = 7")
            cur.execute("select count(*) from user_sigungu_stamps")
            self.assertEqual(cur.fetchone()[0], 0)
            cur.execute("select relrowsecurity from pg_class where oid = 'user_sigungu_stamps'::regclass")
            self.assertTrue(cur.fetchone()[0])
