import { useEffect } from "react";
import type { Course, RouteType } from "../types";
import { formatDuration } from "../courseDuration";

interface Props {
  /** 한 마커에 포개진 코스들 — 순서는 지도가 넘겨준 그대로 둔다. */
  courses: Course[];
  index: number;
  routeType: RouteType;
  onIndexChange: (next: number) => void;
  onSelect: (course: Course) => void;
  onClose: () => void;
}

/**
 * 시작점이 포개진 마커를 눌렀을 때 그 자리의 코스를 하나씩 넘겨 보는 카드.
 * 지도를 확대해 마커를 억지로 갈라놓던 동작을 대신한다 — 들머리가 완전히 같은
 * 본코스 ↔ 우회로는 아무리 확대해도 갈라지지 않아 예전에는 답이 없었다.
 */
export function CourseGroupPicker({
  courses,
  index,
  routeType,
  onIndexChange,
  onSelect,
  onClose,
}: Props) {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  const course = courses[index];
  if (!course) return null;
  const route = course.routes.find((r) => r.route_type === routeType) ?? course.routes[0];
  const step = (delta: number) => onIndexChange((index + delta + courses.length) % courses.length);

  return (
    <div className="w-[clamp(19rem,28vw,23rem)] rounded-2xl bg-white shadow-[0_8px_28px_rgba(0,0,0,0.24)]">
      <div className="relative flex">
        <button
          type="button"
          onClick={() => onSelect(course)}
          className="flex min-w-0 flex-1 cursor-pointer items-stretch gap-3 rounded-2xl p-3 text-left transition-colors hover:bg-black/[0.03]"
        >
          <span className="grid size-24 shrink-0 place-items-center overflow-hidden rounded-xl bg-lavender">
            {course.image_url ? (
              <img
                src={course.image_url}
                alt=""
                className="size-full object-cover"
              />
            ) : (
              <span className="text-[26px]" aria-hidden="true">
                🏞️
              </span>
            )}
          </span>
          <span className="flex min-w-0 flex-1 flex-col justify-center gap-1">
            {/* 제목만 닫기 버튼 자리를 비운다 — 아래 줄까지 좁히면 메타가 줄바꿈된다. */}
            <span className="truncate pr-6 font-bold text-ink text-[17px]">{course.title}</span>
            <span className="truncate text-[13px] text-caption">{course.start_address}</span>
            {routeType === "도보" && (
              <span className="text-[13px] text-caption">{route.difficulty}</span>
            )}
            {/* 구분은 중간점 대신 세로선으로 — DifficultyFilter와 같은 방식 */}
            <span className="flex items-center gap-2 text-[13px] text-caption">
              <span className="shrink-0 font-bold text-figure">{route.distance.toFixed(1)}km</span>
              <span className="h-3 w-px shrink-0 bg-divider" aria-hidden="true" />
              <span className="truncate">{formatDuration(route.estimated_time)}</span>
            </span>
          </span>
        </button>

        <button
          type="button"
          onClick={onClose}
          aria-label="코스 선택 닫기"
          className="absolute right-2 top-2 grid size-7 place-items-center rounded-full text-caption transition-colors hover:bg-black/5 hover:text-ink"
        >
          <svg viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
            <path d="m5 5 10 10M15 5 5 15" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {/* 페이지 전환 — 넘길 때마다 지도의 경로선과 목록 카드 강조가 함께 따라온다. */}
      <div className="flex items-center justify-center gap-1 border-t border-divider py-1.5">
        <StepButton label="이전 코스" onClick={() => step(-1)} d="M12 4 7 10l5 6" />
        <span className="min-w-14 text-center text-[13px] font-medium text-ink" aria-live="polite">
          {index + 1} / {courses.length}
        </span>
        <StepButton label="다음 코스" onClick={() => step(1)} d="M8 4l5 6-5 6" />
      </div>
    </div>
  );
}

function StepButton({ label, onClick, d }: { label: string; onClick: () => void; d: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="grid size-7 place-items-center rounded-full text-caption transition-colors hover:bg-black/5 hover:text-ink"
    >
      <svg viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
        <path d={d} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}
