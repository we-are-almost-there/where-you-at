import { useEffect, useState } from "react";
import { toUserError, type UserError } from "../../components/error/userError";
import { fetchMyRecordCards, fetchMyRecords } from "./mypageData";
import type { RunRecord, SavedRecordCard } from "./types";

export type RecordsState =
  | { status: "loading" }
  | { status: "error"; error: UserError; retry: () => void }
  | { status: "ready"; records: RunRecord[]; cards: SavedRecordCard[] };

/** 내 완주 기록과 기록 카드를 함께 불러온다. 두 탭이 같은 요청을 나눠 쓴다. */
export function useRecords(): RecordsState {
  const [data, setData] = useState<{ records: RunRecord[]; cards: SavedRecordCard[] } | null>(null);
  const [error, setError] = useState<UserError | null>(null);
  const [retryTick, setRetryTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchMyRecords(), fetchMyRecordCards()]).then(
      ([records, cards]) => {
        if (!cancelled) setData({ records, cards });
      },
      (err: unknown) => {
        if (!cancelled) setError(toUserError(err, "기록을 불러오지 못했어요"));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [retryTick]);

  if (error) {
    return {
      status: "error",
      error,
      retry: () => {
        setError(null);
        setData(null);
        setRetryTick((tick) => tick + 1);
      },
    };
  }
  return data ? { status: "ready", ...data } : { status: "loading" };
}
