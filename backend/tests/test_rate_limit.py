"""services/rate_limit.py 테스트 (unittest, 시계 대체).

client_key는 이용자 IP를 확인했는지까지만 본다. 확인하지 못했을 때(None) 막을지 통과시킬지는
호출하는 라우터가 정하므로, 그 결과는 test_inquiries.py와 test_auth.py에서 확인한다.

실행 (backend/ 에서):
    python -m unittest tests.test_rate_limit
"""
import unittest
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

        with patch.object(rate_limit.settings, "trust_cloudflare_ip_header", False):
            self.assertEqual(client_key(request), "203.0.113.10")

    def test_render_mode_uses_valid_cloudflare_ip_and_ignores_xff(self):
        request = _request(
            headers={
                "X-Forwarded-For": "1.2.3.4",
                "CF-Connecting-IP": "198.51.100.23",
            }
        )

        with patch.object(rate_limit.settings, "trust_cloudflare_ip_header", True):
            self.assertEqual(client_key(request), "198.51.100.23")

    def test_render_mode_groups_ipv6_by_64_prefix(self):
        # 같은 /64 안에서 주소만 바꿔도(표기가 달라도) 같은 키, 다른 /64는 다른 키여야 한다.
        same_prefix = [
            _request(headers={"CF-Connecting-IP": "2001:0db8:0:0:0:0:0:1"}),
            _request(headers={"CF-Connecting-IP": "2001:db8::ffff:1234"}),
        ]
        other_prefix = _request(headers={"CF-Connecting-IP": "2001:db8:0:1::1"})

        with patch.object(rate_limit.settings, "trust_cloudflare_ip_header", True):
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

        with patch.object(rate_limit.settings, "trust_cloudflare_ip_header", True):
            self.assertEqual([client_key(request) for request in requests], [None] * 4)


if __name__ == "__main__":
    unittest.main()
