import { useEffect, useRef } from "react";

/**
 * Polls `fn` on an interval while `active` is truthy.
 *
 * Why this exists: the case status screens (eligibility, preauth, claim) sit on
 * a long-running async backend with no server-side cache, so every poll is a
 * real DB + FHIR round trip. This hook keeps that traffic honest:
 *
 *  - Pauses while the browser tab is hidden and resumes — with an immediate
 *    poll — when it becomes visible again, so a case left open in a background
 *    tab stops hitting the backend every interval.
 *  - Hands each poll an AbortSignal that is aborted when the poll is superseded,
 *    the tab hides, or the component unmounts, so navigating away cancels the
 *    in-flight request instead of leaking it.
 *  - `active` doubles as a restart key: pass a changing value (e.g. the
 *    correlation id) and the poll restarts — with an immediate fetch — whenever
 *    it changes; pass a falsy value to stop.
 *
 * `fn` is `(signal) => Promise`. Keep the stop condition in the caller (flip
 * `active` to falsy on a terminal status). The latest `fn` closure is always
 * used, so it can safely read current props/state.
 *
 * @param {(signal: AbortSignal) => Promise<unknown>} fn
 * @param {{ active: unknown, intervalMs: number, immediate?: boolean }} options
 */
export function usePoll(fn, { active, intervalMs, immediate = true }) {
  const fnRef = useRef(fn);
  useEffect(() => {
    fnRef.current = fn;
  });

  useEffect(() => {
    if (!active) return undefined;
    let timer = null;
    let controller = null;
    let unmounted = false;

    const tick = () => {
      controller?.abort();
      controller = new AbortController();
      Promise.resolve(fnRef.current(controller.signal)).catch(() => {});
    };
    const start = (pollNow) => {
      if (timer || unmounted || document.hidden) return;
      if (pollNow) tick();
      timer = setInterval(tick, intervalMs);
    };
    const stop = () => {
      clearInterval(timer);
      timer = null;
      controller?.abort();
    };
    const onVisibility = () => (document.hidden ? stop() : start(true));

    start(immediate);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      unmounted = true;
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [active, intervalMs, immediate]);
}
