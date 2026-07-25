import { useEffect, useState } from "react";
import { Link, useSearchParams} from "react-router";
import type { SupportListItem } from "../support.types";
import { fetchSupportList } from "../supportApi";

type Props = {
  regionCode: string;
};

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
    <div className="flex flex-col gap-6 px-4 py-4">
      {/* 뒤로 = 지도로 */}
      <button
        onClick={() => {
          searchParams.delete("region");
          setSearchParams(searchParams);
        }}
        className="self-start text-[13px] text-slate-400 hover:text-slate-600"
      >
        ← 지도로
      </button>

      {/* 지역 헤더 */}
      <header>
        <h2 className="text-xl font-extrabold text-indigo-950">
          {regionName || regionCode}
        </h2>
        <p className="mt-1 text-sm text-slate-400">
          이 지역에서 받을 수 있는 지원 혜택이에요.
        </p>
      </header>

      {/* ① 지원 제도 안내 */}
      <section>
        <h3 className="mb-2 text-sm font-extrabold text-indigo-900">받을 수 있는 지원 제도</h3>
        {loading && <p className="text-sm text-slate-400">불러오는 중…</p>}
        {error && <p className="text-sm text-rose-600">{error}</p>}
        {!loading && !error && items.length === 0 && (
          <p className="text-sm text-slate-400">이 지역에 해당하는 지원 제도가 없어요.</p>
        )}
        <ul className="flex flex-col gap-2">
          {items.map((item) => (
            <li key={item.id}>
              <button
                onClick={() => {
                  searchParams.set("support", String(item.id));
                  setSearchParams(searchParams);
                }}
                className="w-full rounded-xl border border-violet-100 bg-white p-3 text-left hover:border-violet-300"
              >
                <span className="text-[14px] font-bold text-indigo-950">{item.title}</span>
                <span className="mt-0.5 block text-xs text-slate-500">{item.summary}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      {/* ② 지출 입력 + ③ 영수증 — 다음 단계에서 계산기 컴포넌트로 */}
      <section>
        <h3 className="mb-2 text-sm font-extrabold text-indigo-900">예상 환급 계산</h3>
        <div className="rounded-xl border border-dashed border-violet-200 p-4 text-center text-sm text-slate-400">
          환급 계산기 자리 (다음 단계)
        </div>
      </section>

      {/* ④ 코스 링크 */}
      <Link
        to={`/?region=${regionCode}`}
        className="rounded-2xl bg-violet-600 py-3.5 text-center text-sm font-extrabold text-white hover:bg-violet-700"
      >
        이 지역 코스 보러가기 →
      </Link>
    </div>
  );
}