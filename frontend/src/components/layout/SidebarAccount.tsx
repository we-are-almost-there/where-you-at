import { Link } from "react-router";
import { ChevronRight, UserRound } from "lucide-react";
import type { User } from "../../features/auth";
import { getStamps } from "../../features/mypage/mypageData";
import { useRunRecords } from "../../features/mypage/useRunRecords";
import { useSavedCourses } from "../../features/mypage/useSavedCourses";

export default function SidebarAccount({ user, onClose }: { user: User; onClose: () => void }) {
  const saved = useSavedCourses();
  const records = useRunRecords();
  const stats = [
    { label: "찜한 코스", count: saved.status === "ready" ? saved.courses.length : "—", to: "/mypage/saved" },
    { label: "내 기록", count: records.status === "ready" ? records.records.length : "—", to: "/mypage/records" },
    { label: "스탬프", count: getStamps().length, to: "/mypage#mypage-stamps" },
  ];

  return (
    <>
      <Link to="/mypage" onClick={onClose} className="flex items-center gap-3 rounded-2xl bg-lavender p-4 transition-colors hover:bg-accent/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-white text-accent">
            <UserRound size={22} aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[18px] font-bold text-ink">{user.nickname ?? "회원"}</span>
            <span className="block text-[12px] text-muted">마이페이지</span>
          </span>
        <ChevronRight size={22} className="shrink-0 text-muted" aria-hidden="true" />
      </Link>
      <div className="mt-2.5 grid grid-cols-3 gap-2">
        {stats.map(({ label, count, to }) => (
          <Link key={label} to={to} onClick={onClose} className="flex flex-col items-center gap-1 rounded-xl border border-accent/15 py-2.5 hover:bg-lavender/40">
            <span className="text-[20px] font-semibold leading-6 text-accent">{count}</span>
            <span className="text-[11px] text-caption">{label}</span>
          </Link>
        ))}
      </div>
      {saved.status === "error" && <p className="mt-2 text-[12px] text-caption">찜한 코스 수를 불러오지 못했어요.</p>}
      {records.status === "error" && <p className="mt-2 text-[12px] text-caption">기록 수를 불러오지 못했어요.</p>}
    </>
  );
}
