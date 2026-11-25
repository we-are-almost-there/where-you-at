import logging
import os
import unittest
from unittest.mock import patch
from urllib.parse import quote_plus

import requests


TEST_SERVICE_KEY = "test-key+/="
with patch.dict(
    os.environ,
    {
        "DB_HOST": "localhost",
        "DB_NAME": "postgres",
        "DB_USER": "postgres",
        "DB_PASSWORD": "password",
        "TOUR_API_KEY": TEST_SERVICE_KEY,
        "BICYCLE_FILE_LOG_ENABLED": "false",
    },
):
    from scripts import collect_bicycle_realtime as collector


class CollectBicycleRealtimeTest(unittest.TestCase):
    def test_request_failure_log_redacts_encoded_service_key(self):
        encoded_key = quote_plus(TEST_SERVICE_KEY, safe="")
        error = requests.exceptions.HTTPError(
            f"401 Client Error for url: {collector.SERVICE_URL}?serviceKey={encoded_key}&pageNo=1"
        )

        with (
            patch.object(collector.requests, "get", side_effect=error),
            patch.object(collector.time, "sleep"),
            self.assertLogs(collector.logger, level="WARNING") as captured,
        ):
            with self.assertRaises(requests.exceptions.HTTPError):
                collector.fetch_page("1100000000", 1)

        output = "\n".join(captured.output)
        self.assertNotIn(TEST_SERVICE_KEY, output)
        self.assertNotIn(encoded_key, output)
        self.assertIn("serviceKey=[REDACTED]", output)

    def test_redact_sensitive_text_masks_key_outside_query_string(self):
        output = collector.redact_sensitive_text(f"API rejected key {TEST_SERVICE_KEY}")

        self.assertNotIn(TEST_SERVICE_KEY, output)
        self.assertEqual("API rejected key [REDACTED]", output)

    def test_false_file_log_setting_does_not_create_file_handler(self):
        for value in ("0", "false", "no", "off"):
            with self.subTest(value=value):
                with (
                    patch.dict(os.environ, {"BICYCLE_FILE_LOG_ENABLED": value}),
                    patch.object(collector.Path, "mkdir") as mkdir,
                ):
                    handlers = collector.build_log_handlers()

                mkdir.assert_not_called()
                self.assertFalse(
                    any(isinstance(handler, logging.FileHandler) for handler in handlers)
                )

    def test_unwritable_log_dir_falls_back_to_stream_log(self):
        # 컨테이너는 실행 사용자가 /app/logs를 만들 수 없다. .env가 파일 로그를 켜도 수집은 계속돼야 한다.
        with (
            patch.dict(os.environ, {"BICYCLE_FILE_LOG_ENABLED": "true"}),
            patch.object(collector.Path, "mkdir", side_effect=PermissionError),
            patch.object(collector.logging, "FileHandler") as file_handler,
            patch("sys.stderr"),
        ):
            handlers = collector.build_log_handlers()

        file_handler.assert_not_called()
        self.assertEqual([type(handler) for handler in handlers], [logging.StreamHandler])


if __name__ == "__main__":
    unittest.main()
