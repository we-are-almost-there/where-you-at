import type { Course, RouteType } from "../types";
import { formatDuration } from "../courseDuration";
import { RoutePreview } from "./RoutePreview";
import { SaveHeartButton } from "../../saved";

interface Props {
  course: Course;
  routeType: RouteType;
  onSelect?: (course: Course) => void;
  /** 카드에 마우스가 올라오거나 키보드 포커스가 잡힐 때 — 지도에서 해당 코스를 강조하는 데 쓴다. */
  onHoverChange?: (hovered: boolean) => void;
  /** 지도 마커 쪽에서 이 코스를 가리키고 있을 때 — 카드에 테두리를 둘러 되짚어 준다. */
  active?: boolean;
}

export function CourseCard({ course, routeType, onSelect, onHoverChange, active }: Props) {
  const route =
    course.routes.find((r) => r.route_type === routeType) ?? course.routes[0];
  const points = routeType === "자전거" ? course.path_bicycle : course.path_trail;
  // RoutePreview가 그릴 수 있는 최소 좌표 수(<2면 null). 이미지·경로 둘 다 없을 때 fallback 판단에 씀.
  const hasRoute = points.length >= 2;

  return (
    // 강조는 ring이 아니라 outline으로 준다. ring은 box-shadow 위에 합성되는데 이 카드는
    // shadow-[...] 임의값을 쓰고 있어 ring 레이어가 최종 box-shadow에 반영되지 않는다.
    // 하트는 카드 버튼 안에 넣을 수 없어(버튼 안의 버튼) 형제로 두고 썸네일 우상단에 얹는다.
    // 그래서 이 article에 relative가 필요하다.
    <article className="@container relative h-full" data-course-id={course.id}>
      <button
        type="button"
        onClick={() => onSelect?.(course)}
        onMouseEnter={() => onHoverChange?.(true)}
        onMouseLeave={() => onHoverChange?.(false)}
        onFocus={() => onHoverChange?.(true)}
        onBlur={() => onHoverChange?.(false)}
        className={`flex h-full w-full cursor-pointer flex-col overflow-hidden rounded-[14px] bg-white text-left shadow-[0px_3px_10px_0px_rgba(0,0,0,0.12)] transition-shadow hover:shadow-[0px_5px_16px_0px_rgba(0,0,0,0.16)] ${
          active ? "outline outline-2 outline-accent" : ""
        }`}
      >
        {/* 미리보기: 경로와 대표 사진이 모두 있으면 반씩 표시하고, 하나만 있으면 전체 폭.
            둘 다 없으면 🏞️ fallback을 유지한다. */}
        <div className="relative flex h-[120px] shrink-0">
          {course.is_population_drop_zone && (
            <span className="absolute left-2 top-2 z-10 rounded-md bg-white px-2 py-1.5 text-[11px] font-semibold leading-none text-accent shadow-[0px_1px_4px_0px_rgba(0,0,0,0.18)]">
              방문 혜택 지역
            </span>
          )}
          {(hasRoute || !course.image_url) && (
            <div
              className={`relative flex items-center justify-center overflow-hidden bg-mapbg ${
                course.image_url ? "w-1/2" : "w-full"
              }`}
            >
              {hasRoute ? (
                // 뱃지(하단 31px) + 시작점 원 반지름(6px) + 여유를 두고 경로를 아래로 민다.
                <RoutePreview points={points} padTop={course.is_population_drop_zone ? 42 : undefined} />
              ) : (
                <span className="text-[26px]" aria-hidden="true">
                  🏞️
                </span>
              )}
            </div>
          )}
          {course.image_url && (
            <div
              className={`flex items-center justify-center bg-lavender ${
                hasRoute ? "w-1/2" : "w-full"
              }`}
            >
              <img
                src={course.image_url}
                alt=""
                className="h-full w-full object-cover"
              />
            </div>
          )}
        </div>

        {/* 본문 (flex-1로 카드 높이를 채워, 아래 구분선+footer를 mt-auto로 바닥 정렬) */}
        <div className="flex flex-1 flex-col p-4">
          <div className="flex items-start justify-between gap-2">
            {/* 목록 화면에는 h1(코스 목록)과 카드 사이에 다른 제목이 없어 h2로 둔다. */}
            <h2 className="font-bold text-ink text-[17px] @[280px]:text-[19px]">
              {course.title}
            </h2>
            <span aria-hidden="true" className="shrink-0 text-[18px] leading-none text-caption">
              ›
            </span>
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
                  className="rounded-full bg-lavender px-2 py-0.5 text-[11px] font-medium text-accent-strong"
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

      {/* 왼쪽 위 방문 혜택 뱃지와 겹치지 않게 오른쪽 위에 둔다. 어떤 썸네일 위에서도 또렷하도록 흰 판을 깐다. */}
      <SaveHeartButton
        courseId={course.id}
        courseTitle={course.title}
        routeType={routeType}
        className="absolute right-2 top-2 z-10 size-9 rounded-full bg-white/90 shadow-[0px_1px_4px_0px_rgba(0,0,0,0.18)] hover:bg-white"
      />
    </article>
  );
}
