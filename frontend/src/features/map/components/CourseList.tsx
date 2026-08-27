import type { Course, RouteType } from "../types";
import { CourseCard } from "./CourseCard";

interface Props {
  courses: Course[];
  routeType: RouteType;
  onSelect?: (course: Course) => void;
  /** hover/포커스된 코스 id (벗어나면 null) — 지도 강조용. */
  onHover?: (id: number | null) => void;
  /** 지도에서 짚고 있는 코스 id들 — 카드 쪽을 되짚어 준다. 시작점이 포개진 마커면 2개 이상이다. */
  activeIds?: number[];
}

export function CourseList({ courses, routeType, onSelect, onHover, activeIds }: Props) {
  if (courses.length === 0) {
    return (
      <p className="py-16 text-center text-[14px] text-caption">
        조건에 맞는 코스가 없어요.
      </p>
    );
  }

  return (
    // auto-fit으로 폭에 따라 1→2→3열로 자동 증가, max-width로 4열 이상 확장 방지
    <div className="grid max-w-[960px] gap-4 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]">
      {courses.map((course) => (
        <CourseCard
          key={course.id}
          course={course}
          routeType={routeType}
          onSelect={onSelect}
          onHoverChange={(hovered) => onHover?.(hovered ? course.id : null)}
          active={activeIds?.includes(course.id) ?? false}
        />
      ))}
    </div>
  );
}
