"""완주 기록 라우터(routers/records.py) 테스트 (unittest, DB 없이).

crud를 mock으로 바꾸고 인증은 의존성 override로 건너뛴다.

실행 (backend/ 에서):
    python -m unittest tests.test_records
"""
import unittest
from math import nextafter
from contextlib import contextmanager
from datetime import datetime, timezone
from unittest.mock import patch
from uuid import uuid4

from fastapi.testclient import TestClient

from app.deps import CurrentUser, get_current_user
from app.main import app

USER = CurrentUser(id=7, nickname="길손", bio=None, kakao_id=1, session_id=uuid4())
NOW = datetime(2026, 9, 20, tzinfo=timezone.utc)

ROW = {
    "id": 3,
    "course_id": 5,
    "course_name": "코스",
    "route_type": "trail",
    "distance_km": 5.0,
    "duration_ms": 3000000,
    "pace_sec_per_km": 600.0,
    "finished_at": NOW,
}

BODY = {
    "course_id": 5,
    "route_type": "trail",
    "distance_km": 5.0,
    "duration_ms": 3000000,
    "pace_sec_per_km": 600.0,
    "finished_at": "2026-09-20T00:00:00Z",
}


@contextmanager
def fake_db():
    yield object()


class RecordsRouterTest(unittest.TestCase):
    def setUp(self):
        app.dependency_overrides[get_current_user] = lambda: USER
        self.client = TestClient(app)
        p = patch("app.api.routers.records.db_connection", fake_db)
        p.start()
        self.addCleanup(p.stop)
        f = patch("app.deps.settings.record_features_enabled", True)
        f.start()
        self.addCleanup(f.stop)
        self.addCleanup(app.dependency_overrides.clear)

    def test_create_returns_201_with_record(self):
        with patch("app.api.routers.records.crud") as crud:
            crud.create_record.return_value = ROW
            res = self.client.post("/api/records", json=BODY)
        self.assertEqual(res.status_code, 201)
        data = res.json()
        self.assertEqual(data["id"], 3)
        self.assertEqual(data["course_name"], "코스")
        self.assertEqual(data["route_type"], "trail")
        # 로그인한 회원의 id로 저장한다.
        self.assertEqual(crud.create_record.call_args.kwargs["user_id"], 7)

    def test_create_allows_null_pace(self):
        with patch("app.api.routers.records.crud") as crud:
            crud.create_record.return_value = {**ROW, "pace_sec_per_km": None}
            res = self.client.post("/api/records", json={**BODY, "pace_sec_per_km": None})
        self.assertEqual(res.status_code, 201)
        self.assertIsNone(res.json()["pace_sec_per_km"])

    def test_completion_is_forwarded_and_legacy_defaults_to_false(self):
        for fields, expected in (({}, False), ({"is_completed": False}, False), ({"is_completed": True}, True)):
            with self.subTest(fields=fields), patch("app.api.routers.records.crud") as crud:
                crud.create_record.return_value = ROW
                res = self.client.post("/api/records", json={**BODY, **fields})
                self.assertEqual(res.status_code, 201)
                self.assertIs(crud.create_record.call_args.kwargs["is_completed"], expected)

    def test_completion_rejects_non_boolean(self):
        with patch("app.api.routers.records.crud") as crud:
            for value in ("true", 1, None):
                res = self.client.post("/api/records", json={**BODY, "is_completed": value})
                self.assertEqual(res.status_code, 422)
            crud.create_record.assert_not_called()

    def test_pace_database_upper_bound(self):
        with patch("app.api.routers.records.crud") as crud:
            crud.create_record.return_value = {**ROW, "pace_sec_per_km": 999999.99}
            response = self.client.post("/api/records", json={**BODY, "pace_sec_per_km": 999999.99})
            self.assertEqual(response.status_code, 201)
            self.assertEqual(response.json()["pace_sec_per_km"], 999999.99)

    def test_values_rounding_to_zero_are_422_without_insert(self):
        cases = (
            ("distance_km", (0.0001, nextafter(0.0005, 0))),
            ("pace_sec_per_km", (0.001, nextafter(0.005, 0))),
        )
        with patch("app.api.routers.records.crud") as crud:
            for field, values in cases:
                for value in values:
                    with self.subTest(field=field, value=value):
                        response = self.client.post("/api/records", json={**BODY, field: value})
                        self.assertEqual(response.status_code, 422)
                        self.assertEqual(response.json()["detail"][0]["loc"], ["body", field])
            crud.create_record.assert_not_called()

    def test_smallest_inputs_rounding_to_positive_are_accepted(self):
        for field, minimum in (("distance_km", 0.0005), ("pace_sec_per_km", 0.005)):
            for value in (minimum, nextafter(minimum, float("inf"))):
                with self.subTest(field=field, value=value), patch("app.api.routers.records.crud") as crud:
                    crud.create_record.return_value = ROW
                    response = self.client.post("/api/records", json={**BODY, field: value})
                    self.assertEqual(response.status_code, 201)
                    self.assertEqual(crud.create_record.call_args.kwargs[field], value)

    def test_pace_above_database_bound_is_422_without_insert(self):
        with patch("app.api.routers.records.crud") as crud:
            for pace in (999999.991, 999999.995, 999999.996, 1000000):
                with self.subTest(pace=pace):
                    response = self.client.post("/api/records", json={**BODY, "pace_sec_per_km": pace})
                    self.assertEqual(response.status_code, 422)
            crud.create_record.assert_not_called()

    def test_course_or_route_missing_is_404(self):
        # 코스가 없거나 그 코스에 없는 경로 유형이면 crud가 None을 돌려준다.
        with patch("app.api.routers.records.crud") as crud:
            crud.create_record.return_value = None
            res = self.client.post("/api/records", json={**BODY, "route_type": "bicycle"})
        self.assertEqual(res.status_code, 404)

    def test_invalid_body_is_422_without_touching_db(self):
        bad_bodies = [
            {**BODY, "route_type": "walk"},
            {**BODY, "distance_km": 0},
            {**BODY, "duration_ms": 0},
            {**BODY, "pace_sec_per_km": 0},
            {**BODY, "distance_km": 1001},
            {**BODY, "duration_ms": 7 * 24 * 60 * 60 * 1000 + 1},
            {**BODY, "pace_sec_per_km": 1_000_000},
            {**BODY, "finished_at": "2026-09-20T00:00:00"},  # 시간대 없음
            {**BODY, "finished_at": "2999-01-01T00:00:00Z"},  # 먼 미래
        ]
        with patch("app.api.routers.records.crud") as crud:
            for body in bad_bodies:
                res = self.client.post("/api/records", json=body)
                self.assertEqual(res.status_code, 422, body)
            crud.create_record.assert_not_called()

    def test_list_returns_total_and_records(self):
        with patch("app.api.routers.records.crud") as crud:
            crud.list_records.return_value = (2, [ROW, {**ROW, "id": 2}])
            res = self.client.get("/api/records")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["total_count"], 2)
        self.assertEqual([r["id"] for r in data["records"]], [3, 2])
        self.assertEqual(crud.list_records.call_args.kwargs["user_id"], 7)

    def test_inf_and_nan_are_422(self):
        for value in ("Infinity", "NaN"):
            raw = ('{"course_id":5,"route_type":"trail","distance_km":%s,'
                   '"duration_ms":1000,"finished_at":"2026-09-20T00:00:00Z"}') % value
            res = self.client.post("/api/records", content=raw, headers={"Content-Type": "application/json"})
            self.assertEqual(res.status_code, 422, value)


class AuthRequiredTest(unittest.TestCase):
    def test_requires_login(self):
        app.dependency_overrides.clear()
        client = TestClient(app)
        # 로그인 설정이 없는 환경(CI)에서도 "토큰 없음 → 401" 경로를 타게 한다.
        with patch("app.deps.auth_token.is_configured", return_value=True), patch(
            "app.deps.settings.record_features_enabled", True
        ):
            self.assertEqual(client.get("/api/records").status_code, 401)
            self.assertEqual(client.post("/api/records", json=BODY).status_code, 401)


class FeatureDisabledTest(unittest.TestCase):
    def test_disabled_returns_503_for_both_apis(self):
        app.dependency_overrides[get_current_user] = lambda: USER
        self.addCleanup(app.dependency_overrides.clear)
        client = TestClient(app)
        with patch("app.deps.settings.record_features_enabled", False):
            self.assertEqual(client.get("/api/records").status_code, 503)
            self.assertEqual(client.get("/api/record-cards").status_code, 503)


if __name__ == "__main__":
    unittest.main()
