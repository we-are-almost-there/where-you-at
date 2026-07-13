import type { Course, RouteType } from "../types";
import { RoutePreview } from "./RoutePreview";

function formatDuration(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h && m) return `약 ${h}시간 ${m}분`;
  if (h) return `약 ${h}시간`;
  return `약 ${m}분`;
}

interface Props {
  course: Course;
  routeType: RouteType;
  onSelect?: (course: Course) => void;
}

export function CourseCard({ course, routeType, onSelect }: Props) {
  const route =
    course.routes.find((r) => r.route_type === routeType) ?? course.routes[0];
  const points = routeType === "자전거" ? course.path_bicycle : course.path_trail;

  return (
    <article className="@container h-full">
      <button
        type="button"
        onClick={() => onSelect?.(course)}
        className="flex h-full w-full cursor-pointer flex-col overflow-hidden rounded-[14px] bg-white text-left shadow-[0px_3px_10px_0px_rgba(0,0,0,0.12)] transition-shadow hover:shadow-[0px_5px_16px_0px_rgba(0,0,0,0.16)]"
      >
        {/* 미리보기: 좌(경로) + 우(썸네일) */}
        <div className="flex h-[120px] shrink-0">
          <div className="relative w-1/2 overflow-hidden bg-mapbg">
            <RoutePreview points={points} />
          </div>
          <div className="flex w-1/2 items-center justify-center bg-lavender">
            {course.image_url ? (
              <img
                src={course.image_url}
                alt={course.title}
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="text-[26px]" aria-hidden="true">
                🏞️
              </span>
            )}
          </div>
        </div>

        {/* 본문 (flex-1로 카드 높이를 채워, 아래 구분선+footer를 mt-auto로 바닥 정렬) */}
        <div className="flex flex-1 flex-col p-4">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-bold text-ink text-[17px] @[280px]:text-[19px]">
              {course.title}
            </h3>
            <span className="shrink-0 text-[18px] leading-none text-caption">›</span>
          </div>
          <p className="mt-1.5 truncate text-[13px] text-caption">{course.start_address}</p>
          <p className="mt-1 font-bold text-figure text-[16px]">
            {route.distance.toFixed(1)}km
          </p>

          {/* 대표 관광지 칩 (최대 3개) */}
          {course.landmarks.length > 0 && (
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {course.landmarks.slice(0, 3).map((name) => (
                <li
                  key={name}
                  className="rounded-full bg-lavender px-2 py-0.5 text-[11px] font-medium text-accent"
                >
                  {name}
                </li>
              ))}
            </ul>
          )}

          {/* 구분선 + footer: 남는 공간을 위로 밀어 카드 바닥에 정렬 */}
          <div className="mt-auto">
            <hr className="my-3 border-t border-divider" />
            <div className="flex items-center justify-between gap-2">
              <span className="font-bold text-accent text-[14px]">{routeType}</span>
              <span className="truncate text-[14px] text-caption">
                {formatDuration(route.estimated_time)}
                {routeType === "도보" && ` · ${route.difficulty}`}
              </span>
            </div>
          </div>
        </div>
      </button>
    </article>
  );
}
