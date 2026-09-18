import type { ReactNode } from "react";
import { Link, useLocation } from "react-router";
import AppHeader from "../../../components/layout/AppHeader";
import Footer from "../../../components/layout/Footer";
import { MAIN_CONTENT_ID } from "../../../components/layout/mainContent";
import { useScrollbarGutterStable } from "../../../components/layout/useScrollbarGutterStable";
import { useDocumentTitle } from "../../../lib/useDocumentTitle";
import { useAuth, useKakaoLogin, type User } from "../../auth";
import ProfileAvatar from "./ProfileAvatar";
import { PRIMARY_BUTTON } from "../buttonStyles";

interface Props {
  title: string;
  /** 제목 위의 뒤로가기 링크. 전체 보기 화면에서 마이페이지로 돌아갈 길을 준다. */
  back?: { to: string; label: string };
  /** 로그인하지 않았을 때 대신 보여 줄 내용. 없으면 로그인 안내. 탈퇴 완료 안내 같은 경우에 넘긴다. */
  signedOutContent?: ReactNode;
  children: (user: User) => ReactNode;
}

/**
 * 마이페이지와 그 전체 보기 화면(찜한 코스·내 기록)의 페이지 틀.
 * 폭·여백·제목 규격은 대회 행사(Race)와 같다: max-w-6xl, 위아래 16px, 제목 20px, 제목 아래 12px.
 * 고객지원 문서 페이지(DocumentPage)처럼 위를 넓게 띄우지 않는다. 그쪽은 긴 글을 읽는 화면이고, 마이페이지는
 * 여러 칸을 둘러보는 서비스 화면이라 다른 서비스 화면과 제목 위치를 맞춘다.
 * 뒤로가기 링크는 위 여백이 좁아 그 안에 띄울 수 없어 제목 위 흐름에 둔다. 그래서 전체 보기 화면만 제목이 링크 높이만큼 내려간다.
 * 로그인 상태를 확인해 로그인한 경우에만 children을 그린다.
 */
export default function MyPageLayout({ title, back, signedOutContent, children }: Props) {
  useScrollbarGutterStable();
  useDocumentTitle(title === "마이페이지" ? title : `${title} - 마이페이지`);
  const auth = useAuth();

  return (
    <div className="flex min-h-dvh flex-col bg-white">
      <AppHeader />
      <main id={MAIN_CONTENT_ID} tabIndex={-1} className="mx-auto w-full max-w-6xl flex-1 px-4 pt-4 pb-4 outline-none">
        {back && (
          <Link
            to={back.to}
            className="mb-1 block w-fit whitespace-nowrap text-[13px] text-caption transition-colors hover:text-ink"
          >
            <span aria-hidden="true">←</span> {back.label}
          </Link>
        )}
        <h1 className="mb-3 text-[20px] font-bold text-ink">{title}</h1>
        {auth.status === "loading" ? (
          <p role="status" className="py-16 text-center text-[14px] text-caption">
            로그인 정보를 확인하고 있어요…
          </p>
        ) : auth.status === "signedIn" ? (
          children(auth.user)
        ) : (
          (signedOutContent ?? <SignedOutNotice />)
        )}
      </main>
      <Footer />
    </div>
  );
}

function SignedOutNotice() {
  const location = useLocation();
  // 처음 로그인하는 기기에서는 만 14세 이상인지 먼저 묻는다(features/auth/useKakaoLogin).
  const { login, dialog } = useKakaoLogin();
  return (
    <>
      <Notice
        title="로그인이 필요해요"
        description={"로그인하면 찜한 코스와 완주 기록,\n지역 스탬프를 한곳에서 모아 볼 수 있어요."}
        action={
          <button
            type="button"
            // 전체 보기 화면에서 로그인해도 보던 화면(탭·페이지 포함)으로 돌아오게 한다.
            onClick={() => login(location.pathname + location.search)}
            className={`mt-6 ${PRIMARY_BUTTON}`}
          >
            카카오로 로그인
          </button>
        }
      />
      {dialog}
    </>
  );
}

export function Notice({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return (
    <section className="mx-auto mt-6 flex max-w-md flex-col items-center rounded-[14px] bg-surface-muted px-6 py-12 text-center">
      <ProfileAvatar />
      <h2 className="mt-5 text-[18px] font-bold text-ink">{title}</h2>
      <p className="mt-2 whitespace-pre-line text-[14px] leading-6 text-muted">{description}</p>
      {action}
    </section>
  );
}
