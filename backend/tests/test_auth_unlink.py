"""GET·POST /api/auth/kakao/unlink 연결 끊기 웹훅 테스트 (unittest, DB 없이 crud patch).

카카오가 보내는 형식(GET 쿼리, POST 폼, POST JSON)을 모두 받는지, 대표 어드민 키 검증이
갈리는지, 그리고 검증을 통과한 요청은 무슨 일이 있어도 200으로 끝나는지 확인한다.
200이 아닌 응답은 카카오가 아닌 요청(401)에만 나가야 한다.

다루지 않음 (DB가 있어야 확인 가능):
    - 회원 행 삭제가 회원에 딸린 데이터까지 지우는지 (on delete cascade)

실행 (backend/ 에서):
    python -m unittest tests.test_auth_unlink
"""
import unittest
from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient

from app.core.config import settings
from app.main import app

ADMIN_KEY = "admin-key"
HEADERS = {"Authorization": f"KakaoAK {ADMIN_KEY}"}
PARAMS = {"app_id": "1234", "user_id": "4321", "referrer_type": "UNLINK_FROM_APPS"}
USER_ID = 7


@patch("app.crud.user.delete_user")
@patch("app.crud.user.get_user_id_by_kakao_id", return_value=USER_ID)
class TestKakaoUnlinkWebhook(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)

    def setUp(self):
        settings_patcher = patch.object(settings, "kakao_login_admin_key", ADMIN_KEY)
        settings_patcher.start()
        self.addCleanup(settings_patcher.stop)
        self.conn = MagicMock()
        connect_patcher = patch("app.deps.get_db_connection", return_value=self.conn)
        self.connect = connect_patcher.start()
        self.addCleanup(connect_patcher.stop)
        notify_patcher = patch("app.services.slack_notify.notify_unlink_delete_failure")
        self.notify = notify_patcher.start()
        self.addCleanup(notify_patcher.stop)

    def _post(self, params=PARAMS, headers=HEADERS):
        return self.client.post("/api/auth/kakao/unlink", data=params, headers=headers)

    def test_deletes_user_however_kakao_sends_it(self, mock_find, mock_delete):
        # 카카오 문서에 Content-Type이 없어 세 형태를 모두 받는다.
        cases = {
            "GET 쿼리": lambda: self.client.get("/api/auth/kakao/unlink", params=PARAMS, headers=HEADERS),
            "POST 폼": lambda: self.client.post("/api/auth/kakao/unlink", data=PARAMS, headers=HEADERS),
            "POST JSON": lambda: self.client.post(
                "/api/auth/kakao/unlink", json={"app_id": 1234, "user_id": 4321}, headers=HEADERS
            ),
        }
        for name, call in cases.items():
            with self.subTest(name):
                mock_find.reset_mock()
                mock_delete.reset_mock()

                res = call()

                self.assertEqual(res.status_code, 200)
                self.assertEqual(mock_find.call_args.args[1], 4321)
                # 탈퇴 API와 같은 삭제 함수를 회원 id로 부른다.
                self.assertEqual(mock_delete.call_args.args[1], USER_ID)

    def test_query_and_body_are_merged(self, mock_find, mock_delete):
        # 콘솔에 쿼리가 붙은 주소를 등록하는 실수가 있어도 바디를 버리지 않아야 한다.
        cases = {
            "쿼리가 있어도 바디를 읽는다": "/api/auth/kakao/unlink?foo=1",
            "겹치는 키는 바디가 이긴다": "/api/auth/kakao/unlink?user_id=9999",
        }
        for name, url in cases.items():
            with self.subTest(name):
                mock_find.reset_mock()
                mock_delete.reset_mock()

                res = self.client.post(url, data=PARAMS, headers=HEADERS)

                self.assertEqual(res.status_code, 200)
                self.assertEqual(mock_find.call_args.args[1], 4321)
                self.assertEqual(mock_delete.call_args.args[1], USER_ID)

    def test_unverified_requests_return_401_without_db(self, mock_find, mock_delete):
        cases = {
            "헤더 없음": {},
            "다른 키": {"Authorization": "KakaoAK other-key"},
            "접두사 다름": {"Authorization": f"Bearer {ADMIN_KEY}"},
            # str끼리 compare_digest하면 TypeError로 500이 난다. 401이어야 한다.
            # 헤더는 latin-1로 디코딩되므로 ASCII 밖의 바이트가 그대로 들어올 수 있다.
            "비ASCII 키": {"Authorization": "KakaoAK 한글".encode("utf-8")},
            "키 뒤에 덧붙임": {"Authorization": f"KakaoAK {ADMIN_KEY}x"},
        }
        for name, headers in cases.items():
            with self.subTest(name):
                res = self.client.post("/api/auth/kakao/unlink", data=PARAMS, headers=headers)

                self.assertEqual(res.status_code, 401)
        self.connect.assert_not_called()
        mock_delete.assert_not_called()

    def test_admin_key_not_configured_returns_401(self, mock_find, mock_delete):
        with patch.object(settings, "kakao_login_admin_key", ""):
            res = self.client.post("/api/auth/kakao/unlink", data=PARAMS, headers=HEADERS)

        self.assertEqual(res.status_code, 401)
        self.connect.assert_not_called()

    def test_unknown_user_returns_200(self, mock_find, mock_delete):
        mock_find.return_value = None

        res = self.client.post("/api/auth/kakao/unlink", data=PARAMS, headers=HEADERS)

        self.assertEqual(res.status_code, 200)
        mock_delete.assert_not_called()

    def test_missing_or_invalid_user_id_returns_200_without_db(self, mock_find, mock_delete):
        cases = {
            "회원번호 없음": {"app_id": "1234"},
            "숫자가 아님": {"app_id": "1234", "user_id": "abc"},
            "빈 바디": {},
        }
        for name, params in cases.items():
            with self.subTest(name):
                res = self.client.post("/api/auth/kakao/unlink", data=params, headers=HEADERS)

                self.assertEqual(res.status_code, 200)
        self.connect.assert_not_called()
        mock_delete.assert_not_called()

    def test_db_failure_returns_200_and_notifies_slack(self, mock_find, mock_delete):
        # 재시도 정책이 문서에 없어, 200이 아닌 응답을 돌려줘도 삭제가 복구되지 않는다.
        # 놓친 삭제는 Slack 알림을 받고 [ERROR] 로그로 찾아 직접 지운다.
        with self.subTest("DB 연결 실패"):
            self.connect.return_value = None

            self.assertEqual(self._post().status_code, 200)
            self.assertEqual(self.notify.call_count, 1)

        with self.subTest("조회 중 오류"):
            self.connect.return_value = self.conn
            mock_find.side_effect = RuntimeError("boom")

            self.assertEqual(self._post().status_code, 200)
            self.assertEqual(self.notify.call_count, 2)

        with self.subTest("삭제 중 오류"):
            mock_find.side_effect = None
            mock_delete.side_effect = RuntimeError("boom")

            self.assertEqual(self._post().status_code, 200)
            self.assertEqual(self.notify.call_count, 3)

    def test_slack_is_not_notified_when_nothing_failed(self, mock_find, mock_delete):
        cases = {"삭제 성공": USER_ID, "회원 없음": None}
        for name, found in cases.items():
            with self.subTest(name):
                mock_find.return_value = found

                self.assertEqual(self._post().status_code, 200)
        self.notify.assert_not_called()

    def test_slack_failure_does_not_change_response(self, mock_find, mock_delete):
        # 알림 전송은 실패해도 False만 돌려준다(slack_notify.post). 알림이 막혀도 [ERROR] 로그는 남는다.
        mock_delete.side_effect = RuntimeError("boom")
        self.notify.return_value = False

        self.assertEqual(self._post().status_code, 200)


if __name__ == "__main__":
    unittest.main()
