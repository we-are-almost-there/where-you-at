import type { Course, RouteType } from "../types";
import { CourseCard } from "./CourseCard";

interface Props {
  courses: Course[];
  routeType: RouteType;
  onSelect?: (course: Course) => void;
}

export function CourseList({ courses, routeType, onSelect }: Props) {
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
        />
      ))}
    </div>
  );
}
