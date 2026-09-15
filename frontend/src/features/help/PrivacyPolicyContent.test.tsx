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
    expect(outsourcing.textContent).toContain("새 1:1 문의 접수 알림 전송 및 보관");

    const overseas = screen.getByRole("region", { name: /개인정보의 국외 수집 및 이전/ });
    expect(overseas.textContent).toContain("이메일, 문의 유형, 문의 내용, 알림 전송 일시");
    expect(overseas.textContent).toContain("전송 후 90일");
  });
});
