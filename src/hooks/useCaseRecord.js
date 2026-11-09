import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, markHandled } from "../api";
import { projectCaseStatus } from "../components/case/caseStages";

const fresh = (caseId, auto) => ({ key: caseId, full: null, overrides: null, loading: !!caseId && auto, error: null });

export function useCaseRecord(caseId, { seed = null, auto = true, onLoaded } = {}) {
  const [state, setState] = useState(() => fresh(caseId, auto));
  const alive = useRef(true);
  const latest = useRef({ onLoaded });

  useEffect(() => {
    latest.current = { onLoaded };
  });

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  if (state.key !== caseId) {
    const carried = state.full && caseId && String(state.full.cashless_case_id) === String(caseId);
    setState(carried ? { ...state, key: caseId, loading: false, error: null } : fresh(caseId, auto));
  }

  const apply = useCallback((full) => {
    if (!full) return;
    setState((prev) => ({ ...prev, full, loading: false, error: null }));
    latest.current.onLoaded?.(full);
  }, []);

  const override = useCallback((patch) => {
    setState((prev) => {
      const base = prev.overrides || {};
      const next = typeof patch === "function" ? patch(base) : { ...base, ...patch };
      return { ...prev, overrides: next };
    });
  }, []);

  const reload = useCallback(
    async ({ signal, force = false } = {}) => {
      if (!caseId) return null;
      try {
        const full = await api.getCashlessStatus(caseId, signal, force);
        if (!alive.current || signal?.aborted) return full;
        if (full) {
          setState((prev) => ({ ...prev, full, loading: false, error: null }));
          latest.current.onLoaded?.(full);
        } else {
          setState((prev) => ({ ...prev, loading: false }));
        }
        return full;
      } catch (err) {
        if (err?.name === "AbortError") return null;
        markHandled(err);
        if (alive.current) setState((prev) => ({ ...prev, loading: false, error: err?.message || "The case status could not be read." }));
        return null;
      }
    },
    [caseId],
  );

  useEffect(() => {
    if (!caseId || !auto) return undefined;
    const controller = new AbortController();
    reload({ signal: controller.signal });
    return () => controller.abort();
  }, [caseId, auto, reload]);

  const full = state.key === caseId ? state.full : null;
  const overrides = state.key === caseId ? state.overrides : null;

  const record = useMemo(() => {
    if (!seed && !full && !overrides) return null;
    return { ...(seed || {}), ...projectCaseStatus(full), ...(overrides || {}) };
  }, [seed, full, overrides]);

  return {
    full,
    record,
    loading: state.key === caseId && state.loading,
    error: state.key === caseId ? state.error : null,
    reload,
    apply,
    override,
  };
}
