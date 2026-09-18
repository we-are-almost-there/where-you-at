import { useSearchParams } from "react-router";
import { parsePage } from "../help/helpFormat";

/**
 * 주소의 ?page= 값과 그 페이지로 옮기는 함수. 다른 검색 값(tab 등)은 그대로 둔다.
 * 공지 목록처럼 주소에 두어, 코스 상세에 들어갔다가 뒤로 와도 보던 페이지가 유지된다.
 */
export function usePageParam(): [number, (page: number) => void] {
  const [searchParams, setSearchParams] = useSearchParams();
  const page = parsePage(searchParams.get("page"));
  const goToPage = (next: number) => {
    const params = new URLSearchParams(searchParams);
    if (next === 1) params.delete("page");
    else params.set("page", String(next));
    setSearchParams(params);
    window.scrollTo({ top: 0 });
  };
  return [page, goToPage];
}

/** 목록을 한 페이지만큼 자른다. 주소의 page가 범위를 넘으면 마지막 페이지를 보여 준다. */
export function paginate<T>(items: T[], page: number, perPage: number) {
  const totalPages = Math.max(1, Math.ceil(items.length / perPage));
  const current = Math.min(page, totalPages);
  return { current, totalPages, items: items.slice((current - 1) * perPage, current * perPage) };
}
