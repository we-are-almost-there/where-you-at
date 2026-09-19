import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { BADGE_CLASS, BADGE_LABEL, type SupportListItem } from "../support.types";
import { fetchSupportList } from "../supportApi";
// 코스 탐색의 지역 필터가 쓰는 것과 같은 목록이다. 엔드포인트를 여기 한 번 더 적으면
// 한쪽만 바뀌어 조용히 어긋나므로, 이미 있는 함수를 가져다 쓴다.
import { getRegions } from "../../map/coursesApi";
import { loadRegionNames } from "../../../lib/regionNames";
import { toUserError, type UserError } from "../../../components/error/userError";
import { SupportCalculator } from "./SupportCalculator";
import { SupportErrorText } from "./SupportErrorText";

type Props = {
  regionCode: string;
};

function formatAmount(amount: number | null): string {
  if (amount == null) return "금액 상이";
  return `최대 ${amount.toLocaleString()}원`;
}

/**
 * region-index.json의 이름을 마지막 한 칸에서 갈라 '전남광주통합특별시' + '담양군'으로 만든다.
 *
 * 그 이름은 '{시도} {시군구}'라 최장 13자인데, md에서 패널이 컬럼의 3분의 1이라
 * 한 줄에 안 들어가고 '담/양군'처럼 시군구 이름 한가운데가 끊긴다. 줄을 나눠 두면
 * 두 줄을 쓰되 각 줄이 온전한 이름이 된다.
 * 세종처럼 시도와 이름이 같으면 인덱스가 하나만 담으므로 시도 줄이 없다.
 *
 * 앞이 아니라 뒤에서 자른다. 지도에서 고를 수 있는 지역은 전부 공백이 하나라
 * 결과가 같지만, 인덱스에는 '경기도 수원시 장안구'처럼 공백이 둘인 행정구 이름도
 * 있다(지도가 시 단위로 병합해 클릭으로는 닿지 않는다). 그때도 제목은 잎인
 * '장안구'여야 하고 그 위 경로 전체가 윗줄로 가야 계층이 일관된다.
 */
function splitRegionName(full: string): { sido: string | null; name: string } {
  const at = full.lastIndexOf(" ");
  if (at < 0) return { sido: null, name: full };
  return { sido: full.slice(0, at), name: full.slice(at + 1) };
}

/**
 * 기본 코스 탐색 화면(도보)에 코스가 있는 지역 코드. GET /api/regions?type=trail은
 * 도보 경로가 하나도 없는 시군구를 응답에서 제외한다.
 *
 * 지역명과 같은 이유로 한 번만 받아 재사용한다 — 지역을 옮길 때마다 다시 받을 값이 아니고,
 * 패널을 여닫을 때마다 요청이 새로 나가서도 안 된다.
 */
let trailCourseRegionsPromise: Promise<ReadonlySet<string>> | null = null;
function loadTrailCourseRegions(): Promise<ReadonlySet<string>> {
  trailCourseRegionsPromise ??= getRegions("도보")
    .then((rows) => new Set(rows.map((r) => r.region_code)))
    .catch((err) => {
      // 실패한 Promise를 캐시로 남기면 네트워크가 돌아와도 새로고침 전까지 재요청하지 않는다
      trailCourseRegionsPromise = null;
      throw err;
    });
  return trailCourseRegionsPromise;
}

/** 목록을 어느 지역까지 받아왔는지. loading·error는 이 값에서 파생시킨다. */
type Loaded = { regionCode: string; error: UserError | null };

export function SupportRegionView({ regionCode }: Props) {
  // 목록도 어느 지역의 것인지 함께 들고 다닌다. 지역을 바꾸는 동안 직전 목록을
  // 그대로 그리면 새 지역 제목 아래에 남의 제도가 붙고, 그 카드가 눌려서 이 지역과
  // 무관한 상세로 들어간다. 아래 환급 계산기도 이 목록으로 열리고 닫힌다.
  const [listed, setListed] = useState<{
    regionCode: string;
    items: SupportListItem[];
  } | null>(null);
  const items = listed?.regionCode === regionCode ? listed.items : [];
  // 직전 목록의 내용은 쓸 수 없지만 길이는 쓸 수 있다. 새 목록을 기다리는 동안
  // 그만큼 자리를 잡아 두면 패널 높이가 한 줄로 줄었다가 다시 늘어나지 않는다.
  const placeholderCount = listed && listed.regionCode !== regionCode ? listed.items.length : 0;

  const [loaded, setLoaded] = useState<Loaded | null>(null);

  const [searchParams, setSearchParams] = useSearchParams();

  // 아래 목록과 같은 규칙 — 어느 지역의 이름인지 함께 들고, 지금 지역의 것일 때만 쓴다.
  // 이름만 state로 두면 지역을 바꾼 첫 렌더에 직전 지역 이름이 새 목록 위에 남는다
  // (이펙트는 페인트 뒤에 돈다).
  const [named, setNamed] = useState<{ regionCode: string; name: string } | null>(null);
  const regionName = named?.regionCode === regionCode ? named.name : "";

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
        if (!cancelled) setNamed({ regionCode, name: names.get(regionCode) ?? "" });
      })
      // 이름을 못 받으면 헤더에 지역코드를 그대로 보여준다.
      // .catch가 없으면 unhandled rejection까지 같이 난다.
      .catch(() => {
        if (!cancelled) setNamed({ regionCode, name: "" });
      });
    return () => {
      cancelled = true;
    };
  }, [regionCode]);

  // 도보 코스가 없는 지역에도 링크를 열어 두면 '조건에 맞는 코스가 없어요'만 뜨는 목록으로
  // 보낸다(링크는 도보 탭으로 간다). 그 화면의 지역 필터는 코스 보유 지역만 담고 있어서
  // URL의 지역이 표시되지도 않는다 — 사용자는 '전체 지역'이라고 적힌 빈 목록을 보고
  // 왜 비었는지 알 수 없다. 그래서 링크를 먼저 막고 이유를 그 자리에 적는다.
  //
  // null은 '아직 모른다'는 뜻이다. 조회 전이거나 실패했으면 막지 않는다 — 지도 배지와
  // 같은 규칙으로, 모르는 것을 없다고 단정하지 않는다.
  const [trailCourseRegions, setTrailCourseRegions] = useState<ReadonlySet<string> | null>(null);
  const hasTrailCourse = trailCourseRegions ? trailCourseRegions.has(regionCode) : null;

  useEffect(() => {
    let cancelled = false;
    loadTrailCourseRegions()
      .then((codes) => {
        if (!cancelled) setTrailCourseRegions(codes);
      })
      // 못 받으면 링크를 그대로 둔다. 목록이 비어 있을 수는 있어도, 도보 코스가 있는 지역의
      // 링크를 조회 실패 때문에 막아 버리는 쪽이 더 나쁘다.
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchSupportList({ region_code: regionCode })
      .then((next) => {
        if (cancelled) return;
        setListed({ regionCode, items: next });
        setLoaded({ regionCode, error: null });
      })
      .catch((err) => {
        if (cancelled) return;
        setListed({ regionCode, items: [] });
        setLoaded({ regionCode, error: toUserError(err, "지원 제도를 불러오지 못했어요") });
      });
    return () => {
      cancelled = true;
    };
  }, [regionCode]);

  // 이름을 아직 못 받았으면 코드를 그대로 보여준다 (코드에는 공백이 없어 한 줄이 된다)
  const { sido: headerSido, name: headerName } = splitRegionName(regionName || regionCode);

  return (
    <div className="flex flex-col gap-5 md:px-1 md:py-1">
      {/* 지역 헤더 — 닫기는 '뒤로'가 아니라 패널을 없애는 동작이라 우측 X로 둔다
          (주변 정보 상세 시트와 같은 규칙) */}
      <header className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          {/* 시도도 지역명의 일부이므로 시군구와 같은 크기·굵기로 둔다. 작은 회색으로
              깔면 아래 설명문과 같은 층으로 읽혀 제목이 '담양군' 한 줄로 보인다.
              색만 강조색으로 갈라 어디까지가 상위 지역명인지 알아보게 한다. */}
          {/* 두 줄로 쪼갠 건 눈으로 읽을 때 이야기다. 스크린 리더가 보는 textContent는
              '인천광역시옹진군'으로 붙어 버린다(block 경계에 공백을 넣어주는 건 브라우저
              재량이라 기대면 안 된다). 원래 한 줄짜리 이름을 이름표로 따로 준다. */}
          <h2 aria-label={regionName || undefined} className="font-bold text-ink text-[18px]">
            {headerSido && <span className="block text-accent">{headerSido}</span>}
            {headerName}
          </h2>
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

        {/* 첫 로드에는 문구, 지역을 바꾸는 중에는 직전 목록 길이만큼 빈 칸을 둔다.
            직전 목록 자체를 그리면 남의 제도가 이 지역 것으로 읽히고 눌리기까지 한다. */}
        {loading && placeholderCount === 0 && (
          <p className="py-6 text-center text-[13px] text-caption">불러오는 중…</p>
        )}
        {loading && placeholderCount > 0 && (
          <>
            {/* 자리표는 눈으로만 읽히는 신호다. 도형을 aria-hidden으로 감추면
                보조기기 쪽에는 목록이 통째로 사라진 것처럼 들리므로, 대신
                무슨 일이 일어나는지 한 줄로 알린다. */}
            <p role="status" className="sr-only">
              지원 제도를 불러오는 중이에요.
            </p>
            <ul aria-hidden className="flex animate-pulse flex-col gap-3">
              {Array.from({ length: placeholderCount }, (_, i) => (
                <li key={i} className="rounded-lg bg-white/50 p-4">
                  <span className="mb-2 block h-[18px] w-16 rounded-full bg-ink/5" />
                  <span className="block h-[20px] w-3/4 rounded bg-ink/5" />
                  <span className="mt-3 block h-[16px] w-1/2 rounded bg-ink/5" />
                </li>
              ))}
            </ul>
          </>
        )}
        {error && <SupportErrorText error={error} />}
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
      {hasTrailCourse === false ? (
        // 누를 것이 아니라 알리는 것이라 버튼이 아니라 문단으로 둔다. disabled 버튼은
        // Tab 순서에서 빠져, 키보드로 패널을 훑는 사람은 이 문구를 만나지 못한다.
        // 링크 자리를 그대로 차지해 없어진 게 아니라 '갈 곳이 없다'는 것으로 읽히게 하고,
        // accent 채움은 빼 흰 글자 대비 문제(opacity를 걸면 2:1까지 떨어진다)를 피한다.
        <p className="rounded-lg bg-white/60 py-3.5 text-center text-[14px] font-bold text-muted">
          이 지역에는 등록된 도보 코스가 없어요
        </p>
      ) : (
        <Link
          to={`/courses?region=${regionCode}`}
          className="rounded-lg bg-accent py-3.5 text-center text-[14px] font-bold text-white transition-opacity hover:opacity-90"
        >
          이 지역 코스 보러가기 →
        </Link>
      )}
    </div>
  );
}
