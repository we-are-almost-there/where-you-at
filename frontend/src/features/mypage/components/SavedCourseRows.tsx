import { Link } from "react-router";
import type { Course } from "../../map/types";

/**
 * 찜한 코스 게시판형 목록. 마이페이지 첫 화면에서 최근 몇 개만 보여 줄 때 쓴다.
 * 공지 목록처럼 한 줄에 하나씩, 이름 아래에 종목·출발지·거리를 둔다. 전체는 코스 카드로 본다.
 */
export default function SavedCourseRows({ courses }: { courses: Course[] }) {
  return (
    <ul className="flex flex-col">
      {courses.map((course) => {
        const route = course.routes[0];
        return (
          <li key={course.id} className="border-b border-divider last:border-b-0">
            <Link
              to={`/courses/${course.id}${route?.route_type === "자전거" ? "?type=bicycle" : ""}`}
              className="flex items-center gap-3 py-3 hover:bg-surface-hover"
            >
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="truncate text-[15px] font-medium text-ink">{course.title}</span>
                <span className="flex min-w-0 items-center gap-1.5 text-[12px] text-caption">
                  {route && (
                    <span className="shrink-0 rounded-full bg-lavender px-1.5 py-px text-[11px] font-bold text-accent-strong">
                      {route.route_type}
                    </span>
                  )}
                  <span className="truncate">{course.start_address}</span>
                  {route && <span className="shrink-0 font-bold text-figure">· {route.distance.toFixed(1)}km</span>}
                </span>
              </span>
              <span aria-hidden="true" className="shrink-0 text-[18px] leading-none text-caption">
                ›
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
