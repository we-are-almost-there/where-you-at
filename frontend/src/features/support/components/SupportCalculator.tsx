import { useState } from "react";
import { calculateRefund } from "../supportApi";
import type { CalculateResponse, CalculationBasisItem } from "../support.types";

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
  const [error, setError] = useState<string | null>(null);

  const handleChange = (key: string, value: string) => {
    // 숫자만
    setSpent((prev) => ({ ...prev, [key]: value.replace(/[^\d]/g, "") }));
  };

  const handleCalculate = () => {
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
      stay_duration: parseInt(stayDuration || "1", 10),
    })
      .then(setResult)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  const grouped = result ? groupByPolicy(result.calculation_basis) : [];

  return (
    <div className="flex flex-col gap-4">
      {/* 입력폼 */}
      <div className="rounded-xl border border-violet-100 bg-white p-4">
        <div className="flex flex-col gap-3">
          {CATEGORIES.map(({ key, label }) => (
            <label key={key} className="flex flex-col gap-1">
              <span className="text-xs font-bold text-slate-500">{label}</span>
              <div className="flex items-center rounded-lg border border-slate-200 px-3 py-2 focus-within:border-violet-400">
                <input
                  type="text"
                  inputMode="numeric"
                  value={spent[key] ? Number(spent[key]).toLocaleString("ko-KR") : ""}
                  onChange={(e) => handleChange(key, e.target.value)}
                  placeholder="0"
                  className="w-full text-right text-sm text-indigo-950 outline-none placeholder:text-slate-300"
                />
                <span className="ml-1 text-sm text-slate-400">원</span>
              </div>
            </label>
          ))}

          <label className="flex flex-col gap-1">
            <span className="text-xs font-bold text-slate-500">숙박일수</span>
            <div className="flex items-center rounded-lg border border-slate-200 px-3 py-2 focus-within:border-violet-400">
              <input
                type="text"
                inputMode="numeric"
                value={stayDuration}
                onChange={(e) =>
                  setStayDuration(e.target.value.replace(/[^\d]/g, ""))
                }
                className="w-full text-right text-sm text-indigo-950 outline-none"
              />
              <span className="ml-1 text-sm text-slate-400">박</span>
            </div>
          </label>
        </div>

        <button
          onClick={handleCalculate}
          disabled={loading}
          className="mt-4 w-full rounded-xl bg-violet-600 py-2.5 text-sm font-extrabold text-white hover:bg-violet-700 disabled:opacity-50"
        >
          {loading ? "계산 중…" : "예상 환급액 계산"}
        </button>
      </div>

      {error && <p className="text-sm text-rose-600">{error}</p>}

      {/* 영수증 */}
      {result && (
        <div className="rounded-xl border border-violet-100 bg-violet-50/40 p-4">
          {result.expected_refund > 0 ? (
            <>
              <div className="mb-3 flex items-baseline justify-between border-b border-dashed border-violet-200 pb-3">
                <span className="text-sm font-bold text-indigo-900">예상 환급액</span>
                <span className="text-xl font-extrabold text-violet-700">
                  {won(result.expected_refund)}
                </span>
              </div>

              <ul className="flex flex-col gap-2">
                {grouped.map((g) => (
                  <li key={g.title} className="flex flex-col">
                    <div className="flex items-baseline justify-between">
                      <span className="text-sm font-bold text-indigo-950">{g.title}</span>
                      <span className="text-sm font-bold text-indigo-950">{won(g.total)}</span>
                    </div>
                    {g.notes.length > 0 && (
                      <span className="mt-0.5 text-xs text-slate-400">
                        {g.notes.join(" · ")}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="text-center text-sm text-slate-400">
              입력한 지출로는 해당하는 환급 혜택이 없어요.
            </p>
          )}

          {result.tips.length > 0 && (
            <ul className="mt-3 flex flex-col gap-1 border-t border-dashed border-violet-200 pt-3">
              {result.tips.map((tip, i) => (
                <li key={i} className="text-xs text-slate-500">· {tip}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}