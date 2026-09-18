// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { CourseKeywordSearch } from "./CourseFilters";

afterEach(cleanup);

it("코스 검색창은 placeholder가 아닌 고유한 이름을 가진다", () => {
  render(
    <CourseKeywordSearch
      value={{ keyword: "", region: "", distance: "", difficulty: "", sort: "" }}
      onChange={vi.fn()}
    />,
  );

  const search = screen.getByRole("searchbox", { name: "코스 이름 검색" });
  expect(search.getAttribute("aria-label")).toBe("코스 이름 검색");
});
