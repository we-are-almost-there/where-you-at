import type { UserError } from "../../../components/error/userError";

type Props = {
  error: UserError;
  className?: string;
};

/**
 * 지원금 탭의 에러 표시. 지도·지역 목록·제도 상세가 함께 쓴다.
 *
 * 아이콘·버튼은 두지 않는다. 지도는 바다 배경 위, 목록·상세는 좁은 우측 패널 안이라
 * 코스 탐색의 ErrorNotice(아이콘 + 다시 시도 버튼)를 그대로 넣기에는 자리가 좁다.
 * 위계(제목 굵게/짙게 + 설명 얇게/연하게)와 문구만 맞춘다.
 */
export function SupportErrorText({ error, className = "py-6" }: Props) {
  return (
    <div className={`text-center ${className}`}>
      <p className="text-[14px] font-bold text-ink">{error.title}</p>
      <p className="mt-1.5 whitespace-pre-line text-[13px] leading-relaxed text-caption">
        {error.description}
      </p>
    </div>
  );
}
