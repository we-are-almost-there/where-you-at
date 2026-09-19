// @vitest-environment jsdom
//
// 이전 버전 약관·방침 페이지가 적용 기간과 현재 문서 링크를 보여 주고, 옛 본문(회원가입 없음)을 그대로 보관하는지 본다.
import type { ReactElement } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PrivacyPolicy20260917Page, Terms20260917Page } from ".";
import { PREVIOUS_VERSIONS } from "../legalInfo";

vi.mock("../../../components/layout/AppHeader", () => ({ default: () => null }));
// 현재 운영 정보(legalInfo)를 바꿔도 이전 버전 문서는 당시 값 그대로여야 한다. 운영 정보만 일부러 다른 값으로 바꾸고,
// 적용 기간(PREVIOUS_VERSIONS·findPreviousVersion)은 실제 값을 그대로 쓴다.
vi.mock("../legalInfo", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../legalInfo")>()),
  OPERATOR: "MOCK_OPERATOR",
  SERVICE: "MOCK_SERVICE",
  CONTEST: "MOCK_CONTEST",
  EFFECTIVE_DATE: "2099년 1월 1일",
}));

afterEach(cleanup);

function renderPage(page: ReactElement) {
  return render(<MemoryRouter>{page}</MemoryRouter>);
}

describe("이전 버전 페이지", () => {
  it("9월 17일 개인정보처리방침을 적용 기간과 함께 그대로 보여 준다", () => {
    renderPage(<PrivacyPolicy20260917Page />);

    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("이전 개인정보처리방침");
    // 맨 위 안내의 기간은 방침·약관의 이전 버전 링크와 같은 PREVIOUS_VERSIONS 값이다.
    const version = PREVIOUS_VERSIONS.find((item) => item.privacyPath === "/privacy/2026-09-17");
    expect(version).toBeTruthy();
    expect(screen.getByText(version!.period)).toBeTruthy();
    expect(screen.getByRole("link", { name: "현재 개인정보처리방침 보기" }).getAttribute("href")).toBe("/privacy");
    expect(document.body.textContent).toContain("서비스는 회원가입 없이 이용하므로");
    expect(document.body.textContent).toContain("이 개인정보처리방침은 2026년 9월 17일부터 적용됩니다.");
    expect(document.body.textContent).toContain("거의 다왔어 팀(이하 ‘운영팀’)은 어디까지왔니 서비스");
    // 푸터의 저작권 표시는 현재 값을 쓰는 게 맞으므로 본문(main)만 본다.
    expect(screen.getByRole("main").textContent).not.toContain("MOCK_");
  });

  it("9월 17일 이용약관을 적용 기간과 함께 그대로 보여 준다", () => {
    renderPage(<Terms20260917Page />);

    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("이전 이용약관");
    const version = PREVIOUS_VERSIONS.find((item) => item.termsPath === "/terms/2026-09-17");
    expect(screen.getByText(version!.period)).toBeTruthy();
    expect(screen.getByRole("link", { name: "현재 이용약관 보기" }).getAttribute("href")).toBe("/terms");
    expect(document.body.textContent).toContain("이 약관은 2026년 9월 17일부터 시행합니다.");
    expect(document.body.textContent).toContain("2026 관광데이터 활용 공모전 출품작");
    // 푸터의 저작권 표시는 현재 값을 쓰는 게 맞으므로 본문(main)만 본다.
    expect(screen.getByRole("main").textContent).not.toContain("MOCK_");
  });
});
