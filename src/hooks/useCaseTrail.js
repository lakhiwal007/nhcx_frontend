import { useCallback, useEffect, useRef, useState } from "react";
import { api, markHandled } from "../api";

const MAX_PAGES = 20;

export function useCaseTrail(ctx) {
  const caseId = ctx?.caseState?.cashless_case_id || ctx?.cashlessCase?.cashless_case_id || null;
  const seedEvents = ctx?.timelineEvents;
  const seedTotal = ctx?.timelineTotal;
  const refreshTimeline = ctx?.refreshTimeline;
  const [state, setState] = useState(() => ({ key: caseId, events: seedEvents?.length ? seedEvents : null, total: seedTotal ?? null, ledger: ctx?.moneyLedger || null, error: null, loading: !!caseId, attempt: 0 }));
  const run = useRef(0);

  if (state.key !== caseId) setState({ key: caseId, events: null, total: null, ledger: null, error: null, loading: !!caseId, attempt: 0 });

  useEffect(() => {
    if (!caseId) return undefined;
    const mine = ++run.current;
    let cancelled = false;
    const alive = () => !cancelled && run.current === mine;
    (async () => {
      try {
        const first = await api.getCaseTimeline(caseId, {});
        if (!alive()) return;
        let events = first?.events || [];
        const total = first?.total_count ?? events.length;
        setState((prev) => ({ ...prev, events, total, ledger: first?.money_ledger || prev.ledger, error: null, loading: events.length < total }));
        for (let page = 1; page < MAX_PAGES && events.length < total; page += 1) {
          const next = await api.getCaseTimeline(caseId, { offset: events.length });
          if (!alive()) return;
          if (!next?.events?.length) break;
          events = [...events, ...next.events];
          setState((prev) => ({ ...prev, events, loading: events.length < total }));
        }
        if (alive()) setState((prev) => ({ ...prev, loading: false }));
      } catch (err) {
        if (!alive()) return;
        markHandled(err);
        setState((prev) => ({ ...prev, error: err?.message || "The audit trail could not be read.", loading: false }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [caseId, state.attempt]);

  const refresh = useCallback(() => {
    refreshTimeline?.();
    setState((prev) => ({ ...prev, attempt: prev.attempt + 1, loading: true, error: null }));
  }, [refreshTimeline]);

  return {
    caseId,
    events: state.events || [],
    total: state.total,
    ledger: state.ledger,
    error: state.error,
    loading: state.loading && !state.events,
    loadingMore: state.loading && !!state.events,
    refreshing: state.loading && !!state.events,
    refresh,
  };
}
