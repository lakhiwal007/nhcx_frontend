import { useCallback, useEffect, useState } from "react";
import { api } from "../../api";
import { useSend } from "../util/useSend";
import { useWorkflowStatus } from "../case/useWorkflowStatus";
import { useStageRefresh } from "../case/useStageRefresh";
import { CLAIM_WITH_PAYER } from "../../components/case/frame/caseStages";
import { verdictFor } from "../../components/case/step/verdict";

const POLL_INTERVAL_MS = 7000;
const ENQUIRY_TERMINAL = new Set(["complete", "failed", "not_found"]);
const CLAIM_DECIDED = ["approved", "partial", "rejected"];
const CANCELLABLE_PREAUTH = ["submitting", "approved", "partial", "queried"];

export function usePreauthDecision(ctx) {
  const { caseState, updateCaseState, cashlessCase, overrideCase, caseRecord, applyCase, reloadCase, timelineEvents, caseClosed } = ctx;
  const { preauthCorrelationId: correlationId, claim_id, cashless_case_id } = caseState;
  const recoveredId = caseRecord?.preauth?.correlation_id || null;
  useEffect(() => {
    if (!correlationId && recoveredId) updateCaseState({ preauthCorrelationId: recoveredId });
  }, [correlationId, recoveredId, updateCaseState]);

  const restart = useCallback(
    (newId) => {
      updateCaseState({ preauthCorrelationId: newId, preauthDecision: null });
      overrideCase?.({ preauth_status: null });
    },
    [updateCaseState, overrideCase],
  );

  const [cancelRefused, setCancelRefused] = useState(false);

  const status = useWorkflowStatus((signal) => api.getPreauthStatus(correlationId, signal), {
    key: correlationId,
    intervalMs: POLL_INTERVAL_MS,
    onData: (res) => {
      const updates = {};
      if (res.preauth_ref) updates.preauthRef = res.preauth_ref;
      if (res.decision) updates.preauthDecision = res.decision;
      if (res.claim_id && !claim_id) updates.claim_id = res.claim_id;
      if (res.cashless_case_id && !cashless_case_id) updates.cashless_case_id = res.cashless_case_id;
      if (res.status === "complete") {
        const authorized = res.totals?.benefit?.value ?? res.totals?.eligible?.value;
        if (authorized != null) updates.approvedAmount = authorized;
      }
      if (Object.keys(updates).length) updateCaseState(updates);
    },
    onTerminal: (res) => {
      if (res.decision === "CANCELLATION_REJECTED") {
        setCancelRefused(true);
        if (caseState.preauthBeforeCancel) {
          const original = caseState.preauthBeforeCancel;
          updateCaseState({ preauthBeforeCancel: null });
          restart(original);
        }
      }
    },
  });

  useStageRefresh(ctx, () => status.refresh());

  const data = status.data;
  const cachedDecision = !data && caseState.preauthDecision && caseState.preauthDecision !== "UNKNOWN" ? caseState.preauthDecision : null;
  const view = data ? verdictFor(data) : cachedDecision ? verdictFor({ status: "complete", decision: cachedDecision }) : verdictFor({ status: "pending" });
  const decisionEvent = [...(timelineEvents || [])].reverse().find((e) => e.workflow === "preauth" && e.decision && e.correlation_id === correlationId);
  const provenance = decisionEvent ? { ...decisionEvent.decision, nhcx_workflow_id: decisionEvent.nhcx_workflow_id } : null;
  const ambiguous = provenance?.ambiguous ?? view.ambiguous;
  const elapsedMs = status.elapsedMs ?? 0;

  const enquiryId = caseState.statusEnquiry?.leg === correlationId ? caseState.statusEnquiry.id : null;
  const enquiry = useWorkflowStatus((signal) => api.getReprocessStatus(enquiryId, signal), {
    key: enquiryId,
    intervalMs: POLL_INTERVAL_MS,
    isTerminal: (res) => ENQUIRY_TERMINAL.has(res?.status),
  });

  const askGateway = useSend(
    async () => {
      const res = await api.requestGatewayStatus({ correlation_id: correlationId, claim_id, use_case: "preauth" });
      if (!res?.enquiry_correlation_id) throw new Error(res?.message || res?.error?.message || "The status enquiry could not be sent.");
      updateCaseState({ statusEnquiry: { leg: correlationId, id: res.enquiry_correlation_id, asked_at: new Date().toISOString() } });
      return res;
    },
    { success: "Asked NHCX where this pre-auth stands" },
  );

  const resolvedCaseId = cashless_case_id || data?.cashless_case_id || cashlessCase?.cashless_case_id || null;

  const answerQuery = async ({ answer, docs, lines }) => {
    const res = await api.respondPreauthQuery({
      ...(resolvedCaseId ? { cashless_case_id: resolvedCaseId } : {}),
      ...(claim_id ? { claim_id } : {}),
      supporting_documents: docs ?? [],
      ...(lines?.length > 0 ? { query_answers: lines } : {}),
      ...(answer ? { questionnaire_response: { status: "completed", item: [{ linkId: "query-1", answer: [{ valueString: answer }] }] } } : {}),
    });
    restart(res.correlation_id);
    return res;
  };

  const cancel = useSend(
    async ({ reason, description }) => {
      const res = await api.cancelPreauth({
        ...(resolvedCaseId ? { cashless_case_id: resolvedCaseId } : {}),
        ...(claim_id ? { claim_id } : {}),
        preauth_ref: data?.preauth_ref,
        reason,
        description,
      });
      setCancelRefused(false);
      updateCaseState({ preauthBeforeCancel: correlationId });
      restart(res.correlation_id);
      return res;
    },
    { success: "Cancellation sent to the payer" },
  );

  const recheck = useSend(
    async () => {
      const res = await api.getCashlessStatus(resolvedCaseId, undefined, true);
      applyCase(res);
      return res;
    },
    { success: "Eligibility data refreshed" },
  );

  const legs = cashlessCase?.legs;
  const claimWithPayer = CLAIM_WITH_PAYER.includes(legs?.claim);
  const canAnswer = !claimWithPayer && !caseClosed;
  const canEnquire = cashlessCase?.answers_status_enquiry !== false;
  const canCancel = legs
    ? CANCELLABLE_PREAUTH.includes(legs.preauth) && !CLAIM_DECIDED.includes(legs.claim) && !caseClosed
    : view.phase === "decided" && (view.decision === "APPROVED" || view.decision === "PARTIALLY_APPROVED") && !caseClosed;

  return {
    correlationId,
    resolvedCaseId,
    data,
    view,
    ambiguous,
    provenance,
    cachedDecision,
    waiting: status.phase === "waiting" && !cachedDecision,
    checking: status.checking,
    pollError: status.error,
    lastCheckedAt: status.lastCheckedAt,
    elapsedMs,
    refresh: () => restart(correlationId),
    recover: reloadCase,
    enquiryId,
    enquiry: enquiry.data,
    enquiryError: enquiry.error,
    askGateway,
    answerQuery,
    cancel,
    cancelRefused,
    recheck,
    restart,
    canAnswer,
    canEnquire,
    canCancel,
    claimWithPayer,
  };
}
