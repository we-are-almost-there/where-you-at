// "YYYY-MM-DD" 문자열을 로컬 타임존 기준 Date로 파싱.
// new Date("YYYY-MM-DD")는 UTC 자정으로 해석되어 KST 등에서 하루가 밀리는 문제가 있다.
export function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function formatDateRange(start: string, end: string | null): string {
  const fmt = (s: string) => {
    const d = parseLocalDate(s);
    return `${d.getMonth() + 1}.${d.getDate()}(${"일월화수목금토"[d.getDay()]})`;
  };
  if (!end || end === start) return fmt(start);
  return `${fmt(start)} ~ ${fmt(end)}`;
}