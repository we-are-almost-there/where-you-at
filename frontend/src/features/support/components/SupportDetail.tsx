import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import type { SupportDetail as SupportDetailType } from "../support.types";
import { fetchSupportDetail } from "../supportApi";

const STORAGE_KEY = (id: number) => `support_checklist_${id}`;

function loadChecked(id: number): Record<number, boolean> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY(id)) ?? "{}");
  } catch {
    return {};
  }
}

type Props = {
  id: number;
};

export function SupportDetail({ id }: Props) {
  const [searchParams, setSearchParams] = useSearchParams();

  const [detail, setDetail] = useState<SupportDetailType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [checked, setChecked] = useState<Record<number, boolean>>({});

  useEffect(() => {
    if (!Number.isInteger(id)) {
      setError("잘못된 지원 제도 ID입니다.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    fetchSupportDetail(id)
      .then((data) => {
        setDetail(data);
        setChecked(loadChecked(id));
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  // 제도 목록으로 = support 쿼리만 제거 (region 유지)
  function backToList() {
    searchParams.delete("support");
    setSearchParams(searchParams);
  }

  function toggleCheck(itemId: number) {
    setChecked((prev) => {
      const next = { ...prev, [itemId]: !prev[itemId] };
      localStorage.setItem(STORAGE_KEY(id), JSON.stringify(next));
      return next;
    });
  }

  const refundRules = detail?.refund_rules ?? [];
  const checklist = detail?.checklist ?? [];

  return (
    // 오버레이가 아니라 지역 목록과 같은 자리에서 내용만 바뀐다.
    // (모바일에서 바텀시트로 띄우면 뷰포트가 최상단으로 튀어 지도가 가려졌다)
    <div className="flex flex-col gap-5">
      <button
        type="button"
        onClick={backToList}
        className="cursor-pointer self-start text-[13px] text-caption transition-colors hover:text-ink"
      >
        ← 목록으로
      </button>

      {loading && <p className="py-6 text-center text-[13px] text-caption">불러오는 중…</p>}
      {error && <p className="py-6 text-center text-[13px] text-caption">{error}</p>}

      {!loading && !error && detail && (
        <>
          <div>
            <h2 className="font-bold text-ink text-[18px]">{detail.title}</h2>
            {detail.description && (
              <p className="mt-1.5 text-[13px] leading-relaxed text-caption">
                {detail.description}
              </p>
            )}
          </div>

          {refundRules.length > 0 && (
            <section>
              <h3 className="mb-2.5 font-bold text-ink text-[15px]">환급 조건</h3>
              <dl className="flex flex-col gap-2.5 text-[13px]">
                {refundRules.map((rule, i) => (
                  <div key={i} className="flex gap-3">
                    <dt className="w-24 shrink-0 text-caption">{rule.category}</dt>
                    <dd className="text-ink">
                      {rule.min_spend != null && `${rule.min_spend.toLocaleString()}원 이상 지출 시 `}
                      <span className="font-bold text-accent">
                        {rule.is_rate
                          ? `${rule.refund_value}% 환급`
                          : `${rule.refund_value.toLocaleString()}원 할인`}
                      </span>
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          )}

          <section>
            <h3 className="mb-2.5 font-bold text-ink text-[15px]">신청 체크리스트</h3>
            {checklist.length === 0 ? (
              <p className="py-6 text-center text-[13px] text-caption">체크리스트가 없어요.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-divider">
                {checklist.map((item) => (
                  <li key={item.id} className="flex items-start gap-2.5 py-2.5">
                    <input
                      type="checkbox"
                      id={`check-${item.id}`}
                      checked={!!checked[item.id]}
                      onChange={() => toggleCheck(item.id)}
                      className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-accent"
                    />
                    <label
                      htmlFor={`check-${item.id}`}
                      className={`cursor-pointer text-[13px] leading-relaxed ${
                        checked[item.id] ? "text-caption line-through" : "text-ink"
                      }`}
                    >
                      {item.content}
                      {item.is_essential && (
                        <span className="ml-1.5 rounded-full bg-lavender px-1.5 py-0.5 text-[10px] font-medium text-accent">
                          필수
                        </span>
                      )}
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {detail.apply_url && (
            <a
              href={detail.apply_url}
              target="_blank"
              rel="noreferrer"
              className="rounded-lg bg-accent py-3.5 text-center text-[14px] font-bold text-white transition-opacity hover:opacity-90"
            >
              신청 페이지로 이동
            </a>
          )}
        </>
      )}
    </div>
  );
}
