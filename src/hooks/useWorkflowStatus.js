import { useCallback, useEffect, useRef, useState } from "react";
import { markHandled } from "../api";
import { usePoll } from "./usePoll";

export const WORKFLOW_TERMINAL = new Set(["complete", "not_found", "failed"]);

const terminalByDefault = (res) => WORKFLOW_TERMINAL.has(res?.status) || !!res?.decision;

const fresh = (key) => ({ key, data: null, error: null, lastCheckedAt: null, stopped: false });

export function useWorkflowStatus(fetch, { key, intervalMs = 7000, immediate = true, isTerminal = terminalByDefault, onTerminal } = {}) {
  const [state, setState] = useState(() => fresh(key));
  const [checking, setChecking] = useState(false);
  const latest = useRef({ fetch, isTerminal, onTerminal });

  useEffect(() => {
    latest.current = { fetch, isTerminal, onTerminal };
  });

  if (state.key !== key) setState(fresh(key));

  const tick = useCallback(async (signal) => {
    setChecking(true);
    try {
      const res = await latest.current.fetch(signal);
      if (signal?.aborted) return;
      const done = latest.current.isTerminal(res);
      setState((prev) => ({ ...prev, data: res, error: null, lastCheckedAt: Date.now(), stopped: prev.stopped || done }));
      if (done) latest.current.onTerminal?.(res);
    } catch (err) {
      if (err?.name === "AbortError") return;
      markHandled(err);
      setState((prev) => ({ ...prev, error: err?.message || "Could not check the status.", lastCheckedAt: Date.now() }));
    } finally {
      setChecking(false);
    }
  }, []);

  const active = key && !state.stopped ? key : null;
  const { tick: pollNow } = usePoll(tick, { active, intervalMs, immediate });

  const refresh = useCallback(() => {
    if (!key) return Promise.resolve();
    return pollNow();
  }, [key, pollNow]);

  const data = state.key === key ? state.data : null;
  const phase = !key ? "idle" : WORKFLOW_TERMINAL.has(data?.status) ? data.status : data?.decision ? "complete" : "waiting";
  const submittedAt = data?.submitted_at ? Date.parse(data.submitted_at) : NaN;
  const elapsedMs = Number.isNaN(submittedAt) || !state.lastCheckedAt ? null : Math.max(0, state.lastCheckedAt - submittedAt);

  return {
    data,
    phase,
    error: state.key === key ? state.error : null,
    checking,
    lastCheckedAt: state.key === key ? state.lastCheckedAt : null,
    elapsedMs,
    refresh,
    stopped: state.key === key && state.stopped,
  };
}
