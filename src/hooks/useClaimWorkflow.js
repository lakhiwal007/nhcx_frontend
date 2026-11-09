import { useEffect, useState } from "react";
import { api, markHandled } from "../api";
import { useSend } from "./useSend";
import { useCaseDocuments } from "./useCaseDocuments";
import { useWorkflowStatus } from "./useWorkflowStatus";
import { liveAsks } from "../components/case/askStatus";
import { verdictFor } from "../components/case/verdict";
import { buildClaimChecklist } from "../components/case/claimChecklist";

const POLL_INTERVAL_MS = 7000;
const HIS_BLOCKERS = new Set(["diagnoses", "items", "preauth_ref"]);
const CLAIM_TERMINAL = new Set(["complete", "not_found", "failed"]);

const answerBody = (answer) =>
  answer ? { questionnaire_response: { status: "completed", item: [{ linkId: "query-1", answer: [{ valueString: answer }] }] } } : {};

const draftParams = (caseId, claimId) => (caseId ? { cashless_case_id: caseId } : claimId ? { claim_id: claimId } : null);

export function useClaimWorkflow(ctx, { navState = {}, biometric = null, locked = false, onDischargeSent, onFinalSent } = {}) {
  const { caseState, updateCaseState, cashlessCase, caseRecord, moneyLedger, timelineEvents, refreshTimeline, reloadCase, caseClosed, setDraftFiles } = ctx;
  const claimId = caseState.claim_id || navState.claim_id || null;
  const caseId = caseState.cashless_case_id || navState.cashless_case_id || null;
  const anchor = caseId || claimId || null;
  const filesKey = anchor ? `${anchor}:claim` : null;
  const dischargeId = caseState.dischargeCorrelationId || null;
  const finalId = caseState.claimCorrelationId || null;
  const releaseId = caseState.releaseCorrelationId || null;

  const [state, setState] = useState({ key: null, draft: null, missingFields: [], error: null, attempt: 0 });
  const [askForms, setAskForms] = useState([]);
  const [asksReload, setAsksReload] = useState(0);
  const [asksError, setAsksError] = useState(null);
  const [ackOverCeiling, setAckOverCeiling] = useState(false);

  const loadKey = `${anchor || ""}|${state.attempt}`;
  const loading = !!anchor && state.key !== loadKey;

  useEffect(() => {
    const params = draftParams(caseId, claimId);
    if (!params) return undefined;
    let cancelled = false;
    api
      .prepareClaimDraft(params)
      .then((res) => {
        if (!cancelled) setState((prev) => ({ ...prev, key: loadKey, draft: res, missingFields: res.missing_fields ?? [], error: null }));
      })
      .catch((err) => {
        if (cancelled) return;
        markHandled(err);
        setState((prev) => ({ ...prev, key: loadKey, draft: null, missingFields: [], error: err?.message || "The claim draft could not be built." }));
      });
    return () => {
      cancelled = true;
    };
  }, [caseId, claimId, loadKey]);

  const draft = state.key === loadKey ? state.draft : null;
  const missingFields = state.key === loadKey ? state.missingFields : [];
  const reload = () => setState((prev) => ({ ...prev, attempt: prev.attempt + 1 }));
  const setMissingFields = (next) => setState((prev) => ({ ...prev, missingFields: next }));

  const draftClaimId = draft?.claim_id ?? null;
  const draftCaseId = draft?.cashless_case_id ?? null;
  const storedClaimId = caseState.claim_id;
  const storedCaseId = caseState.cashless_case_id;
  useEffect(() => {
    const updates = {};
    if (draftClaimId && !storedClaimId) updates.claim_id = draftClaimId;
    if (draftCaseId && !storedCaseId) updates.cashless_case_id = draftCaseId;
    if (Object.keys(updates).length) updateCaseState(updates);
  }, [draftClaimId, draftCaseId, storedClaimId, storedCaseId, updateCaseState]);

  const refreshAsks = () => {
    const params = draftParams(caseId, claimId);
    if (!params) return;
    setAsksReload((n) => n + 1);
    setAsksError(null);
    api
      .prepareClaimDraft(params)
      .then((res) => setState((prev) => (prev.draft ? { ...prev, draft: { ...prev.draft, payer_asks: res.payer_asks } } : prev)))
      .catch((err) => {
        markHandled(err);
        setAsksError(err?.message || "The payer's asks could not be reloaded.");
      });
  };

  const recordClaim = caseRecord?.claim?.correlation_id || null;
  const recordLeg = caseRecord?.legs?.claim;
  useEffect(() => {
    if (!recordClaim || finalId) return;
    if ((recordLeg ?? "sent") === "draft") {
      if (!dischargeId) updateCaseState({ dischargeCorrelationId: recordClaim });
    } else {
      updateCaseState({ claimCorrelationId: recordClaim });
    }
  }, [recordClaim, recordLeg, finalId, dischargeId, updateCaseState]);

  const discharge = useWorkflowStatus((signal) => api.getClaimStatus(dischargeId, signal), {
    key: dischargeId,
    intervalMs: POLL_INTERVAL_MS,
    isTerminal: (res) => CLAIM_TERMINAL.has(res?.status) || res?.decision === "REJECTED" || res?.decision === "QUERIED",
    onTerminal: () => refreshTimeline?.(),
  });
  const final = useWorkflowStatus((signal) => api.getClaimStatus(finalId, signal), {
    key: finalId,
    intervalMs: POLL_INTERVAL_MS,
    isTerminal: (res) => CLAIM_TERMINAL.has(res?.status),
    onTerminal: () => {
      refreshTimeline?.();
      reloadCase?.();
    },
  });
  const release = useWorkflowStatus((signal) => api.getReprocessStatus(releaseId, signal), {
    key: releaseId,
    intervalMs: POLL_INTERVAL_MS,
    isTerminal: (res) => res?.status === "complete" || res?.status === "failed",
    onTerminal: () => refreshTimeline?.(),
  });

  const documents = useCaseDocuments(ctx, { key: filesKey, seed: draft?.supporting_documents });
  const docs = documents.documents;
  const asks = liveAsks(draft?.payer_asks, docs, askForms);
  const askCodes = asks.filter((a) => a.kind === "document").map((a) => String(a.code));
  const { otherDocs } = documents.partition(askCodes);
  const blockingAsks = asks.filter((a) => a.blocking);
  const warnAsks = asks.filter((a) => !a.blocking && a.status !== "attached" && a.status !== "answered");
  const hasMissingDocs = otherDocs.some((d) => !d.optional && !d.url && !d.attachment);
  const attached = docs.filter((d) => d.url || d.attachment);

  const patientContextMissing = missingFields.filter((f) => !HIS_BLOCKERS.has(f.toLowerCase()) && !f.startsWith("discharge."));
  const dischargeMissing = missingFields.filter((f) => f.startsWith("discharge."));
  const hisBlockers = missingFields.filter((f) => HIS_BLOCKERS.has(f.toLowerCase()) && f.toLowerCase() !== "preauth_ref");
  const dischargeRules = draft?.discharge_rules;
  const hasPreauthRef = !!draft?.preauth_ref;

  const authorizedCeiling = moneyLedger?.authorized_ceiling?.value;
  const billedTotal = draft?.total_amount;
  const overCeiling = authorizedCeiling != null && billedTotal != null && billedTotal > authorizedCeiling;
  const ceilingExcess = overCeiling ? billedTotal - authorizedCeiling : 0;

  const dischargeView = verdictFor(discharge.data);
  const dischargeRejected = dischargeView.decision === "REJECTED";
  const dischargeQueried = dischargeView.decision === "QUERIED";
  const dischargeFailed = dischargeView.phase === "failed";
  const dischargeWaiting = !!dischargeId && discharge.phase === "waiting";
  const dischargeIntimation = cashlessCase?.discharge_intimation !== false;

  const claimView = verdictFor(final.data);
  const decisionEvent = [...(timelineEvents || [])].reverse().find((e) => e.workflow === "claim" && e.decision);
  const provenance = decisionEvent ? { ...decisionEvent.decision, nhcx_workflow_id: decisionEvent.nhcx_workflow_id } : null;
  const finalFailed = claimView.phase === "failed";
  const finalSent = !!finalId && !finalFailed;
  const finalWaiting = !!finalId && final.phase === "waiting";
  const claimDecided = claimView.phase === "decided" && !!claimView.decision && claimView.decision !== "UNKNOWN";
  const claimUnclear = claimView.phase === "decided" && !claimDecided;
  const ambiguous = claimDecided && !!(provenance?.ambiguous ?? claimView.ambiguous);
  const claimTotals = final.data?.totals || {};
  const claimApproved = final.data?.approved_amount ?? claimTotals.benefit?.value ?? claimTotals.approved?.value ?? null;
  const claimRequested = claimTotals.submitted?.value ?? draft?.total_amount ?? null;
  const isApproved = claimView.decision === "APPROVED";
  const isPartial = claimView.decision === "PARTIALLY_APPROVED";
  const isQueried = claimView.decision === "QUERIED";
  const isRejected = claimView.decision === "REJECTED";
  const balanceOwed = claimRequested != null && claimApproved != null ? claimRequested - claimApproved : 0;
  const settledGross = moneyLedger?.settlement?.gross;
  const releaseOwed = caseClosed ? (claimApproved != null && settledGross != null ? Math.max(0, claimApproved - settledGross) : 0) : balanceOwed;

  const justification = [
    ["Chief complaints", draft?.chief_complaints],
    ["Clinical findings", draft?.clinical_findings],
    ["Investigations", draft?.investigations],
    ["Medications", draft?.medications],
  ].filter(([, codes]) => codes?.length > 0);

  const docsLocked = locked || finalSent;
  const groups = buildClaimChecklist({
    biometric,
    patientMissing: patientContextMissing.length,
    dischargeRequired: !!dischargeRules?.required,
    dischargeMissing: dischargeMissing.length,
    dischargeType: draft?.discharge?.type,
    hasPreauthRef,
    preauthRef: draft?.preauth_ref,
    dischargeDate: draft?.discharge_date,
    justified: justification.reduce((sum, [, codes]) => sum + codes.length, 0),
    hisBlocked: hisBlockers.length > 0,
    ceilingExcess,
    ackOverCeiling,
    authorised: authorizedCeiling,
    total: draft?.total_amount,
    asks,
    blockingAsks: blockingAsks.length,
    hasMissingDocs,
    attachedFiles: otherDocs.filter((d) => d.url || d.attachment).length,
    dischargeIntimation,
    dischargeRejected,
    dischargeFailed,
    dischargePolling: dischargeWaiting,
    dischargeSent: !!dischargeId,
    dischargeDecision: dischargeView.decision,
    dischargeNoAnswer: dischargeView.phase === "not_found",
    finalFailed,
    finalSent,
    decision: claimView.phase === "decided" ? claimView.decision || "UNKNOWN" : null,
    notFound: claimView.phase === "not_found",
    locked: docsLocked,
  });
  const blockers = groups.flatMap((g) => g.rows).filter((r) => r.blocks);
  const dischargeBlockers = blockers.filter((r) => r.id !== "bill" || hisBlockers.length > 0);
  const dischargeNext = dischargeIntimation && !finalId && (!dischargeId || dischargeFailed);
  const finalAllowed = !dischargeQueried && !dischargeRejected && !dischargeWaiting;
  const canSend = missingFields.length === 0 && hasPreauthRef && !hasMissingDocs;

  const sendDischarge = useSend(
    async () => {
      const res = await api.submitDischargeClaim({ claim_id: draft.claim_id, ...(attached.length > 0 && { supporting_documents: attached }) });
      updateCaseState({ dischargeCorrelationId: res.correlation_id });
      return res;
    },
    { success: "Discharge claim sent to the payer", onDone: onDischargeSent },
  );

  const sendFinal = useSend(
    async () => {
      const res = await api.submitFinalClaim({ claim_id: draft.claim_id, ...(attached.length > 0 && { supporting_documents: attached }) });
      updateCaseState({ claimCorrelationId: res.correlation_id });
      if (filesKey) setDraftFiles(filesKey, []);
      return res;
    },
    { success: "Final claim sent to the payer", onDone: onFinalSent },
  );

  const answerQuery = async ({ answer, docs: files }) => {
    const res = await api.respondClaimQuery({ claim_id: draft?.claim_id || claimId, ...(files?.length > 0 && { supporting_documents: files }), ...answerBody(answer) });
    updateCaseState({ claimCorrelationId: res.correlation_id });
    return res;
  };

  const requestRelease = useSend(
    async ({ amount, note }) => {
      const res = await api.requestClaimRelease({ claim_id: claimId, amount: Number(amount), ...(note?.trim() ? { note: note.trim() } : {}) });
      updateCaseState({ releaseCorrelationId: res.correlation_id || null, releaseRequestedAt: new Date().toISOString() });
      return res;
    },
    { success: "Balance request sent to the payer" },
  );

  const resubmitDischarge = useSend(
    async ({ items, answer }) => {
      const res = await api.resubmitDischargeClaim({
        ...(claimId ? { claim_id: claimId } : {}),
        ...(items?.length > 0 ? { items } : {}),
        ...(attached.length > 0 ? { supporting_documents: attached } : {}),
        ...(dischargeQueried && answer?.trim() ? answerBody(answer.trim()) : {}),
      });
      updateCaseState({ dischargeCorrelationId: res.correlation_id });
      return res;
    },
    { success: dischargeQueried ? "Answer sent to the payer" : "Discharge claim sent again", onDone: onDischargeSent },
  );

  const askGateway = useSend(
    async () => {
      const res = await api.requestGatewayStatus({ correlation_id: finalId, claim_id: claimId, use_case: "claim" });
      if (!res?.enquiry_correlation_id) throw new Error(res?.message || res?.error?.message || "The status enquiry could not be sent.");
      return res;
    },
    { success: "Asked NHCX where this claim stands. The answer lands in the audit trail." },
  );

  return {
    claimId,
    caseId,
    draft,
    loading,
    error: state.key === loadKey ? state.error : null,
    reload,
    missingFields,
    setMissingFields,
    patientContextMissing,
    dischargeMissing,
    hisBlockers,
    dischargeRules,
    hasPreauthRef,
    documents,
    docs,
    otherDocs,
    attached,
    asks,
    setAskForms,
    asksReload,
    asksError,
    refreshAsks,
    blockingAsks,
    warnAsks,
    authorizedCeiling,
    overCeiling,
    ceilingExcess,
    ackOverCeiling,
    setAckOverCeiling,
    justification,
    dischargeId,
    discharge,
    dischargeView,
    dischargeRejected,
    dischargeQueried,
    dischargeFailed,
    dischargeWaiting,
    dischargeIntimation,
    finalId,
    final,
    claimView,
    provenance,
    ambiguous,
    finalFailed,
    finalSent,
    finalWaiting,
    claimDecided,
    claimUnclear,
    claimTotals,
    claimApproved,
    claimRequested,
    isApproved,
    isPartial,
    isQueried,
    isRejected,
    releaseOwed,
    releaseId,
    release,
    docsLocked,
    groups,
    blockers,
    dischargeBlockers,
    dischargeNext,
    finalAllowed,
    canSend,
    sendDischarge,
    sendFinal,
    answerQuery,
    requestRelease,
    resubmitDischarge,
    askGateway,
  };
}
