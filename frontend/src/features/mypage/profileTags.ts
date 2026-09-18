import { sidoCodeOf } from "./stampRegions";
import type { RunRecord, Stamp } from "./types";

/**
 * 프로필 카드 맨 위의 자동 해시태그. 기록과 스탬프로 만든다. "#"은 화면에서 붙인다.
 *   기록 없음  ["첫완주에도전"]
 *   기록 있음  ["23번완주", "294.5km"] (+ 스탬프가 있으면 "4개시도")
 * 해시태그라 띄어 쓰지 않는다.
 */
export function profileTags(records: RunRecord[], stamps: Stamp[]): string[] {
  if (records.length === 0) return ["첫완주에도전"];
  const totalKm = records.reduce((sum, record) => sum + record.distanceKm, 0);
  const km = totalKm.toLocaleString("ko-KR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const tags = [`${records.length}번완주`, `${km}km`];
  const sidoCount = new Set(stamps.map((stamp) => sidoCodeOf(stamp.sigunguCode))).size;
  if (sidoCount > 0) tags.push(`${sidoCount}개시도`);
  return tags;
}
