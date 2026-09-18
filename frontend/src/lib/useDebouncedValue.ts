import { useEffect, useState } from "react";

/** value가 delayMs 동안 바뀌지 않았을 때만 따라가는 값. 입력 중 글자마다 화면낭독기가 읽지 않게 할 때 쓴다. */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
