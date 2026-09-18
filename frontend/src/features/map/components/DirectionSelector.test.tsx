// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { DirectionSelector } from "./DirectionSelector";

afterEach(cleanup);

const start = { caption: "부산광역시 강서구", main: "송정동 1476-1" };
const end = { caption: "경상남도 창원시 진해구", main: "제덕동 885" };

function terms() {
  return screen.getAllByRole("term").map((dt) => `${dt.textContent}:${dt.nextElementSibling?.textContent}`);
}

it("출발·도착을 색이 아닌 글자로도 구분하고, 방향을 바꾸면 주소가 바뀐다", () => {
  const { rerender } = render(
    <DirectionSelector start={start} end={end} direction="forward" onToggle={vi.fn()} />,
  );
  expect(terms()).toEqual(["출발:부산광역시 강서구송정동 1476-1", "도착:경상남도 창원시 진해구제덕동 885"]);

  rerender(<DirectionSelector start={start} end={end} direction="reverse" onToggle={vi.fn()} />);
  expect(terms()).toEqual(["출발:경상남도 창원시 진해구제덕동 885", "도착:부산광역시 강서구송정동 1476-1"]);
});
