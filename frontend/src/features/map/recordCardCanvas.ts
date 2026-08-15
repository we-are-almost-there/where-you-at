import { formatDistance, formatDuration, formatPace, type TrackingRecord } from "./trackingRecord";
import type { LatLng } from "./types";

export type Template = "top" | "center" | "bottom";
export type TextColor = "white" | "black";
export type FontChoice = "pretendard" | "dohyeon" | "blackhan";
export type Ratio = "feed" | "story";

/** 화면 크기와 무관하게 이 해상도로 그려 내보낸다. 가로는 고정, 세로만 비율에 따라 바뀐다. */
export const CANVAS_W = 1080;
export const PADDING = 84;

export const RATIOS: { key: Ratio; label: string; height: number }[] = [
  { key: "feed", label: "4:5", height: 1350 },
  { key: "story", label: "9:16", height: 1920 },
];

/** 경로 썸네일 상자의 기준 크기(배율 1). */
export const ROUTE_BOX = 210;

/** 3열 사이 최소 간격. 값이 열 폭을 꽉 채우면 옆 칸과 붙어 보인다. */
const COLUMN_GAP = 24;

/**
 * 카드에 쓰는 글꼴.
 *
 * previewPx·previewNudgeY는 글꼴 고르는 타일에 '가'를 찍을 때만 쓴다.
 * 같은 font-size라도 글자가 실제로 차지하는 잉크는 글꼴마다 달라서
 * (19px에서 Pretendard 18px, Do Hyeon 15px, Black Han Sans 14px)
 * 그대로 두면 타일마다 글자 크기와 높이가 제각각으로 보인다.
 * 잉크 높이를 16px로 맞추는 font-size와, 잉크 중심을 타일 중심에 놓는 보정값을 재서 넣었다.
 */
export const FONTS: {
  key: FontChoice;
  label: string;
  family: string;
  weight: number;
  previewPx: number;
  previewNudgeY: number;
}[] = [
  {
    key: "pretendard",
    label: "Pretendard",
    family: '"Pretendard Variable", Pretendard, sans-serif',
    weight: 800,
    previewPx: 17,
    previewNudgeY: 0,
  },
  {
    key: "dohyeon",
    label: "Do Hyeon",
    family: '"Do Hyeon", sans-serif',
    weight: 400,
    previewPx: 20,
    previewNudgeY: 1,
  },
  {
    key: "blackhan",
    label: "Black Han Sans",
    family: '"Black Han Sans", sans-serif',
    weight: 400,
    previewPx: 22,
    previewNudgeY: 2.5,
  },
];

// 수치 블록의 글자 크기(배율 1 기준). 한 곳에서 고쳐야 그리기와 끌기 판정이 어긋나지 않는다.
const HERO_VALUE = 134; // 가운데 배치의 거리
const HERO_SUB_VALUE = 68; // 그 아래 페이스·시간
const HERO_GAP = 130; // 거리와 아래 줄 사이
const ROW_VALUE = 72; // 위·아래 배치의 3열
// 값 아래 캡션까지 포함한 한 줄의 높이 배수(캡션 0.42 + 줄간격).
const LINE_HEIGHT_RATIO = 1.63;

/** 사진 확대·이동 상태. scale은 "화면을 꽉 채우는 배율"의 배수라 1이 기본. */
export interface PhotoTransform {
  scale: number;
  offsetX: number;
  offsetY: number;
}

export interface Offset {
  x: number;
  y: number;
}

export const INITIAL_TRANSFORM: PhotoTransform = { scale: 1, offsetX: 0, offsetY: 0 };
export const NO_OFFSET: Offset = { x: 0, y: 0 };

interface Stat {
  value: string;
  caption: string;
}

/** 카드에 찍히는 세 수치. 그리기와 끌기 판정이 같은 문자열을 봐야 폭이 어긋나지 않는다. */
function statValues(record: TrackingRecord): Stat[] {
  return [
    { value: formatDistance(record.distanceKm), caption: "Km" },
    { value: formatPace(record.paceSecPerKm), caption: "평균 페이스" },
    { value: formatDuration(record.durationMs), caption: "시간" },
  ];
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** 사진이 캔버스를 항상 덮도록 이동 범위를 제한한다(가장자리에 빈 곳이 생기지 않게). */
export function clampPhotoOffset(
  image: { width: number; height: number },
  transform: PhotoTransform,
  canvasH: number,
): PhotoTransform {
  const base = Math.max(CANVAS_W / image.width, canvasH / image.height) * transform.scale;
  const limitX = Math.max(0, (image.width * base - CANVAS_W) / 2);
  const limitY = Math.max(0, (image.height * base - canvasH) / 2);
  return {
    scale: transform.scale,
    offsetX: clamp(transform.offsetX, -limitX, limitX),
    offsetY: clamp(transform.offsetY, -limitY, limitY),
  };
}

/** 배치·글자 크기에 따라 달라지는 수치 블록의 크기. */
function statsMetrics(template: Template, textScale: number) {
  if (template === "center") {
    const hero = HERO_VALUE * textScale;
    const sub = HERO_SUB_VALUE * textScale;
    return { hero, sub, height: hero + HERO_GAP + sub * LINE_HEIGHT_RATIO };
  }
  const value = ROW_VALUE * textScale;
  return { hero: 0, sub: value, height: value * LINE_HEIGHT_RATIO };
}

/** 끌기 전 기본 자리. 배치 프리셋이 정한다. */
export function statsLayout(template: Template, canvasH: number, textScale: number) {
  const metrics = statsMetrics(template, textScale);
  const width = CANVAS_W - PADDING * 2;
  const defaultTop =
    template === "top"
      ? PADDING
      : template === "center"
        ? canvasH / 2 - metrics.hero
        : canvasH - PADDING - metrics.height;
  return { defaultLeft: PADDING, defaultTop, width, ...metrics };
}

export function routeLayout(template: Template, canvasH: number, size: number) {
  return {
    defaultLeft: CANVAS_W - PADDING - size,
    defaultTop: template === "bottom" ? PADDING : canvasH - PADDING - size,
  };
}

/**
 * 상자가 캔버스 안에 머무는 오프셋 범위로 자른다.
 *
 * 그리는 시점이 아니라 "저장하는 시점"에 잘라야 한다. 저장값을 무한히 키우면
 * 경계 밖으로 끈 만큼 반대로 되돌려야 다시 움직이는 헛도는 구간이 생긴다.
 */
function clampOffsetWithin(
  offset: Offset,
  defaultLeft: number,
  defaultTop: number,
  width: number,
  height: number,
  canvasH: number,
): Offset {
  return {
    x: clamp(offset.x, -defaultLeft, CANVAS_W - width - defaultLeft),
    y: clamp(offset.y, -defaultTop, canvasH - height - defaultTop),
  };
}

export function clampStatsOffset(
  offset: Offset,
  template: Template,
  canvasH: number,
  textScale: number,
): Offset {
  const { defaultLeft, defaultTop, width, height } = statsLayout(template, canvasH, textScale);
  return clampOffsetWithin(offset, defaultLeft, defaultTop, width, height, canvasH);
}

export function clampRouteOffset(
  offset: Offset,
  template: Template,
  canvasH: number,
  size: number,
): Offset {
  const { defaultLeft, defaultTop } = routeLayout(template, canvasH, size);
  return clampOffsetWithin(offset, defaultLeft, defaultTop, size, size, canvasH);
}

/** 수치 블록의 좌상단 좌표와 크기. */
export function statsBoxAt(
  template: Template,
  canvasH: number,
  textScale: number,
  offset: Offset,
) {
  const layout = statsLayout(template, canvasH, textScale);
  // 글자 크기·비율이 바뀌면 저장된 오프셋이 범위를 벗어날 수 있어 여기서도 한 번 더 자른다.
  const safe = clampStatsOffset(offset, template, canvasH, textScale);
  return { ...layout, left: layout.defaultLeft + safe.x, top: layout.defaultTop + safe.y };
}

/**
 * 끌기 판정에 쓸 수치 블록의 실제 글자 범위.
 *
 * 레이아웃 폭은 항상 콘텐츠 전체 폭(912px)이라 글자가 없는 빈 곳까지 수치로 잡힌다.
 * 그러면 사진을 옮기려고 여백을 눌러도 수치가 딸려 움직인다. 실제로 그려질 글자 폭을 재서
 * 그만큼만 잡히게 한다. 측정에는 그리기와 같은 글꼴·크기를 써야 어긋나지 않는다.
 */
export function statsHitBox(
  ctx: CanvasRenderingContext2D,
  record: TrackingRecord,
  template: Template,
  canvasH: number,
  textScale: number,
  fontChoice: FontChoice,
  offset: Offset,
) {
  const box = statsBoxAt(template, canvasH, textScale, offset);
  const { family, weight } = FONTS.find((f) => f.key === fontChoice) ?? FONTS[0];
  const values = statValues(record);

  let width: number;
  if (template === "center") {
    ctx.font = `${weight} ${box.hero}px ${family}`;
    const heroWidth = ctx.measureText(values[0].value).width;
    // 아래 두 열은 열 간격만큼 벌어져 있으므로 두 번째 열의 오른쪽 끝이 전체 폭이 된다.
    const columnWidth = (CANVAS_W - PADDING * 2) / 2;
    ctx.font = `${weight} ${box.sub}px ${family}`;
    const rowWidth = columnWidth + ctx.measureText(values[2].value).width;
    width = Math.max(heroWidth, rowWidth);
  } else {
    const columnWidth = (CANVAS_W - PADDING * 2) / 3;
    ctx.font = `${weight} ${box.sub}px ${family}`;
    width = columnWidth * 2 + ctx.measureText(values[2].value).width;
  }
  return { ...box, width: Math.min(box.width, width) };
}

/** 경로 썸네일의 좌상단 좌표와 크기. */
export function routeBoxAt(template: Template, canvasH: number, offset: Offset, size: number) {
  const { defaultLeft, defaultTop } = routeLayout(template, canvasH, size);
  const safe = clampRouteOffset(offset, template, canvasH, size);
  return { left: defaultLeft + safe.x, top: defaultTop + safe.y, size };
}

function drawPhoto(
  ctx: CanvasRenderingContext2D,
  image: CanvasImageSource & { width: number; height: number },
  transform: PhotoTransform,
  canvasH: number,
) {
  const scale = Math.max(CANVAS_W / image.width, canvasH / image.height) * transform.scale;
  const width = image.width * scale;
  const height = image.height * scale;
  ctx.drawImage(
    image,
    (CANVAS_W - width) / 2 + transform.offsetX,
    (canvasH - height) / 2 + transform.offsetY,
    width,
    height,
  );
}

/**
 * 코스 좌표를 선으로 그린 썸네일.
 * 경도 1도는 위도가 올라갈수록 짧아지므로 cos 보정을 해야 경로가 옆으로 눌리지 않는다.
 */
function drawRoute(
  ctx: CanvasRenderingContext2D,
  points: LatLng[],
  left: number,
  top: number,
  size: number,
  color: string,
) {
  if (points.length < 2) return;

  const cosLat = Math.cos(((points[0].lat + points[points.length - 1].lat) / 2) * (Math.PI / 180));
  const xs = points.map((p) => p.lng * cosLat);
  const ys = points.map((p) => p.lat);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const spanX = maxX - minX;
  const spanY = maxY - minY;
  if (spanX === 0 && spanY === 0) return;

  const inner = size - 24; // 선 굵기가 잘리지 않도록 여백
  const scale = Math.min(inner / (spanX || spanY), inner / (spanY || spanX));
  const drawnW = spanX * scale;
  const drawnH = spanY * scale;
  const originX = left + (size - drawnW) / 2;
  const originY = top + (size - drawnH) / 2;

  ctx.save();
  ctx.beginPath();
  points.forEach((point, index) => {
    const x = originX + (point.lng * cosLat - minX) * scale;
    // 위도는 위로 갈수록 커지는데 캔버스 y는 아래로 커지므로 뒤집는다.
    const y = originY + drawnH - (point.lat - minY) * scale;
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = color;
  // 상자 크기에 비례 — 고정 두께면 작게 줄일 때 선이 뭉치고 키울 때 실처럼 얇아진다.
  ctx.lineWidth = Math.max(4, size / 30);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.stroke();
  ctx.restore();
}

/** 수치 3열. */
function drawStatRow(
  ctx: CanvasRenderingContext2D,
  stats: Stat[],
  left: number,
  top: number,
  font: string,
  weight: number,
  color: string,
  valueSize: number,
) {
  const columnWidth = (CANVAS_W - PADDING * 2) / stats.length;

  // 값의 길이는 기록에 따라 달라진다("42:10" vs "10:24:31"). 열 폭을 넘으면 옆 칸을 침범하므로
  // 넘치는 만큼만 줄여 그린다 — 슬라이더는 희망 크기이고, 최종 크기는 여기서 안전하게 잘린다.
  ctx.font = `${weight} ${valueSize}px ${font}`;
  const widest = Math.max(...stats.map((stat) => ctx.measureText(stat.value).width));
  const room = columnWidth - COLUMN_GAP;
  const size = widest > room ? Math.floor(valueSize * (room / widest)) : valueSize;
  const captionSize = Math.round(size * 0.42);

  stats.forEach((stat, index) => {
    const x = left + columnWidth * index;
    ctx.fillStyle = color;
    ctx.font = `${weight} ${size}px ${font}`;
    ctx.fillText(stat.value, x, top + size);
    // 캡션은 항상 Pretendard — Black Han Sans처럼 굵기가 하나뿐인 글꼴에서
    // 캡션까지 같이 굵어지면 수치와 위계가 사라진다.
    ctx.font = `500 ${captionSize}px ${FONTS[0].family}`;
    ctx.globalAlpha = 0.75;
    ctx.fillText(stat.caption, x, top + size + captionSize * 1.5);
    ctx.globalAlpha = 1;
  });
}

export interface DrawOptions {
  record: TrackingRecord;
  image: (CanvasImageSource & { width: number; height: number }) | null;
  transform: PhotoTransform;
  routePoints: LatLng[];
  template: Template;
  textColor: TextColor;
  fontChoice: FontChoice;
  textScale: number;
  showRoute: boolean;
  routeOffset: Offset;
  routeScale: number;
  statsOffset: Offset;
}

export function draw(canvas: HTMLCanvasElement, options: DrawOptions) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const {
    record,
    image,
    transform,
    routePoints,
    template,
    textColor,
    fontChoice,
    textScale,
    showRoute,
    routeOffset,
    routeScale,
    statsOffset,
  } = options;
  const canvasH = canvas.height; // 비율에 따라 1350(피드) 또는 1920(스토리)

  ctx.clearRect(0, 0, CANVAS_W, canvasH);
  if (image) {
    drawPhoto(ctx, image, transform, canvasH);
  } else {
    ctx.fillStyle = "#2f2f33";
    ctx.fillRect(0, 0, CANVAS_W, canvasH);
  }

  const { family, weight } = FONTS.find((f) => f.key === fontChoice) ?? FONTS[0];
  const color = textColor === "white" ? "#ffffff" : "#111111";
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  // 밝은 사진 위의 흰 글씨, 어두운 사진 위의 검은 글씨가 모두 읽히도록 반대 색 그림자를 깐다.
  ctx.shadowColor = textColor === "white" ? "rgba(0,0,0,0.45)" : "rgba(255,255,255,0.55)";
  ctx.shadowBlur = 18;

  const stats = statValues(record);
  const statsBox = statsBoxAt(template, canvasH, textScale, statsOffset);
  if (template === "center") {
    // 가운데 배치는 거리를 크게 쓰는 구성 — 아래 두 수치와의 비는 2배 남짓으로 유지해
    // 거리는 주인공이되 페이스·시간도 읽히게 한다.
    ctx.fillStyle = color;
    ctx.font = `${weight} ${statsBox.hero}px ${family}`;
    ctx.fillText(formatDistance(record.distanceKm), statsBox.left, statsBox.top + statsBox.hero);
    ctx.font = `500 ${Math.round(statsBox.hero * 0.26)}px ${FONTS[0].family}`;
    ctx.globalAlpha = 0.75;
    ctx.fillText("Km", statsBox.left, statsBox.top + statsBox.hero + Math.round(statsBox.hero * 0.38));
    ctx.globalAlpha = 1;
    drawStatRow(
      ctx,
      stats.slice(1),
      statsBox.left,
      statsBox.top + statsBox.hero + HERO_GAP,
      family,
      weight,
      color,
      statsBox.sub,
    );
  } else {
    drawStatRow(ctx, stats, statsBox.left, statsBox.top, family, weight, color, statsBox.sub);
  }

  if (showRoute) {
    const routeBox = routeBoxAt(template, canvasH, routeOffset, ROUTE_BOX * routeScale);
    drawRoute(ctx, routePoints, routeBox.left, routeBox.top, routeBox.size, color);
  }

  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
}
