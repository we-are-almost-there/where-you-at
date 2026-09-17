// @vitest-environment jsdom
import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { CategoryFilter } from "./CategoryFilter";
import { CATEGORY_META, CATEGORY_ORDER, type SpotCategory } from "../types";

afterEach(cleanup);

it("카테고리를 바꿀 때마다 선택한 버튼 하나만 눌림 상태가 된다", () => {
  function Filter() {
    const [value, setValue] = useState<SpotCategory>("attraction");
    return <CategoryFilter value={value} onChange={setValue} />;
  }

  render(<Filter />);
  expect(screen.getByRole("button", { name: "관광지", pressed: true })).toBeTruthy();

  for (const category of CATEGORY_ORDER) {
    fireEvent.click(screen.getByRole("button", { name: CATEGORY_META[category].label }));
    expect(screen.getAllByRole("button", { pressed: true })).toHaveLength(1);
    expect(screen.getByRole("button", {
      name: CATEGORY_META[category].label,
      pressed: true,
    })).toBeTruthy();
    expect(screen.getAllByRole("button", { pressed: false })).toHaveLength(CATEGORY_ORDER.length - 1);
  }
});
