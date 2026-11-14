import { useCallback, useEffect, useRef } from "react";

export function usePoll(fn, { active, intervalMs, immediate = true }) {
  const fnRef = useRef(fn);
  const controllerRef = useRef(null);

  useEffect(() => {
    fnRef.current = fn;
  });

  const tick = useCallback(() => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    return Promise.resolve(fnRef.current(controller.signal)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!active) return undefined;
    let timer = null;
    let unmounted = false;

    const start = (pollNow) => {
      if (timer || unmounted || document.hidden) return;
      if (pollNow) tick();
      timer = setInterval(tick, intervalMs);
    };
    const stop = () => {
      clearInterval(timer);
      timer = null;
      controllerRef.current?.abort();
    };
    const onVisibility = () => (document.hidden ? stop() : start(true));

    start(immediate);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      unmounted = true;
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [active, intervalMs, immediate, tick]);

  return { tick };
}
