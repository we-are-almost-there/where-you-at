// @vitest-environment jsdom
//
// 개인정보처리방침 본문의 구조를 본다. 문안 자체의 적정성은 사람이 검토하고, 여기서는
// 목차가 모든 항목으로 이어지는지와 1:1 문의 동의 안내와 어긋나기 쉬운 사실(보유 기간·수집 항목)을 지킨다.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import PrivacyPolicyContent from "./PrivacyPolicyContent";

afterEach(cleanup);

describe("PrivacyPolicyContent", () => {
  it("목차의 모든 링크가 같은 이름의 항목 제목으로 이어진다", () => {
    render(<PrivacyPolicyContent />);

    const toc = screen.getByRole("navigation", { name: "개인정보처리방침 목차" });
    const links = Array.from(toc.querySelectorAll("a"));
    expect(links.length).toBeGreaterThan(0);

    for (const link of links) {
      const id = link.getAttribute("href")!.slice(1);
      const heading = document.getElementById(id);
      expect(heading?.tagName).toBe("H2");
      expect(heading?.textContent).toBe(link.textContent);
    }
  });

  it("목차를 누르면 주소는 그대로 두고 해당 항목 제목으로 포커스를 옮긴다", () => {
    render(<PrivacyPolicyContent />);

    fireEvent.click(screen.getByRole("link", { name: /개인정보의 처리 및 보유 기간/ }));

    expect(window.location.hash).toBe("");
    expect(document.activeElement?.textContent).toMatch(/개인정보의 처리 및 보유 기간$/);
  });

  it("팝업에서는 항목 제목을 한 단계 낮춰(h3) 그린다", () => {
    render(<PrivacyPolicyContent headingLevel={3} />);

    expect(screen.getAllByRole("heading", { level: 3 }).length).toBeGreaterThan(0);
    expect(screen.queryAllByRole("heading", { level: 2 })).toHaveLength(0);
  });

  it("1:1 문의 동의 안내와 같은 수집 항목과 보유 기간을 적는다", () => {
    render(<PrivacyPolicyContent />);

    const retention = screen.getByRole("region", { name: /개인정보의 처리 및 보유 기간/ });
    expect(retention.textContent).toContain("1:1 문의 (이메일, 문의 유형, 문의 내용)");
    expect(retention.textContent).toContain("문의 처리 완료 후 1년");
  });

  it("Slack 문의 알림의 위탁과 국외 이전 내용을 안내한다", () => {
    render(<PrivacyPolicyContent />);

    const outsourcing = screen.getByRole("region", { name: /개인정보 처리업무의 위탁/ });
    expect(outsourcing.textContent).toContain("Slack Technologies Limited");
    expect(outsourcing.textContent).toContain("새 1:1 문의 접수 및 회원 탈퇴 처리 실패 알림 전송·보관");

    const overseas = screen.getByRole("region", { name: /개인정보의 국외 수집 및 이전/ });
    expect(overseas.textContent).toContain("탈퇴 처리에 실패한 회원의 내부 회원 번호, 실패 단계");
    expect(overseas.textContent).toContain("회원 탈퇴 처리에 실패할 때 Incoming Webhook을 통해 전송");
    expect(overseas.textContent).toContain("아일랜드 (처리 주체), 미국 (기본 데이터 저장 위치)");
    expect(overseas.textContent).toContain("1:1 문의의 이메일·문의 유형·문의 내용");
    expect(overseas.textContent).toContain("알림 전송 일시");
    expect(overseas.textContent).toContain("전송 후 90일");
  });

  it("권리 행사 본인 확인과 Slack 알림 수동 삭제 절차를 안내한다", () => {
    render(<PrivacyPolicyContent />);

    const rights = screen.getByRole("region", { name: /정보주체의 권리·의무 및 행사방법/ });
    expect(rights.textContent).toContain("기존 문의에 입력한 이메일로 확인 메일을 보내고");
    expect(rights.textContent).toContain("회신 여부를 통해 요청자임을 확인");

    const destruction = screen.getByRole("region", { name: /개인정보의 파기 절차 및 방법/ });
    expect(destruction.textContent).toContain("관련 Slack 알림과 데이터베이스의 문의를 직접 찾아");
    expect(destruction.textContent).toContain("Slack 메시지를 직접 삭제");
    expect(destruction.textContent).toContain("90일 보존 설정에 따라 자동으로 삭제");
  });

  it("회원 정보의 항목·법적 근거·보유 기간·파기를 안내한다", () => {
    render(<PrivacyPolicyContent />);

    const items = screen.getByRole("region", { name: /처리하는 개인정보의 항목/ });
    expect(items.textContent).toContain("카카오 회원번호, 닉네임");
    expect(items.textContent).toContain("한 줄 소개, 프로필 사진과 저장 객체 키");
    expect(items.textContent).toContain("로그인 세션 번호, 회원 번호, 만료 시각");
    expect(items.textContent).toContain("제15조제1항제4호(계약의 체결·이행)");
    expect(items.textContent).not.toContain("회원가입 없이");

    const retention = screen.getByRole("region", { name: /개인정보의 처리 및 보유 기간/ });
    expect(retention.textContent).toContain("회원 정보 (카카오 회원번호, 닉네임, 한 줄 소개, 프로필 사진과 저장 객체 키)");
    expect(retention.textContent).toContain("회원 탈퇴 시까지(카카오에서 서비스와의 연결을 끊은 경우 포함)");
    expect(retention.textContent).toContain("프로필 사진은 삭제하거나 새 사진으로 바꾸면 기존 파일과 저장 객체 키를 바로 삭제");
    expect(retention.textContent).not.toContain("임시 업로드 파일");
    expect(retention.textContent).toContain("로그인 세션 (로그인 세션 번호, 회원 번호, 만료 시각)");
    expect(retention.textContent).toContain("7일이 지나 만료된 세션은 같은 회원이 다음에 로그인할 때 삭제");

    const destruction = screen.getByRole("region", { name: /개인정보의 파기 절차 및 방법/ });
    expect(destruction.textContent).toContain("카카오에 연결 해제를 요청한 뒤 데이터베이스의 회원");
    // 카카오 쪽에서 연결을 끊어도 연결 해제 웹훅으로 지운다(#164).
    expect(destruction.textContent).toContain("카카오로부터 알림을 받으면 회원 정보를 바로 삭제");
    expect(destruction.textContent).toContain("로그아웃하면 현재 세션을 삭제");

    const children = screen.getByRole("region", { name: /14세 미만 아동/ });
    expect(children.textContent).toContain("회원 가입(카카오 로그인)은 만 14세 이상만");

    const autoCollect = screen.getByRole("region", { name: /자동 수집 장치/ });
    expect(autoCollect.textContent).toContain("로그인 토큰을 브라우저 저장소(localStorage)");
    expect(autoCollect.textContent).toContain("회원 번호, 로그인 세션 번호와 발급·만료 시각");
  });

  it("Cloudflare R2의 프로필 사진 위탁·국외 이전과 직접 삭제 방법을 안내한다", () => {
    render(<PrivacyPolicyContent />);

    const outsourcing = screen.getByRole("region", { name: /개인정보 처리업무의 위탁/ });
    expect(outsourcing.textContent).toContain("Cloudflare, Inc.");
    expect(outsourcing.textContent).toContain("프로필 사진을 비공개 객체 저장소(R2)에 저장·전송하고 삭제");

    const overseas = screen.getByRole("region", { name: /개인정보의 국외 수집 및 이전/ });
    expect(overseas.textContent).toContain("아시아·태평양(APAC) (객체 저장 위치)");
    expect(overseas.textContent).toContain("회원이 직접 올린 프로필 사진과 저장 객체 키");
    expect(overseas.textContent).toContain("프로필 사진 삭제·교체 또는 회원 탈퇴 시까지");

    const security = screen.getByRole("region", { name: /개인정보의 안전성 확보조치/ });
    expect(security.textContent).toContain("프로필 사진 비공개 저장과 만료되는 조회 주소 사용");

    const rights = screen.getByRole("region", { name: /정보주체의 권리·의무 및 행사방법/ });
    expect(rights.textContent).toContain("프로필 사진을 직접 바꾸거나 삭제");
  });

  it("이전 방침을 적용 기간과 함께 새 탭 링크로 연결한다", () => {
    render(<PrivacyPolicyContent />);

    const changes = screen.getByRole("region", { name: /개인정보처리방침의 변경/ });
    const link = changes.querySelector("a");

    expect(link?.getAttribute("href")).toBe("/privacy/2026-09-17");
    expect(link?.getAttribute("target")).toBe("_blank");
    expect(link?.textContent).toContain("2026년 9월 17일 ~ 2026년 9월 20일 적용");
  });
});
