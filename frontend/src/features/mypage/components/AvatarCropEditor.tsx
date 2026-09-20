import { useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import {
  clampCropOffset,
  createCroppedAvatar,
  cropLayout,
  type CropOffset,
  type ImageDimensions,
} from "../avatarCrop";

const VIEWPORT = 176;

interface Props {
  file: File;
  onReselect: () => void;
  onConfirm: (file: File) => Promise<void>;
}

export default function AvatarCropEditor({ file, onReselect, onConfirm }: Props) {
  const zoomId = useId();
  const imageRef = useRef<HTMLImageElement>(null);
  const dragRef = useRef<{ pointerId: number; x: number; y: number; offset: CropOffset } | null>(null);
  const [sourceUrl, setSourceUrl] = useState("");
  const [dimensions, setDimensions] = useState<ImageDimensions | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState<CropOffset>({ x: 0, y: 0 });
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      if (active && typeof reader.result === "string") setSourceUrl(reader.result);
    });
    reader.addEventListener("error", () => {
      if (active) setError("사진을 불러오지 못했어요. 다른 사진으로 다시 시도해 주세요.");
    });
    reader.readAsDataURL(file);
    return () => {
      active = false;
      if (reader.readyState === FileReader.LOADING) reader.abort();
    };
  }, [file]);

  const layout = dimensions ? cropLayout(dimensions, VIEWPORT, zoom) : null;

  const move = (next: CropOffset) => {
    if (layout) setOffset(clampCropOffset(next, layout));
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!layout) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, offset };
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    move({ x: drag.offset.x + event.clientX - drag.x, y: drag.offset.y + event.clientY - drag.y });
  };

  const stopDragging = (event: PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
  };

  const handlePositionKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const amount = event.shiftKey ? 12 : 4;
    const delta = {
      ArrowLeft: { x: -amount, y: 0 },
      ArrowRight: { x: amount, y: 0 },
      ArrowUp: { x: 0, y: -amount },
      ArrowDown: { x: 0, y: amount },
    }[event.key];
    if (!delta) return;
    event.preventDefault();
    move({ x: offset.x + delta.x, y: offset.y + delta.y });
  };

  const apply = async () => {
    const image = imageRef.current;
    if (!image || !dimensions || processing) return;
    setProcessing(true);
    setError("");
    try {
      await onConfirm(await createCroppedAvatar(image, VIEWPORT, zoom, offset));
    } catch {
      setError("사진을 자르지 못했어요. 다른 사진으로 다시 시도해 주세요.");
      setProcessing(false);
    }
  };

  return (
    <section aria-label="프로필 사진 자르기" className="w-full">
      <p className="mb-3 text-center text-[13px] text-muted">사진을 움직여 사용할 영역을 맞춰 주세요.</p>
      <div
        tabIndex={0}
        aria-label="사진 위치 조절. 방향키로 이동"
        className="relative mx-auto cursor-grab touch-none overflow-hidden rounded-lg bg-surface-muted active:cursor-grabbing"
        style={{ width: VIEWPORT, height: VIEWPORT }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={stopDragging}
        onPointerCancel={stopDragging}
        onKeyDown={handlePositionKey}
      >
        {sourceUrl && (
          <img
            ref={imageRef}
            src={sourceUrl}
            alt="자를 프로필 사진"
            draggable={false}
            onLoad={(event) =>
              setDimensions({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })
            }
            onError={() => setError("사진을 불러오지 못했어요. 다른 사진으로 다시 시도해 주세요.")}
            className="pointer-events-none absolute left-1/2 top-1/2 max-w-none select-none"
            style={
              layout
                ? {
                    width: layout.width,
                    height: layout.height,
                    transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px))`,
                  }
                : undefined
            }
          />
        )}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-full border-2 border-white shadow-[0_0_0_999px_rgba(0,0,0,0.48)]"
        />
      </div>

      <div className="mx-auto mt-4 max-w-56">
        <label htmlFor={zoomId} className="flex justify-between text-[12px] text-caption">
          <span>확대</span>
          <span>{Math.round(zoom * 100)}%</span>
        </label>
        <input
          id={zoomId}
          type="range"
          min="1"
          max="3"
          step="0.01"
          value={zoom}
          onChange={(event) => {
            const nextZoom = Number(event.target.value);
            setZoom(nextZoom);
            if (dimensions) {
              setOffset((current) => clampCropOffset(current, cropLayout(dimensions, VIEWPORT, nextZoom)));
            }
          }}
          className="mt-1 w-full accent-accent"
        />
      </div>

      <p role="alert" className="mt-2 min-h-[1lh] text-center text-[12px] text-danger">
        {error}
      </p>
      <div className="mx-auto mt-2 grid w-full max-w-52 grid-cols-2 gap-2">
        <button
          type="button"
          onClick={onReselect}
          disabled={processing}
          className="h-9 cursor-pointer rounded-lg border border-control-border text-[13px] font-bold text-ink hover:bg-control-hover disabled:opacity-50"
        >
          다시 선택
        </button>
        <button
          type="button"
          onClick={apply}
          disabled={!dimensions || processing}
          aria-label="프로필 사진 자르기 적용"
          className="h-9 cursor-pointer rounded-lg bg-accent text-[13px] font-bold text-white hover:bg-accent-strong disabled:cursor-wait disabled:opacity-60"
        >
          {processing ? "적용 중…" : "적용"}
        </button>
      </div>
    </section>
  );
}
