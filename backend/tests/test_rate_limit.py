"""services/rate_limit.py 테스트 (unittest, 시계 대체).

client_key는 이용자 IP를 확인했는지까지만 본다. 확인하지 못했을 때(None) 막을지 통과시킬지는
호출하는 라우터가 정하므로, 그 결과는 test_inquiries.py와 test_auth.py에서 확인한다.

실행 (backend/ 에서):
    python -m unittest tests.test_rate_limit
"""
import unittest
from contextlib import contextmanager
from unittest.mock import patch

from starlette.requests import Request

from app.services import rate_limit
from app.services.rate_limit import SlidingWindowLimiter, client_key


def _request(*, headers=None, client=("203.0.113.10", 12345)):
    header_items = headers.items() if isinstance(headers, dict) else (headers or [])
    return Request(
        {
            "type": "http",
            "headers": [(name.lower().encode(), value.encode()) for name, value in header_items],
            "client": client,
        }
    )


@contextmanager
def _client_ip(*, cloudflare=False, hops=0):
    # 두 설정을 함께 고정한다. 하나만 바꾸면 .env나 실행 환경의 다른 값이 먼저 적용될 수 있다.
    with (
        patch.object(rate_limit.settings, "trust_cloudflare_ip_header", cloudflare),
        patch.object(rate_limit.settings, "trusted_proxy_hops", hops),
    ):
        yield


class FakeClock:
    def __init__(self):
        self.now = 1000.0

    def __call__(self):
        return self.now


class TestSlidingWindowLimiter(unittest.TestCase):
    def setUp(self):
        self.clock = FakeClock()
        self.limiter = SlidingWindowLimiter(max_requests=3, window_seconds=600, clock=self.clock)

    def test_allows_up_to_max_then_blocks(self):
        self.assertEqual([self.limiter.allow("1.1.1.1") for _ in range(4)], [True, True, True, False])

    def test_allows_again_after_oldest_request_leaves_the_window(self):
        for _ in range(3):
            self.limiter.allow("1.1.1.1")
        self.clock.now += 600

        self.assertTrue(self.limiter.allow("1.1.1.1"))

    def test_blocked_request_is_not_counted(self):
        for _ in range(3):
            self.limiter.allow("1.1.1.1")
        self.clock.now += 300
        self.assertFalse(self.limiter.allow("1.1.1.1"))  # 기록되면 창이 늦게 풀린다
        self.clock.now += 300

        self.assertTrue(self.limiter.allow("1.1.1.1"))

    def test_keys_are_counted_separately(self):
        for _ in range(3):
            self.limiter.allow("1.1.1.1")

        self.assertTrue(self.limiter.allow("2.2.2.2"))

    def test_reset_clears_history(self):
        for _ in range(3):
            self.limiter.allow("1.1.1.1")
        self.limiter.reset()

        self.assertTrue(self.limiter.allow("1.1.1.1"))


class TestClientKey(unittest.TestCase):
    def test_local_mode_ignores_forwarding_headers(self):
        request = _request(
            headers={
                "X-Forwarded-For": "1.2.3.4",
                "CF-Connecting-IP": "5.6.7.8",
            }
        )

        with _client_ip():
            self.assertEqual(client_key(request), "203.0.113.10")

    def test_render_mode_uses_valid_cloudflare_ip_and_ignores_xff(self):
        request = _request(
            headers={
                "X-Forwarded-For": "1.2.3.4",
                "CF-Connecting-IP": "198.51.100.23",
            }
        )

        with _client_ip(cloudflare=True):
            self.assertEqual(client_key(request), "198.51.100.23")

    def test_render_mode_groups_ipv6_by_64_prefix(self):
        # 같은 /64 안에서 주소만 바꿔도(표기가 달라도) 같은 키, 다른 /64는 다른 키여야 한다.
        same_prefix = [
            _request(headers={"CF-Connecting-IP": "2001:0db8:0:0:0:0:0:1"}),
            _request(headers={"CF-Connecting-IP": "2001:db8::ffff:1234"}),
        ]
        other_prefix = _request(headers={"CF-Connecting-IP": "2001:db8:0:1::1"})

        with _client_ip(cloudflare=True):
            self.assertEqual(
                [client_key(request) for request in same_prefix],
                ["2001:db8::/64", "2001:db8::/64"],
            )
            self.assertEqual(client_key(other_prefix), "2001:db8:0:1::/64")

    def test_render_mode_returns_none_for_missing_or_invalid_header(self):
        requests = [
            _request(),
            _request(headers={"CF-Connecting-IP": "1.2.3.4, 5.6.7.8"}),
            _request(headers={"CF-Connecting-IP": "not-an-ip"}),
            _request(
                headers=[
                    ("CF-Connecting-IP", "1.2.3.4"),
                    ("CF-Connecting-IP", "5.6.7.8"),
                ]
            ),
        ]

        with _client_ip(cloudflare=True):
            self.assertEqual([client_key(request) for request in requests], [None] * 4)


class TestClientKeyBehindProxy(unittest.TestCase):
    """TRUSTED_PROXY_HOPS: X-Forwarded-For 끝에 접속 IP를 덧붙이는 프록시(AWS ALB 등) 뒤."""

    def _key(self, request, hops):
        with _client_ip(hops=hops):
            return client_key(request)

    def test_one_hop_uses_rightmost_and_ignores_spoofed_left_values(self):
        # 이용자가 1.2.3.4를 미리 넣어 보내도 ALB가 덧붙인 실제 접속 IP(맨 오른쪽)만 쓴다.
        request = _request(headers={"X-Forwarded-For": "1.2.3.4, 198.51.100.23"})

        self.assertEqual(self._key(request, 1), "198.51.100.23")

    def test_two_hops_uses_second_from_right(self):
        # 앞단 프록시가 이용자 IP를, ALB가 앞단 IP를 덧붙인 경우. 운영에서는 원본 인증을 갖춘 뒤에만 쓴다(README).
        request = _request(headers={"X-Forwarded-For": "1.2.3.4, 198.51.100.23, 192.0.2.7"})

        self.assertEqual(self._key(request, 2), "198.51.100.23")

    def test_repeated_headers_are_read_in_order(self):
        request = _request(
            headers=[
                ("X-Forwarded-For", "1.2.3.4"),
                ("X-Forwarded-For", "198.51.100.23"),
            ]
        )

        self.assertEqual(self._key(request, 1), "198.51.100.23")

    def test_groups_ipv6_by_64_prefix(self):
        request = _request(headers={"X-Forwarded-For": "2001:db8::ffff:1234"})

        self.assertEqual(self._key(request, 1), "2001:db8::/64")

    def test_ignores_cloudflare_header(self):
        request = _request(headers={"CF-Connecting-IP": "5.6.7.8", "X-Forwarded-For": "198.51.100.23"})

        self.assertEqual(self._key(request, 1), "198.51.100.23")

    def test_returns_none_for_missing_short_or_invalid_header(self):
        cases = [
            (_request(), 1),  # 프록시를 거치지 않은 요청
            (_request(headers={"X-Forwarded-For": "198.51.100.23"}), 2),  # 기대한 단수보다 적음
            (_request(headers={"X-Forwarded-For": "1.2.3.4, not-an-ip"}), 1),
            (_request(headers={"X-Forwarded-For": "1.2.3.4,"}), 1),  # 맨 오른쪽이 빈 값
            # ALB 클라이언트 포트 보존 옵션을 켠 형식. 받지 않으므로 README대로 옵션을 꺼 둔다.
            (_request(headers={"X-Forwarded-For": "198.51.100.23:443"}), 1),
            (_request(headers={"X-Forwarded-For": "[2001:db8::1]:443"}), 1),
        ]

        self.assertEqual([self._key(request, hops) for request, hops in cases], [None] * 6)


class TestClientIpSettings(unittest.TestCase):
    def test_rejects_both_sources_enabled(self):
        from pydantic import ValidationError

        from app.core.config import Settings

        with self.assertRaises(ValidationError):
            Settings(_env_file=None, trust_cloudflare_ip_header=True, trusted_proxy_hops=1)

    def test_rejects_negative_hops(self):
        from pydantic import ValidationError

        from app.core.config import Settings

        with self.assertRaises(ValidationError):
            Settings(_env_file=None, trusted_proxy_hops=-1)


if __name__ == "__main__":
    unittest.main()
