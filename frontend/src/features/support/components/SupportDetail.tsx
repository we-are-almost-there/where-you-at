import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import type { SupportDetail as SupportDetailType } from "../support.types";
import { fetchSupportDetail } from "../supportApi";
import { toUserError, type UserError } from "../../../components/error/userError";
import { HttpError } from "../../../lib/http";
import { SupportErrorText } from "./SupportErrorText";

const STORAGE_KEY = (id: number) => `support_checklist_${id}`;

// ?support= 에 숫자가 아닌 값이 들어온 경우. id만 보면 알 수 있어 요청을 보내지 않는다.
const INVALID_ID_ERROR: UserError = {
  title: "지원 제도를 찾을 수 없어요",
  description: "주소가 잘못되었어요. 목록에서 다시 선택해 주세요.",
};

// 없는 제도(404). 다시 시도해도 같은 결과라 재시도 안내를 띄우지 않는다.
const NOT_FOUND_ERROR: UserError = {
  title: "지원 제도를 찾을 수 없어요",
  description: "존재하지 않거나 삭제된 제도예요. 목록에서 다시 선택해 주세요.",
};

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

/** 상세를 어느 id까지 받아왔는지. loading·error는 이 값에서 파생시킨다. */
type Loaded = { id: number; detail: SupportDetailType | null; error: UserError | null };

export function SupportDetail({ id }: Props) {
  const [searchParams, setSearchParams] = useSearchParams();

  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [checked, setChecked] = useState<Record<number, boolean>>({});

  // effect 안에서 setLoading/setError를 동기적으로 호출하면 렌더가 한 번 더 돈다
  // (react-hooks/set-state-in-effect). 어느 id까지 받아왔는지만 남기고
  // 나머지는 렌더 중에 계산한다. 잘못된 id는 요청 없이 여기서 바로 갈린다.
  const validId = Number.isInteger(id);
  // 직전 id의 응답이 남아 있으면 그건 지금 화면의 것이 아니다
  const settled = loaded?.id === id ? loaded : null;
  const loading = validId && settled == null;
  const error = !validId ? INVALID_ID_ERROR : (settled?.error ?? null);
  const detail = settled?.detail ?? null;

  useEffect(() => {
    if (!Number.isInteger(id)) return;
    let cancelled = false;
    fetchSupportDetail(id)
      .then((data) => {
        if (cancelled) return;
        setLoaded({ id, detail: data, error: null });
        setChecked(loadChecked(id));
      })
      .catch((err) => {
        if (cancelled) return;
        setLoaded({
          id,
          detail: null,
          error:
            err instanceof HttpError && err.status === 404
              ? NOT_FOUND_ERROR
              : toUserError(err, "지원 제도를 불러오지 못했어요"),
        });
      });
    return () => {
      cancelled = true;
    };
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
      {error && <SupportErrorText error={error} />}

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
