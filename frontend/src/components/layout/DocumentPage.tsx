import type { ReactNode } from "react";
import AppHeader from "./AppHeader";
import { useScrollbarGutterStable } from "./useScrollbarGutterStable";

interface Props {
  /** 페이지 제목. h1으로 그린다. */
  title: string;
  children?: ReactNode;
}

/**
 * 고객지원과 그 하위 문서 페이지(공지사항·자주 묻는 질문·이용약관·개인정보처리방침·1:1 문의)가
 * 공유하는 페이지 셸.
 *
 * 스크롤을 내부 컨테이너가 아니라 문서에 맡기는 게 핵심이다. 이전 구조는 루트가
 * `h-dvh overflow-hidden`이고 그 안의 div가 `overflow-y-auto`였는데, AppHeader는 그
 * 스크롤 컨테이너 바깥에 있어 뷰포트 폭을 전부 쓰는 반면 본문은 스크롤바 폭(약 15px)만큼
 * 좁아졌다. 폭이 다른 두 요소라 눈에 띄지는 않았지만, 헤더와 같은 max-w-6xl을 쓰는 공통
 * 푸터를 붙이면 좌우 끝이 그만큼 어긋난다. Race·Support와 같은 문서 스크롤로 바꾸면
 * 헤더와 본문이 같은 폭을 기준으로 계산돼 어긋남이 사라진다.
 *
 * 공통 푸터(components/layout/Footer.tsx)는 여기서 렌더하지 않는다. 고객지원 상세가
 * 다 채워진 뒤 푸터 담당이 직접 붙이기로 했다. min-h-dvh + flex-col과 main의 flex-1을
 * 남겨 둔 것은 그때를 위한 자리다 — Footer는 mt-auto를 갖고 있어서 이 구조 안에 넣으면
 * 내용이 짧은 페이지에서도 화면 바닥에 붙는다.
 */
export default function DocumentPage({ title, children }: Props) {
  useScrollbarGutterStable();

  return (
    <div className="flex min-h-dvh flex-col bg-white">
      <AppHeader variant="wide" />

      {/* 본문 폭은 720px로, 헤더가 기준으로 삼는 max-w-6xl(72rem)보다 좁게 둔다.
        헤더와 좌우 끝을 맞추는 다른 페이지와 달리 여기는 긴 글을 읽는 페이지라 한 줄이
        72rem까지 늘어나면 눈이 다음 줄 첫머리를 놓친다. */}
      <main className="mx-auto w-full max-w-[720px] flex-1 px-4 py-10 md:py-16">
        <h1 className="font-bold text-ink text-[20px] md:text-[26px]">{title}</h1>
        {children}
      </main>
    </div>
  );
}
