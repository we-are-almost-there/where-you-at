import { MapPinOff } from "lucide-react";
import { Link } from "react-router";
import AppHeader from "../../components/layout/AppHeader";
import { MAIN_CONTENT_ID } from "../../components/layout/mainContent";
import { useDocumentTitle } from "../../lib/useDocumentTitle";

export default function NotFoundPage() {
  useDocumentTitle("페이지를 찾을 수 없음");
  return (
    <div className="flex min-h-dvh flex-col bg-white">
      <AppHeader />

      <main id={MAIN_CONTENT_ID} tabIndex={-1} className="flex flex-1 flex-col outline-none items-center justify-center px-4 py-12 text-center">
        <div className="flex size-16 items-center justify-center rounded-full bg-lavender">
          <MapPinOff className="size-8 text-accent" aria-hidden="true" />
        </div>
        <p className="mt-5 text-[13px] font-bold tracking-[0.16em] text-accent">404</p>
        <h1 className="mt-2 font-bold text-ink text-[20px] md:text-[26px]">
          페이지를 찾을 수 없어요
        </h1>
        <p className="mt-3 max-w-[360px] break-keep text-[14px] leading-relaxed text-caption">
          주소가 잘못되었거나 페이지가 이동 또는 삭제되었어요.
          <br />
          홈에서 원하는 정보를 다시 찾아보세요.
        </p>
        <Link
          to="/"
          className="mt-8 flex h-12 w-full max-w-[320px] items-center justify-center rounded-xl bg-accent text-[15px] font-bold text-white transition-colors hover:bg-accent/90"
        >
          홈으로 가기
        </Link>
      </main>
    </div>
  );
}
