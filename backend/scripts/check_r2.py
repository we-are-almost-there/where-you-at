"""
R2 연결 확인 스크립트

버킷에 브라우저가 쓸 흐름을 그대로 한 번 해 본다.
  1. 브라우저 출처에서 PUT 사전 요청(CORS)이 허용되는지
  2. 사전 서명 URL로 작은 이미지를 올릴 수 있는지
  3. head()로 크기·형식을 읽을 수 있는지
  4. 사전 서명 URL로 내려받을 수 있는지
  5. 서명 없이는 내려받을 수 없는지(비공개인지)
  6. 지울 수 있는지
결과만 출력하고 키, URL, 비밀값은 출력하지 않는다. 확인용 파일은 마지막에 지운다.

실행 (backend/ 에서, .env에 R2_* 값을 채운 뒤):
    python -m scripts.check_r2
    python -m scripts.check_r2 --origin https://배포-도메인
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
# 실제 회원 id와 겹치지 않는 키 접두어
_CHECK_USER_ID = 0


def _check(origin: str) -> bool:
    ok = True

    def report(step: str, passed: bool, detail: str = "") -> None:
        nonlocal ok
        ok = ok and passed
        mark = "통과" if passed else "실패"
        print(f"  [{mark}] {step}" + (f" ({detail})" if detail and not passed else ""))

    key = storage.new_key(Folder.AVATAR, _CHECK_USER_ID, _CONTENT_TYPE)
    upload_url = storage.presign_upload(key, _CONTENT_TYPE)

    with httpx.Client(timeout=15) as http:
        preflight = http.options(
            upload_url,
            headers={
                "Origin": origin,
                "Access-Control-Request-Method": "PUT",
                "Access-Control-Request-Headers": "content-type",
            },
        )
        allowed = preflight.headers.get("access-control-allow-origin") in (origin, "*")
        report(f"CORS: {origin}에서 PUT 허용", allowed, f"HTTP {preflight.status_code}")

        put = http.put(upload_url, content=_PNG, headers={"Content-Type": _CONTENT_TYPE})
        report("사전 서명 URL로 올리기", put.status_code == 200, f"HTTP {put.status_code}")
        if put.status_code != 200:
            return False

        try:
            info = storage.head(key)
            report(
                "크기·형식 읽기",
                info == storage.ObjectInfo(size=len(_PNG), content_type=_CONTENT_TYPE),
                f"{info}",
            )

            get = http.get(storage.presign_download(key))
            report("사전 서명 URL로 내려받기", get.content == _PNG, f"HTTP {get.status_code}")

            plain_url = storage.presign_download(key).split("?", 1)[0]
            anonymous = http.get(plain_url)
            report("서명 없이 내려받기 차단", anonymous.status_code in (400, 401, 403), f"HTTP {anonymous.status_code}")
        finally:
            storage.delete(key)
            report("지우기", storage.head(key) is None)

    return ok


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--origin", default="http://localhost:5173", help="CORS를 확인할 프론트 출처")
    args = parser.parse_args()

    if not storage.is_configured():
        names = ("r2_account_id", "r2_access_key_id", "r2_secret_access_key", "r2_bucket")
        missing = [name.upper() for name in names if not getattr(settings, name)]
        print(f"R2 설정이 비어 있습니다. backend/.env에서 다음 키를 확인하세요: {', '.join(missing)}")
        return 1

    try:
        all_ok = _check(args.origin)
    except (storage.StorageError, httpx.HTTPError) as exc:
        # 예외 메시지에 URL이 들어갈 수 있어 종류만 출력한다.
        print(f"  [실패] 요청 오류: {type(exc).__name__}")
        all_ok = False

    print("모두 통과" if all_ok else "실패한 항목이 있습니다")
    return 0 if all_ok else 1


if __name__ == "__main__":
    sys.exit(main())
