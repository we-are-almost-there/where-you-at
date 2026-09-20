import { useSearchParams } from "react-router";
import { Footprints, Images } from "lucide-react";
import { Tabs } from "../../components/common/Tabs";
import { tabPanelProps } from "../../components/common/tabIds";
import { Pagination } from "../map/components/Pagination";
import MyPageLayout from "./components/MyPageLayout";
import EmptyState from "./components/EmptyState";
import RecordRows from "./components/RecordRows";
import RecordCardGrid from "./components/RecordCardGrid";
import { formatTotalDuration } from "./format";
import { paginate, usePageParam } from "./usePageParam";
import { useRecords } from "./useRecords";
import type { RunRecord, SavedRecordCard } from "./types";

type Tab = "records" | "cards";

const TABS: { value: Tab; label: string }[] = [
  { value: "records", label: "기록" },
  { value: "cards", label: "기록 카드" },
];
const TAB_ID_BASE = "my-records";
const PER_PAGE: Record<Tab, number> = { records: 10, cards: 12 };

/**
 * 내 기록 전체 보기. "기록"(완주 기록 목록)과 "기록 카드"(만들어 저장한 카드 이미지)를 탭으로 나누고,
 * 탭마다 따로 페이지를 넘긴다. 탭과 페이지는 주소(?tab=cards&page=2)에 남는다.
 */
export default function RecordsPage() {
  return (
    <MyPageLayout title="내 기록" back={{ to: "/mypage", label: "마이페이지" }}>
      {() => <Records />}
    </MyPageLayout>
  );
}

function Records() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab: Tab = searchParams.get("tab") === "cards" ? "cards" : "records";
  const [page, goToPage] = usePageParam();
  const state = useRecords();

  // 탭을 바꾸면 페이지는 1로 돌아간다. 두 목록의 페이지 수가 달라 이어 쓰면 빈 페이지가 나올 수 있다.
  // replace로 바꾸는 것은 의도다. 탭은 다른 화면으로 이동하는 것이 아니라 같은 목록의 보기를 바꾸는 것이라
  // 뒤로가기에 탭 전환을 쌓지 않는다. 페이지 이동(usePageParam)은 탐색 기록으로 남긴다.
  const changeTab = (next: Tab) => setSearchParams(next === "records" ? {} : { tab: next }, { replace: true });

  if (state.status === "loading") {
    return (
      <p role="status" className="py-16 text-center text-[14px] text-caption">
        기록을 불러오는 중…
      </p>
    );
  }
  if (state.status === "error") {
    return (
      <div className="py-16 text-center">
        <p className="text-[14px] text-ink">{state.error.title}</p>
        <button type="button" onClick={state.retry} className="mt-2 cursor-pointer text-[14px] font-bold text-accent hover:opacity-70">
          다시 시도
        </button>
      </div>
    );
  }

  const { records, cards } = state;
  const counts: Record<Tab, number> = { records: records.length, cards: cards.length };
  const activeIndex = TABS.findIndex((item) => item.value === tab);

  return (
    <>
      {records.length > 0 && <Summary records={records} />}

      <Tabs
        idBase={TAB_ID_BASE}
        label="기록 보기"
        items={TABS}
        value={tab}
        onChange={changeTab}
        className="flex gap-6 border-b border-divider"
        tabClassName={() => "relative -mb-px cursor-pointer pb-2.5 text-[15px] font-bold md:text-[16px]"}
        renderLabel={(item, active) => (
          <>
            <span className={active ? "text-accent" : "text-muted"}>{item.label}</span>
            <span className={`ml-1 text-[13px] ${active ? "text-accent" : "text-caption"}`}>{counts[item.value]}</span>
            {active && <span className="absolute inset-x-0 bottom-0 h-[3px] rounded-full bg-accent" />}
          </>
        )}
      />
      <div {...tabPanelProps(TAB_ID_BASE, activeIndex)} className="mt-2">
        {tab === "records" ? <RecordList records={records} page={page} onPage={goToPage} /> : <CardList cards={cards} page={page} onPage={goToPage} />}
      </div>
    </>
  );
}

function Summary({ records }: { records: RunRecord[] }) {
  const totalKm = records.reduce((sum, record) => sum + record.distanceKm, 0);
  const totalMs = records.reduce((sum, record) => sum + record.durationMs, 0);
  return (
    <dl className="mb-6 grid grid-cols-3 rounded-[14px] bg-lavender py-4 text-center">
      <div>
        <dt className="text-[12px] text-muted">완주</dt>
        <dd className="mt-1 text-[18px] font-bold text-figure md:text-[20px]">{records.length}회</dd>
      </div>
      <div className="border-x border-divider-soft">
        <dt className="text-[12px] text-muted">총 거리</dt>
        <dd className="mt-1 text-[18px] font-bold text-figure md:text-[20px]">{totalKm.toFixed(1)}km</dd>
      </div>
      <div>
        <dt className="text-[12px] text-muted">총 시간</dt>
        <dd className="mt-1 text-[18px] font-bold text-figure md:text-[20px]">{formatTotalDuration(totalMs)}</dd>
      </div>
    </dl>
  );
}

function RecordList({ records, page, onPage }: { records: RunRecord[]; page: number; onPage: (page: number) => void }) {
  if (records.length === 0) {
    return (
      <div className="mt-4">
        <EmptyState
          icon={<Footprints size={26} strokeWidth={1.75} />}
          title="아직 완주한 기록이 없어요"
          description={"코스 따라가기를 끝까지 마치면\n거리·시간·페이스가 여기에 쌓여요."}
          action={{ to: "/courses", label: "코스 둘러보기" }}
        />
      </div>
    );
  }
  const { current, totalPages, items } = paginate(records, page, PER_PAGE.records);
  return (
    <>
      <RecordRows records={items} />
      <Pagination page={current} totalPages={totalPages} onChange={onPage} />
    </>
  );
}

function CardList({ cards, page, onPage }: { cards: SavedRecordCard[]; page: number; onPage: (page: number) => void }) {
  if (cards.length === 0) {
    return (
      <div className="mt-4">
        <EmptyState
          icon={<Images size={26} strokeWidth={1.75} />}
          title="아직 저장한 기록 카드가 없어요"
          description={"완주 뒤 기록 카드를 만들어 저장하면\n여기에 모여요."}
        />
      </div>
    );
  }
  const { current, totalPages, items } = paginate(cards, page, PER_PAGE.cards);
  return (
    <div className="mt-4">
      <RecordCardGrid cards={items} />
      <Pagination page={current} totalPages={totalPages} onChange={onPage} />
    </div>
  );
}
