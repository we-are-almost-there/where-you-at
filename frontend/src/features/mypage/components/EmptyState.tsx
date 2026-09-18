import type { ReactNode } from "react";
import { Link } from "react-router";
import { PRIMARY_BUTTON } from "../buttonStyles";

interface Props {
  icon: ReactNode;
  title: string;
  description: string;
  action?: { to: string; label: string };
}

/** 찜·기록·스탬프 탭이 비었을 때. 무엇을 하면 채워지는지 알려 주고 코스 둘러보기로 이어 준다. */
export default function EmptyState({ icon, title, description, action }: Props) {
  return (
    <div className="flex flex-col items-center rounded-[14px] border border-dashed border-divider px-6 py-12 text-center">
      <span aria-hidden="true" className="flex size-14 items-center justify-center rounded-full bg-lavender text-accent">
        {icon}
      </span>
      <p className="mt-4 text-[16px] font-bold text-ink">{title}</p>
      <p className="mt-1.5 whitespace-pre-line text-[14px] leading-6 text-muted">{description}</p>
      {action && (
        <Link
          to={action.to}
          className={`mt-5 ${PRIMARY_BUTTON}`}
        >
          {action.label}
        </Link>
      )}
    </div>
  );
}
