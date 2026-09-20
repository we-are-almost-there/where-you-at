"""시군구 스탬프 API 계약과 지도 코드 범위. 실제 DB 경합은 통합 테스트에서 확인한다."""

import json
import unittest
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch
from uuid import uuid4

from fastapi.testclient import TestClient

from app.deps import CurrentUser, get_current_user
from app.main import app
from app.sigungu_codes import SIGUNGU_CODES

ROW = {"sigungu_code": "51110", "stamped_at": datetime(2026, 9, 21, tzinfo=timezone.utc)}


@contextmanager
def fake_db():
    yield object()


class SigunguStampsTest(unittest.TestCase):
    def setUp(self):
        app.dependency_overrides[get_current_user] = lambda: CurrentUser(
            id=7, nickname=None, bio=None, kakao_id=1, session_id=uuid4()
        )
        self.addCleanup(app.dependency_overrides.clear)
        for target, value in [("app.api.routers.sigungu_stamps.db_connection", fake_db),
                              ("app.deps.settings.record_features_enabled", True)]:
            p = patch(target, value)
            p.start()
            self.addCleanup(p.stop)
        self.client = TestClient(app)

    def test_list_states_and_user_scope(self):
        rows = [{"sigungu_code": "51110", "status": status,
                 "stamped_at": ROW["stamped_at"] if status == "STAMPED" else None}
                for status in ("LOCKED", "AVAILABLE", "STAMPED")]
        with patch("app.api.routers.sigungu_stamps.crud.list_stamps", return_value=rows) as query:
            response = self.client.get("/api/me/sigungu-stamps")
        self.assertEqual(response.status_code, 200)
        self.assertEqual([row["status"] for row in response.json()], ["LOCKED", "AVAILABLE", "STAMPED"])
        self.assertEqual(query.call_args.kwargs, {"user_id": 7})

    def test_creation_and_repeat(self):
        for created, status in [(True, 201), (False, 200)]:
            with self.subTest(created=created), patch(
                "app.api.routers.sigungu_stamps.crud.create_stamp", return_value=(ROW, created, status)
            ) as query:
                response = self.client.post("/api/me/sigungu-stamps/51110")
                self.assertEqual(response.status_code, status)
                self.assertEqual(response.json(), {"sigungu_code": "51110", "status": "STAMPED",
                                                   "stamped_at": "2026-09-21T00:00:00Z", "created": created})
                self.assertEqual(query.call_args.kwargs, {"user_id": 7, "code": "51110"})

    def test_not_completed_and_missing_region(self):
        for status in (409, 404):
            with patch("app.api.routers.sigungu_stamps.crud.create_stamp", return_value=(None, False, status)):
                self.assertEqual(self.client.post("/api/me/sigungu-stamps/51110").status_code, status)

    def test_non_map_region_rejected_before_database(self):
        with patch("app.api.routers.sigungu_stamps.db_connection") as db:
            self.assertEqual(self.client.post("/api/me/sigungu-stamps/99999").status_code, 404)
            db.assert_not_called()

    def test_authentication(self):
        app.dependency_overrides.clear()
        with patch("app.services.auth_token.is_configured", return_value=True):
            for method, path in [("get", ""), ("post", "/51110")]:
                self.assertEqual(getattr(self.client, method)("/api/me/sigungu-stamps" + path).status_code, 401)

    def test_feature_disabled(self):
        with patch("app.deps.settings.record_features_enabled", False):
            self.assertEqual(self.client.get("/api/me/sigungu-stamps").status_code, 503)
            self.assertEqual(self.client.post("/api/me/sigungu-stamps/51110").status_code, 503)

    def test_map_scope_matches_exactly(self):
        path = Path(__file__).resolve().parents[2] / "frontend/public/korea-all-regions.json"
        codes = {str(feature["properties"]["sgg_code"]) for feature in json.loads(path.read_text("utf-8"))["features"]}
        self.assertEqual(len(codes), 230)
        self.assertEqual(set(SIGUNGU_CODES), codes)
