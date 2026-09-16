import { describe, expect, it } from "vitest";
import { toSafeHttpUrl } from "./externalUrl";

describe("toSafeHttpUrl", () => {
  it.each([
    ["https://example.com/reserve?course=1", "https://example.com/reserve?course=1"],
    ["http://example.com", "http://example.com/"],
    ["  HTTPS://example.com/path  ", "https://example.com/path"],
  ])("%s 주소를 HTTP(S) 링크로 반환한다", (value, expected) => {
    expect(toSafeHttpUrl(value)).toBe(expected);
  });

  it.each([
    null,
    undefined,
    "",
    "example.com/reserve",
    "/reserve",
    "//evil.example/reserve",
    "javascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "ftp://example.com/file",
    "https://",
  ])("%s 주소는 링크로 사용하지 않는다", (value) => {
    expect(toSafeHttpUrl(value)).toBeNull();
  });
});
