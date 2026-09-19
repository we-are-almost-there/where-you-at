"""
R2 연결 확인 스크립트

버킷에 브라우저가 쓸 흐름을 그대로 한 번 해 본다.
  1. 브라우저 출처에서 PUT 사전 요청(CORS)이 성공하고 PUT·Content-Type을 허용하는지
  2. 사전 서명 URL로 임시 키에 작은 이미지를 올릴 수 있는지
  3. head()로 크기·형식을 읽을 수 있는지
  4. 검증한 파일을 최종 키로 옮기고 임시 파일을 지우는지
  5. 같은 업로드 URL로 다시 올려도 최종 파일은 그대로인지
  6. 사전 서명 URL로 내려받을 수 있는지
  7. S3 API 주소로 서명 없이는 내려받을 수 없는지
  8. (--public-url을 준 경우) 공개 주소로 내려받을 수 없는지
  9. 지울 수 있는지
7번은 S3 API의 익명 접근만 확인한다. r2.dev·사용자 도메인 공개 접근은 별개라서, --public-url로
그 주소를 확인하거나 Cloudflare 대시보드 > R2 > 버킷 > 설정에서 공개 접근이 꺼져 있는지 직접 본다.
결과만 출력하고 키, URL, 비밀값은 출력하지 않는다. 확인용 파일은 마지막에 지운다.

실행 (backend/ 에서, .env에 R2_* 값을 채운 뒤):
    python -m scripts.check_r2
    python -m scripts.check_r2 --origin https://배포-도메인
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


def _header_values(response: httpx.Response, name: str) -> set[str]:
    return {value.strip().lower() for value in response.headers.get(name, "").split(",") if value.strip()}


def _check(origin: str, public_url: str | None) -> bool:
    ok = True

    def report(step: str, passed: bool, detail: str = "") -> None:
        nonlocal ok
        ok = ok and passed
        mark = "통과" if passed else "실패"
        print(f"  [{mark}] {step}" + (f" ({detail})" if detail and not passed else ""))

    upload_key = storage.new_key(Folder.UPLOAD, _CHECK_USER_ID, _CONTENT_TYPE)
    upload_url = storage.presign_upload(upload_key, _CONTENT_TYPE)
    final_key = None

    with httpx.Client(timeout=15) as http:
        preflight = http.options(
            upload_url,
            headers={
                "Origin": origin,
                "Access-Control-Request-Method": "PUT",
                "Access-Control-Request-Headers": "content-type",
            },
        )
        methods = _header_values(preflight, "access-control-allow-methods")
        headers = _header_values(preflight, "access-control-allow-headers")
        report(
            f"CORS: {origin}에서 PUT 허용",
            preflight.is_success
            and preflight.headers.get("access-control-allow-origin") in (origin, "*")
            and bool(methods & {"put", "*"})
            and bool(headers & {"content-type", "*"}),
            f"HTTP {preflight.status_code}, 메서드 {sorted(methods)}, 헤더 {sorted(headers)}",
        )

        put = http.put(upload_url, content=_PNG, headers={"Content-Type": _CONTENT_TYPE})
        report("사전 서명 URL로 임시 키에 올리기", put.status_code == 200, f"HTTP {put.status_code}")
        if put.status_code != 200:
            return False

        try:
            info = storage.head(upload_key)
            report(
                "크기·형식 읽기",
                info is not None and (info.size, info.content_type) == (len(_PNG), _CONTENT_TYPE),
                f"{info}",
            )
            if info is None:
                return False

            final_key = storage.promote(upload_key, Folder.AVATAR, info)
            final = storage.head(final_key)
            report(
                "최종 키로 옮기고 임시 파일 지우기",
                final is not None and final.etag == info.etag and storage.head(upload_key) is None,
            )

            # 사전 서명 URL은 만료 전까지 다시 쓸 수 있다. 실제로 임시 키가 다시 쓰여도 최종 파일은
            # 바뀌지 않아야 한다. 재업로드 자체가 실패하면 이 보호 흐름을 확인한 것이 아니므로 실패다.
            replay = http.put(upload_url, content=_PNG + b"x", headers={"Content-Type": _CONTENT_TYPE})
            replayed_upload = storage.head(upload_key)
            final_after_replay = storage.head(final_key)
            report(
                "같은 업로드 URL로 다시 올려도 최종 파일 유지",
                replay.status_code == 200
                and replayed_upload is not None
                and replayed_upload.size == len(_PNG) + 1
                and final_after_replay == final,
                f"재업로드 HTTP {replay.status_code}",
            )

            get = http.get(storage.presign_download(final_key))
            report("사전 서명 URL로 내려받기", get.content == _PNG, f"HTTP {get.status_code}")

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
            storage.delete(upload_key)
            if final_key:
                storage.delete(final_key)
            report("지우기", storage.head(upload_key) is None and (not final_key or storage.head(final_key) is None))

    return ok


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--origin", default="http://localhost:5173", help="CORS를 확인할 프론트 출처")
    parser.add_argument("--public-url", help="버킷의 r2.dev 또는 사용자 도메인 주소. 주면 그 주소로 못 받는지 확인한다")
    args = parser.parse_args()

    if not storage.is_configured():
        names = ("r2_account_id", "r2_access_key_id", "r2_secret_access_key", "r2_bucket")
        missing = [name.upper() for name in names if not getattr(settings, name)]
        print(f"R2 설정이 비어 있습니다. backend/.env에서 다음 키를 확인하세요: {', '.join(missing)}")
        return 1

    try:
        all_ok = _check(args.origin, args.public_url)
    except (storage.StorageError, httpx.HTTPError) as exc:
        # 예외 메시지에 URL이 들어갈 수 있어 종류만 출력한다.
        print(f"  [실패] 요청 오류: {type(exc).__name__}")
        all_ok = False

    print("모두 통과" if all_ok else "실패한 항목이 있습니다")
    return 0 if all_ok else 1


if __name__ == "__main__":
    sys.exit(main())
