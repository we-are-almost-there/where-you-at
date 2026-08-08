import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { BADGE_CLASS, BADGE_LABEL, type SupportListItem } from "../support.types";
import { fetchSupportList } from "../supportApi";
import { SupportCalculator } from "./SupportCalculator";

type Props = {
  regionCode: string;
};

function formatAmount(amount: number | null): string {
  if (amount == null) return "금액 상이";
  return `최대 ${amount.toLocaleString()}원`;
}

export function SupportRegionView({ regionCode }: Props) {
  const [items, setItems] = useState<SupportListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchParams, setSearchParams] = useSearchParams();

  // 지역명: 지도 GeoJSON에서 넘어올 때 state로 받거나, 제도 목록에서 유추.
  // 지금은 제도 응답에 지역명이 없으니 일단 코드로 표시 (뒤에서 개선).
  const [regionName, setRegionName] = useState<string>("");

  useEffect(() => {
    fetch("/support-regions-geo.json")
      .then((r) => r.json())
      .then((geo) => {
        const f = geo.features.find(
          (f: any) => String(f.properties.region_code) === regionCode
        );
        if (f) setRegionName(f.properties.name);
      });
  }, [regionCode]);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchSupportList({ region_code: regionCode })
      .then(setItems)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [regionCode]);

  return (
    <div className="flex flex-col gap-5 md:px-1 md:py-1">
      {/* 뒤로 = 지도로 */}
      <button
        type="button"
        onClick={() => {
          searchParams.delete("region");
          setSearchParams(searchParams);
        }}
        className="cursor-pointer self-start text-[13px] text-caption transition-colors hover:text-ink"
      >
        ← 지도로
      </button>

      {/* 지역 헤더 */}
      <header>
        <h2 className="font-bold text-ink text-[18px]">{regionName || regionCode}</h2>
        <p className="mt-1 text-[13px] text-caption">
          이 지역에서 받을 수 있는 지원 혜택이에요.
        </p>
      </header>

      {/* ① 지원 제도 안내 */}
      <section>
        <h3 className="mb-2.5 font-bold text-ink text-[15px]">받을 수 있는 지원 제도</h3>

        {loading && <p className="py-6 text-center text-[13px] text-caption">불러오는 중…</p>}
        {error && <p className="py-6 text-center text-[13px] text-caption">{error}</p>}
        {!loading && !error && items.length === 0 && (
          <p className="py-6 text-center text-[13px] text-caption">
            이 지역에 해당하는 지원 제도가 없어요.
          </p>
        )}

        <ul className="flex flex-col gap-3">
          {items.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => {
                  searchParams.set("support", String(item.id));
                  setSearchParams(searchParams);
                }}
                className="w-full cursor-pointer rounded-[14px] bg-white p-4 text-left shadow-[0px_3px_10px_0px_rgba(0,0,0,0.12)] transition-shadow hover:shadow-[0px_5px_16px_0px_rgba(0,0,0,0.16)]"
              >
                <span className="mb-2 flex items-center justify-between gap-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${BADGE_CLASS[item.badge_type]}`}
                  >
                    {BADGE_LABEL[item.badge_type]}
                  </span>
                  {item.end_date && (
                    <span className="text-[11px] text-caption">~{item.end_date}</span>
                  )}
                </span>

                <span className="flex items-start justify-between gap-2">
                  <span className="font-bold text-ink text-[15px]">{item.title}</span>
                  <span className="shrink-0 text-[18px] leading-none text-caption">›</span>
                </span>
                {item.summary && (
                  <span className="mt-1 block text-[13px] leading-relaxed text-caption">
                    {item.summary}
                  </span>
                )}

                <span className="mt-3 block border-t border-divider pt-3">
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-[12px] text-caption">{item.agency}</span>
                    <span className="shrink-0 font-bold text-accent text-[14px]">
                      {formatAmount(item.max_amount)}
                    </span>
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      {/* ② 지출 입력 + ③ 영수증 — 환급형 제도가 있을 때만 */}
      {items.some((it) => it.refund_type === "정률" || it.refund_type === "정액") && (
        <section>
          <h3 className="mb-2.5 font-bold text-ink text-[15px]">예상 환급 계산</h3>
          {/* 지도가 옆에 떠 있어 패널을 연 채로 다른 지역을 바로 누를 수 있다. 그때 region만
              바뀌고 이 뷰는 언마운트되지 않아, key가 없으면 이전 지역의 입력값과 영수증이
              그대로 남는다. */}
          <SupportCalculator key={regionCode} regionCode={regionCode} />
        </section>
      )}

      {/* ④ 코스 링크 */}
      <Link
        to={`/?region=${regionCode}`}
        className="rounded-[14px] bg-accent py-3.5 text-center text-[14px] font-bold text-white transition-opacity hover:opacity-90"
      >
        이 지역 코스 보러가기 →
      </Link>
    </div>
  );
}
