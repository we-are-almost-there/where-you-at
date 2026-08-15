import { describe, expect, it } from "vitest";
import {
  CANVAS_W,
  PADDING,
  ROUTE_BOX,
  clampPhotoOffset,
  clampRouteOffset,
  clampStatsOffset,
  routeBoxAt,
  routeLayout,
  statsBoxAt,
  statsLayout,
} from "./recordCardCanvas";

const FEED_H = 1350;

describe("clampRouteOffset", () => {
  it("범위 안의 값은 그대로 둔다", () => {
    expect(clampRouteOffset({ x: -100, y: -50 }, "top", FEED_H, ROUTE_BOX)).toEqual({
      x: -100,
      y: -50,
    });
  });

  it("상자가 왼쪽·위 밖으로 나가지 않도록 자른다", () => {
    const { defaultLeft, defaultTop } = routeLayout("top", FEED_H, ROUTE_BOX);
    const clamped = clampRouteOffset({ x: -9999, y: -9999 }, "top", FEED_H, ROUTE_BOX);
    expect(clamped).toEqual({ x: -defaultLeft, y: -defaultTop });
    const box = routeBoxAt("top", FEED_H, clamped, ROUTE_BOX);
    expect(box.left).toBe(0);
    expect(box.top).toBe(0);
  });

  it("상자가 오른쪽·아래 밖으로 나가지 않도록 자른다", () => {
    const clamped = clampRouteOffset({ x: 9999, y: 9999 }, "top", FEED_H, ROUTE_BOX);
    const box = routeBoxAt("top", FEED_H, clamped, ROUTE_BOX);
    expect(box.left).toBe(CANVAS_W - ROUTE_BOX);
    expect(box.top).toBe(FEED_H - ROUTE_BOX);
  });

  /**
   * 이 테스트가 원래 버그를 잡는다.
   * 저장값을 자르지 않으면 경계 밖으로 끈 만큼 되돌려야 다시 움직이는 헛도는 구간이 생긴다.
   */
  it("경계 밖으로 끈 뒤 반대로 조금만 끌어도 즉시 움직인다", () => {
    const size = ROUTE_BOX;
    // 왼쪽 끝을 한참 넘겨 끈 상태
    const pinned = clampRouteOffset({ x: -9999, y: 0 }, "top", FEED_H, size);
    const pinnedLeft = routeBoxAt("top", FEED_H, pinned, size).left;
    expect(pinnedLeft).toBe(0);

    // 오른쪽으로 100px만 되돌린다
    const nudged = clampRouteOffset({ x: pinned.x + 100, y: 0 }, "top", FEED_H, size);
    expect(routeBoxAt("top", FEED_H, nudged, size).left).toBe(100);
  });
});

describe("clampStatsOffset", () => {
  it("수치 블록이 캔버스 밖으로 나가지 않는다", () => {
    const { width, height } = statsLayout("top", FEED_H, 1);
    const clamped = clampStatsOffset({ x: 9999, y: 9999 }, "top", FEED_H, 1);
    const box = statsBoxAt("top", FEED_H, 1, clamped);
    expect(box.left).toBeCloseTo(CANVAS_W - width, 5);
    expect(box.top).toBeCloseTo(FEED_H - height, 5);
  });

  it("경계 밖으로 끈 뒤 반대로 조금만 끌어도 즉시 움직인다", () => {
    const pinned = clampStatsOffset({ x: 0, y: 9999 }, "top", FEED_H, 1);
    const pinnedTop = statsBoxAt("top", FEED_H, 1, pinned).top;
    const nudged = clampStatsOffset({ x: 0, y: pinned.y - 120 }, "top", FEED_H, 1);
    expect(statsBoxAt("top", FEED_H, 1, nudged).top).toBeCloseTo(pinnedTop - 120, 5);
  });

  it("기본 배치는 프리셋이 정한다", () => {
    expect(statsBoxAt("top", FEED_H, 1, { x: 0, y: 0 }).top).toBe(PADDING);
    const bottom = statsBoxAt("bottom", FEED_H, 1, { x: 0, y: 0 });
    expect(bottom.top + bottom.height).toBeCloseTo(FEED_H - PADDING, 5);
  });
});

describe("statsBoxAt", () => {
  it("글자 크기를 키우면 저장된 오프셋이 범위를 벗어나도 캔버스 안에 머문다", () => {
    // 작은 글자 기준으로 바닥까지 내려 둔 오프셋
    const small = clampStatsOffset({ x: 0, y: 9999 }, "top", FEED_H, 0.85);
    // 글자를 키우면 블록이 높아져 같은 오프셋으로는 넘친다
    const box = statsBoxAt("top", FEED_H, 1.4, small);
    expect(box.top + box.height).toBeLessThanOrEqual(FEED_H + 0.001);
  });
});

describe("clampPhotoOffset", () => {
  it("사진이 캔버스를 덮는 범위 안으로 자른다", () => {
    const image = { width: 2000, height: 1000 }; // 가로로 긴 사진
    const clamped = clampPhotoOffset(image, { scale: 1, offsetX: 9999, offsetY: 9999 }, FEED_H);
    const cover = Math.max(CANVAS_W / image.width, FEED_H / image.height);
    expect(clamped.offsetX).toBeCloseTo((image.width * cover - CANVAS_W) / 2, 5);
    // 세로는 딱 맞아 움직일 여지가 없다
    expect(clamped.offsetY).toBeCloseTo(0, 5);
  });
});
