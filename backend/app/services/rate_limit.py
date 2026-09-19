"""
메모리 기반 요청 횟수 제한 (슬라이딩 윈도우)와 이용자 키

SlidingWindowLimiter는 키별로 횟수를 세고, client_key는 요청에서 그 키(이용자 IP)를 뽑는다.
문의와 로그인이 함께 쓴다.

기록은 외부 저장소(Redis 등)나 DB에 남기지 않는다. 그래서 IP 같은 식별 정보를 보관하지 않아도 되고
의존성도 늘지 않는다. 대신 한계가 있다.
  - 서버 프로세스를 재시작하면 기록이 사라진다.
  - 서버(또는 워커)가 여러 개면 각자 따로 센다. 실제 허용량은 "개수 × 제한"까지 늘어난다.
짧은 시간에 몰아서 보내는 것만 막으면 되는 곳에 쓴다.
"""

import threading
import time
from collections import deque
from ipaddress import IPv6Address, ip_address, ip_network
from typing import Callable

from fastapi import Request

from ..core.config import settings


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


def client_key(request: Request) -> str | None:
    """요청 제한에 쓸 이용자 키. 이용자 IP를 확인하지 못하면 None.

    None일 때 무엇을 할지는 호출자가 정한다. 문의는 한 그룹으로 묶어 함께 막고(fail closed),
    로그인은 제한하지 않는다(fail open). 헤더 검증이 깨졌을 때 전체 이용자가 한 키로 묶여
    로그인이 통째로 막히는 피해가, 로그인 API 오남용보다 크기 때문이다.
    """
    # X-Forwarded-For는 사용자가 미리 넣은 값을 Cloudflare가 보존할 수 있으므로 절대 읽지 않는다.
    # Render 공개 트래픽은 Cloudflare를 거치며, Cloudflare는 원본 서버로 보내는
    # CF-Connecting-IP를 실제 접속 IP 한 개로 설정한다. 이 배포 경계를 확인한 Render에서만
    # TRUST_CLOUDFLARE_IP_HEADER=true로 켠다(README "배포" 참고).
    if settings.trust_cloudflare_ip_header:
        values = request.headers.getlist("cf-connecting-ip")
        if len(values) != 1:
            return None
        try:
            # 단일 헤더의 IPv4/IPv6만 허용한다. 쉼표 목록이나 임의 문자열은 확인 실패로 본다.
            ip = ip_address(values[0].strip())
        except ValueError:
            return None
        # IPv6 이용자는 보통 /64 대역을 통째로 받아 그 안에서 주소를 바꿔 보낼 수 있으므로 대역 단위로 센다.
        if isinstance(ip, IPv6Address):
            return str(ip_network(f"{ip}/64", strict=False))
        return str(ip)

    # 로컬 개발에서는 신뢰 프록시 헤더를 켜지 않고 실제 소켓 상대 주소를 사용한다.
    return request.client.host if request.client else "unknown"
