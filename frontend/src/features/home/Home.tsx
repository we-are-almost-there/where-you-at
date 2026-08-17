import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import {
  Route as RouteIcon,
  Trophy,
  Gift,
  Bike,
  Pause,
  Play,
  Plus,
  ChevronLeft,
  ChevronRight,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import AppHeader from "../../components/layout/AppHeader";
import {
  FEATURED_REGIONS,
  fetchFeaturedCourses,
  fetchNearbyCourses,
  fetchUpcomingRaces,
} from "./homeApi";
import type { CourseItem, UpcomingRace } from "./homeApi";

/**
 * 혜택 배너는 사진이 아니라 금액이 주인공이라 배경 이미지가 필요 없다.
 * benefit 항목은 support 테이블(support_title·max_amount·agency)과
 * support_schedule(status·apply_end)에서 그대로 뽑아 만들 수 있는 형태로 맞춰뒀다.
 */
type Banner = {
  to: string;
  /** 목업용 배경 — 코스 배너만 나중에 <img src>로 교체 */
  background: string;
} & (
  | {
      kind: "benefit";
      /** support_schedule.status + apply_end 기준 D-day. 실제로는 계산값 */
      status: string;
      maxAmount: number;
      title: string;
      agency: string;
    }
  | { kind: "course"; tag: string; title: string; subtitle: string }
);

const BANNERS: Banner[] = [
  {
    kind: "benefit",
    status: "접수중 · D-12",
    maxAmount: 140000,
    title: "대한민국 반값여행",
    agency: "한국관광공사",
    to: "/support",
    background: "bg-[linear-gradient(135deg,#2a2358_0%,#6c5ce7_55%,#a394f0_100%)]",
  },
  {
    kind: "course",
    tag: "해파랑길",
    title: "동해를 따라 걷는\n770km 해파랑길",
    subtitle: "지금 코스 탐색에서 확인하세요",
    to: "/courses",
    background: "bg-[linear-gradient(135deg,#1f6f5c_0%,#3fa37f_55%,#7fc9a3_100%)]",
  },
  {
    kind: "benefit",
    status: "마감임박 · D-5",
    maxAmount: 70000,
    title: "2026 여름맞이 숙박세일 페스타",
    agency: "한국관광공사",
    to: "/support",
    background: "bg-[linear-gradient(135deg,#7a2b1d_0%,#d2542f_55%,#f0916a_100%)]",
  },
  {
    kind: "benefit",
    status: "접수중",
    maxAmount: 30000,
    title: "디지털 관광주민증",
    agency: "한국관광공사",
    to: "/support",
    background: "bg-[linear-gradient(135deg,#0e4a52_0%,#1c8f96_55%,#6fcfd0_100%)]",
  },
  {
    kind: "course",
    tag: "국토종주",
    title: "자전거로 국토를\n가로지르는 633km",
    subtitle: "인증센터 코스 모아보기",
    to: "/courses",
    background: "bg-[linear-gradient(135deg,#123a6b_0%,#2f7fc1_55%,#7ec2e8_100%)]",
  },
];

/** 140000 → "최대 14만원" */
function formatMaxAmount(won: number) {
  return `최대 ${(won / 10000).toLocaleString("ko-KR")}만원`;
}

interface MenuItem {
  label: string;
  to: string | null; // null이면 비활성화(준비중)
  icon: LucideIcon;
  /** 아이콘 글리프에 입힐 그라데이션 id — 배경 원은 통일하고 글리프만 색을 달리한다 */
  gradientId: string;
  /** [시작색, 중간색, 끝색] */
  gradientStops: [string, string, string];
}

const MENU_ITEMS: MenuItem[] = [
  {
    label: "코스 탐색",
    to: "/courses",
    icon: RouteIcon,
    gradientId: "menu-gradient-course",
    gradientStops: ["#b4a5ff", "#7c6cf0", "#5b47d6"],
  },
  {
    label: "대회 행사",
    to: "/races",
    icon: Trophy,
    gradientId: "menu-gradient-race",
    gradientStops: ["#8fd8ff", "#4aa8f5", "#2f7fe0"],
  },
  {
    label: "방문 혜택",
    to: "/support",
    icon: Gift,
    gradientId: "menu-gradient-support",
    gradientStops: ["#8bf0d8", "#3ecfb0", "#1fae90"],
  },
  {
    label: "자전거 대여",
    to: null,
    icon: Bike,
    gradientId: "menu-gradient-bike",
    gradientStops: ["#d5d2e0", "#bcb8cb", "#a5a1b5"],
  },
];

/** 오늘 자정 기준 남은 일수. 오늘이면 0 */
function daysUntil(startDate: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(`${startDate}T00:00:00`);
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

/** 배포 전 각 데이터셋 원본에서 공공누리 유형을 확인해 "공공누리 제N유형"까지 표기해야 한다 */
const DATA_SOURCES = [
  { label: "걷기여행길 코스·GPX", provider: "한국관광공사 두루누비" },
  { label: "관광·주변 정보", provider: "한국관광공사 TourAPI" },
  { label: "국토종주 자전거길", provider: "행정안전부" },
  { label: "지도", provider: "카카오" },
];

const SLIDE_INTERVAL_MS = 4000;

function SectionHeader({ title, caption }: { title: string; caption?: string }) {
  return (
    <div className="mb-3">
      <h2 className="text-[17px] font-bold text-ink">{title}</h2>
      {caption && <p className="mt-0.5 text-[13px] text-caption">{caption}</p>}
    </div>
  );
}

function CourseGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="-mx-4 flex gap-3 overflow-hidden px-4 md:mx-0 md:grid md:grid-cols-4 md:px-0">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="w-[clamp(9rem,40vw,15rem)] shrink-0 md:w-auto">
          <span className="mb-2 block aspect-[4/3] animate-pulse rounded-xl bg-mapbg" />
          <span className="mb-1 block h-4 w-4/5 animate-pulse rounded bg-mapbg" />
          <span className="block h-3 w-1/2 animate-pulse rounded bg-mapbg" />
        </div>
      ))}
    </div>
  );
}

/**
 * 코스 카드 4장.
 * 모바일은 4장을 한 줄에 못 넣으므로 가로 스크롤(옆 카드가 걸쳐 보임),
 * 데스크톱은 4열 그리드로 가로폭을 꽉 채운다.
 */
function CourseGrid({ items }: { items: CourseItem[] }) {
  return (
    // -mx-4 px-4로 섹션 여백을 뚫고 화면 끝까지 스크롤되게 한다.
    // 다음 카드가 화면 가장자리에 걸쳐 보여야 "옆으로 넘길 수 있다"가 읽힌다.
    <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] md:mx-0 md:grid md:grid-cols-4 md:overflow-x-visible md:px-0 [&::-webkit-scrollbar]:hidden">
      {items.map((item) => (
        <Link
          key={item.id}
          to={`/courses/${item.id}`}
          className="w-[clamp(9rem,40vw,15rem)] shrink-0 md:w-auto"
        >
          <span className="relative mb-2 block aspect-[4/3] overflow-hidden rounded-xl bg-mapbg">
            {/* 코스명이 바로 아래에 있어 alt는 비운다(중복 읽힘 방지).
                로드 실패 시 img만 감춰 뒤의 회색 배경이 그대로 폴백이 된다. */}
            {item.imageUrl && (
              <img
                src={item.imageUrl}
                alt=""
                className="size-full object-cover"
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                }}
              />
            )}

            {/* 내 위치에서의 거리는 코스 길이와 헷갈리지 않게 썸네일 위로 올린다 */}
            {item.highlight && (
              <span className="absolute left-2 top-2 rounded-full bg-black/55 px-2 py-0.5 text-[13px] font-semibold text-white backdrop-blur-sm">
                {item.highlight}
              </span>
            )}
          </span>

          <p className="truncate text-sm font-semibold text-ink">{item.name}</p>
          <p className="mt-0.5 truncate text-[13px] text-caption">
            {item.landmarks ? (
              // 좁은 카드에 이름을 여러 개 늘어놓으면 잘려서 안 보인다.
              // 첫 곳만 쓰고 나머지는 개수로 알린다.
              <span className="text-accent">
                {item.landmarks[0]}
                {item.landmarks.length > 1 && ` 외 ${item.landmarks.length - 1}곳`}
              </span>
            ) : (
              item.region
            )}
          </p>

          <p className="mt-1 truncate text-[13px]">
            <span className="text-figure">{item.lengthKm}km</span>
            {item.level && (
              <>
                <span className="mx-1 text-divider">·</span>
                <span className="text-caption">{item.level}</span>
              </>
            )}
          </p>
        </Link>
      ))}
    </div>
  );
}

/** 배너 카드 내용 — 캐러셀과 전체보기 모달이 함께 쓴다 */
function BannerCard({ banner, reserveControls = false }: { banner: Banner; reserveControls?: boolean }) {
  return (
    <>
      <div className={`size-full ${banner.background}`} />

      {/* 텍스트 가독성용 하단 그라데이션 */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/25 to-transparent" />

      <div
        className={`absolute inset-x-0 bottom-0 flex flex-col items-start gap-2 p-[clamp(1rem,4cqw,2rem)] ${
          // 캐러셀에서는 우하단 컨트롤과 겹치지 않게 자리를 비워둔다
          reserveControls ? "pe-[8rem] md:pe-[clamp(2rem,20cqw,14rem)]" : ""
        }`}
      >
        <span className="rounded-full bg-white/90 px-2.5 py-1 text-[13px] font-semibold text-ink">
          {banner.kind === "benefit" ? banner.status : banner.tag}
        </span>

        {banner.kind === "benefit" ? (
          <>
            {/* 혜택 배너는 금액이 헤드라인 */}
            <p className="text-[clamp(1.75rem,7cqw,3rem)] font-bold leading-none text-white">
              {formatMaxAmount(banner.maxAmount)}
            </p>
            <h3 className="text-[clamp(1rem,3cqw,1.375rem)] font-semibold leading-snug text-white">
              {banner.title}
            </h3>
            <p className="text-[clamp(0.8125rem,2.4cqw,0.9375rem)] text-white/70">{banner.agency}</p>
          </>
        ) : (
          <>
            <h3 className="whitespace-pre-line text-[clamp(1.125rem,4cqw,1.875rem)] font-bold leading-snug text-white">
              {banner.title}
            </h3>
            <p className="text-[clamp(0.8125rem,2.4cqw,0.9375rem)] text-white/75">
              {banner.subtitle}
            </p>
          </>
        )}
      </div>
    </>
  );
}

function BannerGalleryModal({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-white">
      <header className="sticky top-0 flex h-14 items-center gap-3 border-b border-divider bg-white px-4">
        <button type="button" onClick={onClose} aria-label="닫기" className="cursor-pointer text-ink">
          <X size={22} strokeWidth={1.75} />
        </button>
        <span className="text-[17px] font-bold text-ink">전체보기</span>
      </header>

      <div className="mx-auto grid w-full max-w-5xl grid-cols-[repeat(auto-fill,minmax(340px,1fr))] gap-4 px-4 py-5">
        {BANNERS.map((banner) => (
          <Link
            key={banner.title}
            to={banner.to}
            onClick={onClose}
            className="relative aspect-[16/9] overflow-hidden rounded-xl [container-type:inline-size]"
          >
            <BannerCard banner={banner} />
          </Link>
        ))}
      </div>
    </div>
  );
}

/**
 * 무한 루프를 위해 배너를 3벌 이어 붙이고 가운데 벌에서 시작한다.
 * 스크롤이 멈췄을 때 양 끝 벌에 있으면 한 벌 폭만큼 순간이동시켜 항상 가운데로 되돌린다.
 */
const LOOPED_BANNERS = [...BANNERS, ...BANNERS, ...BANNERS];
const LOOP_START = BANNERS.length;

function BannerCarousel({ onOpenGallery }: { onOpenGallery: () => void }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const settleTimerRef = useRef<number | undefined>(undefined);
  const [current, setCurrent] = useState(LOOP_START);
  const [isPaused, setIsPaused] = useState(false);

  /** 중앙에 가장 가까운 슬라이드 인덱스 */
  const findCentered = useCallback((track: HTMLDivElement) => {
    const trackRect = track.getBoundingClientRect();
    const trackCenter = trackRect.left + trackRect.width / 2;

    let nearest = 0;
    let minDistance = Infinity;
    Array.from(track.children).forEach((child, index) => {
      const rect = child.getBoundingClientRect();
      const distance = Math.abs(rect.left + rect.width / 2 - trackCenter);
      if (distance < minDistance) {
        minDistance = distance;
        nearest = index;
      }
    });
    return nearest;
  }, []);

  /**
   * 트랙만 가로로 움직인다.
   * scrollIntoView는 배너가 화면 밖에 있으면 페이지를 세로로도 끌어올리기 때문에 쓰지 않는다.
   */
  const scrollToIndex = useCallback((index: number, behavior: ScrollBehavior = "smooth") => {
    const track = trackRef.current;
    const slide = track?.children[index];
    if (!track || !slide) return;

    const trackRect = track.getBoundingClientRect();
    const slideRect = slide.getBoundingClientRect();
    const delta =
      slideRect.left + slideRect.width / 2 - (trackRect.left + trackRect.width / 2);
    track.scrollTo({ left: track.scrollLeft + delta, behavior });
  }, []);

  // 가운데 벌에서 시작
  useEffect(() => {
    scrollToIndex(LOOP_START, "instant");
  }, [scrollToIndex]);

  const handleScroll = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;

    const centered = findCentered(track);
    setCurrent(centered);

    // 스크롤이 멎은 뒤에 위치를 되돌려야 튐이 안 보인다
    window.clearTimeout(settleTimerRef.current);
    settleTimerRef.current = window.setTimeout(() => {
      if (centered >= LOOP_START && centered < LOOP_START * 2) return;

      const first = track.children[0].getBoundingClientRect().left;
      const setWidth = track.children[LOOP_START].getBoundingClientRect().left - first;
      track.scrollLeft += centered < LOOP_START ? setWidth : -setWidth;
      setCurrent(centered < LOOP_START ? centered + LOOP_START : centered - LOOP_START);
    }, 150);
  }, [findCentered]);

  useEffect(() => () => window.clearTimeout(settleTimerRef.current), []);

  useEffect(() => {
    if (isPaused) return;
    const timer = setTimeout(() => scrollToIndex(current + 1), SLIDE_INTERVAL_MS);
    return () => clearTimeout(timer);
  }, [current, isPaused, scrollToIndex]);

  return (
    // 트랙은 화면 폭까지 쓰되(양옆 배너가 화면 끝까지 이어지게), 좌우 패딩을 콘텐츠 라인에
    // 맞춰서 가운데 배너의 좌우 모서리가 아래 섹션들과 정확히 같은 선에 놓이게 한다.
    // 패딩 = (트랙폭 - 콘텐츠폭 72rem) / 2 + 섹션 좌우 여백 1rem
    <div className="relative">
      <div
        ref={trackRef}
        onScroll={handleScroll}
        className="flex snap-x snap-mandatory gap-2 overflow-x-auto px-[max(1rem,calc((100%-72rem)/2+1rem))] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {LOOPED_BANNERS.map((banner, index) => (
          <Link
            key={`${banner.title}-${index}`}
            to={banner.to}
            className="relative aspect-[16/10] w-full shrink-0 snap-center overflow-hidden rounded-2xl [container-type:inline-size] md:aspect-[24/9]"
          >
            <BannerCard banner={banner} reserveControls />
          </Link>
        ))}
      </div>

      {/* 인덱스·재생 제어·전체보기 */}
      <div className="absolute bottom-[clamp(1rem,4vw,2rem)] right-[calc(max(1rem,calc((100%-72rem)/2+1rem))+clamp(1rem,4vw,2rem))] flex items-center gap-1.5 text-white">
        <div className="flex h-7 items-center rounded-full bg-black/40 px-1 backdrop-blur-sm">
          {/* 화살표는 스와이프가 안 되는 포인터 환경(데스크톱)에서만 필요하다 */}
          <button
            type="button"
            onClick={() => scrollToIndex(current - 1)}
            aria-label="이전 배너"
            className="hidden size-6 cursor-pointer items-center justify-center md:flex"
          >
            <ChevronLeft size={15} />
          </button>
          <span className="px-1.5 text-[13px] tabular-nums">
            <span className="font-semibold">{(current % BANNERS.length) + 1}</span>
            <span className="text-white/60"> / {BANNERS.length}</span>
          </span>
          <button
            type="button"
            onClick={() => scrollToIndex(current + 1)}
            aria-label="다음 배너"
            className="hidden size-6 cursor-pointer items-center justify-center md:flex"
          >
            <ChevronRight size={15} />
          </button>
        </div>

        <button
          type="button"
          onClick={() => setIsPaused((paused) => !paused)}
          aria-label={isPaused ? "배너 자동 전환 재생" : "배너 자동 전환 일시정지"}
          className="flex size-7 cursor-pointer items-center justify-center rounded-full bg-black/40 backdrop-blur-sm"
        >
          {isPaused ? (
            <Play size={13} fill="currentColor" />
          ) : (
            <Pause size={13} fill="currentColor" />
          )}
        </button>

        <button
          type="button"
          onClick={onOpenGallery}
          aria-label="배너 전체보기"
          className="flex size-7 cursor-pointer items-center justify-center rounded-full bg-black/40 backdrop-blur-sm"
        >
          <Plus size={15} />
        </button>
      </div>
    </div>
  );
}

/** lucide 아이콘의 stroke에 물릴 그라데이션 정의 (화면에는 보이지 않음) */
function MenuIconGradients() {
  return (
    <svg aria-hidden className="absolute size-0">
      <defs>
        {MENU_ITEMS.map((item) => (
          <linearGradient key={item.gradientId} id={item.gradientId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={item.gradientStops[0]} />
            <stop offset="55%" stopColor={item.gradientStops[1]} />
            <stop offset="100%" stopColor={item.gradientStops[2]} />
          </linearGradient>
        ))}
      </defs>
    </svg>
  );
}

function MenuIcon({ item }: { item: MenuItem }) {
  const Icon = item.icon;
  return (
    <span className="relative flex size-[clamp(4rem,17vw,5rem)] items-center justify-center rounded-full bg-lavender">
      {/* 글리프 뒤에 깔리는 옅은 그림자 — 살짝 떠 보이게 한다 */}
      <Icon
        size={30}
        strokeWidth={2.2}
        className="absolute translate-y-[1.5px] text-black/12 blur-[1.5px]"
      />
      <Icon
        size={30}
        strokeWidth={2.2}
        className="relative"
        style={{ stroke: `url(#${item.gradientId})` }}
      />
    </span>
  );
}

export default function Home() {
  const [isGalleryOpen, setIsGalleryOpen] = useState(false);
  const [races, setRaces] = useState<UpcomingRace[]>([]);
  const [isRaceLoading, setIsRaceLoading] = useState(true);
  const [nearby, setNearby] = useState<CourseItem[]>([]);
  const [isNearbyLoading, setIsNearbyLoading] = useState(true);
  const [isNearbyFallback, setIsNearbyFallback] = useState(false);
  const [featured, setFeatured] = useState<CourseItem[]>([]);
  const [isFeaturedLoading, setIsFeaturedLoading] = useState(true);

  // 두 섹션에 같은 코스가 겹쳐 보이지 않게, 주변 코스는 여유 있게 받아 관광지 섹션에
  // 쓰인 코스를 빼고 4개만 남긴다. 두 요청은 동시에 출발하고 합칠 때만 서로를 기다린다.
  // 관광지는 먼저 끝나는 대로 그린다 — 주변은 위치 권한 응답까지 기다려야 해서 느리다.
  useEffect(() => {
    let alive = true;

    const featuredPromise = fetchFeaturedCourses().catch(() => [] as CourseItem[]);

    featuredPromise.then((list) => {
      if (!alive) return;
      setFeatured(list);
      setIsFeaturedLoading(false);
    });

    const nearbyPromise = fetchNearbyCourses(8).catch(() => ({
      items: [] as CourseItem[],
      isFallback: true,
    }));

    Promise.all([featuredPromise, nearbyPromise]).then(([featuredList, nearbyResult]) => {
      if (!alive) return;
      const usedIds = new Set(featuredList.map((course) => course.id));
      setNearby(nearbyResult.items.filter((course) => !usedIds.has(course.id)).slice(0, 4));
      setIsNearbyFallback(nearbyResult.isFallback);
      setIsNearbyLoading(false);
    });

    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    fetchUpcomingRaces(3)
      // 실패해도 홈 전체가 죽으면 안 되므로 빈 목록으로 두고 섹션만 감춘다
      .catch(() => [] as UpcomingRace[])
      .then((list) => {
        if (!alive) return;
        setRaces(list);
        setIsRaceLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="flex min-h-dvh flex-col">
      <AppHeader />

      <section className="w-full pt-3">
        <BannerCarousel onOpenGallery={() => setIsGalleryOpen(true)} />
      </section>

      {/* 메뉴 바로가기 */}
      <section className="relative mx-auto flex w-full max-w-6xl justify-center gap-[clamp(1rem,6vw,4rem)] px-4 py-[clamp(1.5rem,5vw,2.5rem)]">
        <MenuIconGradients />
        {MENU_ITEMS.map((item) => {
          const content = (
            <>
              <MenuIcon item={item} />
              <span className={`text-[13px] ${item.to ? "text-ink" : "text-caption"}`}>
                {item.label}
              </span>
            </>
          );

          // 아이템 폭을 원 지름에 고정해야 라벨 길이와 무관하게 원 간격이 일정하다
          const baseClass =
            "flex w-[clamp(4rem,17vw,5rem)] shrink-0 flex-col items-center gap-2 text-center";

          return item.to ? (
            <Link key={item.label} to={item.to} className={baseClass}>
              {content}
            </Link>
          ) : (
            <span key={item.label} className={`${baseClass} cursor-not-allowed`}>
              {content}
              <span className="-mt-1.5 text-[13px] text-caption">준비중</span>
            </span>
          );
        })}
      </section>

      {/* ① 위치 축 */}
      {(isNearbyLoading || nearby.length > 0) && (
        <section className="mx-auto w-full max-w-6xl px-4 pb-[clamp(2rem,6vw,3rem)]">
          <SectionHeader
            title="주변으로 떠나볼까?"
            caption={
              isNearbyFallback
                ? "위치를 확인할 수 없어 전체 코스를 보여드려요"
                : "현재 위치에서 가까운 순"
            }
          />
          {isNearbyLoading ? <CourseGridSkeleton /> : <CourseGrid items={nearby} />}
        </section>
      )}

      {/* ② 관광지 축 */}
      {(isFeaturedLoading || featured.length > 0) && (
        <section className="mx-auto w-full max-w-6xl px-4 pb-[clamp(2rem,6vw,3rem)]">
          <SectionHeader
            title="유명 관광지에서 달려보자!"
            caption={FEATURED_REGIONS.map((region) => region.label).join(" · ")}
          />
          {isFeaturedLoading ? <CourseGridSkeleton /> : <CourseGrid items={featured} />}
        </section>
      )}

      {/* 다가오는 대회 — 대회가 하나도 없으면 섹션째 감춘다 */}
      {(isRaceLoading || races.length > 0) && (
      <section className="mx-auto w-full max-w-6xl px-4 pb-[clamp(2rem,6vw,3rem)]">
        <SectionHeader title="다가오는 대회" caption="가까운 날짜순" />

        {isRaceLoading ? (
          <div className="grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] gap-3">
            <span className="h-24 animate-pulse rounded-xl bg-mapbg" />
          </div>
        ) : (
        <ul className="grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] gap-3">
          {races.map((race) => {
            const [, month, day] = race.startDate.split("-");
            const remainingDays = daysUntil(race.startDate);

            return (
              <li key={race.id}>
                <Link
                  to="/races"
                  className="flex items-center gap-3 rounded-xl border border-divider p-3 transition-shadow hover:shadow-md"
                >
                  {/* 1순위: 언제 — 날짜 블록을 채워서 가장 먼저 눈에 들어오게 */}
                  {/* 높이를 오른쪽 3줄에 맞춰야 D-day가 배지 위로 삐져나오지 않는다 */}
                  <span className="flex size-[4.5rem] shrink-0 flex-col items-center justify-center rounded-lg bg-accent leading-none text-white">
                    <span className="text-[13px] font-medium text-white/85">{Number(month)}월</span>
                    <span className="mt-0.5 text-2xl font-bold">{Number(day)}</span>
                  </span>

                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    {/* 1순위: 얼마나 남았나. 종목은 분류값이라 본문 흐름에서 빼 오른쪽 끝에 고정 */}
                    <span className="flex items-center justify-between gap-2">
                      <span className="text-base font-bold text-accent">
                        {remainingDays === 0 ? "D-DAY" : `D-${remainingDays}`}
                      </span>
                      {race.type && (
                        <span className="shrink-0 rounded border border-divider px-1.5 py-0.5 text-[13px] text-caption">
                          {race.type}
                        </span>
                      )}
                    </span>
                    {/* 2순위: 무슨 대회 */}
                    <span className="truncate font-semibold text-ink">{race.name}</span>
                    {/* 3순위: 어디서 */}
                    {race.location && (
                      <span className="truncate text-[13px] text-caption">{race.location}</span>
                    )}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
        )}
      </section>
      )}

      <footer className="mt-auto border-t border-divider">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-6">
          <div className="flex flex-col gap-1.5">
            <p className="text-sm font-bold text-ink">어디까지왔니</p>
            <p className="text-[13px] leading-relaxed text-caption">
              전국 걷기여행길과 자전거길을 지도에서 찾고, 실시간으로 따라가며 기록을 남기는
              서비스입니다. 인구감소지역을 방문하면 받을 수 있는 지원금도 함께 안내합니다.
            </p>
          </div>

          <div className="flex flex-col gap-1 border-t border-divider pt-4 text-[13px] text-caption">
            {DATA_SOURCES.map((source) => (
              <p key={source.label}>
                {source.label} — {source.provider}
              </p>
            ))}
            <p className="mt-2">© 2026 WHERE YOU AT</p>
          </div>
        </div>
      </footer>

      {isGalleryOpen && <BannerGalleryModal onClose={() => setIsGalleryOpen(false)} />}
    </div>
  );
}
