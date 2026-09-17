import { useCallback, useEffect, useId, useRef, useState } from "react";
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
import { MAIN_CONTENT_ID } from "../../components/layout/mainContent";
import { useDocumentTitle } from "../../lib/useDocumentTitle";
import { smoothScrollBehavior, usePrefersReducedMotion } from "../../lib/motion";
import Footer from "../../components/layout/Footer";
import { fetchFeaturedCourses, fetchNearbyCourses, fetchUpcomingRaces } from "./homeApi";
import type { CourseItem, UpcomingRace } from "./homeApi";
import { BANNERS } from "./banners";
import type { Banner } from "./banners";

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
    to: "/bicycle-facilities",
    icon: Bike,
    gradientId: "menu-gradient-bike",
    gradientStops: ["#ffc98f", "#ff9f4a", "#f07a1f"],
  },
];

/** 오늘 자정 기준 남은 일수. 오늘이면 0, 이미 시작했으면 음수 */
function daysUntil(startDate: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(`${startDate}T00:00:00`);
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

/**
 * 여러 날 열리는 대회는 시작일이 지나도 종료 전이면 목록에 남는다(end_date 기준 필터).
 * 이때 남은 일수가 음수라 "D--7" 같은 문자열이 나오므로 따로 처리한다.
 */
function formatDDay(startDate: string) {
  const remainingDays = daysUntil(startDate);
  if (remainingDays > 0) return `D-${remainingDays}`;
  return remainingDays === 0 ? "D-DAY" : "진행중";
}

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
          <span className="mb-2 block aspect-[4/3] animate-pulse motion-reduce:animate-none rounded-xl bg-mapbg" />
          <span className="mb-1 block h-4 w-4/5 animate-pulse motion-reduce:animate-none rounded bg-mapbg" />
          <span className="block h-3 w-1/2 animate-pulse motion-reduce:animate-none rounded bg-mapbg" />
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
    //
    // 스크롤바는 스와이프가 되는 터치 기기에서만 숨긴다. 마우스뿐인 환경에서는
    // 세로 휠로 가로 스크롤이 안 되므로 스크롤바를 없애면 넘길 방법이 사라진다.
    // (배너 트랙은 화살표가 그 역할을 하므로 거기서는 계속 숨긴다)
    <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:thin] md:mx-0 md:grid md:grid-cols-4 md:overflow-x-visible md:px-0 pointer-coarse:[scrollbar-width:none] pointer-coarse:[&::-webkit-scrollbar]:hidden">
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

            {/* 내 위치에서의 거리는 코스 길이와 헷갈리지 않게 썸네일 위로 올린다.
                스타일은 코스 목록 카드의 '방문 혜택 지역' 뱃지와 맞춘다. */}
            {item.highlight && (
              <span className="absolute left-2 top-2 rounded-md bg-white px-2 py-1 text-[13px] font-semibold leading-none text-accent shadow-[0px_1px_4px_0px_rgba(0,0,0,0.18)]">
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
function BannerCard({
  banner,
  reserveControls = false,
  priority = false,
}: {
  banner: Banner;
  reserveControls?: boolean;
  priority?: boolean;
}) {
  return (
    <>
      {/* 로드 실패 시 img만 감춰 뒤의 그라데이션이 그대로 폴백이 된다 */}
      <div className={`size-full ${banner.background}`} />
      <img
        src={banner.src}
        srcSet={banner.srcSet}
        sizes="(min-width: 1200px) 1120px, 100vw"
        alt=""
        loading={priority ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : "auto"}
        className="absolute inset-0 size-full object-cover"
        onError={(e) => {
          e.currentTarget.style.display = "none";
        }}
      />

      {/* 세 배너 모두 왼쪽이 밝아서(노을·바다·민트) 흰 글씨가 그냥은 안 읽힌다.
          하단 전체를 덮으면 사진이 탁해지므로 글씨가 놓이는 왼쪽만 눌러 대비를 만든다. */}
      {/* 부제(작은 글자)까지 사진 밝기와 상관없이 읽히도록 글자가 놓이는 왼쪽 아래를 한 번 더 누른다. */}
      <div className="absolute inset-0 bg-gradient-to-r from-black/60 via-black/30 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/45 to-transparent" />

      <div
        className={`absolute inset-x-0 bottom-0 flex flex-col items-start gap-2 p-[clamp(1rem,4cqw,2rem)] ${
          // 캐러셀에서는 우하단 컨트롤과 겹치지 않게 자리를 비워둔다
          reserveControls ? "pe-[8rem] md:pe-[clamp(2rem,20cqw,14rem)]" : ""
        }`}
      >
        <span className="rounded-full bg-white/90 px-2.5 py-1 text-[13px] font-semibold text-ink">
          {banner.tag}
        </span>

        <h3 className="whitespace-pre-line text-[clamp(1.125rem,4cqw,1.875rem)] font-bold leading-snug text-white">
          {banner.title}
        </h3>
        <p className="text-[clamp(0.8125rem,2.4cqw,0.9375rem)] text-white/90">{banner.subtitle}</p>
      </div>
    </>
  );
}

function BannerGalleryModal({ onClose }: { onClose: () => void }) {
  const titleId = useId();
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // 열리면 닫기 버튼으로 초점을 옮기고, 닫히면 연 버튼(배너 전체보기)으로 돌려준다.
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeButtonRef.current?.focus();
    return () => opener?.focus();
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // 모달이 자체 스크롤을 가지므로 뒤 페이지까지 스크롤되면 스크롤바가 두 개 나란히 보인다.
  // 모달이 화면을 꽉 덮고 있어 잠그는 동안 생기는 리플로우는 눈에 띄지 않는다.
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  return (
    <div role="dialog" aria-modal="true" aria-labelledby={titleId} className="fixed inset-0 z-50 overflow-y-auto bg-white">
      {/* 카드도 relative라 z-index가 없으면 DOM 순서대로 그려져 헤더 위로 올라탄다 */}
      <header className="sticky top-0 z-10 flex h-14 items-center gap-3 border-b border-divider bg-white px-4">
        <button
          ref={closeButtonRef}
          type="button"
          onClick={onClose}
          aria-label="닫기"
          className="-ml-2 flex size-10 cursor-pointer items-center justify-center text-ink"
        >
          <X size={22} strokeWidth={1.75} />
        </button>
        <h2 id={titleId} className="text-[17px] font-bold text-ink">
          배너 전체보기
        </h2>
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
  // 동작 줄이기 설정이면 자동 전환을 멈춘 채로 시작한다. 재생 버튼으로 직접 켤 수는 있다.
  // 쓰는 도중에 설정을 켜면 그때도 멈춘다.
  const reduceMotion = usePrefersReducedMotion();
  const [isPaused, setIsPaused] = useState(reduceMotion);
  const [prevReduceMotion, setPrevReduceMotion] = useState(reduceMotion);
  if (prevReduceMotion !== reduceMotion) {
    setPrevReduceMotion(reduceMotion);
    if (reduceMotion) setIsPaused(true);
  }
  // 키보드로 배너를 보는 동안 자동 전환이 초점 아래 배너를 바꿔 버리지 않게 멈춘다(WCAG 2.2.2).
  // 사용자가 누른 일시정지(isPaused)와는 따로 둔다 — 초점이 나가면 원래 상태로 돌아가야 한다.
  const [hasFocusWithin, setHasFocusWithin] = useState(false);

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
  const scrollToIndex = useCallback((index: number, behavior: ScrollBehavior = smoothScrollBehavior()) => {
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
    if (isPaused || hasFocusWithin) return;
    // 범위를 벗어나면 scrollToIndex가 조용히 무시되고 current가 안 바뀌어
    // 자동 전환이 영구 정지한다. 마지막 벌 끝에서는 가운데 벌로 되돌린다.
    const nextIndex = current + 1 < LOOPED_BANNERS.length ? current + 1 : LOOP_START;
    const timer = setTimeout(() => scrollToIndex(nextIndex), SLIDE_INTERVAL_MS);
    return () => clearTimeout(timer);
  }, [current, isPaused, hasFocusWithin, scrollToIndex]);

  return (
    // 트랙은 화면 폭까지 쓰되(양옆 배너가 화면 끝까지 이어지게), 좌우 패딩을 콘텐츠 라인에
    // 맞춰서 가운데 배너의 좌우 모서리가 아래 섹션들과 정확히 같은 선에 놓이게 한다.
    // 패딩 = (트랙폭 - 콘텐츠폭 72rem) / 2 + 섹션 좌우 여백 1rem
    <div
      className="relative"
      onFocus={() => setHasFocusWithin(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setHasFocusWithin(false);
      }}
    >
      <div
        ref={trackRef}
        onScroll={handleScroll}
        className="flex snap-x snap-mandatory gap-2 overflow-x-auto px-[max(1rem,calc((100%-72rem)/2+1rem))] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {LOOPED_BANNERS.map((banner, index) => {
          // 앞뒤 벌은 무한 루프처럼 보이게 하는 복제본이다. 키보드·화면낭독기에는 원본인
          // 가운데 벌 5장만 노출해야 Tab이 15번 걸리지 않고, 화면 밖 복제본에 초점이 가서
          // 초점 위치가 사라지는 일도 없다(#139). 터치로 누르는 건 막지 않도록 inert는 쓰지 않는다.
          const isClone = index < LOOP_START || index >= LOOP_START * 2;
          const position = (index % BANNERS.length) + 1;
          return (
            // 원본 슬라이드는 "슬라이드, 2 / 5"처럼 전체 중 위치를 알린다.
            <div
              key={`${banner.title}-${index}`}
              role={isClone ? undefined : "group"}
              aria-roledescription={isClone ? undefined : "슬라이드"}
              aria-label={isClone ? undefined : `${position} / ${BANNERS.length}`}
              aria-hidden={isClone || undefined}
              className="relative aspect-[16/10] w-full shrink-0 snap-center overflow-hidden rounded-2xl [container-type:inline-size] md:aspect-[24/9]"
            >
              <Link to={banner.to} tabIndex={isClone ? -1 : undefined} className="block size-full">
                {/* 배너는 홈 최상단이라 LCP 요소다. 처음 화면에 놓이는 가운데 벌의
                    첫 장만 먼저 받고, 나머지 8장은 스크롤·전환될 때 받는다. */}
                <BannerCard banner={banner} reserveControls priority={index === LOOP_START} />
              </Link>
            </div>
          );
        })}
      </div>

      {/* 인덱스·재생 제어·전체보기 */}
      <div className="absolute bottom-[clamp(1rem,4vw,2rem)] right-[calc(max(1rem,calc((100%-72rem)/2+1rem))+clamp(1rem,4vw,2rem))] flex items-center gap-1.5 text-white">
        {/* 사진이 밝은 곳에서도 글자가 4.5:1 이상 나오도록 판을 black/60으로 둔다 */}
        <div className="flex h-7 items-center rounded-full bg-black/60 px-1 backdrop-blur-sm">
          {/* 화살표는 스와이프가 안 되는 포인터 환경에서만 필요하다.
              화면 폭이 아니라 입력 장치로 판별해야 한다 — 데스크톱 창을 반으로 줄이면
              md 미만이 되지만 여전히 마우스뿐이라 넘길 방법이 사라진다.
              트랙은 스크롤바를 숨겨놔서 휠로도 못 넘긴다. */}
          <button
            type="button"
            onClick={() => scrollToIndex(current - 1)}
            aria-label="이전 배너"
            className="hidden size-6 cursor-pointer items-center justify-center pointer-fine:flex"
          >
            <ChevronLeft size={15} />
          </button>
          <span aria-hidden="true" className="px-1.5 text-[13px] tabular-nums">
            <span className="font-semibold">{(current % BANNERS.length) + 1}</span>
            <span className="text-white/85"> / {BANNERS.length}</span>
          </span>
          <button
            type="button"
            onClick={() => scrollToIndex(current + 1)}
            aria-label="다음 배너"
            className="hidden size-6 cursor-pointer items-center justify-center pointer-fine:flex"
          >
            <ChevronRight size={15} />
          </button>
        </div>

        <button
          type="button"
          onClick={() => setIsPaused((paused) => !paused)}
          aria-label={isPaused ? "배너 자동 전환 재생" : "배너 자동 전환 일시정지"}
          className="flex size-7 cursor-pointer items-center justify-center rounded-full bg-black/60 backdrop-blur-sm"
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
          className="flex size-7 cursor-pointer items-center justify-center rounded-full bg-black/60 backdrop-blur-sm"
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
          // userSpaceOnUse로 아이콘 viewBox(24×24) 전체를 좌표계로 잡는다.
          // 기본값(objectBoundingBox)은 path마다 자기 바운딩박스로 계산해서,
          // 조각이 나뉜 글리프는 조각마다 그라데이션이 새로 시작하고
          // 높이가 0인 가로선은 한 색으로 뭉갠다.
          <linearGradient
            key={item.gradientId}
            id={item.gradientId}
            gradientUnits="userSpaceOnUse"
            x1="0"
            y1="0"
            x2="24"
            y2="24"
          >
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
  useDocumentTitle(null);
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
    const controller = new AbortController();
    fetchUpcomingRaces(3, controller.signal)
      // 실패해도 홈 전체가 죽으면 안 되므로 빈 목록으로 두고 섹션만 감춘다
      .catch(() => [] as UpcomingRace[])
      .then((list) => {
        if (!alive) return;
        setRaces(list);
        setIsRaceLoading(false);
      });
    return () => {
      alive = false;
      controller.abort();
    };
  }, []);

  return (
    <>
      {/* 전체보기가 화면을 덮는 동안 뒤 페이지로 초점이 넘어가지 않게 막는다 */}
      <div className="flex min-h-dvh flex-col" inert={isGalleryOpen}>
        {/* 헤더 좌우 여백은 본문(max-w-6xl=72rem)이 가운데
          정렬됐을 때의 여백과 동일한 수식(max(1rem,calc((100%-72rem)/2+1rem)))을 쓴다
          (AppHeader.tsx) — 화면 폭과 무관하게 로고 시작·CTA 끝이 본문·배너 좌우 끝과
          항상 정확히 일치한다. */}
        <AppHeader />

        <main id={MAIN_CONTENT_ID} tabIndex={-1} className="outline-none">
          {/* 홈은 화면에 큰 제목이 없어 화면낭독기용 페이지 제목만 둔다 */}
          <h1 className="sr-only">어디까지왔니 홈</h1>

          <section aria-roledescription="carousel" aria-labelledby="home-banner-heading" className="w-full pt-3">
            <h2 id="home-banner-heading" className="sr-only">
              추천 소식
            </h2>
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
              {/* 지역은 카드마다 배지로 붙어 있어 소제목으로 다시 나열하지 않는다 */}
              <SectionHeader title="유명 관광지에서 달려보자!" />
              {isFeaturedLoading ? <CourseGridSkeleton /> : <CourseGrid items={featured} />}
            </section>
          )}

          {/* 다가오는 대회 — 대회가 하나도 없으면 섹션째 감춘다 */}
          {(isRaceLoading || races.length > 0) && (
          <section className="mx-auto w-full max-w-6xl px-4 pb-[clamp(2rem,6vw,3rem)]">
            <SectionHeader title="다가오는 대회" caption="가까운 날짜순" />

            {isRaceLoading ? (
              <div className="grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] gap-3">
                <span className="h-24 animate-pulse motion-reduce:animate-none rounded-xl bg-mapbg" />
              </div>
            ) : (
            <ul className="grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] gap-3">
              {races.map((race) => {
                const [, month, day] = race.startDate.split("-");

                return (
                  <li key={race.id}>
                    <Link
                      to={`/races?eventId=${race.id}`}
                      className="flex items-center gap-3 rounded-xl border border-divider p-3 transition-shadow hover:shadow-md"
                    >
                      {/* 1순위: 언제 — 날짜 블록을 채워서 가장 먼저 눈에 들어오게 */}
                      {/* 높이를 오른쪽 3줄에 맞춰야 D-day가 배지 위로 삐져나오지 않는다 */}
                      <span className="flex size-[4.5rem] shrink-0 flex-col items-center justify-center rounded-lg bg-accent leading-none text-white">
                        <span className="text-[13px] font-medium text-white">{Number(month)}월</span>
                        <span className="mt-0.5 text-2xl font-bold">{Number(day)}</span>
                      </span>

                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        {/* 1순위: 얼마나 남았나. 종목은 분류값이라 본문 흐름에서 빼 오른쪽 끝에 고정 */}
                        <span className="flex items-center justify-between gap-2">
                          <span className="text-base font-bold text-accent">
                            {formatDDay(race.startDate)}
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
        </main>

        <Footer />
      </div>

      {isGalleryOpen && <BannerGalleryModal onClose={() => setIsGalleryOpen(false)} />}
    </>
  );
}
