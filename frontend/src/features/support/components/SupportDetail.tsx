import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router";
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

export function SupportDetail() {
  const { id: idParam } = useParams();
  const navigate = useNavigate();
  const id = Number(idParam);

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

  function toggleCheck(itemId: number) {
    setChecked((prev) => {
      const next = { ...prev, [itemId]: !prev[itemId] };
      localStorage.setItem(STORAGE_KEY(id), JSON.stringify(next));
      return next;
    });
  }

  if (loading) return <p className="mx-auto max-w-md px-4 py-4 text-sm text-slate-400">불러오는 중…</p>;
  if (error) return <p className="mx-auto max-w-md px-4 py-4 text-sm text-rose-600">{error}</p>;
  if (!detail) return null;

  return (
    <div className="mx-auto flex max-w-md flex-col gap-5 px-4 py-4">
      <button
        onClick={() => navigate(-1)}
        className="self-start text-[13px] text-slate-400 hover:text-slate-600"
      >
        ← 목록으로
      </button>

      <h2 className="text-xl font-extrabold text-indigo-950">{detail.title}</h2>

      <p className="text-[13px] leading-relaxed text-slate-600">{detail.description}</p>

      {detail.refund_rules.length > 0 && (
        <section>
          <h3 className="mb-2 text-sm font-extrabold text-indigo-900">환급 조건</h3>
          <ul className="flex flex-col gap-1.5">
            {detail.refund_rules.map((rule, i) => (
              <li key={i} className="text-[13px] text-slate-600">
                <strong className="text-indigo-950">{rule.category}</strong>
                {" · "}
                {rule.min_spend != null && `${rule.min_spend.toLocaleString()}원 이상 지출 시 `}
                {rule.is_rate
                  ? `${rule.refund_value}% 환급`
                  : `${rule.refund_value.toLocaleString()}원 할인`}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h3 className="mb-2 text-sm font-extrabold text-indigo-900">신청 체크리스트</h3>
        <ul className="flex flex-col gap-2">
          {detail.checklist.map((item) => (
            <li key={item.id} className="flex items-start gap-2.5">
              <input
                type="checkbox"
                id={`check-${item.id}`}
                checked={!!checked[item.id]}
                onChange={() => toggleCheck(item.id)}
                className="mt-1 h-4 w-4 shrink-0 accent-violet-600"
              />
              <label htmlFor={`check-${item.id}`} className="text-[13px] text-indigo-950">
                {item.content}
                {item.is_essential && (
                  <span className="ml-1.5 text-[11px] font-bold text-violet-700">필수</span>
                )}
              </label>
            </li>
          ))}
        </ul>
      </section>

      {detail.apply_url && (
        <a
          href={detail.apply_url}
          target="_blank"
          rel="noreferrer"
          className="rounded-2xl bg-violet-600 py-3.5 text-center text-sm font-extrabold text-white hover:bg-violet-700"
        >
          신청 페이지로 이동
        </a>
      )}
    </div>
  );
}