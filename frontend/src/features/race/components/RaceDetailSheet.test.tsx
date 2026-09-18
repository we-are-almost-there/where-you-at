// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Race } from "../types";
import RaceDetailSheet from "./RaceDetailSheet";

// 지도·숙박은 이 테스트의 대상이 아니다(카카오 SDK·네트워크를 쓴다).
vi.mock("./RaceMap", () => ({ default: () => null }));
vi.mock("./RaceAccommodations", () => ({ default: () => null }));

const race: Race = {
  event_id: 7,
  source: "tourapi",
  race_title: "바다 마라톤",
  event_type: "cycling",
  start_date: "2026-10-03",
  end_date: null,
  location_name: "부산",
  map_x: null,
  map_y: null,
  region_code: null,
  contact: null,
  homepage_url: "https://example.com",
};

let root: HTMLDivElement;

beforeEach(() => {
  // 모달은 앱 루트(#root)를 inert로 잠근다.
  root = document.createElement("div");
  root.id = "root";
  document.body.append(root);
  vi.stubGlobal("matchMedia", () => ({ matches: true, addEventListener() {}, removeEventListener() {} }));
});

afterEach(() => {
  cleanup();
  root.remove();
  vi.unstubAllGlobals();
});

describe("RaceDetailSheet 모바일(모달)", () => {
  it("대회명을 제목으로 하는 모달로 열고, 뒤 화면을 잠그고, 뒤로 버튼에 초점을 둔다", () => {
    render(<RaceDetailSheet race={race} onClose={vi.fn()} />, { container: root });

    const dialog = screen.getByRole("dialog", { name: "바다 마라톤" });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(root.contains(dialog)).toBe(false); // 포털로 #root 밖에 그려야 함께 잠기지 않는다
    expect(root.inert).toBe(true);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "목록으로" }));
  });

  it("Escape로 닫고, 닫히면 잠금을 풀고 누른 대회 버튼으로 초점을 돌려준다", () => {
    const trigger = document.createElement("button");
    root.append(trigger);
    const onClose = vi.fn();
    const { unmount } = render(
      <RaceDetailSheet race={race} onClose={onClose} getReturnTarget={() => trigger} />,
      { container: root.appendChild(document.createElement("div")) },
    );

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);

    unmount();
    expect(root.inert).toBe(false);
    expect(document.activeElement).toBe(trigger);
  });

  it("흰 글자 종목 배지는 대비를 맞춘 진한 색을 쓰고, 홈페이지 링크는 새 탭을 알린다", () => {
    render(<RaceDetailSheet race={race} onClose={vi.fn()} />, { container: root });

    expect(screen.getByText("자전거").style.backgroundColor).toBe("var(--color-race-cycling-strong)");
    expect(screen.getByRole("link", { name: "대회 홈페이지 바로가기 (새 탭에서 열림)" })).toBeTruthy();
  });
});

describe("RaceDetailSheet 데스크톱(인라인)", () => {
  it("목록 옆 패널이라 대화상자 속성과 초점 이동을 걸지 않는다", () => {
    const before = document.activeElement;
    render(<RaceDetailSheet race={race} onClose={vi.fn()} inline />, { container: root });

    expect(screen.queryByRole("dialog")).toBeNull();
    // jsdom에는 inert 속성이 없어 한 번도 걸지 않았으면 undefined다.
    expect(root.inert).not.toBe(true);
    expect(document.activeElement).toBe(before);
  });
});
