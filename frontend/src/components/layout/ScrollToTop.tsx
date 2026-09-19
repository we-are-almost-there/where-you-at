import { useEffect, useLayoutEffect, useRef } from "react";
import { useLocation, useNavigationType } from "react-router";
import { MAIN_CONTENT_ID } from "./mainContent";

/**
 * 링크로 다른 화면에 가면 맨 위에서 시작하게 한다.
 *
 * react-router의 ScrollRestoration은 쓰지 않는다. 키를 pathname으로 두면 한 번 가 본
 * 화면을 링크로 다시 열어도 예전 위치가 복원되고, 기본 키(location.key)로 두면 같은
 * 화면에서 필터나 페이지만 바꿔도(setSearchParams) 맨 위로 튀어 호출하는 곳마다
 * preventScrollReset을 붙여야 한다.
 *
 * - 경로가 바뀌면 맨 위로 간다.
 * - 경로가 그대로면 쿼리가 바뀌든 같든 건드리지 않는다. react-router는 같은 쿼리를 다시
 *   넣어도(현재 페이지 번호, 이미 고른 탭) 새 이동으로 기록하고, 현재 주소로 가는 Link도
 *   같은 REPLACE라 둘을 구분할 수 없다. 현재 주소를 다시 누르면 맨 위로 가야 하는 푸터
 *   링크는 Footer가 직접 올린다. 페이지를 넘길 때 맨 위로 보내는 건 각 화면이 맡는다.
 * - 뒤로/앞으로 가기(POP)는 브라우저의 기본 복원에 맡긴다. 그래서 돌아온 화면이 처음에
 *   더 짧게 그려지면(펼쳐 둔 푸터 출처가 다시 접힘, 목록을 다시 불러옴) 원래 위치로
 *   돌아가지 못할 수 있다.
 *
 * 초점도 함께 옮긴다. SPA는 화면이 바뀌어도 초점이 이전 화면의 링크 자리(이미 사라진 요소)에
 * 남아, 화면낭독기 사용자는 페이지가 바뀐 줄 모른다. 경로가 바뀌면(POP 포함) 새 화면의
 * 제목(h1), 없으면 본문(main)으로 초점을 옮기되, 스크롤은 preventScroll로 유지한다.
 * 쿼리만 바뀌는 필터·페이지 이동은 사용자가 조작하던 컨트롤에 초점이 있어야 하므로 건드리지 않는다.
 */
export default function ScrollToTop() {
  const { pathname } = useLocation();
  const navigationType = useNavigationType();
  const prevPathname = useRef(pathname);
  const prevFocusPathname = useRef(pathname);

  useLayoutEffect(() => {
    const changed = prevPathname.current !== pathname;
    prevPathname.current = pathname;
    if (!changed) return;
    if (navigationType !== "POP") window.scrollTo(0, 0);
  }, [pathname, navigationType]);

  // 드로어의 비활성화 해제와 포커스 복귀 정리가 끝난 뒤 새 화면에 초점을 둔다.
  useEffect(() => {
    const changed = prevFocusPathname.current !== pathname;
    prevFocusPathname.current = pathname;
    if (!changed) return;
    const page = document.getElementById(MAIN_CONTENT_ID);
    if (!page) return;
    // 제목이 숨겨져 있으면 포커스를 받을 수 없으므로 본문으로 이동한다.
    const heading = page.querySelector<HTMLElement>("h1");
    const target = heading?.getClientRects().length ? heading : page;
    if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
    target.classList.add("outline-none");
    target.focus({ preventScroll: true });
    // 제목에 포커스를 주지 못했으면 본문으로 이동한다.
    if (document.activeElement !== target) {
      page.focus({ preventScroll: true });
    }
  }, [pathname, navigationType]);

  return null;
}
