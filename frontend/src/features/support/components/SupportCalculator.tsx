import { useState } from "react";
import { calculateRefund } from "../supportApi";
import type { CalculateResponse, CalculationBasisItem } from "../support.types";
import { toUserError, type UserError } from "../../../components/error/userError";
import { SupportErrorText } from "./SupportErrorText";

type Props = {
  regionCode: string;
};

// 입력폼에 노출할 지출 카테고리. 시드의 refund_rule.category 기준.
// 현재 시드: "숙박", "전체"만 존재 → "전체"는 total_spent로 자동 계산되므로 입력 제외.
// "기타"는 숙박 외 지출을 "전체" 규칙에 반영하기 위한 칸 (백엔드로는 안 보냄, total에만 합산).
const CATEGORIES = [
  { key: "숙박", label: "숙박비" },
  { key: "기타", label: "그 외 지출 (식비·교통 등)" },
] as const;

// 제도별로 calculation_basis 묶어서 합계 내기
function groupByPolicy(basis: CalculationBasisItem[]) {
  const map = new Map<string, { total: number; notes: string[] }>();
  for (const b of basis) {
    const cur = map.get(b.item) ?? { total: 0, notes: [] };
    cur.total += b.amount;
    if (b.description && !cur.notes.includes(b.description)) {
      cur.notes.push(b.description);
    }
    map.set(b.item, cur);
  }
  return Array.from(map.entries()).map(([title, v]) => ({ title, ...v }));
}

const won = (n: number) => n.toLocaleString("ko-KR") + "원";

export function SupportCalculator({ regionCode }: Props) {
  const [spent, setSpent] = useState<Record<string, string>>({});
  const [stayDuration, setStayDuration] = useState("1");
  const [result, setResult] = useState<CalculateResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<UserError | null>(null);

  const handleChange = (key: string, value: string) => {
    // 숫자만
    setSpent((prev) => ({ ...prev, [key]: value.replace(/[^\d]/g, "") }));
  };

  // 빈 칸은 유효한 입력이 아니다. `stayDuration || "1"`로 조용히 1을 채워 보내면
  // 입력칸은 비어 있는데 영수증에는 1박 구간 할인이 적용되는 어긋남이 생긴다.
  // 숙박세일은 1박/연박으로 구간이 갈리므로 이 차이가 금액에 그대로 반영된다.
  const stayNights = stayDuration === "" ? null : parseInt(stayDuration, 10);

  const handleCalculate = () => {
    if (stayNights == null) return;

    setLoading(true);
    setError(null);
    setResult(null);

    // 백엔드는 category별 키를 그대로 매칭. "기타"는 refund_rule에 없는 키라
    // 어떤 category 규칙에도 안 걸리지만, total_spent에는 합산되어 "전체" 규칙에 반영됨.
    const spent_by_category: Record<string, number> = {};
    for (const { key } of CATEGORIES) {
      const n = parseInt(spent[key] || "0", 10);
      if (n > 0) spent_by_category[key] = n;
    }

    calculateRefund({
      region_code: regionCode,
      spent_by_category,
      stay_duration: stayNights,
    })
      .then(setResult)
      .catch((err) => setError(toUserError(err, "환급액을 계산하지 못했어요")))
      .finally(() => setLoading(false));
  };

  const grouped = result ? groupByPolicy(result.calculation_basis) : [];

  return (
    <div className="flex flex-col gap-4">
      {/* 입력폼 */}
      <div className="rounded-lg bg-white/80 p-4 shadow-[0px_3px_10px_0px_rgba(31,58,95,0.10)]">
        <div className="flex flex-col gap-3">
          {CATEGORIES.map(({ key, label }) => (
            <label key={key} className="flex flex-col gap-1.5">
              <span className="text-[12px] font-bold text-caption">{label}</span>
              <div className="flex items-center rounded-lg border border-divider bg-white px-3.5 py-2.5 focus-within:border-accent">
                <input
                  type="text"
                  inputMode="numeric"
                  value={spent[key] ? Number(spent[key]).toLocaleString("ko-KR") : ""}
                  onChange={(e) => handleChange(key, e.target.value)}
                  placeholder="0"
                  className="w-full text-right text-[14px] text-ink outline-none placeholder:text-caption"
                />
                <span className="ml-1 text-[14px] text-caption">원</span>
              </div>
            </label>
          ))}

          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] font-bold text-caption">숙박일수</span>
            <div className="flex items-center rounded-lg border border-divider bg-white px-3.5 py-2.5 focus-within:border-accent">
              <input
                type="text"
                inputMode="numeric"
                value={stayDuration}
                onChange={(e) =>
                  setStayDuration(e.target.value.replace(/[^\d]/g, ""))
                }
                // 비운 채로 칸을 벗어나면 기본값을 되돌려, 화면 값과 계산에 쓰는 값이 어긋나지 않게 한다
                onBlur={() => stayDuration === "" && setStayDuration("1")}
                className="w-full text-right text-[14px] text-ink outline-none"
              />
              <span className="ml-1 text-[14px] text-caption">박</span>
            </div>
          </label>
        </div>

        <button
          type="button"
          onClick={handleCalculate}
          disabled={loading || stayNights == null}
          className="mt-4 w-full cursor-pointer rounded-lg bg-accent py-3 text-[14px] font-bold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "계산 중…" : "예상 환급액 계산"}
        </button>
      </div>

      {error && <SupportErrorText error={error} className="py-2" />}

      {/* 영수증 */}
      {result && (
        <div className="rounded-lg bg-lavender p-4">
          {result.expected_refund > 0 ? (
            <>
              <div className="mb-3 flex items-baseline justify-between border-b border-dashed border-divider pb-3">
                <span className="text-[12px] font-bold text-caption">예상 환급액</span>
                <span className="text-[22px] font-bold leading-none text-accent">
                  {won(result.expected_refund)}
                </span>
              </div>

              <ul className="flex flex-col gap-2">
                {grouped.map((g) => (
                  <li key={g.title} className="flex flex-col">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-[13px] font-bold text-ink">{g.title}</span>
                      <span className="shrink-0 text-[13px] font-bold text-figure">
                        {won(g.total)}
                      </span>
                    </div>
                    {g.notes.length > 0 && (
                      <span className="mt-0.5 text-[12px] text-caption">
                        {g.notes.join(" · ")}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="text-center text-[13px] text-caption">
              입력한 지출로는 해당하는 환급 혜택이 없어요.
            </p>
          )}

          {result.tips.length > 0 && (
            <ul className="mt-3 flex flex-col gap-1 border-t border-dashed border-divider pt-3">
              {result.tips.map((tip, i) => (
                <li key={i} className="text-[12px] text-caption">· {tip}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}