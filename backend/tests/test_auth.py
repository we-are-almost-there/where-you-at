"""POST /api/auth/kakao 라우터 테스트 (unittest, 카카오와 DB 없이 patch).

카카오 응답에 따라 401(다시 로그인하면 해결), 502(설정 오류나 카카오 문제), 503(서버 설정 누락)이
올바르게 갈리는지, 성공하면 우리 토큰을 발급하는지 확인한다.

다루지 않음 (DB가 있어야 확인 가능):
    - 같은 kakao_id로 다시 로그인하면 행이 새로 생기지 않고 갱신되는지 (on conflict)
    - updated_at 트리거

실행 (backend/ 에서):
    python -m unittest tests.test_auth
"""
import io
import unittest
from contextlib import redirect_stdout
from unittest.mock import MagicMock, patch

import httpx
from fastapi.testclient import TestClient

from app.api.routers import auth as auth_router
from app.core.config import settings
from app.main import app
from app.services import auth_token, rate_limit

SETTINGS = {
    "kakao_login_client_id": "client-id",
    "kakao_login_client_secret": "client-secret",
    "kakao_login_redirect_uri": "http://localhost:5173/auth/kakao/callback",
    "jwt_secret": "s" * 32,
}

KAKAO_USER = {
    "id": 4321,
    "kakao_account": {
        "profile": {"nickname": "길손"}
    },
}

SAVED_USER = {"id": 7, "nickname": "길손", "bio": None}


def _response(status_code, json=None, *, text=None):
    if text is not None:
        return httpx.Response(status_code, text=text)
    return httpx.Response(status_code, json=json)


def _token_ok():
    return _response(200, {"access_token": "kakao-token", "token_type": "bearer"})


def _kakao_error(status_code, error, error_code):
    return _response(status_code, {"error": error, "error_description": "code=secret", "error_code": error_code})


@patch("app.crud.user.upsert_kakao_user", return_value=SAVED_USER)
@patch("app.services.kakao_oauth.httpx.get")
@patch("app.services.kakao_oauth.httpx.post")
class TestKakaoLogin(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)

    def setUp(self):
        # 제한 기록은 모듈 전역이라 테스트끼리 섞이지 않게 매번 비운다.
        auth_router.login_limiter.reset()
        auth_router.unverified_log_limiter.reset()
        settings_patcher = patch.multiple(settings, **SETTINGS)
        settings_patcher.start()
        self.addCleanup(settings_patcher.stop)
        connect_patcher = patch("app.deps.get_db_connection", return_value=MagicMock())
        self.connect = connect_patcher.start()
        self.addCleanup(connect_patcher.stop)

    def _login(self, code="auth-code"):
        return self.client.post("/api/auth/kakao", json={"code": code})

    def test_success_saves_user_and_returns_our_token(self, mock_post, mock_get, mock_upsert):
        mock_post.return_value = _token_ok()
        mock_get.return_value = _response(200, KAKAO_USER)

        res = self._login()

        self.assertEqual(res.status_code, 200)
        body = res.json()
        self.assertEqual(body["user"], SAVED_USER)
        self.assertEqual(body["token_type"], "bearer")
        self.assertEqual(auth_token.decode_access_token(body["access_token"]), 7)
        mock_upsert.assert_called_once()
        self.assertEqual(mock_upsert.call_args.kwargs, {"kakao_id": 4321, "nickname": "길손"})
        self.assertEqual(mock_get.call_args.kwargs["headers"], {"Authorization": "Bearer kakao-token"})

    def test_token_exchange_uses_server_settings(self, mock_post, mock_get, mock_upsert):
        mock_post.return_value = _token_ok()
        mock_get.return_value = _response(200, KAKAO_USER)

        self._login(code="abc")

        self.assertEqual(
            mock_post.call_args.kwargs["data"],
            {
                "grant_type": "authorization_code",
                "client_id": "client-id",
                "client_secret": "client-secret",
                "redirect_uri": "http://localhost:5173/auth/kakao/callback",
                "code": "abc",
            },
        )

    def test_saves_only_kakao_id_and_nickname(self, mock_post, mock_get, mock_upsert):
        cases = {
            "닉네임 없음": {"id": 4321, "kakao_account": {}},
            # 콘솔에서 프로필 사진 동의항목이 켜져 있어도 저장하지 않는다.
            "프로필 사진이 함께 옴": {
                "id": 4321,
                "kakao_account": {
                    "profile": {"nickname": "길손", "profile_image_url": "https://k.kakaocdn.net/profile.jpg"}
                },
            },
        }
        expected = {
            "닉네임 없음": {"kakao_id": 4321, "nickname": None},
            "프로필 사진이 함께 옴": {"kakao_id": 4321, "nickname": "길손"},
        }
        for name, kakao_user in cases.items():
            with self.subTest(name):
                mock_post.return_value = _token_ok()
                mock_get.return_value = _response(200, kakao_user)

                self.assertEqual(self._login().status_code, 200)
                self.assertEqual(mock_upsert.call_args.kwargs, expected[name])

    def test_expired_or_reused_code_returns_401(self, mock_post, mock_get, mock_upsert):
        mock_post.return_value = _kakao_error(400, "invalid_grant", "KOE320")

        res = self._login()

        self.assertEqual(res.status_code, 401)
        mock_get.assert_not_called()
        self.connect.assert_not_called()

    def test_configuration_or_kakao_errors_return_502(self, mock_post, mock_get, mock_upsert):
        cases = {
            # KOE320과 error 값이 같아서, error로 나누면 401로 잘못 나간다.
            "redirect_uri 불일치": _kakao_error(400, "invalid_grant", "KOE303"),
            "클라이언트 시크릿 오류": _kakao_error(401, "invalid_client", "KOE010"),
            "error_code 없음": _response(400, {"error": "invalid_request"}),
            "JSON이 아닌 응답": _response(502, text="<html>Bad Gateway</html>"),
            "카카오 서버 오류": _kakao_error(500, "server_error", "KOE320"),
            "성공인데 access_token 없음": _response(200, {"token_type": "bearer"}),
        }
        for name, token_response in cases.items():
            with self.subTest(name):
                mock_post.return_value = token_response

                self.assertEqual(self._login().status_code, 502)
        mock_get.assert_not_called()
        self.connect.assert_not_called()

    def test_user_lookup_failure_returns_502(self, mock_post, mock_get, mock_upsert):
        cases = {
            "조회 거절": _response(401, {"msg": "this access token does not exist", "code": -401}),
            "id 없음": _response(200, {"kakao_account": {}}),
        }
        for name, user_response in cases.items():
            with self.subTest(name):
                mock_post.return_value = _token_ok()
                mock_get.return_value = user_response

                self.assertEqual(self._login().status_code, 502)
        self.connect.assert_not_called()

    def test_kakao_timeout_returns_502(self, mock_post, mock_get, mock_upsert):
        cases = {
            "토큰 교환": (httpx.ReadTimeout("timeout"), None),
            "회원 정보 조회": (_token_ok(), httpx.ConnectTimeout("timeout")),
        }
        for name, (post_result, get_result) in cases.items():
            with self.subTest(name):
                mock_post.side_effect = [post_result]
                mock_get.side_effect = [get_result]

                self.assertEqual(self._login().status_code, 502)
        self.connect.assert_not_called()

    def test_missing_settings_return_503_without_calling_kakao(self, mock_post, mock_get, mock_upsert):
        cases = {
            "client_id 없음": {"kakao_login_client_id": ""},
            "client_secret 없음": {"kakao_login_client_secret": ""},
            "redirect_uri 없음": {"kakao_login_redirect_uri": ""},
            "jwt_secret 없음": {"jwt_secret": ""},
            "jwt_secret이 32바이트 미만": {"jwt_secret": "s" * 31},
        }
        for name, override in cases.items():
            with self.subTest(name), patch.multiple(settings, **override):
                self.assertEqual(self._login().status_code, 503)
        mock_post.assert_not_called()
        self.connect.assert_not_called()

    def test_empty_code_returns_422(self, mock_post, mock_get, mock_upsert):
        self.assertEqual(self._login(code="").status_code, 422)
        mock_post.assert_not_called()

    def test_too_many_logins_from_one_ip_return_429(self, mock_post, mock_get, mock_upsert):
        mock_post.return_value = _token_ok()
        mock_get.return_value = _response(200, KAKAO_USER)
        limit = auth_router.login_limiter.max_requests

        for _ in range(limit):
            self.assertEqual(self._login().status_code, 200)
        mock_post.reset_mock()

        res = self._login()

        self.assertEqual(res.status_code, 429)
        # 한도를 넘은 요청은 카카오를 호출하기 전에 막는다.
        mock_post.assert_not_called()

    def test_other_ip_is_not_affected(self, mock_post, mock_get, mock_upsert):
        mock_post.return_value = _token_ok()
        mock_get.return_value = _response(200, KAKAO_USER)
        headers = {"CF-Connecting-IP": "203.0.113.10"}

        with patch.object(rate_limit.settings, "trust_cloudflare_ip_header", True):
            for _ in range(auth_router.login_limiter.max_requests):
                self.client.post("/api/auth/kakao", json={"code": "auth-code"}, headers=headers)

            blocked = self.client.post("/api/auth/kakao", json={"code": "auth-code"}, headers=headers)
            other = self.client.post(
                "/api/auth/kakao", json={"code": "auth-code"}, headers={"CF-Connecting-IP": "198.51.100.7"}
            )

        self.assertEqual(blocked.status_code, 429)
        self.assertEqual(other.status_code, 200)

    def test_unverified_client_is_not_limited(self, mock_post, mock_get, mock_upsert):
        # 문의와 반대로 통과시킨다. 헤더 검증이 깨졌을 때 전체 이용자가 한 키로 묶여 로그인이 막히는
        # 피해가 더 크다. 문의 쪽 정책은 test_inquiries.py에서 확인한다.
        mock_post.return_value = _token_ok()
        mock_get.return_value = _response(200, KAKAO_USER)

        with patch.object(rate_limit.settings, "trust_cloudflare_ip_header", True):
            statuses = {
                self.client.post("/api/auth/kakao", json={"code": "auth-code"}).status_code
                for _ in range(auth_router.login_limiter.max_requests + 1)
            }

        self.assertEqual(statuses, {200})

    def test_unverified_client_is_logged_once(self, mock_post, mock_get, mock_upsert):
        # 헤더 설정이 깨지면 요청마다 같은 줄이 쌓여 다른 로그를 덮으므로 10분에 한 번만 남긴다.
        mock_post.return_value = _token_ok()
        mock_get.return_value = _response(200, KAKAO_USER)
        output = io.StringIO()

        with patch.object(rate_limit.settings, "trust_cloudflare_ip_header", True), redirect_stdout(output):
            for _ in range(3):
                self.client.post("/api/auth/kakao", json={"code": "auth-code"})

        self.assertEqual(output.getvalue().count("로그인 요청 제한을 건너뜁니다"), 1)


if __name__ == "__main__":
    unittest.main()
