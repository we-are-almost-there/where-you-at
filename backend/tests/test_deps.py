"""app/deps.py의 get_db 의존성 테스트 (unittest, DB 없이 연결 함수 patch).

조회 API는 모두 get_db를 거치고, get_db는 db_connection()으로 연결을 열고 닫는다.
실제 라우터 대신 이 파일 안의 작은 앱에 get_db를 붙여, 응답 결과와 관계없이 연결이 한 번
닫히는지와 연결할 수 없을 때 503을 내는지 확인한다.

실행 (backend/ 에서):
    python -m unittest tests.test_deps
"""
import unittest
from unittest.mock import MagicMock, patch

from fastapi import Depends, FastAPI, HTTPException
from fastapi.testclient import TestClient

from app.deps import get_db

app = FastAPI()


@app.get("/ok")
def ok(conn=Depends(get_db)):
    return {"ok": True}


@app.get("/not-found")
def not_found(conn=Depends(get_db)):
    raise HTTPException(status_code=404, detail="없음")


@app.get("/boom")
def boom(conn=Depends(get_db)):
    raise RuntimeError("boom")


class TestGetDb(unittest.TestCase):
    def setUp(self):
        # 라우터 예외가 500 응답으로 바뀌는 실제 서버 동작을 보려고 예외를 테스트로 올리지 않는다.
        self.client = TestClient(app, raise_server_exceptions=False)

    def _get_with_connection(self, path):
        conn = MagicMock()
        with patch("app.deps.get_db_connection", return_value=conn):
            res = self.client.get(path)
        return res, conn

    def test_connection_is_closed_after_response(self):
        res, conn = self._get_with_connection("/ok")

        self.assertEqual(res.status_code, 200)
        conn.close.assert_called_once()

    def test_connection_is_closed_when_route_returns_http_error(self):
        res, conn = self._get_with_connection("/not-found")

        self.assertEqual(res.status_code, 404)
        conn.close.assert_called_once()

    def test_connection_is_closed_when_route_raises(self):
        res, conn = self._get_with_connection("/boom")

        self.assertEqual(res.status_code, 500)
        conn.close.assert_called_once()

    def test_returns_503_when_db_is_unavailable(self):
        with patch("app.deps.get_db_connection", return_value=None):
            res = self.client.get("/ok")

        self.assertEqual(res.status_code, 503)
        self.assertEqual(res.json(), {"detail": "데이터베이스에 연결할 수 없습니다."})


if __name__ == "__main__":
    unittest.main()
