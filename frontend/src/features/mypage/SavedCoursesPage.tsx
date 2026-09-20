import { useLayoutEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { Heart } from "lucide-react";
import { StatusMessage } from "../../components/common/a11y";
import { CourseCard } from "../map/components/CourseCard";
import { Pagination } from "../map/components/Pagination";
import MyPageLayout from "./components/MyPageLayout";
import EmptyState from "./components/EmptyState";
import { paginate, usePageParam } from "./usePageParam";
import { useSavedCourses } from "./useSavedCourses";

// 코스 탐색 목록(3열)에 맞춰 3의 배수로 둔다.
const PER_PAGE = 12;

/** 찜한 코스 전체 보기. 코스 탐색과 같은 코스 카드를 페이지로 나눠 보여 준다. */
export default function SavedCoursesPage() {
  return (
    <MyPageLayout title="찜한 코스" back={{ to: "/mypage", label: "마이페이지" }}>
      {() => <SavedCourses />}
    </MyPageLayout>
  );
}

function SavedCourses() {
  const saved = useSavedCourses();
  const [page, goToPage] = usePageParam();
  const navigate = useNavigate();
  const [removedKeys, setRemovedKeys] = useState<ReadonlySet<string>>(() => new Set());
  const [status, setStatus] = useState("");
  const pendingFocusKey = useRef<string | "heading" | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const heartRefs = useRef(new Map<string, HTMLButtonElement>());

  useLayoutEffect(() => {
    const key = pendingFocusKey.current;
    if (key === null) return;
    const target = key === "heading" ? headingRef.current : heartRefs.current.get(key);
    target?.focus();
    pendingFocusKey.current = null;
  });

  if (saved.status === "loading") {
    return (
      <p role="status" className="py-16 text-center text-[14px] text-caption">
        찜한 코스를 불러오는 중…
      </p>
    );
  }
  if (saved.status === "error") {
    return (
      <div className="py-16 text-center">
        <p className="text-[14px] text-ink">{saved.error.title}</p>
        <button type="button" onClick={saved.retry} className="mt-2 cursor-pointer text-[14px] font-bold text-accent hover:opacity-70">
          다시 시도
        </button>
      </div>
    );
  }
  const visibleCourses = saved.courses.filter(({ course, routeType }) => !removedKeys.has(`${course.id}:${routeType}`));
  const { current, totalPages, items } = paginate(visibleCourses, page, PER_PAGE);
  return (
    <>
      <h2 ref={headingRef} tabIndex={-1} className="sr-only">
        찜한 코스 목록
      </h2>
      <StatusMessage message={status} />
      {visibleCourses.length === 0 ? (
        <EmptyState
          icon={<Heart size={26} strokeWidth={1.75} />}
          title="아직 찜한 코스가 없어요"
          description={"마음에 드는 코스에서 하트를 눌러 두면\n여기서 바로 찾아볼 수 있어요."}
          action={{ to: "/courses", label: "코스 둘러보기" }}
        />
      ) : (
        <>
          <p className="text-[14px] text-caption">모두 {visibleCourses.length}개</p>
          {/* 코스 탐색 목록(CourseList)과 같은 격자. 넓은 화면에서도 카드 폭이 지나치게 늘지 않게 4열까지만 둔다. */}
          <ul className="mt-4 grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(220px,1fr))]">
            {/* 찜은 종목 단위라 찜할 때 고른 종목으로 카드를 그린다. 같은 코스를 도보·자전거로 찜했으면 두 장이다. */}
            {items.map(({ course, routeType }) => {
              const key = `${course.id}:${routeType}`;
              return (
                <li key={key}>
                  <CourseCard
                    course={course}
                    routeType={routeType}
                    onSelect={() => navigate(`/courses/${course.id}${routeType === "자전거" ? "?type=bicycle" : ""}`)}
                    saveButtonRef={(button) => {
                      if (button) heartRefs.current.set(key, button);
                      else heartRefs.current.delete(key);
                    }}
                    onSavedChange={(isSaved) => {
                      if (isSaved) return;
                      const index = visibleCourses.findIndex(
                        (item) => item.course.id === course.id && item.routeType === routeType,
                      );
                      const focusCourse = visibleCourses[index + 1] ?? visibleCourses[index - 1];
                      setStatus(`${course.title} 찜을 해제했어요`);
                      pendingFocusKey.current = focusCourse
                        ? `${focusCourse.course.id}:${focusCourse.routeType}`
                        : "heading";
                      setRemovedKeys((currentKeys) => new Set(currentKeys).add(key));
                    }}
                  />
                </li>
              );
            })}
          </ul>
          <Pagination page={current} totalPages={totalPages} onChange={goToPage} />
        </>
      )}
    </>
  );
}
