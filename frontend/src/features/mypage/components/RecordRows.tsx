import { Link } from "react-router";
import { formatDate } from "../format";
import { formatDistance, formatDuration, paceStat } from "../../map/trackingRecord";
import type { RunRecord } from "../types";

interface Props {
  records: RunRecord[];
  /** 마이페이지 첫 화면처럼 폭이 좁은 곳. 수치를 한 줄로 이어 쓴다. */
  compact?: boolean;
}

/**
 * 완주 기록 게시판형 목록. 줄마다 코스 이름·완주 날짜와 거리·시간·페이스(자전거는 평균 속도)를 둔다.
 * 코스 이름은 그 코스 상세로 가는 링크다.
 */
export default function RecordRows({ records, compact = false }: Props) {
  return (
    <ul className="flex flex-col">
      {records.map((record) => {
        const pace = paceStat(record.paceSecPerKm, record.routeType);
        const paceText = `${pace.value}${pace.unit && ` ${pace.unit}`}`;
        return (
          // 좁은 목록은 마지막 줄 아래 여백을 없애, 옆 칸(스탬프)과 아래 끝을 가깝게 맞춘다.
          <li key={record.id} className={`border-b border-divider last:border-b-0 ${compact ? "py-3 last:pb-0" : "py-4"}`}>
            <div className="flex items-baseline justify-between gap-3">
              <Link
                to={`/courses/${record.courseId}${record.routeType === "자전거" ? "?type=bicycle" : ""}`}
                className="min-w-0 truncate text-[15px] font-medium text-ink hover:text-accent"
              >
                {record.courseName}
              </Link>
              <time dateTime={record.finishedAt} className="shrink-0 text-[12px] text-caption">
                {formatDate(record.finishedAt)}
              </time>
            </div>
            {compact ? (
              <p className="mt-1 text-[13px] text-caption">
                <span className="font-bold text-figure">{formatDistance(record.distanceKm)}km</span>
                {" · "}
                <span className="sr-only">시간 </span>
                {formatDuration(record.durationMs)}
                {" · "}
                <span className="sr-only">{pace.caption} </span>
                {paceText}
              </p>
            ) : (
              <dl className="mt-2 grid grid-cols-3 gap-2">
                <Stat label="거리" value={`${formatDistance(record.distanceKm)}km`} />
                <Stat label="시간" value={formatDuration(record.durationMs)} />
                <Stat label={pace.caption} value={paceText} />
              </dl>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[12px] text-caption">{label}</dt>
      <dd className="text-[16px] font-bold text-figure">{value}</dd>
    </div>
  );
}
