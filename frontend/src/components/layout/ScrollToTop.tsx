import { useLayoutEffect, useRef } from "react";
import { useLocation, useNavigationType } from "react-router";

/**
 * 링크로 다른 화면에 가거나 지금 보는 주소를 다시 누르면 맨 위에서 시작하게 한다.
 *
 * react-router의 ScrollRestoration은 쓰지 않는다. 키를 pathname으로 두면 한 번 가 본
 * 화면을 링크로 다시 열어도 예전 위치가 복원되고, 기본 키(location.key)로 두면 같은
 * 화면에서 필터나 페이지만 바꿔도(setSearchParams) 맨 위로 튀어 호출하는 곳마다
 * preventScrollReset을 붙여야 한다.
 *
 * - 경로가 바뀌면 맨 위로 간다.
 * - 경로와 쿼리가 그대로인데 새로 이동했으면(자기 자신 링크) 맨 위로 간다.
 * - 쿼리만 바뀌면 그대로 둔다. 페이지를 넘길 때 맨 위로 보내는 건 각 화면이 맡는다.
 * - 뒤로/앞으로 가기(POP)는 브라우저의 기본 복원에 맡긴다.
 */
export default function ScrollToTop() {
  const location = useLocation();
  const navigationType = useNavigationType();
  const prev = useRef(location);

  useLayoutEffect(() => {
    const before = prev.current;
    prev.current = location;
    if (navigationType === "POP" || before.key === location.key) return;
    if (before.pathname !== location.pathname || before.search === location.search) {
      window.scrollTo(0, 0);
    }
  }, [location, navigationType]);

  return null;
}
