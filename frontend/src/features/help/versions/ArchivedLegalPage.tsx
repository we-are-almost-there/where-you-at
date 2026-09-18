import type { ReactNode } from "react";
import { Link } from "react-router";
import DocumentPage from "../../../components/layout/DocumentPage";

interface Props {
  title: string;
  /** 적용 기간. 예: "2026년 9월 17일 ~ 2026년 9월 18일" */
  period: string;
  /** 현재 문서 주소 */
  currentPath: string;
  children: ReactNode;
}

/** 이전 버전 약관·방침 페이지. 본문 위에 적용 기간과 현재 문서로 가는 링크를 둔다. */
export default function ArchivedLegalPage({ title, period, currentPath, children }: Props) {
  return (
    <DocumentPage title={`이전 ${title}`} documentTitle={`이전 ${title} (${period})`} back={{ to: currentPath, label: `현재 ${title}` }}>
      <p className="mt-6 rounded-[10px] bg-surface-muted px-4 py-3 text-[14px] leading-relaxed text-ink md:mt-8">
        이 문서는 <strong>{period}</strong>에 적용된 이전 {title}입니다.{" "}
        <Link to={currentPath} className="text-accent underline underline-offset-4">
          현재 {title} 보기
        </Link>
      </p>
      <div className="mt-6">{children}</div>
    </DocumentPage>
  );
}
