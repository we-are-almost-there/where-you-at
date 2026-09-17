// @vitest-environment jsdom
import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { CategoryFilter } from "./CategoryFilter";
import { CATEGORY_META, CATEGORY_ORDER, type SpotCategory } from "../types";

afterEach(cleanup);

it("exposes the selected category as a pressed button after each change", () => {
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
    expect(screen.getAllByRole("button", { pressed: false })).toHaveLength(3);
  }
});
