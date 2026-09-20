import { useEffect, useState } from "react";
import { seedSavedKeys, type SavedCourse } from "../saved";
import { toUserError, type UserError } from "../../components/error/userError";
import { fetchSavedCourses } from "./mypageData";

export type SavedCoursesState =
  | { status: "loading" }
  | { status: "error"; error: UserError; retry: () => void }
  | { status: "ready"; courses: SavedCourse[] };

/** 찜한 코스를 불러온다. 마이페이지 첫 화면과 찜한 코스 전체 보기가 같이 쓴다. */
export function useSavedCourses(): SavedCoursesState {
  const [courses, setCourses] = useState<SavedCourse[] | null>(null);
  const [error, setError] = useState<UserError | null>(null);
  const [retryTick, setRetryTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetchSavedCourses().then(
      (result) => {
        if (!cancelled) {
          seedSavedKeys(result.map((item) => ({ courseId: item.course.id, routeType: item.routeType })));
          setCourses(result);
        }
      },
      (err: unknown) => {
        if (!cancelled) setError(toUserError(err, "찜한 코스를 불러오지 못했어요"));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [retryTick]);

  if (error) {
    return {
      status: "error",
      error,
      retry: () => {
        setError(null);
        setCourses(null);
        setRetryTick((tick) => tick + 1);
      },
    };
  }
  return courses ? { status: "ready", courses } : { status: "loading" };
}
