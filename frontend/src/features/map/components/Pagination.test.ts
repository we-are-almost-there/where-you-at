import { describe, it, expect } from "vitest";
import { pageBlock } from "../pagination";

// 화살표는 블록 단위로 이동한다. 이동 목적지는 UI가 blockStart-1 / blockEnd+1 로 계산하므로
// 여기서는 블록 경계(blockStart/blockEnd)와 노출 번호(pages)가 정확한지 검증한다.
describe("pageBlock", () => {
  it("1페이지: 1–5 블록, 이전 없음(blockStart=1)", () => {
    expect(pageBlock(1, 12)).toEqual({ blockStart: 1, blockEnd: 5, pages: [1, 2, 3, 4, 5] });
  });

  it("블록 마지막(5페이지)도 여전히 1–5 블록 → › 는 blockEnd+1=6 으로 이동", () => {
    const b = pageBlock(5, 12);
    expect(b).toEqual({ blockStart: 1, blockEnd: 5, pages: [1, 2, 3, 4, 5] });
    expect(b.blockEnd + 1).toBe(6);
  });

  it("6페이지: 창이 6–10 으로 이동, ‹ 는 blockStart-1=5 로 이동", () => {
    const b = pageBlock(6, 12);
    expect(b).toEqual({ blockStart: 6, blockEnd: 10, pages: [6, 7, 8, 9, 10] });
    expect(b.blockStart - 1).toBe(5);
  });

  it("마지막 블록은 totalPages 까지만 노출 (11–12)", () => {
    expect(pageBlock(11, 12)).toEqual({ blockStart: 11, blockEnd: 12, pages: [11, 12] });
  });

  it("총 페이지가 블록보다 작으면 그 수만큼만", () => {
    expect(pageBlock(1, 3)).toEqual({ blockStart: 1, blockEnd: 3, pages: [1, 2, 3] });
  });

  it("블록 경계(정확히 배수)에서 blockEnd 가 totalPages 를 넘지 않음", () => {
    expect(pageBlock(10, 10)).toEqual({ blockStart: 6, blockEnd: 10, pages: [6, 7, 8, 9, 10] });
  });
});
