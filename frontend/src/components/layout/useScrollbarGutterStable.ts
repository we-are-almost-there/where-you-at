import { useEffect } from "react";

/**
 * 이 페이지가 떠 있는 동안만 <html>에 scrollbar-gutter: stable을 켠다.
 *
 * 문서 스크롤을 쓰는 페이지는 내용 길이에 따라 스크롤바가 생겼다 사라지고, 그때마다
 * 뷰포트 폭이 스크롤바 폭만큼 달라져 가운데 정렬된 본문이 좌우로 흔들린다. 고객지원
 * 하위 문서는 길이가 제각각이라(약관은 길고 목록은 짧다) 페이지를 오갈 때 이 흔들림이
 * 그대로 드러난다.
 *
 * index.css의 html에 상시로 걸지 않는 이유는 코스 탐색·코스 상세처럼 문서 스크롤이
 * 아예 없는 페이지에서는 쓰지도 않는 빈 띠만 남기 때문이다.
 *
 * Race.tsx, Support.tsx, BicycleExplore.tsx가 같은 처리를 각자 useEffect로 갖고 있다.
 * 고객지원 작업 범위 밖이라 이번에는 건드리지 않았고, 정리할 때 이 훅으로 모으면 된다.
 */
export function useScrollbarGutterStable() {
  useEffect(() => {
    document.documentElement.classList.add("scrollbar-gutter-stable");
    return () => document.documentElement.classList.remove("scrollbar-gutter-stable");
  }, []);
}
