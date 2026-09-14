import { describe, expect, it } from "vitest";
import {
  CANVAS_W,
  PADDING,
  ROUTE_BOX,
  clampPhotoOffset,
  clampRouteOffset,
  clampStatsOffset,
  draw,
  routeBoxAt,
  routeLayout,
  statsBoxAt,
  statsHitBox,
  statsLayout,
  type Template,
} from "./recordCardCanvas";
import type { TrackingRecord } from "./trackingRecord";
import type { RouteType } from "./types";

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

describe("statsHitBox", () => {
  // jsdom에는 캔버스가 없으므로 폭 측정만 흉내 낸다(글자당 0.5em).
  // 판정 폭을 실제 그림과 비교할 수 있게 그린 글자와 그때의 크기도 모은다.
  function measuringCtx() {
    const drawn: { text: string; x: number; size: number }[] = [];
    let font = "";
    const sizeOf = (value: string) => Number(/(\d+(?:\.\d+)?)px/.exec(value)?.[1] ?? 0);
    const ctx = {
      get font() {
        return font;
      },
      set font(next: string) {
        font = next;
      },
      measureText(text: string) {
        return { width: text.length * sizeOf(font) * 0.5 };
      },
      fillText(text: string, x: number) {
        drawn.push({ text, x, size: sizeOf(font) });
      },
      clearRect() {},
      fillRect() {},
    } as unknown as CanvasRenderingContext2D;
    return { ctx, drawn };
  }

  const fakeCtx = measuringCtx().ctx;

  /** draw()가 text를 그린 크기와 오른쪽 끝. */
  function drawnValue(
    record: TrackingRecord,
    routeType: RouteType,
    template: Template,
    textScale: number,
    text: string,
  ) {
    const { ctx, drawn } = measuringCtx();
    const canvas = { width: CANVAS_W, height: FEED_H, getContext: () => ctx } as unknown as HTMLCanvasElement;
    draw(canvas, {
      record,
      routeType,
      image: null,
      transform: { scale: 1, offsetX: 0, offsetY: 0 },
      routePoints: [],
      template,
      textColor: "white",
      fontChoice: "pretendard",
      textScale,
      showRoute: false,
      routeOffset: { x: 0, y: 0 },
      routeScale: 1,
      statsOffset: { x: 0, y: 0 },
    });
    const found = drawn.find((item) => item.text === text);
    if (!found) throw new Error(`그려지지 않은 값: ${text}`);
    return { size: found.size, right: found.x + text.length * found.size * 0.5 };
  }

  const record = { distanceKm: 9.73, durationMs: 3_688_000, paceSecPerKm: 379 };

  it("글자가 실제로 차지하는 폭만 잡는다", () => {
    const layout = statsBoxAt("top", FEED_H, 1, { x: 0, y: 0 });
    const hit = statsHitBox(fakeCtx, record, "도보", "top", FEED_H, 1, "pretendard", { x: 0, y: 0 });
    expect(hit.width).toBeLessThan(layout.width);
    // 마지막 열의 시작(2/3 지점)보다는 넓어야 세 번째 수치를 잡을 수 있다
    expect(hit.width).toBeGreaterThan(((CANVAS_W - PADDING * 2) / 3) * 2);
  });

  it("자리·높이는 레이아웃과 같다", () => {
    const layout = statsBoxAt("top", FEED_H, 1, { x: 0, y: 0 });
    const hit = statsHitBox(fakeCtx, record, "도보", "top", FEED_H, 1, "pretendard", { x: 0, y: 0 });
    expect(hit.left).toBe(layout.left);
    expect(hit.top).toBe(layout.top);
    expect(hit.height).toBe(layout.height);
  });

  it("레이아웃 폭을 넘지 않는다", () => {
    const long = { distanceKm: 1234.56, durationMs: 359_999_000, paceSecPerKm: 3599 };
    const hit = statsHitBox(fakeCtx, long, "도보", "top", FEED_H, 1.4, "blackhan", { x: 0, y: 0 });
    expect(hit.width).toBeLessThanOrEqual(CANVAS_W - PADDING * 2);
  });

  // 시간이 열 폭을 넘어 줄어 그려지는 기록. 판정도 줄어든 폭까지만 잡아야 오른쪽 빈 곳에서 사진이 끌린다.
  it.each(["top", "bottom"] as const)("%s 배치는 줄어 그려진 시간의 끝까지만 잡는다", (template) => {
    const long = { distanceKm: 0.51, durationMs: 14_403_000, paceSecPerKm: 28_241 };
    const time = drawnValue(long, "도보", template, 1.4, "4:00:03");
    const hit = statsHitBox(fakeCtx, long, "도보", template, FEED_H, 1.4, "pretendard", { x: 0, y: 0 });
    expect(time.size).toBeLessThan(statsLayout(template, FEED_H, 1.4).sub);
    expect(hit.left + hit.width).toBeCloseTo(time.right, 5);
  });

  // 페이스 문자열이 축소 크기를 정할 수 있어서 같은 기록도 종목에 따라 판정 폭이 갈린다.
  it.each(["도보", "자전거"] as const)("%s 페이스 표기에 맞춘 축소 크기로 잰다", (routeType) => {
    const slow = { distanceKm: 0.2, durationMs: 600_000, paceSecPerKm: 3000 };
    const time = drawnValue(slow, routeType, "top", 1.4, "10:00");
    const hit = statsHitBox(fakeCtx, slow, routeType, "top", FEED_H, 1.4, "pretendard", { x: 0, y: 0 });
    expect(hit.left + hit.width).toBeCloseTo(time.right, 5);
  });

  // 가운데 배치의 아래 두 열은 폭이 넓어 아주 긴 값에서만 줄어든다.
  it("center 배치는 아래 두 열의 축소 크기로 시간을 잰다", () => {
    const long = { distanceKm: 0.01, durationMs: 3_600_000_000, paceSecPerKm: null };
    const time = drawnValue(long, "도보", "center", 1.4, "1000:00:00");
    const hit = statsHitBox(fakeCtx, long, "도보", "center", FEED_H, 1.4, "pretendard", { x: 0, y: 0 });
    expect(time.size).toBeLessThan(statsLayout("center", FEED_H, 1.4).sub);
    expect(hit.left + hit.width).toBeCloseTo(time.right, 5);
  });

  describe("center 배치의 큰 거리", () => {
    // 거리가 가장 넓고, 페이스가 길어 아래 줄만 줄어드는 기록
    const wide = { distanceKm: 12_345.67, durationMs: 60_000, paceSecPerKm: 6_000_000 };

    it("아래 줄이 줄어도 거리는 원래 크기로 그린다", () => {
      const layout = statsLayout("center", FEED_H, 1.4);
      expect(drawnValue(wide, "도보", "center", 1.4, "1:00").size).toBeLessThan(layout.sub);
      expect(drawnValue(wide, "도보", "center", 1.4, "12345.67").size).toBe(layout.hero);
    });

    it("판정은 줄지 않은 거리 폭까지 잡는다", () => {
      const distance = drawnValue(wide, "도보", "center", 1.4, "12345.67");
      const hit = statsHitBox(fakeCtx, wide, "도보", "center", FEED_H, 1.4, "pretendard", { x: 0, y: 0 });
      expect(hit.left + hit.width).toBeCloseTo(distance.right, 5);
    });
  });
});

describe("종목별 페이스 표기", () => {
  // 캔버스가 없는 환경이라 그린 글자만 모아 확인한다.
  function drawnTexts(routeType: RouteType, template: Template = "top"): string[] {
    const texts: string[] = [];
    const ctx = {
      measureText: (text: string) => ({ width: text.length * 20 }),
      fillText: (text: string) => texts.push(text),
      clearRect: () => {},
      fillRect: () => {},
    } as unknown as CanvasRenderingContext2D;
    const canvas = {
      width: CANVAS_W,
      height: FEED_H,
      getContext: () => ctx,
    } as unknown as HTMLCanvasElement;

    expect(
      draw(canvas, {
        record: { distanceKm: 9.73, durationMs: 3_688_000, paceSecPerKm: 180 },
        routeType,
        image: null,
        transform: { scale: 1, offsetX: 0, offsetY: 0 },
        routePoints: [],
        template,
        textColor: "white",
        fontChoice: "pretendard",
        textScale: 1,
        showRoute: false,
        routeOffset: { x: 0, y: 0 },
        routeScale: 1,
        statsOffset: { x: 0, y: 0 },
      }),
    ).toBe(true);
    return texts;
  }

  it("도보는 분/km와 평균 페이스 캡션을 쓴다", () => {
    const texts = drawnTexts("도보");
    expect(texts).toContain("3'00\"");
    expect(texts).toContain("평균 페이스");
  });

  it("자전거는 km/h로 쓰고 단위를 캡션 자리에 둔다", () => {
    const texts = drawnTexts("자전거");
    expect(texts).toContain("20.0");
    expect(texts).toContain("km/h");
    expect(texts).not.toContain("평균 페이스");
  });

  // 거리를 크게 쓰는 center는 캡션을 따로 그리므로 두 경로를 모두 본다. 옆 칸 km/h와 대소문자를 맞춘다.
  it.each(["top", "center"] as const)("%s 배치의 거리 캡션은 km로 쓴다", (template) => {
    const texts = drawnTexts("자전거", template);
    expect(texts).toContain("km");
    expect(texts).not.toContain("Km");
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
