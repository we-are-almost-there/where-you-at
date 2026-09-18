// @vitest-environment jsdom
//
// 이전 버전 약관·방침 페이지가 적용 기간과 현재 문서 링크를 보여 주고, 옛 본문(회원가입 없음)을 그대로 보관하는지 본다.
import type { ReactElement } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PrivacyPolicy20260917Page, Terms20260917Page } from ".";

vi.mock("../../../components/layout/AppHeader", () => ({ default: () => null }));

afterEach(cleanup);

function renderPage(page: ReactElement) {
  return render(<MemoryRouter>{page}</MemoryRouter>);
}

describe("이전 버전 페이지", () => {
  it("9월 17일 개인정보처리방침을 적용 기간과 함께 그대로 보여 준다", () => {
    renderPage(<PrivacyPolicy20260917Page />);

    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("이전 개인정보처리방침");
    expect(screen.getByText("2026년 9월 17일 ~ 2026년 9월 18일")).toBeTruthy();
    expect(screen.getByRole("link", { name: "현재 개인정보처리방침 보기" }).getAttribute("href")).toBe("/privacy");
    expect(document.body.textContent).toContain("서비스는 회원가입 없이 이용하므로");
    expect(document.body.textContent).toContain("이 개인정보처리방침은 2026년 9월 17일부터 적용됩니다.");
  });

  it("9월 17일 이용약관을 적용 기간과 함께 그대로 보여 준다", () => {
    renderPage(<Terms20260917Page />);

    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("이전 이용약관");
    expect(screen.getByRole("link", { name: "현재 이용약관 보기" }).getAttribute("href")).toBe("/terms");
    expect(document.body.textContent).toContain("이 약관은 2026년 9월 17일부터 시행합니다.");
  });
});
