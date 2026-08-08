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
    <Sheet onClose={backToList}>
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
              className="rounded-[14px] bg-accent py-3.5 text-center text-[14px] font-bold text-white transition-opacity hover:opacity-90"
            >
              신청 페이지로 이동
            </a>
          )}
        </>
      )}
    </Sheet>
  );
}

/**
 * 모바일: 하단에서 올라오는 바텀시트 / 데스크톱(md+): 부모 컬럼에 인라인 패널.
 * 대회 탭 RaceDetailSheet와 동일한 규칙.
 */
function Sheet({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <>
      {/* 배경 딤 처리 — 모바일 전용 (데스크톱은 인라인 패널이라 불필요) */}
      <div className="fixed inset-0 z-40 bg-black/30 md:hidden" onClick={onClose} />

      <div className="fixed inset-x-0 bottom-0 top-2 z-50 overflow-y-auto rounded-t-2xl bg-white shadow-xl md:static md:inset-auto md:z-auto md:overflow-visible md:rounded-none md:bg-transparent md:shadow-none">
        <div className="flex flex-col gap-5 p-5 md:px-1 md:py-1">
          {/* 드래그 핸들 (모바일 전용) */}
          <div className="mx-auto -mb-2 h-1 w-9 rounded-full bg-divider md:hidden" />
          {children}
        </div>
      </div>
    </>
  );
}
