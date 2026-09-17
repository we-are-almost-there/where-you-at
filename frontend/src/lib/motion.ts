import { useEffect, useState } from "react";

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

/** 운영체제·브라우저의 "동작 줄이기" 설정이 켜져 있는지. matchMedia가 없는 환경(일부 테스트)에서는 false. */
export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia(REDUCED_MOTION_QUERY).matches
    : false;
}

/**
 * JS로 스크롤할 때 쓸 behavior. CSS의 scroll-behavior 덮어쓰기는 scrollTo({ behavior: "smooth" })처럼
 * 코드에서 직접 지정한 값에는 적용되지 않아서, 호출하는 쪽에서 이 값을 넘긴다.
 */
export function smoothScrollBehavior(): ScrollBehavior {
  return prefersReducedMotion() ? "auto" : "smooth";
}

/** 설정이 바뀌면(사용 중에 켜고 끄면) 다시 그리도록 구독한다. */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(prefersReducedMotion);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const query = window.matchMedia(REDUCED_MOTION_QUERY);
    const sync = () => setReduced(query.matches);
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  return reduced;
}
