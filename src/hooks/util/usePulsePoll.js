import { useCallback, useMemo, useState } from "react";
import { api, markHandled } from "../../api";
import { usePoll } from "./usePoll";

const LIST_PACE_MS = 60_000;
const CASE_PACE_MS = 15_000;
const TASK_LIMIT = 50;
const COMMS_LIMIT = 100;

const EMPTY = { available: null, pending: 0, pendingTotal: null, urgent: 0, unread: 0, unreadTotal: null, tasksStamp: undefined, commsStamp: undefined, caseId: null, caseStamp: undefined };

const listCounts = async (signal) => {
  const next = {};
  try {
    const res = await api.listTasks({ status: "pending", limit: TASK_LIMIT }, signal);
    const tasks = res?.tasks ?? [];
    next.pending = tasks.length;
    next.pendingTotal = res?.total_count ?? null;
    next.urgent = tasks.filter((t) => t.priority === "urgent" || t.priority === "high").length;
  } catch (err) {
    markHandled(err);
    next.pending = 0;
  }
  try {
    const res = await api.listCommunications({ limit: COMMS_LIMIT }, signal);
    const comms = res?.communications ?? [];
    next.unread = comms.filter((c) => !c.provider_read).length;
    next.unreadTotal = res?.unread_count ?? null;
  } catch (err) {
    markHandled(err);
    next.unread = 0;
  }
  return next;
};

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
      if (res?.status === "complete") {
        const sameCase = caseId != null && String(res.case?.cashless_case_id) === String(caseId);
        setState({
          available: true,
          pending: res.pending_tasks ?? 0,
          pendingTotal: res.pending_tasks ?? 0,
          urgent: res.urgent_tasks ?? 0,
          unread: res.unread_communications ?? 0,
          unreadTotal: res.unread_communications ?? 0,
          tasksStamp: `${res.pending_tasks}:${res.tasks_stamp ?? ""}`,
          commsStamp: `${res.unread_communications}:${res.communications_stamp ?? ""}`,
          caseId: sameCase ? caseId : null,
          caseStamp: sameCase ? res.case.stamp ?? "" : undefined,
        });
        return;
      }
      const counts = await listCounts(signal);
      if (signal?.aborted) return;
      setState((prev) => ({ ...EMPTY, ...prev, ...counts, available: false, caseId: null, caseStamp: undefined, tasksStamp: undefined, commsStamp: undefined }));
    },
    [caseId],
  );

  const { tick } = usePoll(beat, { active: enabled ? `pulse:${caseId ?? ""}` : null, intervalMs: caseId ? CASE_PACE_MS : LIST_PACE_MS });

  return useMemo(() => ({ ...state, taskLimit: TASK_LIMIT, commsLimit: COMMS_LIMIT, refresh: tick }), [state, tick]);
}
