import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { KakaoMap } from "./KakaoMap";
import { ErrorNotice, CONNECTION_ERROR_TITLE, CONNECTION_ERROR_DESC } from "./components/ErrorNotice";
import { getCourseDetail } from "./coursesApi";
import type { CourseDetail as CourseDetailData, RouteDetail, RouteType } from "./types";
import { Nearby } from "../nearby";
function formatDuration(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h && m) return `약 ${h}시간 ${m}분`;
  if (h) return `약 ${h}시간`;
  return `약 ${m}분`;
}

const MODE_ICON: Record<RouteType, string> = { 도보: "🚶", 자전거: "🚲" };

// 외부(두루누비) 설명의 <br> 태그를 실제 줄바꿈으로 안전하게 렌더한다.
// dangerouslySetInnerHTML을 쓰지 않으므로 HTML/스크립트 주입 위험이 없다.
function withLineBreaks(text: string) {
  return text.split(/<br\s*\/?>/i).map((seg, i, arr) => (
    <span key={i}>
      {seg}
      {i < arr.length - 1 && <br />}
    </span>
  ));
}

type InfoTab = "course" | "nearby";

// 도보/자전거 선택 카드 (디자인 ModeSelector)
function ModeCard({
  route,
  active,
  onSelect,
}: {
  route: RouteDetail;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      className={`@container flex flex-1 cursor-pointer flex-col gap-1.5 rounded-[14px] p-3.5 text-left transition-colors ${
        active
          ? "border-2 border-accent bg-lavender text-accent shadow-[0px_4px_14px_0px_rgba(0,0,0,0.12)]"
          : "border-[1.5px] border-divider bg-white text-caption"
      }`}
    >
      <span className="text-[14px] font-bold">
        {MODE_ICON[route.route_type]} {route.route_type}
      </span>
      {/* fold처럼 좁은 폭에서 '분'이 줄바꿈되지 않도록 nowrap + 카드 폭에 반응하는 유체 크기 */}
      <span className="whitespace-nowrap text-[clamp(14px,14cqi,22px)] font-bold leading-none">
        {formatDuration(route.estimated_time)}
      </span>
      <span className={`text-[14px] ${active ? "text-ink" : ""}`}>
        {route.distance.toFixed(1)}km
        {route.route_type === "도보" && route.difficulty && ` · ${route.difficulty}`}
      </span>
    </button>
  );
}

export function CourseDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const courseId = Number(id);

  const [detail, setDetail] = useState<CourseDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [routeType, setRouteType] = useState<RouteType>("도보");
  const [infoTab, setInfoTab] = useState<InfoTab>("course");
  const [descExpanded, setDescExpanded] = useState(false);
  const descRef = useRef<HTMLParagraphElement>(null);
  const [descOverflow, setDescOverflow] = useState(false);
  const [sheetExpanded, setSheetExpanded] = useState(true); // 모바일 바텀시트 펼침/접힘
  const [retryTick, setRetryTick] = useState(0); // '다시 시도' 트리거
  const validId = Number.isFinite(courseId);

  useEffect(() => {
    if (!validId) return; // 잘못된 id는 아래 렌더에서 파생 처리
    let cancelled = false;
    getCourseDetail(courseId)
      .then((d) => {
        if (cancelled) return;
        setDetail(d);
        setError(null);
        // 도보 경로가 없으면 보유한 첫 주행방식으로 초기 선택
        if (!d.routes.some((r) => r.route_type === "도보") && d.routes[0]) {
          setRouteType(d.routes[0].route_type);
        }
      })
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : "코스를 불러오지 못했어요"))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [courseId, validId, retryTick]);

  const retry = () => {
    setLoading(true);
    setError(null);
    setRetryTick((t) => t + 1);
  };

  // 설명이 3줄(line-clamp-3)을 실제로 넘칠 때만 '더보기'를 노출한다.
  // 글자 수 추정은 폭, 줄바꿈을 반영 못 해 3줄에 다 들어가도 버튼이 뜨는 문제가 있었다.
  // 접힘 상태에서만 측정 가능(펼치면 clamp가 풀림)하므로 접힘일 때 갱신하고, 폭 변화 시 재측정한다.
  useEffect(() => {
    const el = descRef.current;
    if (!el || descExpanded) return;
    const measure = () => setDescOverflow(el.scrollHeight > el.clientHeight + 1);
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [detail?.description, infoTab, descExpanded]);

  // 디자인 순서: 도보 먼저, 자전거 다음 (API는 알파벳순 bicycle→trail로 내려줌)
  const orderedRoutes = detail
    ? [...detail.routes].sort((a, b) => (a.route_type === "도보" ? -1 : 1) - (b.route_type === "도보" ? -1 : 1))
    : [];
  const activeRoute = detail?.routes.find((r) => r.route_type === routeType) ?? detail?.routes[0];

  // 모바일에선 바텀시트가 지도 하단을 가리므로, 시트 높이만큼 코스를 위로 올려 fit.
  // 데스크톱은 지도가 시트와 겹치지 않아 0. (시트 접기/펼치기 시 재fit)
  const mapBottomInset =
    typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches
      ? Math.round(window.innerHeight * (sheetExpanded ? 0.72 : 0.38))
      : 0;

  return (
    // 모바일: 지도 풀블리드 + 하단 바텀시트 / md+: 좌 패널 + 우 지도
    <div className="relative flex h-dvh w-full flex-col overflow-hidden bg-white md:flex-row">
      {/* 지도 (z-0으로 stacking context를 가둬 Kakao 내부 레이어가 시트를 덮지 않게 함) */}
      <div className="absolute inset-0 z-0 md:relative md:order-2 md:h-full md:min-w-0 md:flex-1">
        <KakaoMap
          courseId={Number.isFinite(courseId) ? courseId : undefined}
          routeType={routeType}
          bottomInset={mapBottomInset}
        />
      </div>

      {/* 패널 (모바일=바텀시트, md+=좌측 컬럼)
        md:relative 유지 필요: 주변 정보 탭 안의 SpotDetailSheet(상세 시트)가 absolute로 위치를 잡는데,
        이 section이 relative여야 시트가 이 패널 안에서만 뜸.
        static으로 바꾸면 시트가 기준을 잃고 지도까지 덮는 전체화면으로 퍼져버림. */}
      <section
        className={`absolute inset-x-0 bottom-0 z-10 flex flex-col overflow-hidden rounded-t-[24px] bg-white shadow-[0px_-6px_14px_0px_rgba(0,0,0,0.16)] transition-[max-height] duration-300 md:relative md:order-1 md:h-full md:max-h-none md:basis-[46%] md:rounded-none md:shadow-none lg:basis-[44%] ${
          sheetExpanded ? "max-h-[72%]" : "max-h-[38%]"
        }`}
      >
        {/* 바텀시트 핸들 (모바일 전용) — 탭하면 시트를 접어 지도(전체 코스)를 넓게 본다 */}
        <button
          type="button"
          onClick={() => setSheetExpanded((v) => !v)}
          aria-label={sheetExpanded ? "코스 정보 접기" : "코스 정보 펼치기"}
          className="shrink-0 cursor-pointer pt-2.5 pb-1 md:hidden"
        >
          <span className="mx-auto block h-[5px] w-11 rounded-full bg-divider" />
        </button>

        {loading && validId ? (
          <p className="py-16 text-center text-[14px] text-caption">코스를 불러오는 중…</p>
        ) : !validId ? (
          <ErrorNotice
            title="잘못된 코스예요"
            description="존재하지 않는 코스 주소예요."
            onBack={() => navigate(-1)}
          />
        ) : error ? (
          // 조회 실패(연결/서버) — 재시도 + 목록으로
          <ErrorNotice
            title={CONNECTION_ERROR_TITLE}
            description={CONNECTION_ERROR_DESC}
            onRetry={retry}
            onBack={() => navigate(-1)}
          />
        ) : !detail ? (
          <ErrorNotice title="코스를 찾을 수 없어요" onBack={() => navigate(-1)} />
        ) : (
          <>
            {/* 스크롤 영역 (모바일은 콘텐츠 높이에 맞춰 시트가 줄어 따라가기 버튼과 붙는다) */}
            <div className="min-h-0 overflow-y-auto px-5 pb-6 pt-3 md:flex-1">
              {/* 뒤로 + 제목 + 주소 */}
              <button
                type="button"
                onClick={() => navigate(-1)}
                aria-label="뒤로"
                className="cursor-pointer text-[20px] leading-none text-ink"
              >
                ←
              </button>
              <h1 className="mt-2 font-bold text-ink text-[20px]">{detail.title}</h1>
              <p className="mt-1.5 text-[14px] text-caption">📍 {detail.start_address}</p>

              {/* 코스 정보 / 주변 정보 토글 */}
              <div
                role="tablist"
                className="mt-4 flex gap-1 rounded-2xl bg-lavender p-1"
              >
                {([["course", "코스 정보"], ["nearby", "주변 정보"]] as const).map(([key, label]) => {
                  const active = infoTab === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => setInfoTab(key)}
                      className={`flex-1 cursor-pointer rounded-[14px] py-2 text-[16px] font-bold transition-colors ${
                        active ? "bg-white text-ink shadow-[0px_2px_4px_0px_rgba(0,0,0,0.12)]" : "text-caption"
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>

              {infoTab === "course" ? (
                <div className="mt-4">
                  {detail.description && (
                    <div>
                      {/* 모바일: 3줄로 접고 더보기 / 데스크톱(md+): 공간이 넉넉해 전체 표시 */}
                      <p
                        ref={descRef}
                        className={`text-[14px] leading-relaxed text-ink md:line-clamp-none ${
                          descExpanded ? "" : "line-clamp-3"
                        }`}
                      >
                        {withLineBreaks(detail.description)}
                      </p>
                      {(descOverflow || descExpanded) && (
                        <button
                          type="button"
                          onClick={() => setDescExpanded((v) => !v)}
                          className="mt-1 cursor-pointer text-[13px] font-bold text-accent md:hidden"
                        >
                          {descExpanded ? "접기" : "더보기"}
                        </button>
                      )}
                    </div>
                  )}

                  {/* 코스 대표 사진 — 원본 비율 그대로(세로 전부 노출, 잘림/회색 박스 없음) */}
                  {detail.image_url ? (
                    <img
                      src={detail.image_url}
                      alt={detail.title}
                      className="mt-3 w-full rounded-[14px]"
                    />
                  ) : (
                    <div className="mt-3 flex aspect-[16/9] flex-col items-center justify-center gap-1 rounded-[14px] bg-mapbg text-caption">
                      <span className="text-[24px]" aria-hidden="true">
                        🏞️
                      </span>
                      <span className="text-[13px]">코스 대표 사진</span>
                    </div>
                  )}

                  {/* 도보 / 자전거 선택 */}
                  <div className="mt-4 flex gap-3">
                    {orderedRoutes.map((r) => (
                      <ModeCard
                        key={r.route_type}
                        route={r}
                        active={r.route_type === routeType}
                        onSelect={() => setRouteType(r.route_type)}
                      />
                    ))}
                  </div>
                </div>
              ) : (
                <div className="mt-4">
                  <Nearby courseId={courseId} />
                </div>
              )}
            </div>

            {/* 따라가기 (하단 고정) */}
            {infoTab === "course" && (
            <div
              className="shrink-0 px-5 pt-3"
              style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}
            >
              <button
                type="button"
                className="flex h-14 w-full cursor-pointer items-center justify-center gap-2 rounded-[14px] bg-accent text-[15px] font-bold text-lavender"
              >
                {activeRoute ? MODE_ICON[activeRoute.route_type] : "🚶"} 따라가기
              </button>
            </div>
           )}
          </>
        )}
      </section>
    </div>
  );
}
