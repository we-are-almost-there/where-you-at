"""FAQ 시드 통합 검증. FAQ_TEST_DSN으로 지정한 테스트 PostgreSQL의 TEMP 테이블만 사용한다.

backend에서 python -m unittest tests.test_help_faq_postgres
DSN 미설정 시 건너뛴다. 운영 연결 설정이나 .env는 사용하지 않는다.
"""
import os
import unittest
from pathlib import Path
from unittest.mock import patch

import psycopg2

from app.db import supabase

QUESTIONS = ("따라가기 기록은 저장되나요?", "기록 카드 이미지는 어떻게 저장하나요?")
SQL = Path(__file__).resolve().parents[1] / "sql"


@unittest.skipUnless(os.environ.get("FAQ_TEST_DSN"), "FAQ_TEST_DSN 미설정")
class HelpFaqPostgresTest(unittest.TestCase):
    def setUp(self):
        self.conn = psycopg2.connect(os.environ["FAQ_TEST_DSN"])
        self.addCleanup(self.conn.close)
        with self.conn.cursor() as cur:
            # 실제 스키마의 고객지원 테이블과 트리거를 TEMP 스키마 안에 생성한다.
            cur.execute("CREATE TEMP TABLE faq_test_anchor (id integer)")
            cur.execute("SET search_path TO pg_temp")
            schema = (SQL / "01_schema.sql").read_text(encoding="utf-8")
            fixture = schema[schema.index("create or replace function set_updated_at()"):
                             schema.index("-- 4. inquiry")]
            # PostgreSQL은 함수 검색에서 pg_temp를 제외하므로 트리거 참조를 명시한다.
            cur.execute(fixture.replace("function set_updated_at()", "function pg_temp.set_updated_at()"))
            cur.execute((SQL / "04_help_seed.sql").read_text(encoding="utf-8"))
        self.conn.commit()

    def execute(self, filename):
        with self.conn.cursor() as cur:
            cur.execute((SQL / filename).read_text(encoding="utf-8"))
        self.conn.commit()

    def rows(self, targets_only=False):
        with self.conn.cursor() as cur:
            query = "SELECT id, question, answer, is_published FROM faq"
            if targets_only:
                cur.execute(query + " WHERE question IN %s ORDER BY id", (QUESTIONS,))
            else:
                cur.execute(query + " ORDER BY id")
            return cur.fetchall()

    def test_release_restore_repeat_and_default_seed_preserve_restored_faq(self):
        before = self.rows()
        self.execute("help_record_features.sql")
        self.execute("help_record_features_disabled.sql")
        restored = self.rows()
        self.assertEqual([r[:2] for r in before], [r[:2] for r in restored])
        self.assertEqual([r for r in before if r[1] not in QUESTIONS],
                         [r for r in restored if r[1] not in QUESTIONS])
        targets = self.rows(True)
        self.assertEqual(len(targets), 2)
        for row in targets:
            self.assertIn("서버 저장 기능", row[2])
            self.assertIn("제공하지 않", row[2])
            self.assertTrue(row[3])
        self.execute("help_record_features_disabled.sql")
        self.assertEqual(self.rows(), restored)
        self.execute("04_help_seed.sql")
        self.assertEqual(self.rows(True), targets)

    def test_missing_or_duplicate_faq_rolls_back_and_command_exits_1(self):
        from scripts.seed_help import main
        # 두 번째 UPDATE 실패도 검사해 첫 번째 UPDATE까지 취소되는지 확인한다.
        for question in QUESTIONS:
            for duplicate in (False, True):
                with self.subTest(question=question, duplicate=duplicate):
                    self.execute("help_record_features.sql")
                    with self.conn.cursor() as cur:
                        cur.execute("SAVEPOINT broken_fixture")
                        if duplicate:
                            cur.execute("INSERT INTO faq (category_id, question, answer) "
                                        "SELECT category_id, question, answer FROM faq WHERE question = %s", (question,))
                        else:
                            cur.execute("DELETE FROM faq WHERE question = %s", (question,))
                    before = self.rows()

                    class TestConnection:
                        def cursor(inner):
                            return self.conn.cursor()

                        def commit(inner):
                            raise AssertionError("누락·중복 FAQ를 커밋하면 안 됩니다")

                        def rollback(inner):
                            with self.conn.cursor() as cur:
                                cur.execute("ROLLBACK TO SAVEPOINT command_start")

                        def close(inner):
                            pass  # 테스트에서 같은 연결로 결과를 확인한다.

                    with self.conn.cursor() as cur:
                        cur.execute("SAVEPOINT command_start")
                    with patch.object(supabase, "get_db_connection", return_value=TestConnection()), self.assertRaises(SystemExit) as error:
                        main(["--no-record-features"])
                    self.assertEqual(error.exception.code, 1)
                    self.assertEqual(self.rows(), before)
                    with self.conn.cursor() as cur:
                        cur.execute("ROLLBACK TO SAVEPOINT broken_fixture")
                    self.conn.commit()
