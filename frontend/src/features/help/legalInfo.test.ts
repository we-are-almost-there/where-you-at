// 시행일을 바꿀 때 함께 고쳐야 하는 곳이 서로 맞는지 본다(legalInfo.ts EFFECTIVE_DATE 주석).
// 배포가 밀려 시행일만 고치면 직전 버전 기간과 새 시행일 사이에 어느 문서에도 덮이지 않는 날이 생기거나,
// 공지가 다른 날짜를 알린다.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { EFFECTIVE_DATE, PREVIOUS_VERSIONS, findPreviousVersion } from "./legalInfo";

const SEED_PATH = resolve(__dirname, "../../../../backend/sql/04_help_seed.sql");

/** "2026년 9월 19일" → UTC 자정 Date. 형식이 다르면 실패시킨다. */
function parseKoreanDate(text: string): Date {
  const match = /^(\d{4})년 (\d{1,2})월 (\d{1,2})일$/.exec(text.trim());
  if (!match) throw new Error(`날짜 형식이 아닙니다: ${text}`);
  const [, year, month, day] = match.map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

/** "2026년 9월 17일 ~ 2026년 9월 18일" → [시작, 끝] */
function parsePeriod(period: string): [Date, Date] {
  const [start, end] = period.split("~");
  return [parseKoreanDate(start), parseKoreanDate(end)];
}

const DAY_MS = 24 * 60 * 60 * 1000;

describe("legalInfo", () => {
  it("직전 버전의 기간은 현재 시행일 하루 전에 끝난다", () => {
    // 순서에 기대지 않고 끝 날짜가 가장 늦은 버전을 직전 버전으로 본다.
    const latestEnd = Math.max(...PREVIOUS_VERSIONS.map((version) => parsePeriod(version.period)[1].getTime()));

    expect(latestEnd).toBe(parseKoreanDate(EFFECTIVE_DATE).getTime() - DAY_MS);
  });

  it("이전 버전 기간은 시작이 끝보다 늦지 않고 서로 겹치지 않는다", () => {
    const periods = PREVIOUS_VERSIONS.map((version) => parsePeriod(version.period)).sort((a, b) => a[0].getTime() - b[0].getTime());
    periods.forEach(([start, end], index) => {
      expect(start.getTime()).toBeLessThanOrEqual(end.getTime());
      if (index > 0) expect(start.getTime()).toBe(periods[index - 1][1].getTime() + DAY_MS);
    });
  });

  it("공지 시드의 변경 안내가 현재 시행일을 알린다", () => {
    const sql = readFileSync(SEED_PATH, "utf-8");
    const notice = /'개인정보처리방침과 이용약관이 바뀌었습니다',\s*E'((?:[^']|'')*)'/.exec(sql);

    expect(notice, "변경 안내 공지를 시드에서 찾지 못했습니다").toBeTruthy();
    expect(notice![1]).toContain(`**${EFFECTIVE_DATE}**부터 적용됩니다`);
  });

  it("경로로 이전 버전을 찾고, 없는 경로면 던진다", () => {
    for (const version of PREVIOUS_VERSIONS) {
      expect(findPreviousVersion(version.privacyPath)).toBe(version);
      expect(findPreviousVersion(version.termsPath)).toBe(version);
    }
    expect(() => findPreviousVersion("/privacy/1999-01-01")).toThrow("PREVIOUS_VERSIONS에 없는 이전 버전 경로");
  });
});
