import { useCallback, useEffect, useRef } from "react";
import { isIdle, onWake } from "../../lib/activity";

export function usePoll(fn, { active, intervalMs, immediate = true }) {
  const fnRef = useRef(fn);
  const controllerRef = useRef(null);

  useEffect(() => {
    fnRef.current = fn;
  });

  const run = useCallback(() => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    return Promise.resolve(fnRef.current(controller.signal)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!active) return undefined;
    let timer = null;
    let unmounted = false;
    let resting = false;

    const schedule = () => {
      if (unmounted || timer) return;
      timer = setTimeout(beat, intervalMs);
    };
    const beat = async () => {
      timer = null;
      if (unmounted) return;
      if (document.hidden || isIdle()) {
        resting = true;
        return;
      }
      await Promise.race([run(), new Promise((resolve) => setTimeout(resolve, intervalMs))]);
      schedule();
    };
    const resume = () => {
      if (!resting || unmounted || document.hidden) return;
      resting = false;
      beat();
    };
    const onVisibility = () => {
      if (!document.hidden) return resume();
      clearTimeout(timer);
      timer = null;
      resting = true;
      controllerRef.current?.abort();
      return undefined;
    };

    if (document.hidden) resting = true;
    else if (immediate) beat();
    else schedule();
    document.addEventListener("visibilitychange", onVisibility);
    const offWake = onWake(resume);

    return () => {
      unmounted = true;
      clearTimeout(timer);
      controllerRef.current?.abort();
      document.removeEventListener("visibilitychange", onVisibility);
      offWake();
    };
  }, [active, intervalMs, immediate, run]);

  return { tick: run };
}
