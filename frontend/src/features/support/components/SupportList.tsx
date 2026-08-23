import { useEffect, useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router";
import { BADGE_CLASS, BADGE_LABEL, type SupportListItem } from "../support.types";
import { fetchSupportList } from "../supportApi";

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
        <h2 className="font-bold text-ink text-[18px]">여행 지원금·혜택</h2>
        <p className="mt-1 text-[13px] text-caption">
          {regionCode
            ? "선택한 지역에서 받을 수 있는 지원 제도예요."
            : "인구감소지역 여행 시 받을 수 있는 지원 제도를 모았어요."}
        </p>
        {regionCode && (
          <Link to="/support" className="mt-2 inline-block text-[12px] font-bold text-accent">
            전체 지원 제도 보기 →
          </Link>
        )}
      </header>

      {loading && (
        <p className="py-6 text-center text-[13px] text-caption">지원 제도를 불러오는 중…</p>
      )}
      {error && <p className="py-6 text-center text-[13px] text-caption">{error}</p>}
      {!loading && !error && items.length === 0 && (
        <p className="py-6 text-center text-[13px] text-caption">
          {regionCode
            ? "이 지역에 해당하는 지원 제도가 없어요."
            : "표시할 지원 제도가 없습니다."}
        </p>
      )}

      <div className="flex flex-col gap-3">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => navigate(`/support/${item.id}`)}
            className="cursor-pointer rounded-lg bg-white p-4 text-left shadow-[0px_3px_10px_0px_rgba(0,0,0,0.12)] transition-shadow hover:shadow-[0px_5px_16px_0px_rgba(0,0,0,0.16)]"
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <span
                className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${BADGE_CLASS[item.badge_type]}`}
              >
                {BADGE_LABEL[item.badge_type]}
              </span>
              {item.end_date && <span className="text-[11px] text-caption">~{item.end_date}</span>}
            </div>

            <div className="flex items-start justify-between gap-2">
              <h3 className="font-bold text-ink text-[15px]">{item.title}</h3>
              <span className="shrink-0 text-[18px] leading-none text-caption">›</span>
            </div>
            {item.summary && (
              <p className="mt-1 text-[13px] leading-relaxed text-caption">{item.summary}</p>
            )}

            <div className="mt-3 flex items-center justify-between gap-2 border-t border-divider pt-3">
              <span className="truncate text-[12px] text-caption">{item.agency}</span>
              <span className="shrink-0 font-bold text-accent text-[14px]">
                {formatAmount(item.max_amount)}
              </span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}