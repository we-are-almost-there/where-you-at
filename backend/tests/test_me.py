"""GET /api/me, DELETE /api/me와 토큰 검증 의존성(get_current_user) 테스트 (unittest, DB 없이 crud patch).

토큰이 없거나 만료, 위조, 내용 오류면 401이고, 인증에 실패한 요청은 DB에 연결하지 않는지 확인한다.

실행 (backend/ 에서):
    python -m unittest tests.test_me
"""
import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, patch

import jwt
from fastapi.testclient import TestClient

from app.core.config import settings
from app.main import app
from app.services import auth_token

SECRET = "s" * 32
USER = {"id": 7, "nickname": "길손"}


def _bearer(token):
    return {"Authorization": f"Bearer {token}"}


def _raw_token(payload, secret=SECRET):
    return jwt.encode(payload, secret, algorithm="HS256")


def _now():
    return datetime.now(timezone.utc)


class AuthTestCase(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)

    def setUp(self):
        secret_patcher = patch.object(settings, "jwt_secret", SECRET)
        secret_patcher.start()
        self.addCleanup(secret_patcher.stop)
        connect_patcher = patch("app.deps.get_db_connection", return_value=MagicMock())
        self.connect = connect_patcher.start()
        self.addCleanup(connect_patcher.stop)


@patch("app.crud.user.get_user", return_value=USER)
class TestReadMe(AuthTestCase):
    def test_valid_token_returns_user(self, mock_get_user):
        res = self.client.get("/api/me", headers=_bearer(auth_token.create_access_token(7)))

        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json(), USER)
        self.assertEqual(mock_get_user.call_args.args[1], 7)

    def test_invalid_tokens_return_401_without_db(self, mock_get_user):
        now = _now()
        cases = {
            "헤더 없음": {},
            "Bearer가 아님": {"Authorization": "Basic abc"},
            "형식이 깨진 토큰": _bearer("not-a-jwt"),
            "만료": _bearer(auth_token.create_access_token(7, now=now - timedelta(days=8))),
            "서명 불일치": _bearer(_raw_token({"sub": "7", "iat": now, "exp": now + timedelta(hours=1)}, "x" * 32)),
            "sub 누락": _bearer(_raw_token({"iat": now, "exp": now + timedelta(hours=1)})),
            "exp 누락": _bearer(_raw_token({"sub": "7", "iat": now})),
            "sub가 숫자 문자열이 아님": _bearer(_raw_token({"sub": "abc", "iat": now, "exp": now + timedelta(hours=1)})),
            "sub가 문자열이 아님": _bearer(_raw_token({"sub": 7, "iat": now, "exp": now + timedelta(hours=1)})),
            "서명 없는 토큰(alg none)": _bearer(
                jwt.encode({"sub": "7", "iat": now, "exp": now + timedelta(hours=1)}, None, algorithm="none")
            ),
        }
        for name, headers in cases.items():
            with self.subTest(name):
                res = self.client.get("/api/me", headers=headers)

                self.assertEqual(res.status_code, 401)
                self.assertEqual(res.headers["www-authenticate"], "Bearer")
        mock_get_user.assert_not_called()
        self.connect.assert_not_called()

    def test_deleted_user_returns_401(self, mock_get_user):
        mock_get_user.return_value = None

        res = self.client.get("/api/me", headers=_bearer(auth_token.create_access_token(7)))

        self.assertEqual(res.status_code, 401)

    def test_missing_secret_returns_503(self, mock_get_user):
        token = auth_token.create_access_token(7)
        for secret in ("", "s" * 31):
            with self.subTest(secret=secret), patch.object(settings, "jwt_secret", secret):
                self.assertEqual(self.client.get("/api/me", headers=_bearer(token)).status_code, 503)
        self.connect.assert_not_called()


@patch("app.crud.user.delete_user", return_value=None)
class TestDeleteMe(AuthTestCase):
    def test_deletes_logged_in_user(self, mock_delete):
        res = self.client.delete("/api/me", headers=_bearer(auth_token.create_access_token(7)))

        self.assertEqual(res.status_code, 204)
        self.assertEqual(res.content, b"")
        self.assertEqual(mock_delete.call_args.args[1], 7)

    def test_already_deleted_user_still_returns_204(self, mock_delete):
        # 프론트는 401을 "탈퇴되지 않음"으로 본다. 지울 행이 없다고 401을 돌려주면 그 약속이 깨진다.
        mock_delete.return_value = False

        res = self.client.delete("/api/me", headers=_bearer(auth_token.create_access_token(7)))

        self.assertEqual(res.status_code, 204)

    def test_invalid_token_returns_401_without_deleting(self, mock_delete):
        # 토큰이 만료되면 401이다. 프론트가 이를 탈퇴 완료로 오해하지 않도록 204와 구분된다.
        expired = auth_token.create_access_token(7, now=_now() - timedelta(days=8))

        res = self.client.delete("/api/me", headers=_bearer(expired))

        self.assertEqual(res.status_code, 401)
        mock_delete.assert_not_called()
        self.connect.assert_not_called()

    def test_without_token_returns_401_without_db(self, mock_delete):
        res = self.client.delete("/api/me")

        self.assertEqual(res.status_code, 401)
        mock_delete.assert_not_called()
        self.connect.assert_not_called()


if __name__ == "__main__":
    unittest.main()
