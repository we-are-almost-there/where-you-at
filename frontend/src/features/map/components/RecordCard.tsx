import { useCallback, useEffect, useRef, useState } from "react";
import { ImagePlus } from "lucide-react";
import type { TrackingRecord } from "../trackingRecord";
import type { LatLng, RouteType } from "../types";
import {
  CANVAS_W,
  FONTS,
  INITIAL_TRANSFORM,
  NO_OFFSET,
  RATIOS,
  ROUTE_BOX,
  clampPhotoOffset,
  clampRouteOffset,
  clampStatsOffset,
  draw,
  routeBoxAt,
  statsBoxAt,
  statsHitBox,
  type FontChoice,
  type Offset,
  type PhotoTransform,
  type Ratio,
  type Template,
  type TextColor,
} from "../recordCardCanvas";

// 한글 웹폰트는 유니코드 범위별로 100개 넘게 쪼개져 있어 정적으로 import하면
// 그 @font-face 규칙이 전부 메인 CSS에 실린다(34kB → 809kB). 카드를 열 때만 받아온다.
let cardFontsPromise: Promise<unknown> | null = null;
function loadCardFonts() {
  cardFontsPromise ??= Promise.all([
    import("@fontsource/do-hyeon"),
    import("@fontsource/black-han-sans"),
  ]);
  return cardFontsPromise;
}

/**
 * 카드용 글꼴을 실어 둔다. 실패해도 절대 던지지 않는다 —
 * 여기서 예외가 새면 그리기가 통째로 건너뛰어 빈 카드가 남는다(폴백 글꼴로라도 그려야 한다).
 * 실패한 프라미스를 캐시해 두면 다시 열어도 영영 복구되지 않으므로 캐시도 비운다.
 */
async function ensureCardFonts(family: string, weight: number) {
  try {
    await loadCardFonts();
    await document.fonts.load(`${weight} 100px ${family}`);
  } catch {
    cardFontsPromise = null;
  }
}

const TEMPLATES: { key: Template; label: string }[] = [
  { key: "top", label: "위" },
  { key: "center", label: "가운데" },
  { key: "bottom", label: "아래" },
];

// 크기는 모두 슬라이더로 통일한다(사진·글자·경로). 단계 칩과 섞이면 같은 "크기"인데
// 조작 방식이 달라 헷갈리고, 3단계로는 원하는 지점을 못 맞춘다.
//
// 범위는 "그 밖은 쓸모없거나 망가지는 값"을 기준으로 잡았다.
// - 사진: 1 미만이면 캔버스를 못 덮어 가장자리가 비고, 3배는 원본이 뭉개진다.
// - 글자: 값 길이·글꼴에 따라 안전 배율이 1.0~1.96으로 흔들려 고정 상한이 무의미하다.
//   대신 drawStatRow가 열 폭에 맞춰 자동으로 줄이므로 여기선 취향 범위만 넉넉히 준다.
// - 경로: 0.7 아래는 선이 뭉쳐 형태를 못 알아보고, 1.5 위는 카드 절반을 먹는다.
const PHOTO_SCALE = { min: 1, max: 2.5, step: 0.05 };
const TEXT_SCALE = { min: 0.85, max: 1.4, step: 0.05 };
const ROUTE_SCALE = { min: 0.7, max: 1.5, step: 0.05 };

// 조작은 한 번에 한 항목만 편다. 전부 펼쳐 두면 미리보기가 화면 밖으로 밀려
// 바꾼 결과를 보려고 매번 스크롤해야 한다.
type Tool = "photo" | "layout" | "font" | "route";

const TOOLS: { key: Tool; label: string }[] = [
  { key: "photo", label: "사진" },
  { key: "layout", label: "배치" },
  { key: "font", label: "글꼴" },
  { key: "route", label: "경로" },
];

// 내보낼 PNG를 만드는 데 1080x1920 기준 200ms 가까이 걸린다. 조작이 멎은 뒤에 한 번만 만든다.
const BLOB_DEBOUNCE_MS = 250;

/**
 * 포인터 캡처는 손가락이 요소 밖으로 나가도 이벤트를 계속 받기 위한 편의다.
 * 포인터가 이미 활성 목록에서 빠졌으면(취소·빠른 탭 등) NotFoundError를 던지는데,
 * 그건 끌기 동작의 성패와 무관하므로 삼킨다.
 */
function capturePointer(element: Element, pointerId: number) {
  try {
    element.setPointerCapture(pointerId);
  } catch {
    // 캡처 없이도 끌기는 동작한다.
  }
}

function releasePointer(element: Element, pointerId: number) {
  try {
    element.releasePointerCapture(pointerId);
  } catch {
    // 이미 풀렸거나 사라진 포인터. 정리 목적이라 무시해도 된다.
  }
}
// 다운로드가 시작될 여유를 준 뒤 blob URL을 놓아준다.
const REVOKE_DELAY_MS = 30_000;

export function RecordCard({
  record,
  routeType,
  routePoints,
  onClose,
}: {
  record: TrackingRecord;
  /** 따라간 종목. 페이스를 분/km로 쓸지 km/h로 쓸지 가른다. */
  routeType: RouteType;
  routePoints: LatLng[];
  onClose: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // 공유는 사용자 제스처 안에서 동기적으로 불러야 iOS에서 막히지 않는다.
  // 조작이 멎으면 미리 만들어 두고, 버튼에서는 그대로 넘긴다.
  const blobRef = useRef<Blob | null>(null);
  // 마지막으로 그린 내용이 아직 blob에 담기지 않았는지. 저장 시 낡은 이미지를 내보내지 않으려고 둔다.
  const dirtyRef = useRef(true);
  const blobTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragRef = useRef<{ x: number; y: number } | null>(null);
  const dragTargetRef = useRef<"photo" | "route" | "stats" | null>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [transform, setTransform] = useState<PhotoTransform>(INITIAL_TRANSFORM);
  const [template, setTemplate] = useState<Template>("top");
  const [textColor, setTextColor] = useState<TextColor>("white");
  const [fontChoice, setFontChoice] = useState<FontChoice>("pretendard");
  const [textScale, setTextScale] = useState(1);
  const [showRoute, setShowRoute] = useState(true);
  const [routeOffset, setRouteOffset] = useState<Offset>(NO_OFFSET);
  const [routeScale, setRouteScale] = useState(1);
  const [statsOffset, setStatsOffset] = useState<Offset>(NO_OFFSET);
  const [ratio, setRatio] = useState<Ratio>("feed");
  const [activeTool, setActiveTool] = useState<Tool>("photo");
  const [hasDragged, setHasDragged] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const hasRoute = routePoints.length >= 2;
  const canvasH = RATIOS.find((r) => r.key === ratio)?.height ?? RATIOS[0].height;
  const routeDraggable = showRoute && hasRoute;
  const routeSize = ROUTE_BOX * routeScale;
  // 실제로 끌 수 있는 것만 말한다 — 없는 대상을 안내하면 그걸 찾게 만든다.
  // 수치는 항상 있으므로 미리보기는 언제나 끌 수 있다.
  const draggableNames = [image && "사진", "수치", routeDraggable && "경로"].filter(Boolean);
  const dragHint = `${draggableNames.join("·")}를 끌어 원하는 자리에 놓아 보세요`;

  // PNG 인코딩은 무거워서 그리기와 분리한다. 조작이 멎은 뒤 한 번만 만든다.
  const scheduleBlob = useCallback(() => {
    if (blobTimerRef.current) clearTimeout(blobTimerRef.current);
    blobTimerRef.current = setTimeout(() => {
      canvasRef.current?.toBlob((blob) => {
        blobRef.current = blob;
        dirtyRef.current = false;
      }, "image/png");
    }, BLOB_DEBOUNCE_MS);
  }, []);

  useEffect(() => () => {
    if (blobTimerRef.current) clearTimeout(blobTimerRef.current);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const { family, weight } = FONTS.find((f) => f.key === fontChoice) ?? FONTS[0];

    // 캔버스는 아직 내려받지 않은 글꼴을 조용히 기본 글꼴로 대체해 버리므로 먼저 실어 둔다.
    ensureCardFonts(family, weight).then(() => {
      const canvas = canvasRef.current;
      if (cancelled || !canvas) return;
      // 그리다 실패하면 여기서 잡아야 한다. 안 잡으면 처리되지 않은 거부로 새어 나가고
      // 화면은 이전 그림 그대로라, 사용자는 조작이 왜 안 먹는지 알 수 없다.
      let drawn: boolean;
      try {
        drawn = draw(canvas, {
          record,
          routeType,
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
        });
      } catch {
        drawn = false;
      }
      if (!drawn) {
        setErrorMessage("카드를 그리지 못했어요. 화면을 캡처해 주세요.");
        return;
      }
      // 그린 내용이 아직 blob에 없다는 표시는 항상 남긴다(끄는 중이라 인코딩을 미뤄도 마찬가지).
      dirtyRef.current = true;
      // 끄는 중에는 인코딩을 미룬다 — 매 프레임 돌면 드래그가 끊긴다.
      if (!dragTargetRef.current) scheduleBlob();
    });

    return () => {
      cancelled = true;
    };
  }, [
    record,
    routeType,
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
    canvasH,
    scheduleBlob,
  ]);

  const pickPhoto = (file: File | undefined) => {
    if (!file) return;
    let url: string;
    try {
      url = URL.createObjectURL(file);
    } catch {
      setErrorMessage("이 사진은 열 수 없어요. 다른 사진을 골라 주세요.");
      return;
    }
    const next = new Image();
    // 로컬 파일이라 캔버스가 오염되지 않는다(외부 이미지와 달리 내보내기가 막히지 않음).
    next.onload = () => {
      setImage(next);
      setTransform(INITIAL_TRANSFORM); // 새 사진은 항상 기본 배치에서 시작
      setHasDragged(false); // 새 사진마다 이동 안내를 다시 보여 준다
      URL.revokeObjectURL(url);
    };
    // 브라우저가 못 읽는 형식(HEIC 등)이나 손상된 파일이면 onload가 끝내 오지 않는다.
    // 안내가 없으면 사용자는 사진 고르기가 왜 안 되는지 알 수 없고 URL도 남는다.
    next.onerror = () => {
      URL.revokeObjectURL(url);
      setErrorMessage("이 사진은 열 수 없어요. 다른 사진을 골라 주세요.");
    };
    next.src = url;
  };

  // 프리셋은 끌어 놓은 위치를 되돌리는 수단도 겸한다 — 누르면 기본 자리로 돌아간다.
  const applyTemplate = (next: Template) => {
    setTemplate(next);
    setStatsOffset(NO_OFFSET);
    setRouteOffset(NO_OFFSET);
  };

  // 비율이 바뀌면 세로 여유가 달라져 기존 이동값이 범위를 벗어난다. 저장값을 다시 맞춰 둔다.
  const changeRatio = (next: Ratio) => {
    setRatio(next);
    const height = RATIOS.find((r) => r.key === next)?.height ?? RATIOS[0].height;
    if (image) setTransform((prev) => clampPhotoOffset(image, prev, height));
    setStatsOffset((prev) => clampStatsOffset(prev, template, height, textScale));
    setRouteOffset((prev) => clampRouteOffset(prev, template, height, routeSize));
  };

  // 미리보기는 캔버스를 CSS로 줄여 보여주므로, 화면에서 끈 거리를 캔버스 좌표로 환산한다.
  const canvasScale = () => {
    const canvas = canvasRef.current;
    if (!canvas) return 1;
    return CANVAS_W / canvas.getBoundingClientRect().width;
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    // 사진·수치·경로가 같은 캔버스에 있으므로 누른 지점으로 무엇을 끌지 정한다.
    const rect = e.currentTarget.getBoundingClientRect();
    const scale = canvasScale();
    const x = (e.clientX - rect.left) * scale;
    const y = (e.clientY - rect.top) * scale;
    // 겹칠 수 있으므로 작은 대상부터 본다 — 경로가 수치 위에 있어도 집을 수 있게.
    const route = routeBoxAt(template, canvasH, routeOffset, routeSize);
    const onRoute =
      routeDraggable &&
      x >= route.left &&
      x <= route.left + route.size &&
      y >= route.top &&
      y <= route.top + route.size;

    // 글자가 실제로 차지하는 폭만 잡는다 — 레이아웃 폭 그대로면 빈 여백을 눌러도 수치가 끌린다.
    const ctx = e.currentTarget.getContext("2d");
    const stats = ctx
      ? statsHitBox(ctx, record, routeType, template, canvasH, textScale, fontChoice, statsOffset)
      : statsBoxAt(template, canvasH, textScale, statsOffset);
    const onStats =
      x >= stats.left &&
      x <= stats.left + stats.width &&
      y >= stats.top &&
      y <= stats.top + stats.height;

    if (!onRoute && !onStats && !image) return;
    dragTargetRef.current = onRoute ? "route" : onStats ? "stats" : "photo";
    dragRef.current = { x: e.clientX, y: e.clientY };
    // 캡처는 손가락이 캔버스를 벗어나도 이벤트를 계속 받으려는 편의일 뿐이다.
    // 포인터가 이미 사라졌으면 NotFoundError가 나는데, 그것 때문에 끌기가 통째로 막히면 안 된다.
    capturePointer(e.currentTarget, e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const start = dragRef.current;
    if (!start) return;
    const scale = canvasScale();
    const dx = (e.clientX - start.x) * scale;
    const dy = (e.clientY - start.y) * scale;
    dragRef.current = { x: e.clientX, y: e.clientY };
    setHasDragged(true);

    // 옮긴 값은 저장할 때 잘라 둔다. 화면에서만 자르면 경계 밖으로 끈 만큼
    // 반대로 되돌려야 다시 움직이는 헛도는 구간이 생긴다.
    if (dragTargetRef.current === "route") {
      setRouteOffset((prev) =>
        clampRouteOffset({ x: prev.x + dx, y: prev.y + dy }, template, canvasH, routeSize),
      );
      return;
    }
    if (dragTargetRef.current === "stats") {
      setStatsOffset((prev) =>
        clampStatsOffset({ x: prev.x + dx, y: prev.y + dy }, template, canvasH, textScale),
      );
      return;
    }
    if (!image) return;
    setTransform((prev) =>
      clampPhotoOffset(image, { ...prev, offsetX: prev.offsetX + dx, offsetY: prev.offsetY + dy }, canvasH),
    );
  };

  const endDrag = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const wasDragging = dragTargetRef.current != null;
    dragRef.current = null;
    dragTargetRef.current = null;
    releasePointer(e.currentTarget, e.pointerId);
    // 끄는 동안 미뤄 둔 인코딩을 여기서 한 번 돌린다.
    if (wasDragging) scheduleBlob();
  };

  const changeScale = (value: number) => {
    setTransform((prev) =>
      image ? clampPhotoOffset(image, { ...prev, scale: value }, canvasH) : { ...prev, scale: value },
    );
  };

  const save = useCallback(async () => {
    setErrorMessage(null);

    // 인코딩은 디바운스로 미뤄 두므로, 방금 바꾼 내용이 아직 blob에 안 담겼을 수 있다.
    // 미리 만들어 둔 게 낡았으면 여기서 즉시 굽는다 — 안 그러면 변경 전 이미지가 저장된다.
    let blob = dirtyRef.current ? null : blobRef.current;
    if (!blob) {
      const canvas = canvasRef.current;
      if (!canvas) return;
      blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
      if (!blob) {
        setErrorMessage("이미지를 만들지 못했어요. 화면을 캡처해 주세요.");
        return;
      }
      blobRef.current = blob;
      dirtyRef.current = false;
    }

    const file = new File([blob], "record.png", { type: "image/png" });

    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file] });
        return;
      } catch (e) {
        // 사용자가 공유 시트를 닫은 것뿐이면 조용히 끝낸다.
        if (e instanceof DOMException && e.name === "AbortError") return;
        // 그 밖의 실패(제스처 요건 등)는 아래 다운로드로 떨어진다.
      }
    }

    try {
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "record.png";
      // 일부 브라우저는 문서에 붙지 않은 링크의 클릭을 무시한다.
      document.body.appendChild(link);
      link.click();
      link.remove();
      // 클릭 직후 동기적으로 해제하면 다운로드가 시작되기 전에 URL이 죽을 수 있다.
      setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS);
    } catch {
      setErrorMessage("이미지를 저장하지 못했어요. 화면을 캡처해 주세요.");
    }
  }, []);

  // 화면 전체를 차지하는 모달이라 부모 박스(바텀시트 컨테이너)에 묶이지 않게 fixed로 띄우고,
  // 사이드바 드로어(z-50)까지 덮도록 그 위에 둔다.
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="기록 카드"
      className="fixed inset-0 z-[60] flex flex-col bg-black/85"
    >
      {/* 미리보기가 남는 높이를 전부 가져간다 — 조작 결과를 스크롤 없이 바로 확인하기 위해서 */}
      <div className="flex min-h-0 flex-1 items-center justify-center px-5 py-4">
        {/* 래퍼가 캔버스 크기에 딱 맞아야 안내 문구가 사진 위에 얹힌다(부모 기준이면 사진 밖으로 떨어진다) */}
        <div className="relative flex max-h-full">
          <canvas
            ref={canvasRef}
            width={CANVAS_W}
            height={canvasH}
            aria-label="완주 기록 이미지 미리보기"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            // max-w-full이 없으면 좁은 화면에서 고정폭이 화면을 넘쳐 카드가 잘린다
            className="max-h-full w-auto max-w-full cursor-move touch-none rounded-[14px]"
          />
          {/* 안내는 대상 위에 얹어야 무엇을 끌라는 말인지 바로 통한다. 한 번 끌면 사라진다. */}
          {!hasDragged && (
            <p className="pointer-events-none absolute inset-x-0 bottom-5 mx-auto w-fit rounded-full bg-black/65 px-4 py-2 text-[13px] font-bold text-white">
              {dragHint}
            </p>
          )}
        </div>
      </div>

      {errorMessage && (
        <p role="alert" className="px-5 pb-2 text-center text-[13px] text-white">
          {errorMessage}
        </p>
      )}

      {/* 선택한 항목의 조작부만 한 줄로 편다.
          가운데 정렬은 justify-center 대신 안쪽 래퍼의 mx-auto로 한다 —
          justify-center는 내용이 넘칠 때 시작 부분이 잘려 스크롤로도 닿지 않는다. */}
      <div className="flex min-h-[52px] shrink-0 items-center overflow-x-auto px-5 pb-3">
        {/* w-max + shrink-0: 래퍼가 눌리지 않고 내용 폭을 갖게 해 mx-auto 가운데 정렬이 실제로 먹는다 */}
        {/* items-end: 라벨이 위로 올라가도 조작들의 아랫선이 서로 맞게 */}
        <div className="mx-auto flex w-max shrink-0 items-end gap-1.5">
          {activeTool === "photo" && (
            <>
              {/* 사진을 넣는 게 첫 단계라 맨 앞에 둔다. 아이콘이라 글자 라벨보다 자리도 덜 먹는다. */}
              <label
                aria-label={image ? "사진 바꾸기" : "사진 고르기"}
                className="flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-[11px] border-2 border-white/40 bg-white text-ink"
              >
                <ImagePlus size={20} strokeWidth={2} aria-hidden />
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    pickPhoto(e.target.files?.[0]);
                    // 값을 비워야 같은 사진을 다시 골랐을 때도 change가 발생한다(배치 되돌리기 용도).
                    e.target.value = "";
                  }}
                />
              </label>
              <Divider />
              <Group label="비율">
                {/* 비율은 글자보다 모양이 빠르다 — 타일 안에 실제 비례의 사각형을 그린다 */}
                {RATIOS.map((item) => (
                  <Tile
                    key={item.key}
                    label={`${item.label} 비율`}
                    selected={ratio === item.key}
                    onClick={() => changeRatio(item.key)}
                  >
                    <span
                      aria-hidden
                      className="block rounded-[3px] border-2 border-ink"
                      style={{ width: 22 * (CANVAS_W / item.height), height: 22 }}
                    />
                  </Tile>
                ))}
              </Group>
              {image && (
                <>
                  <Divider />
                  <Group label="크기">
                    <SizeSlider
                      value={transform.scale}
                      onChange={changeScale}
                      label="사진 크기"
                      range={PHOTO_SCALE}
                    />
                  </Group>
                </>
              )}
            </>
          )}

          {activeTool === "layout" && (
            <>
              <Group label="자리">
                {TEMPLATES.map((item) => (
                  <Chip
                    key={item.key}
                    selected={template === item.key}
                    onClick={() => applyTemplate(item.key)}
                  >
                    {item.label}
                  </Chip>
                ))}
              </Group>
              <Divider />
              <Group label="크기">
                <SizeSlider
                  value={textScale}
                  onChange={setTextScale}
                  label="글자 크기"
                  range={TEXT_SCALE}
                />
              </Group>
            </>
          )}

          {activeTool === "font" && (
            <>
              <Group label="서체">
                {/* 이름을 늘어놓으면 줄이 넘쳐 스크롤이 생긴다. 타일에 '가'를 그 서체로 찍어
                    생김새를 그대로 보여 주고(이름은 aria-label로 남긴다) 폭을 3분의 1로 줄인다. */}
                {FONTS.map((item) => (
                  <Tile
                    key={item.key}
                    label={item.label}
                    selected={fontChoice === item.key}
                    onClick={() => setFontChoice(item.key)}
                    // 글꼴마다 잉크 크기·높이가 달라 타일 안에서 제각각으로 보인다. 재서 맞춘 값.
                    style={{
                      fontFamily: item.family,
                      fontWeight: item.weight,
                      fontSize: item.previewPx,
                    }}
                  >
                    {/* translateY는 레이아웃을 건드리지 않아 이동량이 정확하다(padding은 가운데정렬과 섞인다) */}
                    <span className="block" style={{ transform: `translateY(${item.previewNudgeY}px)` }}>
                      가
                    </span>
                  </Tile>
                ))}
              </Group>
              <Divider />
              {/* 색은 글자 두 개보다 색 자체를 보여 주는 편이 빠르고 자리도 덜 먹는다 */}
              <Group label="색">
                <Swatch
                  color="#ffffff"
                  label="흰색 글씨"
                  selected={textColor === "white"}
                  onClick={() => setTextColor("white")}
                />
                <Swatch
                  color="#111111"
                  label="검정 글씨"
                  selected={textColor === "black"}
                  onClick={() => setTextColor("black")}
                />
              </Group>
            </>
          )}

          {activeTool === "route" &&
            (hasRoute ? (
              <>
                <Group label="표시">
                  <Chip selected={showRoute} onClick={() => setShowRoute(true)}>
                    켜기
                  </Chip>
                  <Chip selected={!showRoute} onClick={() => setShowRoute(false)}>
                    끄기
                  </Chip>
                </Group>
                {showRoute && (
                  <>
                    <Divider />
                    <Group label="크기">
                      <SizeSlider
                        value={routeScale}
                        onChange={setRouteScale}
                        label="경로 크기"
                        range={ROUTE_SCALE}
                      />
                    </Group>
                  </>
                )}
              </>
            ) : (
              <span className="text-[12px] text-white/70">이 코스는 경로 좌표가 없어요</span>
            ))}
        </div>
      </div>

      {/* 항목 선택 툴바 — 좌우 여백은 미리보기·하단 버튼과 같은 px-5로 맞춘다.
          첫 탭의 왼쪽과 마지막 탭의 오른쪽이 카드·버튼의 세로선과 어긋나면 눈에 띈다. */}
      <div className="flex shrink-0 gap-1 border-t border-white/15 px-5 pt-2">
        {TOOLS.map((tool) => (
          <button
            key={tool.key}
            type="button"
            onClick={() => setActiveTool(tool.key)}
            aria-pressed={activeTool === tool.key}
            className={`flex-1 cursor-pointer rounded-[10px] py-2 text-[13px] font-bold ${
              activeTool === tool.key ? "bg-white/20 text-white" : "text-white/60"
            }`}
          >
            {tool.label}
          </button>
        ))}
      </div>

      <div
        className="flex shrink-0 gap-3 px-5 pt-4"
        style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}
      >
        <button
          type="button"
          onClick={onClose}
          className="h-14 flex-1 cursor-pointer rounded-[14px] bg-white/15 text-[15px] font-bold text-white"
        >
          닫기
        </button>
        <button
          type="button"
          onClick={save}
          className="h-14 flex-[2] cursor-pointer rounded-[14px] bg-accent text-[15px] font-bold text-lavender"
        >
          이미지 저장
        </button>
      </div>
    </div>
  );
}

/** 한 줄 안에서 성격이 다른 조작을 갈라 준다. */
function Divider() {
  return <span aria-hidden className="h-10 w-px shrink-0 self-end bg-white/25" />;
}

/**
 * 조작 위에 무엇을 바꾸는지 붙여 준다.
 * 라벨을 왼쪽이 아니라 위에 두면 어느 조작에 걸리는 말인지 더 분명하고,
 * 가로 폭도 라벨만큼 덜 먹어 한 줄에 들어갈 여유가 생긴다.
 */
function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex shrink-0 flex-col items-center gap-1">
      <span className="text-[11px] font-bold text-white/55">{label}</span>
      <div className="flex items-center gap-1.5">{children}</div>
    </div>
  );
}

/**
 * 크기 조절 슬라이더.
 * 타일과 같은 높이(h-10) 상자에 세로 가운데로 넣는다 — 그래야 위에 붙는 소제목이
 * 옆 그룹(비율 등)의 소제목과 같은 줄에 서고, 슬라이더도 타일 중앙에 맞는다.
 */
function SizeSlider({
  value,
  onChange,
  label,
  range,
}: {
  value: number;
  onChange: (next: number) => void;
  label: string;
  range: { min: number; max: number; step: number };
}) {
  return (
    <span className="flex h-10 shrink-0 items-center">
      <input
        type="range"
        min={range.min}
        max={range.max}
        step={range.step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={label}
        className="w-24 accent-accent"
      />
    </span>
  );
}

/** 색·서체처럼 "글자보다 생김새를 보여 주는 게 빠른" 선택지를 담는 정사각 타일. */
function Tile({
  label,
  selected,
  onClick,
  style,
  children,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
  style?: React.CSSProperties;
  children?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={selected}
      style={style}
      className={`flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-[11px] border-2 bg-white text-[19px] leading-none text-ink ${
        selected ? "border-accent" : "border-white/40"
      }`}
    >
      {children}
    </button>
  );
}

function Swatch({
  color,
  label,
  selected,
  onClick,
}: {
  color: string;
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <Tile label={label} selected={selected} onClick={onClick} style={{ backgroundColor: color }} />
  );
}

function Chip({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      // 타일·슬라이더와 같은 40px — 높이가 다르면 위에 붙는 소제목의 줄이 어긋난다
      className={`h-10 shrink-0 cursor-pointer rounded-full px-3.5 text-[13px] font-bold ${
        selected ? "bg-accent text-lavender" : "bg-white text-ink"
      }`}
    >
      {children}
    </button>
  );
}
