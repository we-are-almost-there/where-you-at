// @vitest-environment jsdom
//
// 이용약관 본문의 구조와, 고치다가 빠뜨리기 쉬운 조항을 본다. 문안 자체의 적정성은 사람이 검토한다.
import { cleanup, render, screen, within } from "@testing-library/react";
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

    // 제4조(약관 외 준칙), 제8조(위치 기능), 제11조의2(회원 가입과 탈퇴)에서 안내한다.
    const links = screen.getAllByRole("link", { name: "개인정보처리방침" });
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) expect(link.getAttribute("href")).toBe("/privacy");
  });

  it("회원 가입은 선택이고 만 14세 이상만 할 수 있으며, 마이페이지에서 탈퇴할 수 있다", () => {
    renderTerms();

    const membership = screen.getByRole("region", { name: "제11조의2(회원 가입과 탈퇴)" });
    expect(membership.textContent).toContain("가입하지 않아도 마이페이지를 뺀 서비스를 이용할 수");
    expect(membership.textContent).toContain("만 14세 이상만");
    expect(membership.textContent).toContain("마이페이지에서 언제든지 탈퇴");
    // 카카오 쪽에서 연결을 끊어도 탈퇴로 본다(#164 연결 해제 웹훅).
    expect(membership.textContent).toContain("카카오계정을 탈퇴하면 탈퇴한 것으로 보고");
    // 회원가입 없는 서비스라는 옛 문구가 남아 있지 않다.
    expect(document.body.textContent).not.toContain("회원가입 없이");
  });

  it("프로필 사진의 등록·삭제와 이용자 책임·운영팀 조치를 안내한다", () => {
    renderTerms();

    const profile = screen.getByRole("region", { name: "제11조의3(프로필)" });
    expect(profile.textContent).toContain("프로필 사진을 등록·변경·삭제");
    expect(profile.textContent).toContain("다른 사람의 초상권·저작권·명예 등 권리를 침해");
    expect(profile.textContent).toContain("지우고 기본값으로 바꿀 수 있습니다");

    const membership = screen.getByRole("region", { name: "제11조의2(회원 가입과 탈퇴)" });
    expect(membership.textContent).toContain("프로필 사진을 포함한 회원 정보");
  });

  it("부칙에서 이전 약관을 적용 기간과 함께 연결한다", () => {
    renderTerms();

    const addendum = screen.getByRole("region", { name: "부칙" });
    const link = within(addendum).getByRole("link", { name: "2026년 9월 17일 ~ 2026년 9월 19일 적용" });
    expect(link.getAttribute("href")).toBe("/terms/2026-09-17");
  });
});
