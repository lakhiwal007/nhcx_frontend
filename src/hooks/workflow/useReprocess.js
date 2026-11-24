import { useState } from "react";
import { api } from "../../api";
import { useSend } from "../util/useSend";
import { useCaseDocuments } from "../case/useCaseDocuments";
import { useWorkflowStatus } from "../case/useWorkflowStatus";
import { useStageRefresh } from "../case/useStageRefresh";
import { verdictFor } from "../../components/case/step/verdict";

const POLL_INTERVAL_MS = 7000;
const FINISHED = new Set(["complete", "failed", "not_found"]);

export const REASON_CODES = [
  { value: "claimrejected", label: "The payer rejected the claim", short: "Claim rejected" },
  { value: "rejectiondisputed", label: "The rejection is disputed, with new evidence", short: "Disputed" },
];
const EVIDENCE = [{ category: "attachment", name: "Justification / Supporting Document", code: "ATTACHMENT", optional: true }];

export const reasonName = (code) => REASON_CODES.find((r) => r.value === code)?.label || code;

export function unavailableReason(claimLeg, closed, shut = closed) {
  if (shut) return "This case is closed. Reopen the case to send an appeal.";
  if (closed) return "This claim is settled, so there is nothing left to appeal.";
  if (!claimLeg || claimLeg === "rejected") return null;
  if (claimLeg === "approved" || claimLeg === "partial") return "The payer did not reject this claim. To recover an unpaid balance, ask for the balance on the Claim step.";
  if (claimLeg === "queried") return "The payer has an open query on this claim. Answer it on the Claim step.";
  if (claimLeg === "submitting") return "The payer has not decided this claim yet. An appeal can follow only a rejection.";
  return "Only a final claim the payer has rejected can be appealed.";
}

const normalize = (res) => (res?.decision ? { ...res, decision: String(res.decision).replace(/^REPROCESS_/, "") } : res);

export function useReprocess(ctx, { locked = false, onSent } = {}) {
  const { caseState, caseRecord, cashlessCase, caseClosed, caseShut, reloadCase, refreshTimeline, draftFiles, setDraftFiles, timelineEvents } = ctx;
  const caseId = caseState.cashless_case_id || null;
  const anchor = caseId || caseState.claim_id || null;
  const filesKey = anchor ? `${anchor}:reprocess` : null;
  const textKey = filesKey ? `${filesKey}:text` : null;
  const stored = textKey ? draftFiles?.[textKey] : null;

  const [reasonCode, setReasonCodeState] = useState(stored?.reasonCode || "claimrejected");
  const [description, setDescriptionState] = useState(stored?.description || "");
  const [sentId, setSentId] = useState(null);
  const [dismissedId, setDismissedId] = useState(null);

  const keep = (patch) => {
    if (textKey) setDraftFiles(textKey, { reasonCode, description, ...patch });
  };
  const setReasonCode = (value) => {
    setReasonCodeState(value);
    keep({ reasonCode: value });
  };
  const setDescription = (value) => {
    setDescriptionState(value);
    keep({ description: value });
  };

  const appeal = caseRecord?.reprocess || null;
  const recoveredId = appeal?.correlation_id && appeal.correlation_id !== dismissedId ? appeal.correlation_id : null;
  const correlationId = sentId || recoveredId;
  const claimId = caseRecord?.claim?.claim_id ?? caseRecord?.claim_id ?? cashlessCase?.claim_id ?? caseState.claim_id ?? null;
  const claimLeg = (caseRecord?.legs ?? cashlessCase?.legs)?.claim;
  const unavailable = unavailableReason(claimLeg, caseClosed, caseShut);

  const status = useWorkflowStatus((signal) => api.getReprocessStatus(correlationId, signal), {
    key: correlationId,
    intervalMs: POLL_INTERVAL_MS,
    isTerminal: (res) => FINISHED.has(res?.status),
    onTerminal: () => {
      reloadCase?.();
      refreshTimeline?.();
    },
  });
  useStageRefresh(ctx, () => status.refresh());

  const seeded = !status.data && correlationId && correlationId === appeal?.correlation_id && appeal?.decision ? { status: "complete", decision: appeal.decision, reason_code: appeal.reason_code } : null;
  const data = normalize(status.data || seeded);
  const view = verdictFor(data);
  const waiting = !!correlationId && !data;
  const claimResponse = data?.claim_response || null;
  const totals = claimResponse?.totals || {};
  const lines = claimResponse?.items || [];
  const approved = totals.benefit?.value ?? totals.approved?.value ?? null;
  const payerErrors = [...(data?.errors || []), ...(claimResponse?.errors || []).map((e) => ({ ...e, message: e.message || e.detail }))];
  const sentReason = data?.reason_code ?? appeal?.reason_code ?? (sentId ? reasonCode : null);

  const claimDecisionEvent = [...(timelineEvents || [])].reverse().find((e) => e.workflow === "claim" && e.decision && !String(e.detail?.workflow_type || "").startsWith("discharge"));
  const rejection = {
    notes: caseRecord?.claim?.process_notes || [],
    errors: caseRecord?.claim?.errors || [],
    reasonCodes: claimDecisionEvent?.decision?.reason_codes || caseRecord?.claim?.reason_codes || [],
  };

  const documents = useCaseDocuments(ctx, { key: filesKey, seed: EVIDENCE });
  const attached = documents.attached;
  const explanation = description.trim();

  const send = useSend(
    async () => {
      const res = await api.submitReprocess({ claim_id: claimId, reason_code: reasonCode, description: explanation, supporting_documents: attached });
      if (filesKey) setDraftFiles(filesKey, []);
      if (textKey) setDraftFiles(textKey, null);
      setDismissedId(null);
      setSentId(res.correlation_id);
      reloadCase?.();
      return res;
    },
    { success: "Appeal sent to the payer", onDone: onSent },
  );

  const startAnother = () => {
    send.reset();
    setSentId(null);
    setDismissedId(correlationId);
  };

  return {
    caseId,
    claimId,
    claimLeg,
    unavailable,
    canAppeal: !unavailable && !locked,
    reasonCode,
    setReasonCode,
    description,
    setDescription,
    explanation,
    documents,
    attached,
    correlationId,
    status,
    data,
    view,
    waiting,
    claimResponse,
    totals,
    lines,
    approved,
    payerErrors,
    sentReason,
    rejection,
    send,
    startAnother,
    loading: !!ctx.caseLoading && !caseRecord,
    loadError: ctx.caseError || null,
    reload: reloadCase,
  };
}
