import { useState } from "react";
import { formatDate } from "../format";
import { formatDistance, formatDuration, paceStat } from "../../map/trackingRecord";
import type { SavedRecordCard } from "../types";

/**
 * 저장한 기록 카드 모아보기. 기록 카드 기본 비율(피드 4:5)에 맞춘 격자다.
 * 이미지가 없거나 불러오지 못하면 기록 수치로 그린 기본 카드를 대신 보여 준다.
 * 누르면 크게 보기·다시 저장·공유를 여는 자리다(카드 저장 기능과 함께 붙인다).
 */
export default function RecordCardGrid({ cards }: { cards: SavedRecordCard[] }) {
  return (
    <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
      {cards.map((card) => (
        <li key={card.id}>
          <CardImage card={card} />
        </li>
      ))}
    </ul>
  );
}

function CardImage({ card }: { card: SavedRecordCard }) {
  const [failed, setFailed] = useState(false);
  const label = `${card.record.courseName} 기록 카드, ${formatDate(card.createdAt)}`;

  if (card.imageUrl && !failed) {
    return (
      <img
        src={card.imageUrl}
        alt={label}
        onError={() => setFailed(true)}
        className="aspect-[4/5] w-full rounded-[10px] object-cover"
      />
    );
  }

  const { record } = card;
  const pace = paceStat(record.paceSecPerKm, record.routeType);
  return (
    <div
      role="img"
      aria-label={label}
      className="flex aspect-[4/5] w-full flex-col justify-between rounded-[10px] bg-gradient-to-br from-ink to-accent p-3 text-white"
    >
      <p className="text-[11px] opacity-80">{formatDate(record.finishedAt)}</p>
      <div>
        <p className="text-[26px] font-bold leading-none">
          {formatDistance(record.distanceKm)}
          <span className="ml-0.5 text-[13px] font-medium">km</span>
        </p>
        <p className="mt-1.5 text-[12px] opacity-90">
          {formatDuration(record.durationMs)} · {pace.value}
          {pace.unit && ` ${pace.unit}`}
        </p>
        <p className="mt-2 line-clamp-2 text-[12px] font-bold">{record.courseName}</p>
      </div>
    </div>
  );
}
