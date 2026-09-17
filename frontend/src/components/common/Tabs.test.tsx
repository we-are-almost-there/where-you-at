// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { Tabs } from "./Tabs";
import { tabPanelProps } from "./tabIds";

afterEach(cleanup);

const ITEMS = [
  { value: "a", label: "첫째" },
  { value: "b", label: "둘째" },
  { value: "c", label: "셋째" },
] as const;

function Harness() {
  const [value, setValue] = useState<"a" | "b" | "c">("a");
  const index = ITEMS.findIndex((item) => item.value === value);
  return (
    <>
      <Tabs
        idBase="test"
        label="테스트 탭"
        items={ITEMS}
        value={value}
        onChange={setValue}
        tabClassName={() => ""}
      />
      <div {...tabPanelProps("test", index)}>{value} 내용</div>
    </>
  );
}

const tab = (name: string) => screen.getByRole("tab", { name });

describe("Tabs", () => {
  it("선택된 탭만 Tab 순서에 있고, 모든 탭이 패널을 가리키며 패널은 선택된 탭 이름을 쓴다", () => {
    render(<Harness />);

    expect(screen.getByRole("tablist", { name: "테스트 탭" })).toBeTruthy();
    expect(ITEMS.map((item) => tab(item.label).tabIndex)).toEqual([0, -1, -1]);
    for (const item of ITEMS) {
      expect(tab(item.label).getAttribute("aria-controls")).toBe("test-panel");
    }
    expect(screen.getByRole("tabpanel", { name: "첫째" }).textContent).toBe("a 내용");
  });

  it("좌우 방향키는 옆 탭으로 옮기며 선택하고, 양 끝에서는 반대쪽으로 돈다", () => {
    render(<Harness />);
    tab("첫째").focus();

    fireEvent.keyDown(tab("첫째"), { key: "ArrowRight" });
    expect(document.activeElement).toBe(tab("둘째"));
    expect(tab("둘째").getAttribute("aria-selected")).toBe("true");
    expect(tab("둘째").tabIndex).toBe(0);
    expect(screen.getByRole("tabpanel", { name: "둘째" })).toBeTruthy();

    fireEvent.keyDown(tab("둘째"), { key: "ArrowLeft" });
    fireEvent.keyDown(tab("첫째"), { key: "ArrowLeft" });
    expect(document.activeElement).toBe(tab("셋째"));
    expect(tab("셋째").getAttribute("aria-selected")).toBe("true");
  });

  it("Home·End는 처음·마지막 탭으로 간다", () => {
    render(<Harness />);

    fireEvent.keyDown(tab("첫째"), { key: "End" });
    expect(document.activeElement).toBe(tab("셋째"));

    fireEvent.keyDown(tab("셋째"), { key: "Home" });
    expect(document.activeElement).toBe(tab("첫째"));
    expect(tab("첫째").getAttribute("aria-selected")).toBe("true");
  });
});
