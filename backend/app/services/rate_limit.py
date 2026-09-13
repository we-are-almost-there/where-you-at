"""
메모리 기반 요청 횟수 제한 (슬라이딩 윈도우)

외부 저장소(Redis 등)나 DB에 기록을 남기지 않는다. 그래서 IP 같은 식별 정보를 보관하지 않아도 되고
의존성도 늘지 않는다. 대신 한계가 있다.
  - 서버 프로세스를 재시작하면 기록이 사라진다.
  - 서버(또는 워커)가 여러 개면 각자 따로 센다. 실제 허용량은 "개수 × 제한"까지 늘어난다.
문의 폼처럼 짧은 시간에 몰아서 보내는 것만 막으면 되는 곳에 쓴다.
"""

import threading
import time
from collections import deque
from typing import Callable


class SlidingWindowLimiter:
    def __init__(self, max_requests: int, window_seconds: float, clock: Callable[[], float] = time.monotonic):
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self._clock = clock
        self._hits: dict[str, deque[float]] = {}
        # FastAPI는 동기 엔드포인트를 스레드풀에서 돌리므로 같은 키를 동시에 고칠 수 있다.
        self._lock = threading.Lock()

    def allow(self, key: str) -> bool:
        """이번 요청을 허용하면 기록하고 True, 제한에 걸리면 기록하지 않고 False."""
        now = self._clock()
        with self._lock:
            hits = self._hits.setdefault(key, deque())
            while hits and hits[0] <= now - self.window_seconds:
                hits.popleft()
            if len(hits) >= self.max_requests:
                return False
            hits.append(now)
            self._prune(now)
            return True

    def reset(self) -> None:
        with self._lock:
            self._hits.clear()

    def _prune(self, now: float) -> None:
        # 오래전에 한 번 왔다 간 키가 계속 쌓이지 않게, 창을 벗어난 키는 지운다.
        stale = [key for key, hits in self._hits.items() if not hits or hits[-1] <= now - self.window_seconds]
        for key in stale:
            del self._hits[key]
