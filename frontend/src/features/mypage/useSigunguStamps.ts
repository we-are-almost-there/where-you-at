import { useEffect, useRef, useState } from "react";
import { readAccessToken } from "../../lib/authToken";
import { fetchMyStamps, stampMyRegion } from "./mypageData";
import type { SigunguStampStatus, Stamp } from "./types";

/** 지도와 획득 수에 사용할 상태. 이전 조회·이전 로그인 세션의 응답은 반영하지 않는다. */
export function useSigunguStamps() {
  const [statuses, setStatuses] = useState<SigunguStampStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tick, setTick] = useState(0);
  const generation = useRef(0);
  useEffect(() => {
    const current = ++generation.current;
    const token = readAccessToken();
    fetchMyStamps().then((items) => {
      if (current !== generation.current || token !== readAccessToken()) return;
      setStatuses(items);
      setLoading(false);
    }, () => {
      if (current !== generation.current || token !== readAccessToken()) return;
      setError("스탬프를 불러오지 못했어요. 다시 시도해 주세요.");
      setLoading(false);
    });
    return () => { generation.current = current + 1; };
  }, [tick]);
  const stamp = async (code: string) => {
    const current = generation.current;
    const token = readAccessToken();
    const result = await stampMyRegion(code);
    if (current !== generation.current || token !== readAccessToken()) return;
    setStatuses((items) => [...items.filter((item) => item.sigunguCode !== code), result]);
  };
  const stamps: Stamp[] = statuses.flatMap((item) =>
    item.status === "STAMPED" && item.stampedAt ? [{ sigunguCode: item.sigunguCode, stampedAt: item.stampedAt }] : []);
  return { statuses, stamps, loading, error, stamp, retry: () => {
    generation.current++;
    setLoading(true);
    setError("");
    setTick((value) => value + 1);
  } };
}
