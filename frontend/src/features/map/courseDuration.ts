/** 예상 소요 시간(분) → 표시 문구. 목록 카드와 지도 위 코스 선택 카드가 함께 쓴다. */
export function formatDuration(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h && m) return `약 ${h}시간 ${m}분`;
  if (h) return `약 ${h}시간`;
  return `약 ${m}분`;
}
