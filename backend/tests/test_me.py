"""인증 의존성, GET/DELETE /api/me, POST /api/auth/logout 테스트.

JWT와 DB 세션·회원이 모두 유효해야 인증된다. 로그아웃은 현재 세션만 삭제하고,
탈퇴하거나 세션이 사라진 토큰은 모든 인증 API에서 401인지 확인한다.

실행 (backend/ 에서):
    python -m unittest tests.test_me
"""
import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, patch
from uuid import UUID

import httpx
import jwt
from fastapi.testclient import TestClient

from app.core.config import settings
from app.main import app
from app.services import auth_token

SECRET = "s" * 32
SESSION_ID = UUID("11111111-1111-4111-8111-111111111111")
OTHER_SESSION_ID = UUID("22222222-2222-4222-8222-222222222222")
USER = {"id": 7, "nickname": "길손", "kakao_id": 4321}
USER_OUT = {"id": 7, "nickname": "길손"}


def _bearer(token):
    return {"Authorization": f"Bearer {token}"}


def _token(session_id=SESSION_ID, *, now=None):
    return auth_token.create_access_token(7, session_id, now=now)


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


@patch("app.crud.user.get_authenticated_user", return_value=USER)
class TestReadMe(AuthTestCase):
    def test_valid_session_returns_user(self, mock_get_authenticated_user):
        res = self.client.get("/api/me", headers=_bearer(_token()))

        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json(), USER_OUT)
        self.assertEqual(mock_get_authenticated_user.call_args.kwargs["user_id"], 7)
        self.assertEqual(mock_get_authenticated_user.call_args.kwargs["session_id"], SESSION_ID)

    def test_invalid_tokens_return_401_without_db(self, mock_get_authenticated_user):
        now = _now()
        base = {"sub": "7", "sid": str(SESSION_ID), "iat": now, "exp": now + timedelta(hours=1)}
        cases = {
            "헤더 없음": {},
            "Bearer가 아님": {"Authorization": "Basic abc"},
            "형식이 깨진 토큰": _bearer("not-a-jwt"),
            "만료": _bearer(_token(now=now - timedelta(days=8))),
            "서명 불일치": _bearer(_raw_token(base, "x" * 32)),
            "sub 누락": _bearer(_raw_token({key: value for key, value in base.items() if key != "sub"})),
            "sid 누락": _bearer(_raw_token({key: value for key, value in base.items() if key != "sid"})),
            "exp 누락": _bearer(_raw_token({key: value for key, value in base.items() if key != "exp"})),
            "sub가 숫자 문자열이 아님": _bearer(_raw_token({**base, "sub": "abc"})),
            "sub가 문자열이 아님": _bearer(_raw_token({**base, "sub": 7})),
            "sid가 UUID가 아님": _bearer(_raw_token({**base, "sid": "not-a-uuid"})),
            "sid가 문자열이 아님": _bearer(_raw_token({**base, "sid": 7})),
            "서명 없는 토큰(alg none)": _bearer(jwt.encode(base, None, algorithm="none")),
        }
        for name, headers in cases.items():
            with self.subTest(name):
                res = self.client.get("/api/me", headers=headers)

                self.assertEqual(res.status_code, 401)
                self.assertEqual(res.headers["www-authenticate"], "Bearer")
        mock_get_authenticated_user.assert_not_called()
        self.connect.assert_not_called()

    def test_missing_session_or_deleted_user_returns_401(self, mock_get_authenticated_user):
        mock_get_authenticated_user.return_value = None

        res = self.client.get("/api/me", headers=_bearer(_token()))

        self.assertEqual(res.status_code, 401)
        self.assertEqual(res.headers["www-authenticate"], "Bearer")

    def test_missing_secret_returns_503_without_db(self, mock_get_authenticated_user):
        token = _token()
        for secret in ("", "s" * 31):
            with self.subTest(secret=secret), patch.object(settings, "jwt_secret", secret):
                self.assertEqual(self.client.get("/api/me", headers=_bearer(token)).status_code, 503)
        mock_get_authenticated_user.assert_not_called()
        self.connect.assert_not_called()


@patch("app.crud.user.delete_session", return_value=None)
@patch("app.crud.user.get_authenticated_user", return_value=USER)
class TestLogout(AuthTestCase):
    def test_logout_deletes_only_current_session(self, mock_get_authenticated_user, mock_delete_session):
        res = self.client.post("/api/auth/logout", headers=_bearer(_token()))

        self.assertEqual(res.status_code, 204)
        self.assertEqual(res.content, b"")
        self.assertEqual(mock_delete_session.call_args.kwargs["user_id"], 7)
        self.assertEqual(mock_delete_session.call_args.kwargs["session_id"], SESSION_ID)

    def test_missing_session_returns_401_without_delete(self, mock_get_authenticated_user, mock_delete_session):
        mock_get_authenticated_user.return_value = None

        res = self.client.post("/api/auth/logout", headers=_bearer(_token(OTHER_SESSION_ID)))

        self.assertEqual(res.status_code, 401)
        mock_delete_session.assert_not_called()


ADMIN_KEY = "admin-key"


@patch("app.services.kakao_oauth.httpx.post")
@patch("app.crud.user.delete_user", return_value=None)
@patch("app.crud.user.get_authenticated_user", return_value=USER)
class TestDeleteMe(AuthTestCase):
    def setUp(self):
        super().setUp()
        admin_patcher = patch.object(settings, "kakao_login_admin_key", ADMIN_KEY)
        admin_patcher.start()
        self.addCleanup(admin_patcher.stop)

    def _delete(self, token=None):
        return self.client.delete("/api/me", headers=_bearer(token or _token()))

    def test_unlinks_kakao_then_deletes_user(self, mock_get_authenticated_user, mock_delete, mock_post):
        calls = []
        mock_post.side_effect = lambda *a, **kw: calls.append("unlink") or httpx.Response(200, json={"id": 4321})
        mock_delete.side_effect = lambda *a, **kw: calls.append("delete")

        res = self._delete()

        self.assertEqual(res.status_code, 204)
        self.assertEqual(res.content, b"")
        self.assertEqual(calls, ["unlink", "delete"])
        self.assertEqual(mock_delete.call_args.args[1], 7)
        self.assertEqual(mock_post.call_args.args[0], "https://kapi.kakao.com/v1/user/unlink")
        self.assertEqual(mock_post.call_args.kwargs["headers"], {"Authorization": "KakaoAK admin-key"})
        self.assertEqual(mock_post.call_args.kwargs["data"], {"target_id_type": "user_id", "target_id": "4321"})

    def test_already_unlinked_user_is_deleted(self, mock_get_authenticated_user, mock_delete, mock_post):
        mock_post.return_value = httpx.Response(400, json={"msg": "NotRegisteredUserException", "code": -101})

        res = self._delete()

        self.assertEqual(res.status_code, 204)
        mock_delete.assert_called_once()

    def test_unavailable_unlink_still_deletes_user(self, mock_get_authenticated_user, mock_delete, mock_post):
        mock_post.return_value = httpx.Response(400, json={"code": -103})

        res = self._delete()

        self.assertEqual(res.status_code, 204)
        mock_delete.assert_called_once()

    def test_deleted_user_token_returns_401(self, mock_get_authenticated_user, mock_delete, mock_post):
        mock_get_authenticated_user.return_value = None

        res = self._delete()

        self.assertEqual(res.status_code, 401)
        mock_post.assert_not_called()
        mock_delete.assert_not_called()

    def test_unlink_failure_returns_502_and_keeps_user(self, mock_get_authenticated_user, mock_delete, mock_post):
        cases = {
            "어드민 키 오류": httpx.Response(401, json={"msg": "wrong appKey", "code": -401}),
            "JSON이 아닌 응답": httpx.Response(502, text="<html>Bad Gateway</html>"),
            "시간 초과": httpx.ReadTimeout("timeout"),
        }
        for name, result in cases.items():
            with self.subTest(name):
                mock_post.side_effect = [result]

                self.assertEqual(self._delete().status_code, 502)
        mock_delete.assert_not_called()

    def test_missing_admin_key_returns_503_without_unlink(self, mock_get_authenticated_user, mock_delete, mock_post):
        with patch.object(settings, "kakao_login_admin_key", ""):
            res = self._delete()

        self.assertEqual(res.status_code, 503)
        mock_post.assert_not_called()
        mock_delete.assert_not_called()

    def test_invalid_token_returns_401_without_deleting(self, mock_get_authenticated_user, mock_delete, mock_post):
        expired = _token(now=_now() - timedelta(days=8))
        self.connect.reset_mock()

        res = self._delete(expired)

        self.assertEqual(res.status_code, 401)
        mock_post.assert_not_called()
        mock_delete.assert_not_called()
        self.connect.assert_not_called()

    def test_without_token_returns_401_without_db(self, mock_get_authenticated_user, mock_delete, mock_post):
        res = self.client.delete("/api/me")

        self.assertEqual(res.status_code, 401)
        mock_post.assert_not_called()
        self.connect.assert_not_called()


if __name__ == "__main__":
    unittest.main()
