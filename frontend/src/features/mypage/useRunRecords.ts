import { useEffect, useState } from "react";
import { toUserError, type UserError } from "../../components/error/userError";
import { fetchMyRecords } from "./mypageData";
import type { RunRecord } from "./types";

export type RunRecordsState =
  | { status: "loading" }
  | { status: "error"; error: UserError; retry: () => void }
  | { status: "ready"; records: RunRecord[] };

/** 내 완주 기록만 불러온다. 마이페이지 첫 화면과 사이드바가 쓴다. */
export function useRunRecords(): RunRecordsState {
  const [records, setRecords] = useState<RunRecord[] | null>(null);
  const [error, setError] = useState<UserError | null>(null);
  const [retryTick, setRetryTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetchMyRecords().then(
      (result) => {
        if (!cancelled) setRecords(result);
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
        setRecords(null);
        setRetryTick((tick) => tick + 1);
      },
    };
  }
  return records ? { status: "ready", records } : { status: "loading" };
}
