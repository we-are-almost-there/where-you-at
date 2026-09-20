import type { ReactNode } from "react";
import { Link } from "react-router";
import { ChevronRight } from "lucide-react";

interface Props {
  id: string;
  title: string;
  /** 제목 옆 개수. 예: "12" */
  count?: string;
  /** 전체 보기 링크. 내용이 없으면 넘기지 않는다(빈 목록으로 가는 링크는 쓸모가 없다). */
  moreTo?: string;
  /** 오른쪽에 링크 대신 둘 버튼 등. */
  action?: ReactNode;
}

/** 마이페이지 각 영역(찜한 코스·내 기록·지역 스탬프)의 제목 줄. */
export default function SectionHeader({ id, title, count, moreTo, action }: Props) {
  return (
    <div className="flex min-h-9 items-center justify-between gap-3">
      <h2 id={id} className="text-[17px] font-bold text-ink md:text-[18px]">
        {title}
        {count && <span className="ml-1.5 text-[15px] font-bold text-accent">{count}</span>}
      </h2>
      {moreTo ? (
        <Link
          to={moreTo}
          // 같은 "전체 보기"가 여러 개라 화면낭독기에는 무엇의 전체인지 함께 읽힌다.
          aria-label={`${title} 전체 보기`}
          className="flex shrink-0 items-center text-[13px] text-caption transition-colors hover:text-ink"
        >
          전체 보기
          <ChevronRight size={16} aria-hidden="true" />
        </Link>
      ) : (
        action
      )}
    </div>
  );
}
