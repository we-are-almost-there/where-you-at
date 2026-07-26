import { useEffect, useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router";
import type { SupportListItem, BadgeType } from "../support.types";
import { fetchSupportList } from "../supportApi";

const BADGE_LABEL: Record<BadgeType, string> = {
  refund: "환급",
  discount: "할인",
  pass: "무료 패스",
};

const BADGE_CLASS: Record<BadgeType, string> = {
  refund: "bg-violet-600 text-white",
  pass: "bg-indigo-950 text-white",
  discount: "bg-violet-100 text-indigo-950",
};

function formatAmount(amount: number | null): string {
  if (amount == null) return "금액 상이";
  return `최대 ${amount.toLocaleString()}원`;
}

export function SupportList() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const regionCode = searchParams.get("region") ?? undefined;

  const [items, setItems] = useState<SupportListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchSupportList({ region_code: regionCode })
      .then(setItems)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [regionCode]);

  return (
    <div className="mx-auto max-w-md px-4 py-4">
      <header className="mb-4">
        <h2 className="text-lg font-extrabold text-indigo-950">여행 지원금·혜택</h2>
        <p className="mt-1 text-sm text-slate-400">
          {regionCode
            ? "선택한 지역에서 받을 수 있는 지원 제도예요."
            : "인구감소지역 여행 시 받을 수 있는 지원 제도를 모았어요."}
        </p>
        {regionCode && (
          <Link to="/support" className="mt-2 inline-block text-xs font-semibold text-violet-600">
            전체 지원 제도 보기 →
          </Link>
        )}
      </header>

      {loading && <p className="py-4 text-sm text-slate-400">지원 제도를 불러오는 중…</p>}
      {error && <p className="py-4 text-sm text-rose-600">{error}</p>}
      {!loading && !error && items.length === 0 && (
        <p className="py-4 text-sm text-slate-400">
          {regionCode
            ? "이 지역에 해당하는 지원 제도가 없어요."
            : "표시할 지원 제도가 없습니다."}
        </p>
      )}

      <div className="flex flex-col gap-3">
        {items.map((item) => (
          <button
            key={item.id}
            onClick={() => navigate(`/support/${item.id}`)}
            className="rounded-2xl border border-violet-100 bg-white p-4 text-left transition hover:border-violet-300"
          >
            <div className="mb-2 flex items-center justify-between">
              <span
                className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${BADGE_CLASS[item.badge_type]}`}
              >
                {BADGE_LABEL[item.badge_type]}
              </span>
              <span className="text-[11px] text-slate-400">~{item.end_date}</span>
            </div>

            <h3 className="text-[15px] font-extrabold text-indigo-950">{item.title}</h3>
            <p className="mt-1.5 text-xs leading-relaxed text-slate-500">{item.summary}</p>

            <div className="mt-3 flex items-center justify-between border-t border-violet-100 pt-3">
              <span className="text-[11px] text-slate-400">{item.agency}</span>
              <span className="text-[13px] font-extrabold text-violet-700">
                {formatAmount(item.max_amount)}
              </span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}