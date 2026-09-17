import { useEffect, useRef, type RefObject } from "react";

interface Options {
  /** 열릴 때 초점을 받을 요소. 보통 닫기 버튼이다. */
  initialFocusRef: RefObject<HTMLElement | null>;
  /** 대화상자 전체. 닫힐 때 초점이 아직 이 안(또는 문서 밖)에 있을 때만 원래 자리로 돌려준다. */
  containerRef: RefObject<HTMLElement | null>;
  /** Escape를 누르면 부른다. */
  onEscape: () => void;
  /**
   * 닫힌 뒤 초점을 돌려줄 요소를 닫는 시점에 고른다. 없거나 null이면 열릴 때 초점이 있던 요소로 돌려준다.
   * 연 요소가 대화상자와 함께 inert로 잠기는 화면은, 이펙트가 돌기 전에 초점이 풀려 버리므로 이걸 쓴다.
   */
  getReturnTarget?: () => HTMLElement | null | undefined;
}

/**
 * 대화상자(모달·비모달 공통)의 초점 규칙.
 * - 열리면 initialFocusRef로 초점을 옮긴다.
 * - Escape로 닫는다.
 * - 닫히면 연 요소(열릴 때 초점이 있던 곳)로 돌려준다. 단, 그 사이 사용자가 대화상자 밖의
 *   다른 곳(예: 지도 마커)으로 초점을 옮겼다면 그 자리를 빼앗지 않는다.
 *
 * 배경을 막는 일(inert)은 모달인지에 따라 다르므로 쓰는 쪽이 정한다.
 */
export function useDialogFocus({ initialFocusRef, containerRef, onEscape, getReturnTarget }: Options) {
  const onEscapeRef = useRef(onEscape);
  const getReturnTargetRef = useRef(getReturnTarget);
  useEffect(() => {
    onEscapeRef.current = onEscape;
    getReturnTargetRef.current = getReturnTarget;
  });

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const container = containerRef.current;
    initialFocusRef.current?.focus();

    return () => {
      const active = document.activeElement;
      const focusStillHere = !active || active === document.body || Boolean(container?.contains(active));
      if (!focusStillHere) return;
      const target = getReturnTargetRef.current?.() ?? opener;
      if (target?.isConnected) target.focus();
    };
  }, [initialFocusRef, containerRef]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault();
      onEscapeRef.current();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);
}
