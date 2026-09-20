"""인증 의존성, GET/PATCH/DELETE /api/me, POST /api/auth/logout 테스트 (unittest, DB와 카카오 없이 patch).

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
from app.services import auth_token, storage

SECRET = "s" * 32
SESSION_ID = UUID("11111111-1111-4111-8111-111111111111")
OTHER_SESSION_ID = UUID("22222222-2222-4222-8222-222222222222")
# 인증 조회(get_authenticated_user) 결과. deps.CurrentUser의 칸과 같다.
USER = {"id": 7, "nickname": "길손", "bio": "주말마다 한강을 걸어요", "kakao_id": 4321}
# 응답에는 카카오 회원번호를 내보내지 않는다.
USER_OUT = {"id": 7, "nickname": "길손", "bio": "주말마다 한강을 걸어요"}


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


@patch("app.crud.user.update_profile")
class TestUpdateMe(AuthTestCase):
    def setUp(self):
        super().setUp()
        # 인증은 세션을 확인하려고 DB에 한 번 연결한다(get_current_user). 수정 연결과 구분하려고 따로 센다.
        auth_patcher = patch("app.crud.user.get_authenticated_user", return_value=USER)
        self.authenticate = auth_patcher.start()
        self.addCleanup(auth_patcher.stop)

    def _patch(self, body, token=None):
        headers = _bearer(token or _token())
        return self.client.patch("/api/me", headers=headers, json=body)

    def test_trims_and_saves_nickname(self, mock_update):
        mock_update.return_value = {"id": 7, "nickname": "새 이름", "bio": None}

        res = self._patch({"nickname": "  새 이름  "})

        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json(), {"id": 7, "nickname": "새 이름", "bio": None})
        # 보내지 않은 bio는 건드리지 않는다.
        self.assertEqual(mock_update.call_args.args[1:], (7, {"nickname": "새 이름"}))

    def test_invalid_nickname_returns_422_without_db(self, mock_update):
        cases = {
            "빈 값": "",
            "공백만": "   ",
            "21자": "가" * 21,
            "줄바꿈": "길\n손",
        }
        for name, nickname in cases.items():
            with self.subTest(name):
                res = self._patch({"nickname": nickname})
                self.assertEqual(res.status_code, 422)
        mock_update.assert_not_called()
        # 인증 확인에 요청마다 한 번씩만 연결하고, 수정용 연결은 열지 않는다.
        self.assertEqual(self.connect.call_count, len(cases))

    def test_twenty_characters_is_allowed(self, mock_update):
        mock_update.return_value = {"id": 7, "nickname": "가" * 20, "bio": None}

        res = self._patch({"nickname": "가" * 20})

        self.assertEqual(res.status_code, 200)

    def test_trims_and_saves_bio_only(self, mock_update):
        mock_update.return_value = {"id": 7, "nickname": "길손", "bio": "주말마다 한강을 걸어요"}

        res = self._patch({"bio": "  주말마다 한강을 걸어요 "})

        self.assertEqual(res.status_code, 200)
        self.assertEqual(mock_update.call_args.args[1:], (7, {"bio": "주말마다 한강을 걸어요"}))

    def test_collapses_repeated_spaces(self, mock_update):
        # 화면은 연속 공백을 한 칸으로 그리므로 저장값도 한 칸으로 맞춘다. 41칸짜리 입력도 줄인 뒤 길이를 잰다.
        mock_update.return_value = {"id": 7, "nickname": "길 손", "bio": "안녕하세요 러닝 좋아요"}

        res = self._patch({"nickname": "길     손", "bio": "안녕하세요" + " " * 30 + "러닝 좋아요"})

        self.assertEqual(res.status_code, 200)
        self.assertEqual(mock_update.call_args.args[1:], (7, {"nickname": "길 손", "bio": "안녕하세요 러닝 좋아요"}))

    def test_allows_joined_emoji(self, mock_update):
        # 결합 이모지에는 isprintable()이 막는 서식 문자(ZWJ, 태그 문자)가 들어 있다. 이 문자들은 허용한다.
        mock_update.return_value = {"id": 7, "nickname": "길손", "bio": None}
        cases = {
            "개발자(사람+ZWJ+노트북)": "\U0001F468‍\U0001F4BB",
            "무지개 깃발(깃발+VS16+ZWJ+무지개)": "\U0001F3F3️‍\U0001F308",
            "스코틀랜드 깃발(태그 문자)": "\U0001F3F4\U000E0067\U000E0062\U000E0073\U000E0063\U000E0074\U000E007F",
            "하트+VS16": "❤️",
            "스킨톤": "\U0001F44D\U0001F3FB",
        }
        for name, emoji in cases.items():
            with self.subTest(name):
                res = self._patch({"bio": f"러닝 {emoji}"})
                self.assertEqual(res.status_code, 200)
                self.assertEqual(mock_update.call_args.args[1:], (7, {"bio": f"러닝 {emoji}"}))

    def test_normalizes_other_spaces(self, mock_update):
        # 줄바꿈 없는 공백(U+00A0)·전각 공백(U+3000)은 웹에서 복사해 붙이면 흔히 섞인다. 일반 공백으로 바꿔 받는다.
        mock_update.return_value = {"id": 7, "nickname": "길 손", "bio": None}

        res = self._patch({"nickname": " 길 　손　"})

        self.assertEqual(res.status_code, 200)
        self.assertEqual(mock_update.call_args.args[1:], (7, {"nickname": "길 손"}))

    def test_rejects_invisible_format_chars(self, mock_update):
        # 결합 이모지에 쓰이지 않는 서식 문자는 이름을 보이지 않게 꾸미거나 뒤집는 데 쓰일 수 있어 계속 막는다.
        cases = {
            "폭 없는 공백": "길​손",
            "글자 방향 뒤집기": "길‮손",
            "줄 구분자": "길 손",
            "사용자 정의 영역": "길손",
        }
        for name, nickname in cases.items():
            with self.subTest(name):
                res = self._patch({"nickname": nickname})
                self.assertEqual(res.status_code, 422)
        mock_update.assert_not_called()

    def test_empty_bio_clears_it(self, mock_update):
        mock_update.return_value = {"id": 7, "nickname": "길손", "bio": None}

        for bio in ("", "   ", None):
            with self.subTest(bio=bio):
                res = self._patch({"bio": bio})
                self.assertEqual(res.status_code, 200)
                self.assertEqual(mock_update.call_args.args[1:], (7, {"bio": None}))

    def test_saves_nickname_and_bio_together(self, mock_update):
        mock_update.return_value = {"id": 7, "nickname": "새 이름", "bio": "안녕하세요"}

        self._patch({"nickname": "새 이름", "bio": "안녕하세요"})

        self.assertEqual(mock_update.call_args.args[1:], (7, {"nickname": "새 이름", "bio": "안녕하세요"}))

    def test_invalid_bio_or_empty_body_returns_422_without_db(self, mock_update):
        cases = {
            "41자": {"bio": "가" * 41},
            "줄바꿈": {"bio": "첫 줄\n둘째 줄"},
            "닉네임 null": {"nickname": None},
            "빈 본문": {},
        }
        for name, body in cases.items():
            with self.subTest(name):
                res = self._patch(body)
                self.assertEqual(res.status_code, 422)
        mock_update.assert_not_called()
        self.assertEqual(self.connect.call_count, len(cases))

    def test_forty_character_bio_is_allowed(self, mock_update):
        mock_update.return_value = {"id": 7, "nickname": "길손", "bio": "가" * 40}

        res = self._patch({"bio": "가" * 40})

        self.assertEqual(res.status_code, 200)

    def test_deleted_user_returns_401(self, mock_update):
        mock_update.return_value = None

        res = self._patch({"nickname": "길손"})

        self.assertEqual(res.status_code, 401)

    def test_without_token_returns_401_without_db(self, mock_update):
        res = self.client.patch("/api/me", json={"nickname": "길손"})

        self.assertEqual(res.status_code, 401)
        mock_update.assert_not_called()
        self.connect.assert_not_called()


@patch("app.services.kakao_oauth.httpx.post")
@patch("app.crud.user.delete_user", return_value=None)
@patch("app.crud.user.get_authenticated_user", return_value=USER)
class TestDeleteMe(AuthTestCase):
    def setUp(self):
        super().setUp()
        admin_patcher = patch.object(settings, "kakao_login_admin_key", ADMIN_KEY)
        admin_patcher.start()
        self.addCleanup(admin_patcher.stop)
        configured_patcher = patch("app.services.storage.is_configured", return_value=True)
        configured_patcher.start()
        self.addCleanup(configured_patcher.stop)
        cleanup_patcher = patch("app.services.storage.delete_user_objects")
        self.cleanup = cleanup_patcher.start()
        self.addCleanup(cleanup_patcher.stop)
        notify_patcher = patch("app.services.slack_notify.notify_account_deletion_failure")
        self.notify_cleanup = notify_patcher.start()
        self.addCleanup(notify_patcher.stop)

    def _delete(self, token=None):
        return self.client.delete("/api/me", headers=_bearer(token or _token()))

    def test_unlinks_kakao_then_deletes_user(self, mock_get_authenticated_user, mock_delete, mock_post):
        calls = []
        mock_post.side_effect = lambda *a, **kw: calls.append("unlink") or httpx.Response(200, json={"id": 4321})
        self.cleanup.side_effect = lambda *a, **kw: calls.append("r2")
        mock_delete.side_effect = lambda *a, **kw: calls.append("delete")

        res = self._delete()

        self.assertEqual(res.status_code, 204)
        self.assertEqual(res.content, b"")
        self.assertEqual(calls, ["unlink", "r2", "delete"])
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

    def test_r2_failure_returns_502_and_keeps_user_for_retry(self, mock_get_authenticated_user, mock_delete, mock_post):
        mock_post.return_value = httpx.Response(200, json={"id": 4321})
        self.cleanup.side_effect = storage.StorageError("boom")

        res = self._delete()

        self.assertEqual(res.status_code, 502)
        mock_delete.assert_not_called()
        self.notify_cleanup.assert_called_once_with(7, source="수동 탈퇴", stage="R2 객체 정리")

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
