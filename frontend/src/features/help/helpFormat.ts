import type { Faq } from "./types";

/**
 * ISO 시각 → 이용자 기기 시간대 기준 "YYYY.MM.DD".
 * 서버는 UTC로 주므로 한국에서는 오전 9시 이전 게시분도 한국 날짜로 보인다. 해석할 수 없으면 빈 문자열.
 */
export function formatNoticeDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())}`;
}

export interface FaqGroup {
  category: string;
  items: Faq[];
}

/**
 * 정렬된 FAQ 목록을 카테고리별로 묶는다. 순서는 API가 준 순서(카테고리 순서 → 카테고리 안 순서)를
 * 그대로 따른다. 같은 카테고리가 떨어져서 나오면 처음 나온 묶음에 합친다.
 */
export function groupFaqs(faqs: Faq[]): FaqGroup[] {
  const groups = new Map<string, Faq[]>();
  for (const faq of faqs) {
    const items = groups.get(faq.category);
    if (items) items.push(faq);
    else groups.set(faq.category, [faq]);
  }
  return [...groups].map(([category, items]) => ({ category, items }));
}

/** 주소의 ?page= 값 → 1 이상의 정수. 숫자가 아니거나 1보다 작으면 1. */
export function parsePage(value: string | null): number {
  const page = Number(value);
  return Number.isInteger(page) && page >= 1 ? page : 1;
}

/** 경로의 :id 값 → 1 이상의 정수. 형식이 맞지 않으면 null이고, 이때는 요청을 보내지 않는다. */
export function parseNoticeId(value: string | undefined): number | null {
  if (!value || !/^[1-9]\d*$/.test(value)) return null;
  return Number(value);
}
