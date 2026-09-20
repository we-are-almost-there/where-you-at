"""두 이미지 업로드 경로가 동일한 본문 크기 검증을 적용하는지 확인한다."""

import unittest
from unittest.mock import patch

from fastapi import HTTPException, Request

from app.api.routers import me, record_cards


class UploadBodyTest(unittest.IsolatedAsyncioTestCase):
    async def test_both_routes_apply_the_same_limits(self):
        cases = [
            (None, [b"ab", b"cd"], b"abcd"),
            (b"4", [b"abcd"], b"abcd"),
            (b"1", [b"ab", b"cde"], 413),
            (None, [b"ab", b"cde"], 413),
            (b"5", [], 413),
            (b"-1", [], 400),
            (b"invalid", [], 400),
            (b"0", [b""], 400),
            (None, [b""], 400),
        ]
        for module, reader, limit, label in [
            (me, me._avatar_body, "AVATAR_MAX_BYTES", "프로필 사진"),
            (record_cards, record_cards._card_body, "MAX_CARD_IMAGE_BYTES", "기록 카드 이미지"),
        ]:
            for length, chunks, expected in cases:
                with self.subTest(route=module.__name__, length=length, expected=expected):
                    remaining = list(chunks)

                    async def receive():
                        self.assertTrue(remaining, "헤더가 잘못됐거나 제한을 넘으면 더 읽으면 안 된다")
                        chunk = remaining.pop(0)
                        return {"type": "http.request", "body": chunk, "more_body": bool(remaining)}

                    headers = [] if length is None else [(b"content-length", length)]
                    request = Request({"type": "http", "headers": headers}, receive)
                    with patch.object(module, limit, 4):
                        if isinstance(expected, bytes):
                            self.assertEqual(await reader(request), expected)
                        else:
                            with self.assertRaises(HTTPException) as raised:
                                await reader(request)
                            self.assertEqual(raised.exception.status_code, expected)
                            if expected == 413:
                                self.assertIn(label, raised.exception.detail)
