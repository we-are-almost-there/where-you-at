// TODO: 카드 디자인 확정 전 — 상단탭/타임라인 시안도 검토 중
// 대수강조형으로 우선 반영. 추후 디자인이 바뀔 수 있음 (2026-08-20 기준)
import type { BicycleFacility } from "../types";

const FACILITY_TYPE_LABEL: Record<string, string> = {
  rental_staffed: "유인대여소",
  rental_unmanned: "무인대여소",
  rental_mixed: "혼합대여소",
  rental_unknown: "대여소",
};

// 일부 데이터 소스(서울시 등)의 facility_title에 관리번호가 접두어로
// 붙어있는 경우가 있어("1346. 길음8골어린이공원 옆") 표시 시 제거한다.
function stripNumberPrefix(title: string): string {
  return title.replace(/^\d+\.\s*/, "");
}

interface Props {
  facility: BicycleFacility;
}

export function BicycleCard({ facility }: Props) {
  const typeLabel = FACILITY_TYPE_LABEL[facility.facility_type] ?? "대여소";
  const hasRealtimeData = facility.realtime_synced_at != null;
  const title = stripNumberPrefix(facility.facility_title);

  return (
    <article className="@container h-full">
      <div className="flex h-full w-full flex-col overflow-hidden rounded-[14px] bg-white pt-2 pr-4 pb-4 pl-4 text-center shadow-[0px_3px_10px_0px_rgba(0,0,0,0.12)] transition-shadow hover:shadow-[0px_5px_16px_0px_rgba(0,0,0,0.16)]">
        {/* 정비 가능(전체 대비 0.4%로 극소수)만 눈에 띄게 배지로 강조.
            불가/정보없음이 압도적으로 많아 매번 텍스트로 반복 노출하면 노이즈가 됨.
            뱃지 유무와 상관없이 항상 같은 높이 자리를 확보해 카드 정렬을 맞춘다.
            카드 자체는 text-center라 뱃지만 왼쪽 정렬되도록 text-left로 되돌림.
            items-start로 뱃지를 박스 상단에 붙여, 그 아래 남는 공간이 제목과의 여백이 되게 함. */}
        <div className="flex h-[26px] items-start text-left">
          {facility.repair_available && (
            <span className="inline-block rounded-md bg-lavender px-2 py-0.5 text-[11px] font-semibold text-accent">
              정비 가능
            </span>
          )}
        </div>

        {/* 제목이 길어도 카드 정렬이 흐트러지지 않도록 한 줄로 고정, 주소는 아래 별도 표시 */}
        <p className="line-clamp-1 font-bold text-ink text-[14px] @[280px]:text-[15px]">{title}</p>
        {/* 주소가 길 때 한 줄 잘림(truncate) 대신 2줄까지 보여주고 그 이상은 말줄임표.
            min-h로 2줄 높이를 항상 확보해, 주소가 1줄이든 2줄이든 아래 숫자 영역 시작 위치를 통일 */}
        <p className="mt-1 line-clamp-2 min-h-[34px] text-[12px] text-caption">{facility.addr1}</p>

        {/* 실시간 데이터 보유율이 86.7%로 높아, 대여 가능 대수를 숫자로 크게 강조.
            데이터 없는 나머지 케이스는 "−"로 표시해 실시간 정보 없음을 명확히 구분. */}
        <p className={`my-2 font-bold text-[28px] ${hasRealtimeData ? "text-accent" : "text-caption"}`}>
          {hasRealtimeData ? facility.available_bikes ?? 0 : "−"}
        </p>
        <p className="text-[11px] text-caption">{hasRealtimeData ? "대여 가능 (대)" : "실시간 정보 없음"}</p>

        <div className="mt-auto">
          <hr className="mt-3 mb-2.5 border-t border-divider" />
          <div className="flex items-center justify-between gap-2">
            <span className="font-bold text-accent text-[12px]">{typeLabel}</span>
            <span className="truncate text-[12px] text-caption">
              {facility.open_hours || "정보 없음"} · {facility.rental_fee_type || "정보 없음"}
            </span>
          </div>
        </div>
      </div>
    </article>
  );
}
