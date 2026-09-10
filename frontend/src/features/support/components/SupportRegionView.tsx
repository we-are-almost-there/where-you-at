import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";
import type { Feature } from "geojson";
import { BADGE_CLASS, BADGE_LABEL, type SupportListItem } from "../support.types";
import { fetchSupportList } from "../supportApi";
import { toUserError, type UserError } from "../supportError";
import { SupportCalculator } from "./SupportCalculator";
import { SupportErrorText } from "./SupportErrorText";

type Props = {
  regionCode: string;
};

function formatAmount(amount: number | null): string {
  if (amount == null) return "금액 상이";
  return `최대 ${amount.toLocaleString()}원`;
}

// 지역코드 → 지역명. 지역을 바꿀 때마다 762KB짜리 GeoJSON을 다시 받으면
// 이름이 늦게 채워지며 헤더가 코드→이름으로 깜빡인다. 한 번만 받아 재사용한다.
let regionNamesPromise: Promise<Map<string, string>> | null = null;
function loadRegionNames(): Promise<Map<string, string>> {
  regionNamesPromise ??= fetch("/support-regions-geo.json")
    .then((r) => r.json())
    .then(
      (geo: { features: Feature[] }) =>
        new Map<string, string>(
          geo.features.map((f): [string, string] => [
            String(f.properties?.region_code),
            String(f.properties?.name ?? ""),
          ]),
        ),
    )
    .catch((err) => {
      // 실패한 Promise를 그대로 두면 ??=가 "이미 값이 있다"고 보고 재요청하지 않는다.
      // 네트워크가 돌아와도 새로고침 전까지 지역명이 계속 코드로만 보였다.
      // 성공한 결과만 캐시로 남긴다.
      regionNamesPromise = null;
      throw err;
    });
  return regionNamesPromise;
}

/** 목록을 어느 지역까지 받아왔는지. loading·error는 이 값에서 파생시킨다. */
type Loaded = { regionCode: string; error: UserError | null };

export function SupportRegionView({ regionCode }: Props) {
  const [items, setItems] = useState<SupportListItem[]>([]);
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  const [searchParams, setSearchParams] = useSearchParams();

  const [regionName, setRegionName] = useState<string>("");

  // loading·error를 별도 state로 두면 effect 안에서 setLoading(true)를 동기적으로
  // 호출하게 되고, 지역을 바꿀 때마다 렌더가 한 번 더 돈다
  // (react-hooks/set-state-in-effect). 렌더 중에 계산해서 그 왕복을 없앤다.
  // 직전 지역의 응답이 남아 있으면 그건 지금 화면의 것이 아니다
  const settled = loaded?.regionCode === regionCode ? loaded : null;
  const loading = settled == null;
  const error = settled?.error ?? null;

  useEffect(() => {
    let cancelled = false;
    loadRegionNames()
      .then((names) => {
        if (!cancelled) setRegionName(names.get(regionCode) ?? "");
      })
      // 이름을 못 받으면 헤더에 지역코드를 그대로 보여준다.
      // .catch가 없으면 unhandled rejection까지 같이 난다.
      .catch(() => {
        if (!cancelled) setRegionName("");
      });
    return () => {
      cancelled = true;
    };
  }, [regionCode]);

  // stale-while-revalidate: 새 지역을 부르는 동안 이전 목록을 그대로 둔다.
  // 목록을 비우면 패널 높이가 한 줄짜리 로딩 문구로 줄었다가 다시 늘어나며 요동친다.
  useEffect(() => {
    let cancelled = false;
    fetchSupportList({ region_code: regionCode })
      .then((next) => {
        if (cancelled) return;
        setItems(next);
        setLoaded({ regionCode, error: null });
      })
      .catch((err) => {
        if (cancelled) return;
        // 실패했을 때만 목록을 비운다. 직전 지역 목록이 에러 문구 아래 남아 있으면
        // 지금 지역의 제도로 읽힌다.
        setItems([]);
        setLoaded({ regionCode, error: toUserError(err, "지원 제도를 불러오지 못했어요") });
      });
    return () => {
      cancelled = true;
    };
  }, [regionCode]);

  return (
    <div className="flex flex-col gap-5 md:px-1 md:py-1">
      {/* 지역 헤더 — 닫기는 '뒤로'가 아니라 패널을 없애는 동작이라 우측 X로 둔다
          (주변 정보 상세 시트와 같은 규칙) */}
      <header className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="font-bold text-ink text-[18px]">{regionName || regionCode}</h2>
          <p className="mt-1 text-[13px] text-caption">
            이 지역에서 받을 수 있는 지원 혜택이에요.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            searchParams.delete("region");
            setSearchParams(searchParams);
          }}
          aria-label="닫기"
          className="-mr-1 -mt-1 shrink-0 cursor-pointer p-1 text-[20px] leading-none text-caption transition-colors hover:text-ink"
        >
          ✕
        </button>
      </header>

      {/* ① 지원 제도 안내 */}
      <section>
        <h3 className="mb-2.5 font-bold text-ink text-[15px]">받을 수 있는 지원 제도</h3>

        {/* 첫 로드에만 문구를 띄운다. 이후에는 이전 목록을 흐리게 둔 채 갱신해서
            패널 높이가 튀지 않게 한다. */}
        {loading && items.length === 0 && (
          <p className="py-6 text-center text-[13px] text-caption">불러오는 중…</p>
        )}
        {error && <SupportErrorText error={error} />}
        {!loading && !error && items.length === 0 && (
          <p className="py-6 text-center text-[13px] text-caption">
            이 지역에 해당하는 지원 제도가 없어요.
          </p>
        )}

        <ul
          className={`flex flex-col gap-3 transition-opacity ${loading ? "opacity-60" : "opacity-100"}`}
        >
          {items.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => {
                  searchParams.set("support", String(item.id));
                  setSearchParams(searchParams);
                }}
                className="w-full cursor-pointer rounded-lg bg-white/80 p-4 text-left shadow-[0px_3px_10px_0px_rgba(31,58,95,0.10)] transition-shadow hover:bg-white hover:shadow-[0px_5px_16px_0px_rgba(31,58,95,0.16)]"
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
      {/* "/"는 홈이라 region을 읽지 않는다. 지역 필터를 받는 쪽은 /courses다. */}
      <Link
        to={`/courses?region=${regionCode}`}
        className="rounded-lg bg-accent py-3.5 text-center text-[14px] font-bold text-white transition-opacity hover:opacity-90"
      >
        이 지역 코스 보러가기 →
      </Link>
    </div>
  );
}
