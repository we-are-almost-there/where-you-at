import type { ReactNode } from "react";
import { Link } from "react-router";
import AppHeader from "./AppHeader";
import Footer from "./Footer";
import { useScrollbarGutterStable } from "./useScrollbarGutterStable";

interface Props {
  /** 페이지 제목. h1으로 그린다. */
  title: string;
  /** 제목 위의 뒤로가기 링크. 고객지원 하위 페이지에서 한 단계 위로 돌아갈 길을 준다. 없으면 그리지 않는다. */
  back?: { to: string; label: string };
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
 * 공통 푸터(components/layout/Footer.tsx)는 이 셸이 렌더하므로 고객지원과 하위 문서
 * 페이지가 모두 같은 푸터를 갖는다. min-h-dvh + flex-col과 main의 flex-1이 그 자리를
 * 만든다 — Footer는 mt-auto를 갖고 있어서 내용이 짧은 페이지에서도 화면 바닥에 붙는다.
 */
export default function DocumentPage({ title, back, children }: Props) {
  useScrollbarGutterStable();

  return (
    <div className="flex min-h-dvh flex-col bg-white">
      <AppHeader />

      {/* 본문 폭은 720px로, 헤더가 기준으로 삼는 max-w-6xl(72rem)보다 좁게 둔다.
        헤더와 좌우 끝을 맞추는 다른 페이지와 달리 여기는 긴 글을 읽는 페이지라 한 줄이
        72rem까지 늘어나면 눈이 다음 줄 첫머리를 놓친다. */}
      <main className="mx-auto w-full max-w-[720px] flex-1 px-4 py-10 md:py-16">
        {/* 제목의 크기와 위치는 고객지원 첫 화면과 하위 화면이 똑같다. 화면을 오갈 때 제목이
          움직이거나 커졌다 작아지지 않게 하려는 것이다.
          그래서 뒤로가기 링크는 제목을 밀어내지 않도록 제목 위 여백(py-10, 넓은 화면 py-16) 안에 띄운다.
          링크 높이(약 20px)와 간격(mb-2)을 합해도 가장 좁은 여백(40px) 안에 들어간다.

          제목 아래 내용까지의 간격은 각 화면이 정한다.
          - 고객지원 첫 화면: 목록 mt-8 md:mt-10 + 줄 여백 py-4 md:py-5 (원래 형식)
          - 하위 화면: 제목 아래 첫 내용 글자까지 24px(넓은 화면 32px). 링크 목록(공지 목록)은 줄 여백 12px이
            더해지므로 mt-3 md:mt-5, 자체 여백이 없는 내용(FAQ 카테고리, 공지 상세)은 mt-6 md:mt-8
          로딩·빈 상태·에러는 가운데에 띄우는 별도 여백을 쓴다. */}
        <div className="relative">
          {back && (
            // 방문 혜택 상세(SupportDetail)의 "← 목록으로"와 같은 모양으로 맞춘다.
            // 화살표는 스크린 리더가 "왼쪽 화살표"로 읽지 않게 숨기고 라벨만 읽힌다.
            <Link
              to={back.to}
              className="absolute bottom-full left-0 mb-2 whitespace-nowrap text-[13px] text-caption transition-colors hover:text-ink"
            >
              <span aria-hidden="true">←</span> {back.label}
            </Link>
          )}
          <h1 className="font-bold text-ink text-[20px] md:text-[26px]">{title}</h1>
        </div>
        {children}
      </main>

      <Footer />
    </div>
  );
}
