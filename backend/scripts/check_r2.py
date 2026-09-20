"""
R2 연결 확인 스크립트

서버 경유 업로드에 필요한 저장소 권한과 비공개 조회를 확인한다.
  1. 서버 자격 증명으로 작은 이미지를 최종 키에 저장하고 크기·형식을 읽을 수 있는지
  2. 사전 서명 GET URL로 내려받을 수 있는지
  3. S3 API 주소로 서명 없이는 내려받을 수 없는지
  4. (--public-url을 준 경우) 공개 주소로 내려받을 수 없는지
  5. 확인용 파일을 지울 수 있는지
브라우저 직접 PUT과 CORS는 검사하지 않는다. API의 이미지 검증·인증·DB 저장은 별도 테스트 대상이다.
uploads/ 접두어의 1일 후 삭제 수명 주기는 대시보드에서 별도로 확인한다.
3번은 S3 API의 익명 접근만 확인한다. r2.dev·사용자 도메인 공개 접근은 별개라서, --public-url로
그 주소를 확인하거나 Cloudflare 대시보드 > R2 > 버킷 > 설정에서 공개 접근이 꺼져 있는지 직접 본다.
결과만 출력하고 키, URL, 비밀값은 출력하지 않는다. 확인용 파일은 마지막에 지운다.

실행 (backend/ 에서, .env에 R2_* 값을 채운 뒤):
    python -m scripts.check_r2
    python -m scripts.check_r2 --public-url https://pub-xxxx.r2.dev   # 공개 주소가 있었다면
"""

import argparse
import base64
import sys

import httpx

from app.core.config import settings
from app.services import storage
from app.services.storage import Folder

# 1x1 투명 PNG
_PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
)
_CONTENT_TYPE = "image/png"
# 공개 주소가 비활성화됐거나 객체 접근이 차단됐다고 볼 수 있는 응답만 허용한다.
_BLOCKED_PUBLIC_STATUSES = {400, 401, 403, 404}
# 실제 회원 id와 겹치지 않는 키 접두어
_CHECK_USER_ID = 0


def _check(public_url: str | None) -> bool:
    ok = True

    def report(step: str, passed: bool, detail: str = "") -> None:
        nonlocal ok
        ok = ok and passed
        mark = "통과" if passed else "실패"
        print(f"  [{mark}] {step}" + (f" ({detail})" if detail and not passed else ""))

    final_key = storage.new_key(Folder.RECORD_CARD, _CHECK_USER_ID, _CONTENT_TYPE)
    with httpx.Client(timeout=15) as http:
        try:
            storage.put(final_key, _PNG, _CONTENT_TYPE)
            info = storage.head(final_key)
            report("서버 업로드와 크기·형식 확인", info is not None and
                   (info.size, info.content_type) == (len(_PNG), _CONTENT_TYPE))
            get = http.get(storage.presign_download(final_key))
            report("사전 서명 URL로 내려받기", get.status_code == 200 and get.content == _PNG, f"HTTP {get.status_code}")

            plain_url = storage.presign_download(final_key).split("?", 1)[0]
            anonymous = http.get(plain_url)
            report(
                "S3 API 주소로 서명 없이 내려받기 차단",
                anonymous.status_code in (400, 401, 403),
                f"HTTP {anonymous.status_code}",
            )

            if public_url:
                public = http.get(f"{public_url.rstrip('/')}/{final_key}", follow_redirects=True)
                report(
                    "공개 주소로 내려받기 차단",
                    public.status_code in _BLOCKED_PUBLIC_STATUSES,
                    f"HTTP {public.status_code}",
                )
            else:
                print("  [확인 필요] r2.dev·사용자 도메인 공개 접근은 대시보드에서 꺼져 있는지 확인하세요")
        finally:
            storage.delete(final_key)
            report("확인용 파일 지우기", storage.head(final_key) is None)

    return ok


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--public-url", help="버킷의 r2.dev 또는 사용자 도메인 주소. 주면 그 주소로 못 받는지 확인한다")
    args = parser.parse_args()

    if not storage.is_configured():
        names = ("r2_account_id", "r2_access_key_id", "r2_secret_access_key", "r2_bucket")
        missing = [name.upper() for name in names if not getattr(settings, name)]
        print(f"R2 설정이 비어 있습니다. backend/.env에서 다음 키를 확인하세요: {', '.join(missing)}")
        return 1

    try:
        all_ok = _check(args.public_url)
    except (storage.StorageError, httpx.HTTPError) as exc:
        # 예외 메시지에 URL이 들어갈 수 있어 종류만 출력한다.
        print(f"  [실패] 요청 오류: {type(exc).__name__}")
        all_ok = False

    print("모두 통과" if all_ok else "실패한 항목이 있습니다")
    return 0 if all_ok else 1


if __name__ == "__main__":
    sys.exit(main())
