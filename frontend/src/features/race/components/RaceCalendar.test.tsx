// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Race } from "../types";
import RaceCalendar from "./RaceCalendar";

function makeRace(id: number, title: string, date: string, type: Race["event_type"] = "running"): Race {
  return {
    event_id: id,
    source: "tourapi",
    race_title: title,
    event_type: type,
    start_date: date,
    end_date: null,
    location_name: null,
    map_x: null,
    map_y: null,
    region_code: null,
    contact: null,
    homepage_url: null,
  };
}

const RACES = [
  makeRace(1, "첫 대회", "2026-09-20"),
  makeRace(2, "둘째 대회", "2026-09-20", "cycling"),
  makeRace(3, "셋째 대회", "2026-09-20", null),
  makeRace(4, "넷째 대회", "2026-09-20"),
  makeRace(5, "다섯째 대회", "2026-09-20"),
];

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 8, 18));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("RaceCalendar", () => {
  it("요일 머리글이 있는 표로 그린다", () => {
    render(<RaceCalendar races={RACES} onSelectRace={vi.fn()} />);

    const table = screen.getByRole("table", { name: "2026년 9월 대회 일정" });
    const headers = within(table).getAllByRole("columnheader");
    expect(headers.map((th) => th.textContent)).toEqual(["일", "월", "화", "수", "목", "금", "토"]);
    expect(headers[0].getAttribute("abbr")).toBe("일요일");
  });

  it("대회 버튼 이름에 날짜·대회명·종목을 담고, 흰 글자 대비를 맞춘 배경을 쓴다", () => {
    const onSelect = vi.fn();
    render(<RaceCalendar races={RACES} onSelectRace={onSelect} />);

    const cycling = screen.getByRole("button", { name: "2026년 9월 20일, 둘째 대회 (자전거)" });
    expect(cycling.style.backgroundColor).toBe("var(--color-race-cycling-strong)");
    expect(
      screen.getByRole("button", { name: "2026년 9월 20일, 셋째 대회 (종목 미정)" }).style.backgroundColor,
    ).toBe("var(--color-race-unspecified-strong)");

    fireEvent.click(cycling);
    expect(onSelect).toHaveBeenCalledWith(RACES[1]);
  });

  it("칸에 다 못 넣은 대회는 +N개 버튼으로 펼쳐 고를 수 있고, Escape로 닫으면 버튼으로 초점이 돌아간다", () => {
    const onSelect = vi.fn();
    render(<RaceCalendar races={RACES} onSelectRace={onSelect} />);
    expect(screen.queryByRole("button", { name: /넷째 대회/ })).toBeNull();

    const more = screen.getByRole("button", { name: "2026년 9월 20일 대회 2개 더 보기" });
    more.focus();
    fireEvent.click(more);
    expect(more.getAttribute("aria-expanded")).toBe("true");
    const list = screen.getByRole("group", { name: "2026년 9월 20일 대회 전체" });
    expect(within(list).getAllByRole("button")).toHaveLength(5);
    expect(document.activeElement).toBe(within(list).getAllByRole("button")[0]);

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("group", { name: /대회 전체/ })).toBeNull();
    expect(document.activeElement).toBe(more);

    fireEvent.click(more);
    fireEvent.click(screen.getByRole("button", { name: "2026년 9월 20일, 다섯째 대회 (러닝)" }));
    // 펼친 목록은 곧바로 닫혀 누른 버튼이 사라지므로 "+N개" 버튼을 초점 복귀 대상으로 넘긴다.
    expect(onSelect).toHaveBeenCalledWith(RACES[4], more);
    expect(screen.queryByRole("group", { name: /대회 전체/ })).toBeNull();
  });

  it("달을 옮기면 바뀐 연월을 상태 영역으로 알린다", () => {
    render(<RaceCalendar races={RACES} onSelectRace={vi.fn()} />);
    expect(screen.getByRole("status").textContent).toBe("2026년 9월");

    fireEvent.click(screen.getByRole("button", { name: "다음 달" }));

    expect(screen.getByRole("status").textContent).toBe("2026년 10월");
    expect(screen.getByRole("table", { name: "2026년 10월 대회 일정" })).toBeTruthy();
  });
});
