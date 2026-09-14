"""app/db/supabase.py의 execute_sql_file 성공 여부와 scripts/seed_help.py 종료 코드 테스트 (unittest, DB 없이 patch).

execute_sql_file은 실패해도 예외를 올리지 않아서, 반환값이 없으면 시드가 반영되지 않아도
명령이 종료 코드 0으로 끝났다. 성공 여부를 돌려주고 seed_help가 실패 시 1로 끝나는지 본다.

실행 (backend/ 에서):
    python -m unittest tests.test_execute_sql_file
"""
import io
import os
import runpy
import tempfile
import unittest
from contextlib import redirect_stdout
from unittest.mock import MagicMock, patch

from app.db import supabase


class TestExecuteSqlFile(unittest.TestCase):
    def setUp(self):
        fd, self.path = tempfile.mkstemp(suffix=".sql")
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write("select 1;")

    def tearDown(self):
        os.remove(self.path)

    def _conn(self, execute_error=None):
        conn = MagicMock()
        cursor = conn.cursor.return_value.__enter__.return_value
        if execute_error is not None:
            cursor.execute.side_effect = execute_error
        return conn

    def test_returns_true_and_commits_on_success(self):
        conn = self._conn()
        with patch.object(supabase, "get_db_connection", return_value=conn), redirect_stdout(io.StringIO()):
            self.assertIs(supabase.execute_sql_file(self.path), True)
        conn.commit.assert_called_once()
        conn.close.assert_called_once()

    def test_returns_false_when_connection_fails(self):
        # None도 거짓이라 assertFalse로는 반환값이 없던 이전 동작과 구분되지 않는다.
        with patch.object(supabase, "get_db_connection", return_value=None), redirect_stdout(io.StringIO()):
            self.assertIs(supabase.execute_sql_file(self.path), False)

    def test_returns_false_and_rolls_back_when_sql_fails(self):
        conn = self._conn(execute_error=Exception("syntax error"))
        with patch.object(supabase, "get_db_connection", return_value=conn), redirect_stdout(io.StringIO()):
            self.assertIs(supabase.execute_sql_file(self.path), False)
        conn.rollback.assert_called_once()
        conn.commit.assert_not_called()
        conn.close.assert_called_once()


class TestSeedHelpExitCode(unittest.TestCase):
    def test_exits_with_1_when_seed_fails(self):
        with patch.object(supabase, "execute_sql_file", return_value=False):
            with self.assertRaises(SystemExit) as ctx:
                runpy.run_module("scripts.seed_help", run_name="__main__")
        self.assertEqual(ctx.exception.code, 1)

    def test_runs_help_seed_and_exits_normally_on_success(self):
        with patch.object(supabase, "execute_sql_file", return_value=True) as mock_exec:
            runpy.run_module("scripts.seed_help", run_name="__main__")
        mock_exec.assert_called_once_with("sql/04_help_seed.sql")


if __name__ == "__main__":
    unittest.main()
