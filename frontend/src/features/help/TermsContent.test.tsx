// @vitest-environment jsdom
//
// 이용약관 본문의 구조와, 고치다가 빠뜨리기 쉬운 조항을 본다. 문안 자체의 적정성은 사람이 검토한다.
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it } from "vitest";
import TermsContent from "./TermsContent";

afterEach(cleanup);

function renderTerms() {
  return render(
    <MemoryRouter>
      <TermsContent />
    </MemoryRouter>,
  );
}

describe("TermsContent", () => {
  it("목차의 모든 링크가 같은 이름의 조항 제목으로 이어진다", () => {
    renderTerms();

    const toc = screen.getByRole("navigation", { name: "이용약관 목차" });
    const links = Array.from(toc.querySelectorAll("a"));
    expect(links.length).toBeGreaterThan(0);

    for (const link of links) {
      const heading = document.getElementById(link.getAttribute("href")!.slice(1));
      expect(heading?.tagName).toBe("H2");
      expect(heading?.textContent).toBe(link.textContent);
    }
  });

  it("책임 제한 조항은 운영팀의 고의·중대한 과실을 면책 대상에서 뺀다", () => {
    renderTerms();

    // 「약관의 규제에 관한 법률」 제7조: 고의·중대한 과실로 인한 책임을 배제하는 조항은 무효
    const liability = screen.getByRole("region", { name: "제13조(책임의 제한)" });
    expect(liability.textContent).toContain("고의 또는 중대한 과실로 생긴 손해는 그렇지 않습니다");
  });

  it("개인정보 처리는 개인정보처리방침으로 안내한다", () => {
    renderTerms();

    // 제4조(약관 외 준칙)와 제8조(위치 기능) 두 곳에서 안내한다.
    const links = screen.getAllByRole("link", { name: "개인정보처리방침" });
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) expect(link.getAttribute("href")).toBe("/privacy");
  });
});
