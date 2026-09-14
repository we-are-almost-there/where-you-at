import { useEffect, useState } from "react";

function localMidnight() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

export function useToday() {
  const [today, setToday] = useState(localMidnight);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const refresh = () => {
      clearTimeout(timer);
      setToday(localMidnight());
      const next = new Date();
      next.setHours(24, 0, 0, 0);
      timer = setTimeout(refresh, Math.max(1, next.getTime() - Date.now()));
    };
    const next = new Date();
    next.setHours(24, 0, 0, 0);
    timer = setTimeout(refresh, Math.max(1, next.getTime() - Date.now()));
    window.addEventListener("focus", refresh);
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  return today;
}
