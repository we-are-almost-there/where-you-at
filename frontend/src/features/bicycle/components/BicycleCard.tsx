import type { BicycleFacility } from "../types";

// 백엔드 값(rental_mixed)은 그대로 유지하고, 화면 표시 라벨만 사용자 친화적으로 조정.
const FACILITY_TYPE_LABEL: Record<string, string> = {
  rental_staffed: "유인대여소",
  rental_unmanned: "무인대여소",
  rental_mixed: "유·무인 대여소",
  rental_unknown: "유형 정보 없음",
};

const FEE_TYPE_LABEL: Record<string, string> = {
  무료: "무료",
  유료: "유료",
  혼합: "무료+유료 혼합",
};

function getFeeTypeLabel(feeType: string | null | undefined): string {
  if (!feeType) return "정보 없음";
  return FEE_TYPE_LABEL[feeType] ?? feeType;
}

function stripNumberPrefix(title: string): string {
  return title.replace(/^\d+\.\s*/, "");
}

function getAvailabilityDisplay(facility: BicycleFacility): {
  text: string;
  isRealtime: boolean;
} {
  if (facility.realtime_synced_at != null) {
    return { text: `대여 가능 ${facility.available_bikes ?? 0}대`, isRealtime: true };
  }
  if (facility.total_bikes != null && facility.total_bikes > 0) {
    return { text: `보유 ${facility.total_bikes}대`, isRealtime: false };
  }
  return { text: "보유 수량 확인 불가", isRealtime: false };
}

const cardBase =
  "flex h-full w-full flex-col overflow-hidden rounded-[14px] bg-white shadow-[0px_3px_10px_0px_rgba(0,0,0,0.12)] transition-shadow hover:shadow-[0px_5px_16px_0px_rgba(0,0,0,0.16)]";

interface CardProps {
  facility: BicycleFacility;
}

// "운영 정보" 탭(표준데이터, source_id std:)용 5필드 카드.
function StandardFacilityCard({ facility }: CardProps) {
  const typeLabel = FACILITY_TYPE_LABEL[facility.facility_type] ?? "대여소";
  const title = stripNumberPrefix(facility.facility_title);
  const availability = getAvailabilityDisplay(facility);

  return (
    <div className={`${cardBase} pt-2 pr-4 pb-4 pl-4`}>
      <div className="flex h-[26px] items-start">
        {facility.repair_available && (
          <span className="inline-block rounded-md bg-lavender px-2 py-0.5 text-[11px] font-semibold text-accent">
            정비 가능
          </span>
        )}
      </div>

      <h3 className="truncate font-bold text-ink text-[17px] @[280px]:text-[19px]">{title}</h3>
      <p className="mt-1.5 line-clamp-2 min-h-[34px] text-[13px] text-caption">{facility.addr1}</p>

      <p className={`mt-2 font-bold text-[16px] ${availability.isRealtime ? "text-accent" : "text-caption"}`}>
        {availability.text}
      </p>

      <div className="mt-3 space-y-1 text-[12px]">
        <div className="flex justify-between">
          <span className="text-caption">운영시간</span>
          <span className="text-ink">{facility.open_hours || "정보 없음"}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-caption">정비</span>
          <span className="text-ink">
            {facility.repair_available == null ? "정보 없음" : facility.repair_available ? "가능" : "불가"}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-caption">요금</span>
          <span className="text-ink">{getFeeTypeLabel(facility.rental_fee_type)}</span>
        </div>
      </div>

      <div className="mt-auto pt-3">
        <hr className="mb-2.5 border-t border-divider" />
        <span className="font-bold text-accent text-[13px]">{typeLabel}</span>
      </div>
    </div>
  );
}

/**
 * "실시간" 탭(source_id rt:)용 카드. 운영시간/정비/요금/유형 정보 자체가
 * 원본 API에 없어(rental_unknown 고정) 이 필드들은 표시하지 않는다.
 * addr1은 Kakao 역지오코딩(backfill_bicycle_addr.py)으로 대부분 채워져 있어
 * 제목 아래에 함께 보여주고, 대여 가능 대수를 중앙 정렬로 크게 강조한다.
 */
function RealtimeCard({ facility }: CardProps) {
  const title = stripNumberPrefix(facility.facility_title);
  const hasRealtimeData = facility.realtime_synced_at != null;

  return (
    <div className={`${cardBase} p-4 text-center`}>
      <p className="line-clamp-1 font-bold text-ink text-[15px]">{title}</p>
      {facility.addr1 && <p className="mt-1 line-clamp-1 text-[12px] text-caption">{facility.addr1}</p>}

      <p className={`my-2 font-bold text-[28px] ${hasRealtimeData ? "text-accent" : "text-caption"}`}>
        {hasRealtimeData ? facility.available_bikes ?? 0 : "−"}
      </p>
      <p className="text-[11px] text-caption">{hasRealtimeData ? "대여 가능 (대)" : "보유 수량 확인 불가"}</p>
    </div>
  );
}

interface Props {
  facility: BicycleFacility;
  // 현재 목록이 어느 탭(data_source)인지. 탭에 맞는 카드 레이아웃을 고른다.
  variant?: "standard" | "realtime";
}

export function BicycleCard({ facility, variant = "standard" }: Props) {
  return (
    <article className="@container h-full">
      {variant === "realtime" ? (
        <RealtimeCard facility={facility} />
      ) : (
        <StandardFacilityCard facility={facility} />
      )}
    </article>
  );
}
