"""services/rate_limit.py 테스트 (unittest, 시계 대체).

실행 (backend/ 에서):
    python -m unittest tests.test_rate_limit
"""
import unittest

from app.services.rate_limit import SlidingWindowLimiter


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


if __name__ == "__main__":
    unittest.main()
