import { useEffect, useState } from "react";
import type { UserError } from "../../components/error/userError";
import { toRecordUserError } from "./recordsErrors";
import { fetchMyRecordCards, fetchMyRecords } from "./mypageData";
import type { RunRecord, RecordCardPage } from "./types";

export type RecordsState =
  | { status: "loading" }
  | { status: "error"; error: UserError; retry: () => void }
  | { status: "ready"; records: RunRecord[]; cardPage: RecordCardPage };

/** 완주 기록과 카드 한 페이지를 조회한다. 이전 페이지의 응답은 새 페이지에 표시하지 않는다. */
export function useRecords(page = 1, size = 12): RecordsState {
  const [data, setData] = useState<{ key: string; records: RunRecord[]; cardPage: RecordCardPage } | null>(null);
  const [error, setError] = useState<{ key: string; value: UserError } | null>(null);
  const [retryTick, setRetryTick] = useState(0);
  const key = `${page}:${size}:${retryTick}`;

  useEffect(() => {
    let cancelled = false;
    const loadCards = async () => {
      const result = await fetchMyRecordCards(page, size);
      const lastPage = Math.max(1, Math.ceil(result.totalCount / result.size));
      // 오래된 URL이나 삭제로 범위를 벗어나면 서버에서 마지막 페이지를 다시 받는다.
      return !cancelled && page > lastPage ? fetchMyRecordCards(lastPage, size) : result;
    };
    Promise.all([fetchMyRecords(), loadCards()]).then(
      ([records, cardPage]) => {
        if (!cancelled) {
          setData({ key, records, cardPage });
          setError(null);
        }
      },
      (err: unknown) => {
        if (!cancelled) setError({ key, value: toRecordUserError(err, "기록을 불러오지 못했어요") });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [page, size, key]);

  if (error?.key === key) {
    return {
      status: "error",
      error: error.value,
      retry: () => {
        setRetryTick((tick) => tick + 1);
      },
    };
  }
  // effect가 실행되기 전 렌더에서도 이전 페이지나 이전 재시도의 결과를 숨긴다.
  return data?.key === key ? { status: "ready", records: data.records, cardPage: data.cardPage } : { status: "loading" };
}
