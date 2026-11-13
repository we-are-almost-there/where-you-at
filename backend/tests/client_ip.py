"""요청 제한의 이용자 IP 확인 설정을 테스트에서 고정한다.

TRUST_CLOUDFLARE_IP_HEADER와 TRUSTED_PROXY_HOPS는 함께 결정되므로 늘 두 값을 같이 고정한다.
하나만 바꾸면 .env나 실행 환경에 남은 다른 값이 먼저 적용돼, 실행하는 곳에 따라 결과가 달라진다.
"""
from contextlib import contextmanager
from unittest.mock import patch

from app.services import rate_limit


@contextmanager
def pin_client_ip(*, cloudflare=False, hops=0):
    with (
        patch.object(rate_limit.settings, "trust_cloudflare_ip_header", cloudflare),
        patch.object(rate_limit.settings, "trusted_proxy_hops", hops),
    ):
        yield
