import { useCallback, useMemo, useState } from "react";
import { api, markHandled } from "../../api";
import { usePoll } from "./usePoll";

const LIST_PACE_MS = 60_000;
const CASE_PACE_MS = 15_000;

const EMPTY = { pending: 0, urgent: 0, unread: 0, tasksStamp: undefined, commsStamp: undefined, caseId: null, caseStamp: undefined };

export function usePulsePoll({ enabled, caseId }) {
  const [state, setState] = useState(EMPTY);

  const beat = useCallback(
    async (signal) => {
      let res = null;
      try {
        res = await api.getPulse(caseId ? { cashless_case_id: caseId } : {}, signal);
      } catch (err) {
        if (err?.name === "AbortError") return;
        markHandled(err);
      }
      if (signal?.aborted) return;
      if (res?.status !== "complete") return;
      const sameCase = caseId != null && String(res.case?.cashless_case_id) === String(caseId);
      setState({
        pending: res.pending_tasks ?? 0,
        urgent: res.urgent_tasks ?? 0,
        unread: res.unread_communications ?? 0,
        tasksStamp: `${res.pending_tasks}:${res.tasks_stamp ?? ""}`,
        commsStamp: `${res.unread_communications}:${res.communications_stamp ?? ""}`,
        caseId: sameCase ? caseId : null,
        caseStamp: sameCase ? res.case.stamp ?? "" : undefined,
      });
    },
    [caseId],
  );

  const { tick } = usePoll(beat, { active: enabled ? `pulse:${caseId ?? ""}` : null, intervalMs: caseId ? CASE_PACE_MS : LIST_PACE_MS });

  return useMemo(() => ({ ...state, refresh: tick }), [state, tick]);
}
