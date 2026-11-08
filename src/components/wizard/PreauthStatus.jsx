import { useState, useEffect, useRef } from "react";
import StageBar from "../case/StageBar";
import { usePoll } from "../../hooks/usePoll";
import { useNavigate, useLocation } from "react-router-dom";
import { ArrowRight, MoreHorizontal, RefreshCw, PlusCircle, X, Wifi, Send } from "lucide-react";
import { api } from "../../api";
import { useReadOnly, READ_ONLY_TITLE } from "../../readOnly";
import { Button, DocumentChecklist, LoadingBlock, QueryResponseFields, formatMoney, Tip } from "../Common";
import { formatDate, formatDateTime } from "../../format.js";
import { Section, Fields } from "../case/CaseFile";
import { CLAIM_WITH_PAYER } from "../case/caseStages";
import PayerAsks from "../case/PayerAsks";
import CaseChecklist from "../case/CaseChecklist";
import { useCasePane } from "../case/useCasePane";
import { buildApprovalChecklist, firstApprovalItem } from "../case/approvalChecklist";
import { liveAsks } from "../case/askStatus";
import { Drawer, Modal } from "../Overlay";
import { buildQueryResponseBody, documentFromFile } from "../../queryResponse.js";
import PayrErrorList from "../PayrErrorList";
import SendCommunicationModal, { OUTBOUND_COMMUNICATIONS_ENABLED } from "../SendCommunicationModal";

const POLL_INTERVAL_MS = 7000;
const SOFT_WARNING_MS = 120_000;
const GATEWAY_RECOVERY_MS = 300_000;
const CANCEL_REASONS = [
  { value: "treatmentplanchanged", label: "Treatment plan changed during hospitalization" },
  { value: "patientrequest", label: "Patient requested cancellation" },
  { value: "financialconstraints", label: "Financial constraints" },
  { value: "alternativetreatment", label: "Alternative treatment chosen" },
  { value: "duplicateclaim", label: "Duplicate claim / preauth" },
  { value: "administrativeerror", label: "Administrative error" },
  { value: "other", label: "Other reason" },
];
const CLAIM_DECIDED = ["approved", "partial", "rejected"];
const CANCELLABLE_PREAUTH = ["submitting", "approved", "partial", "queried"];
const READ_ONLY_NOTICE =
  "The claim has gone to the payer, so the pre-authorisation is read only: no enhancement or change can be made. It can only be cancelled while the payer is deciding the claim.";

function netAmountOf(claimItem, adj) {
  if (claimItem?.net_amount != null) return claimItem.net_amount;
  const unit = claimItem?.unit_price ?? claimItem?.amount;
  if (unit != null) return (claimItem?.quantity ?? 1) * unit;
  return adj?.submitted?.value ?? null;
}

function ActionButton({ action, readOnly, onRun }) {
  const blocked = action.write && readOnly;
  return (
    <button type="button" className="cv-btn" disabled={action.disabled || blocked} title={blocked ? READ_ONLY_TITLE : action.title} onClick={() => onRun(action.id)}>
      {action.icon && <action.icon size={14} />}
      {action.label}
    </button>
  );
}

export default function PreauthStatus({ ctx }) {
  const navigate = useNavigate();
  const readOnly = useReadOnly();
  const location = useLocation();
  const { caseState, updateCaseState, cashlessCase, setCashlessCase, timelineEvents, caseClosed, draftFiles, setDraftFiles } = ctx;
  const { preauthCorrelationId, claim_id, cashless_case_id, draftData } = caseState;
  const payerId = caseState.payer?.code || cashlessCase?.payer_id || "";
  const policyNumber = caseState.policy?.policy_number || cashlessCase?.policy_number || "";

  const { picked, paneRef, openItem } = useCasePane();
  const [statusData, setStatusData] = useState(null);
  const [pollError, setPollError] = useState(null);
  const [polling, setPolling] = useState(true);
  const [pollElapsed, setPollElapsed] = useState(0);
  const [showQueryDrawer, setShowQueryDrawer] = useState(false);
  const [showResubmitDrawer, setShowResubmitDrawer] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [showSendModal, setShowSendModal] = useState(false);

  const [queryAnswer, setQueryAnswer] = useState("");
  const [queryDocs, setQueryDocs] = useState([]);
  const [queryDoc, setQueryDoc] = useState([]);
  const [queryError, setQueryError] = useState(null);
  const [resubmitItems, setResubmitItems] = useState([]);
  const [resubmitError, setResubmitError] = useState(null);
  const [resubmitDraft, setResubmitDraft] = useState(null);
  const [resubmitForms, setResubmitForms] = useState([]);
  const [cancelRefused, setCancelRefused] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelDesc, setCancelDesc] = useState("");
  const [cancelError, setCancelError] = useState(null);

  const [submitting, setSubmitting] = useState(false);
  const [recheckingEligibility, setRecheckingEligibility] = useState(false);
  const [recheckMessage, setRecheckMessage] = useState("");
  const [enquiry, setEnquiry] = useState(null);
  const [enquiryError, setEnquiryError] = useState(null);

  const correlationId = preauthCorrelationId;
  const startTimeRef = useRef(Date.now());
  const elapsedRef = useRef(null);

  // Swap in a new correlation id and restart the elapsed timer; usePoll picks up
  // the change and immediately polls the new id. Also clears the prior terminal
  // decision so the case stepper doesn't keep showing the stale REJECTED/QUERIED
  // badge until the next poll tick resolves the new decision (backend clears its
  // own copy on resubmit, but the frontend's cached caseState/cashlessCase don't
  // know that until we clear them here too).
  const restartPoll = (newCorrelationId) => {
    startTimeRef.current = Date.now();
    setPollElapsed(0);
    setStatusData(null);
    setPolling(true);
    // Clear the stale decision (a new one is pending) but KEEP the last authorized
    // amount on screen — nulling it made the header "Approved" chip flicker away on
    // every query/resubmit/enhancement round-trip. The next poll overwrites it.
    updateCaseState({ preauthCorrelationId: newCorrelationId, preauthDecision: null });
    setCashlessCase?.((prev) => (prev ? { ...prev, preauth_status: null } : prev));
  };

  const pollStatus = async (signal) => {
    try {
      const res = await api.getPreauthStatus(correlationId, signal);
      setPollError(null);
      if (res.decision === "CANCELLATION_REJECTED") {
        setCancelRefused(true);
        // The cancel request has its own answer; go back to the pre-auth, which stands.
        if (caseState.preauthBeforeCancel) {
          const original = caseState.preauthBeforeCancel;
          updateCaseState({ preauthBeforeCancel: null });
          restartPoll(original);
          return;
        }
      }
      setStatusData(res);
      const stateUpdates = {};
      if (res.preauth_ref) stateUpdates.preauthRef = res.preauth_ref;
      if (res.decision) stateUpdates.preauthDecision = res.decision;
      if (res.claim_id && !claim_id) stateUpdates.claim_id = res.claim_id;
      if (res.cashless_case_id && !cashless_case_id) stateUpdates.cashless_case_id = res.cashless_case_id;
      // The authorized amount is the payer's BENEFIT total, not `eligible`
      // (eligible is pre-share and >= benefit; using it overstates the sanction
      // and drives false "short payment" alarms at settlement). Fall back to
      // eligible only if the payer omitted benefit.
      if (res.status === "complete") {
        const authorized = res.totals?.benefit?.value ?? res.totals?.eligible?.value;
        if (authorized != null) stateUpdates.approvedAmount = authorized;
      }
      if (Object.keys(stateUpdates).length) updateCaseState(stateUpdates);
      if (res.status === "complete" || res.status === "not_found" || res.status === "failed") setPolling(false);
    } catch (err) {
      if (!signal.aborted) setPollError(err.message || "The payer's answer could not be checked.");
    }
  };

  // Restarts automatically when the correlation id changes (e.g. after a query
  // response or resubmit calls restartPoll), with an immediate fetch.
  usePoll(pollStatus, {
    active: polling && correlationId ? correlationId : null,
    intervalMs: POLL_INTERVAL_MS,
  });

  const [recovering, setRecovering] = useState(false);
  const [recoverError, setRecoverError] = useState(null);

  // Recover the correlation id from the live case so a page refresh doesn't
  // leave users stranded on the "no submission found" dead-end screen.
  const recoverPreauth = async () => {
    if (!cashless_case_id) return;
    setRecovering(true);
    setRecoverError(null);
    try {
      const res = await api.getCashlessStatus(cashless_case_id);
      if (res.preauth?.correlation_id) {
        updateCaseState({ preauthCorrelationId: res.preauth.correlation_id });
      } else {
        setPolling(false);
      }
    } catch (err) {
      setPolling(false);
      setRecoverError(err.message || "The case could not be read.");
    } finally {
      setRecovering(false);
    }
  };

  useEffect(() => {
    if (correlationId) return;
    if (!cashless_case_id) { setPolling(false); return; }
    recoverPreauth();
  }, [correlationId]);

  useEffect(() => {
    if (!polling) {
      clearInterval(elapsedRef.current);
      return;
    }
    elapsedRef.current = setInterval(() => {
      setPollElapsed(Date.now() - startTimeRef.current);
    }, 5000);
    return () => clearInterval(elapsedRef.current);
  }, [polling]);

  const handleQuerySubmit = async () => {
    setSubmitting(true);
    setQueryError(null);
    try {
      const body = buildQueryResponseBody({
        cashless_case_id: resolvedCashlessCaseId,
        claim_id,
        answer: queryAnswer,
        docs: queryDocs,
      });
      const res = await api.respondPreauthQuery(body);
      if (res.status === "failed") {
        setQueryError(res.message || res.error?.message || "Query response submission failed. Please try again.");
        return;
      }
      setShowQueryDrawer(false);
      setQueryAnswer("");
      setQueryDocs([]);
      setQueryDoc([]);
      restartPoll(res.correlation_id);
    } catch (err) {
      setQueryError(err.message || "Query response submission failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleResubmitSubmit = async () => {
    setSubmitting(true);
    setResubmitError(null);
    try {
      // Only what staff changed goes; the backend rebuilds the rest from the case.
      const editedItems = resubmitItems.map((item) => {
        const quantity = Number(item.quantity) || 1;
        const unitPrice = Number(item.unit_price ?? item.amount ?? 0) || 0;
        return { ...item, quantity, unit_price: unitPrice, net_amount: quantity * unitPrice };
      });
      const attachedDocs = (resubmitDraft?.supporting_documents || []).filter((d) => d.url);
      const total = editedItems.length > 0 ? editedItems.reduce((sum, item) => sum + item.net_amount, 0) : resubmitDraft?.total_amount;
      const body = {
        ...(resolvedCashlessCaseId ? { cashless_case_id: resolvedCashlessCaseId } : {}),
        ...(claim_id ? { claim_id } : {}),
        ...(payerId ? { payer_id: payerId } : {}),
        ...(policyNumber ? { policy_number: policyNumber } : {}),
        ...(statusData?.preauth_ref ? { preauth_ref: statusData.preauth_ref } : {}),
        ...(total != null ? { total_amount: total } : {}),
        ...(editedItems.length > 0 ? { items: editedItems } : {}),
        ...(draftData?.editedDiagnoses ? { diagnoses: draftData.editedDiagnoses } : {}),
        ...(attachedDocs.length > 0 ? { supporting_documents: attachedDocs } : {}),
      };
      const res = await api.resubmitPreauth(body);
      if (res.status === "failed") {
        setResubmitError(res.message || res.error?.message || "Preauthorization resubmission failed. Please try again.");
        return;
      }
      setShowResubmitDrawer(false);
      setResubmitItems([]);
      if (filesKey) setDraftFiles(filesKey, []);
      restartPoll(res.correlation_id);
    } catch (err) {
      setResubmitError(err.message || "Preauthorization resubmission failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelSubmit = async () => {
    setSubmitting(true);
    setCancelError(null);
    try {
      const body = {
        ...(resolvedCashlessCaseId ? { cashless_case_id: resolvedCashlessCaseId } : {}),
        ...(claim_id ? { claim_id } : {}),
        preauth_ref: statusData?.preauth_ref,
        reason: cancelReason,
        description: cancelDesc,
      };
      const res = await api.cancelPreauth(body);
      if (res.status === "failed") {
        setCancelError(res.message || res.error?.message || "Cancellation failed. Please try again.");
        return;
      }
      setShowCancelModal(false);
      setCancelRefused(false);
      // A refused cancellation leaves this pre-auth standing, so keep the way back.
      updateCaseState({ preauthBeforeCancel: correlationId });
      restartPoll(res.correlation_id);
    } catch (err) {
      setCancelError(err.message || "Cancellation failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const filesKey = cashless_case_id || claim_id || null;

  // The drawer works from the same draft as the Pre-auth step: what the payer
  // asks for, the hospital's documents and any file already attached there.
  useEffect(() => {
    if (!showResubmitDrawer) return undefined;
    let live = true;
    api
      .preparePreauth(cashless_case_id ? { cashless_case_id } : { claim_id })
      .then((res) => {
        if (!live) return;
        const list = [...(res.supporting_documents || [])];
        (draftFiles?.[filesKey] || []).forEach((file) => {
          const idx = list.findIndex((d) => d.code === file.code);
          if (idx >= 0) list[idx] = { ...list[idx], ...file };
          else list.push(file);
        });
        setResubmitDraft({ ...res, supporting_documents: list });
      })
      .catch((err) => live && setResubmitError(err.message || "The draft could not be loaded."));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showResubmitDrawer]);

  const setResubmitDocs = (update) => setResubmitDraft((prev) => (prev ? { ...prev, supporting_documents: update(prev.supporting_documents || []) } : prev));
  const attachResubmitAsk = (row, uploaded) => {
    const entry = { code: row.code, category: row.category || null, name: row.display, optional: false, ...uploaded };
    setResubmitDocs((list) => {
      const idx = list.findIndex((d) => String(d.code || "").toUpperCase() === String(row.code).toUpperCase());
      return idx >= 0 ? list.map((d, i) => (i === idx ? { ...d, ...entry } : d)) : [...list, entry];
    });
  };

  const enquiryId = caseState.statusEnquiry?.leg === correlationId ? caseState.statusEnquiry.id : null;

  const handleGatewayStatus = async () => {
    setEnquiryError(null);
    try {
      const res = await api.requestGatewayStatus({ correlation_id: correlationId, claim_id, use_case: "preauth" });
      if (res.status === "failed" || !res.enquiry_correlation_id) {
        setEnquiryError(res.message || res.error?.message || res.error || "The status enquiry could not be sent.");
        return;
      }
      setEnquiry(null);
      updateCaseState({ statusEnquiry: { leg: correlationId, id: res.enquiry_correlation_id, asked_at: new Date().toISOString() } });
    } catch (err) {
      setEnquiryError(err.message || "The status enquiry could not be sent.");
    }
  };

  const enquirySettled = enquiry?.status === "complete" || enquiry?.status === "failed" || enquiry?.status === "not_found";
  usePoll(
    async (signal) => {
      try {
        setEnquiry(await api.getReprocessStatus(enquiryId, signal));
        setEnquiryError(null);
      } catch (err) {
        if (!signal?.aborted) setEnquiryError(`The payer's answer to the enquiry could not be checked, and this page keeps trying: ${err.message || "no reason given"}`);
      }
    },
    { active: enquiryId && !enquirySettled ? enquiryId : null, intervalMs: POLL_INTERVAL_MS },
  );

  const resolvedCashlessCaseId = cashless_case_id || location.state?.cashless_case_id || statusData?.cashless_case_id || cashlessCase?.cashless_case_id || caseState.draftData?.cashless_case_id || null;

  // Safe at any decision state (including CANCELLED) — only refreshes the
  // insurance_plan/coverage_eligibility blocks, never touches preauth_status/decision.
  const handleRecheckEligibility = async () => {
    if (!resolvedCashlessCaseId) return;
    setRecheckingEligibility(true);
    setRecheckMessage("");
    try {
      const res = await api.getCashlessStatus(resolvedCashlessCaseId, undefined, true);
      setCashlessCase?.((prev) => (prev ? { ...prev, insurance_plan: res.insurance_plan, coverage_eligibility: res.coverage_eligibility } : prev));
      setRecheckMessage("Eligibility data refreshed.");
    } catch (err) {
      setRecheckMessage(`Could not refresh eligibility data${err?.message ? `: ${err.message}` : "."}`);
    } finally {
      setRecheckingEligibility(false);
    }
  };
  // Until the first poll answers, a decision the case already knows stands in,
  // so the page doesn't flash "Awaiting payer" over a decided preauth.
  const cachedDecision = !statusData && caseState.preauthDecision && caseState.preauthDecision !== "UNKNOWN";
  const isComplete = statusData?.status === "complete" || !!cachedDecision;
  const isFailed = statusData?.status === "failed";
  const isNotFound = statusData?.status === "not_found";
  const decision = statusData?.decision || caseState.preauthDecision;
  // Latest preauth decision event from the audit trail — carries the payer's
  // raw outcome / reason codes / classified_by / inbound workflow id for the
  // banner (fuller provenance). nhcx_workflow_id is a sibling of `decision` on
  // the event, so fold it in.
  const preauthDecisionEvent =
    [...(timelineEvents || [])].reverse().find((e) => e.workflow === "preauth" && e.decision);
  const preauthProvenance = preauthDecisionEvent
    ? { ...preauthDecisionEvent.decision, nhcx_workflow_id: preauthDecisionEvent.nhcx_workflow_id }
    : null;
  const knownDecision = caseState.preauthDecision && caseState.preauthDecision !== "UNKNOWN";
  const isApproved = decision === "APPROVED";
  const isPartial = decision === "PARTIALLY_APPROVED";
  const isQueried = decision === "QUERIED";
  const isRejected = decision === "REJECTED";
  // Payer acknowledged a preauth/cancel — the preauth is void; only Refresh
  // is offered (no claim/enhancement/reprocess/re-cancel actions).
  const isCancelled = decision === "CANCELLED";

  // Must run unconditionally on every render (Rules of Hooks) — the early
  // "no correlationId" return below happens after this, so this effect can't
  // sit after it or the hook count changes once correlationId resolves mid-
  // mount (e.g. the recovery effect finds one after a page refresh), which
  // crashes the render with "Rendered more hooks than during the previous render."
  useEffect(() => {
    const action = location.state?.openAction;
    if (action !== "resubmit_preauth" && action !== "respond_preauth_query" && action !== "resubmit_enhancement") return;
    const canResubmit = Boolean(resolvedCashlessCaseId || claim_id || statusData?.claim_id || cashlessCase?.claim_id);
    if (canResubmit && (isQueried || isRejected || isPartial)) {
      if (resolvedCashlessCaseId) {
        updateCaseState({ cashless_case_id: resolvedCashlessCaseId });
      }
      if (action === "resubmit_preauth") {
        setShowResubmitDrawer(true);
      } else if (action === "respond_preauth_query") {
        setShowQueryDrawer(true);
      } else if (action === "resubmit_enhancement") {
        navigate("../enhancement", { replace: true });
      }
    }
  }, [location.state?.openAction, resolvedCashlessCaseId, claim_id, statusData?.claim_id, cashlessCase?.claim_id, isQueried, isRejected, isPartial, updateCaseState]);
  // Payer returned a decision that could not be classified — neutral state with
  // recovery actions (Refresh / Request Gateway Status) per the contract.
  const isUnknown = isComplete && (!decision || decision === "UNKNOWN");
  const pendingTasks = statusData?.pending_tasks ?? [];
  const showSoftWarning = polling && pollElapsed > SOFT_WARNING_MS;
  const showGatewayRecovery = polling && pollElapsed > GATEWAY_RECOVERY_MS;

  if (!correlationId) {
    return (
      <div className="wizard-step pd-screen">
        <Section id="ds-none" title="No preauth found for this case">
          <p className="ds-empty">
            If a preauth was submitted earlier, its result will appear in the Work Queue when the payer responds.
            You can also submit one from the preauth draft.
          </p>
          {recoverError && <p className="ds-empty">The case could not be read just now: {recoverError}</p>}
          <div className="ds-empty-actions">
            <Button variant="primary" size="small" onClick={() => navigate("../review")}>
              Open preauth draft
            </Button>
            {cashless_case_id && (
              <Button variant="outline" size="small" icon={RefreshCw} disabled={recovering} onClick={recoverPreauth}>
                {recovering ? "Refreshing…" : "Refresh"}
              </Button>
            )}
            <Button variant="outline" size="small" onClick={() => navigate("/work-queue")}>
              Go to Work Queue
            </Button>
          </div>
        </Section>
      </div>
    );
  }

  const totals = statusData?.totals || {};
  const approvedValue = totals.benefit?.value ?? totals.eligible?.value ?? null;
  const requestedValue = totals.submitted?.value ?? null;
  const notesByNumber = Object.fromEntries((statusData?.process_notes || []).map((n) => [n.number, n.text]));
  // `items` holds the payer's answer on each line; `claim_items` only names them.
  const adjItems = statusData?.items || [];
  const deductibleTotal = adjItems.reduce((sum, it) => sum + (Number(it.adjudication?.deductible?.value) || 0), 0);
  const outcome = statusData?.outcome;
  // Guard against a mis-classified decision hiding behind a confident verdict:
  // prefer the wrapper's own `ambiguous` flag from the decision event; fall
  // back to an approval whose raw FHIR outcome isn't a success signal.
  const ambiguous =
    preauthProvenance?.ambiguous ??
    (isApproved && outcome != null && !["complete", "partial"].includes(String(outcome).toLowerCase()));

  const verdict = isFailed
    ? { tone: "bad", label: "Not delivered" }
    : isNotFound
      ? { tone: "pending", label: "No record" }
      : !isComplete
      ? { tone: "pending", label: statusData?.purpose === "cancel" ? "Awaiting cancellation" : "Awaiting payer" }
      : isApproved
        ? { tone: ambiguous ? "warn" : "ok", label: "Approved" }
        : isPartial
          ? { tone: "warn", label: "Partially approved" }
          : isQueried
            ? { tone: "warn", label: "Query raised" }
            : isRejected
              ? { tone: "bad", label: "Rejected" }
              : isCancelled
                ? { tone: "pending", label: "Cancelled" }
                : decision === "CANCELLATION_REJECTED"
                  ? { tone: "warn", label: "Cancellation refused" }
                  : { tone: "pending", label: "Decision unclear" };

  const guide = isFailed
    ? {
        tone: "bad",
        title: "The payer never received this preauth",
        steps: ["Read the reason above.", "Go back to the preauth draft, fix what it names, and submit again."],
      }
    : isNotFound
      ? { tone: "warn", title: "The payer's system has no record of this request yet", text: "Refresh in a while. If it stays like this, ask the payer through Request gateway status or call its helpdesk." }
      : !isComplete
      ? {
          tone: "info",
          title: statusData?.purpose === "cancel" ? "The payer is processing the cancellation" : "The payer is deciding",
          text: "Private insurers must answer a preauth within 1 hour (IRDAI). You can leave this page; the decision appears here and in the Work Queue.",
        }
      : isApproved
        ? {
            tone: "ok",
            title: "Approved: go ahead with treatment",
            steps: [
              "Treat within the approved amount shown below.",
              "If treatment will cost more, use Request enhancement before discharge.",
              "When the patient is discharged, continue to Claim.",
            ],
          }
        : isPartial
          ? {
              tone: "warn",
              title: "Approved for less than you asked",
              steps: [
                "See Amount breakdown below for what the payer cut and why.",
                "Tell the patient they may have to pay the difference.",
                "If you can justify more, use Request enhancement and attach the reason.",
              ],
            }
          : isQueried
            ? {
                tone: "warn",
                title: "The payer has a question",
                steps: [
                  "Read the payer's note below to see what it needs.",
                  "Press Respond to query and attach the documents or details it asks for.",
                  "The decision waits until you answer, so reply quickly.",
                ],
              }
            : isRejected
              ? {
                  tone: "bad",
                  title: "Rejected",
                  steps: [
                    "Read the payer's reason under Payer notes.",
                    "If you can fix it, such as a missing document or a wrong code, press Resubmit preauth.",
                    "If not, tell the patient. They can continue as a cash patient.",
                  ],
                }
              : isCancelled
                ? { tone: "info", title: "Cancelled", text: "This preauth was withdrawn. If the patient is admitted again, start a new case." }
                : {
                    tone: "warn",
                    title: "The payer's answer isn't clear",
                    steps: ["Press Refresh decision.", "If it stays unclear, use Request gateway status or call the payer's helpdesk."],
                  };

  // Actions are described by id and run from one event handler.
  const runAction = (id) => {
    if (id === "claim") navigate("../claim", { state: { claim_id: statusData?.claim_id || caseState.claim_id } });
    else if (id === "query") setShowQueryDrawer(true);
    else if (id === "resubmit") setShowResubmitDrawer(true);
    else if (id === "refresh") restartPoll(correlationId);
    else if (id === "gateway") handleGatewayStatus();
    else if (id === "draft") navigate("../review");
    else if (id === "enhance") navigate("../enhancement");
    else if (id === "message") setShowSendModal(true);
    else if (id === "recheck") handleRecheckEligibility();
    else if (id === "cancel") setShowCancelModal(true);
  };

  const legs = cashlessCase?.legs;
  const canEnquire = cashlessCase?.answers_status_enquiry !== false;
  const preauthReadOnly = CLAIM_WITH_PAYER.includes(legs?.claim);
  // Once a claim is with the payer the backend refuses any pre-auth send.
  const canAnswer = !preauthReadOnly && !caseClosed;

  // One primary action per decision; everything else is listed under it.
  const primary = isFailed
    ? { id: "draft", label: "Back to preauth draft" }
    : !isComplete
      ? null
      : isApproved || isPartial
        ? { id: "claim", label: "Proceed to claim", icon: ArrowRight }
        : isQueried
          ? canAnswer && { id: "query", label: "Respond to query", write: true }
          : isRejected
            ? canAnswer && { id: "resubmit", label: "Resubmit preauth", write: true }
            : { id: "refresh", label: "Refresh decision", icon: RefreshCw };

  const secondary = [];
  if (!isComplete && !isFailed) {
    secondary.push({ id: "refresh", label: "Refresh now", icon: RefreshCw });
    if ((showGatewayRecovery || isNotFound) && canEnquire) secondary.push({ id: "gateway", label: "Request gateway status", icon: Wifi, write: true });
  }
  if (isComplete) {
    if ((isApproved || isPartial) && !caseClosed && !preauthReadOnly) secondary.push({ id: "enhance", label: "Request enhancement", icon: PlusCircle });
    if ((isQueried || isRejected || isPartial) && OUTBOUND_COMMUNICATIONS_ENABLED)
      secondary.push({ id: "message", label: "Message payer", icon: Send, write: true });
    if (isUnknown && canEnquire) secondary.push({ id: "gateway", label: "Request gateway status", icon: Wifi, write: true });
  }
  if (resolvedCashlessCaseId && (isComplete || isFailed) && !caseClosed) {
    secondary.push({
      id: "recheck",
      label: recheckingEligibility ? "Re-checking eligibility…" : "Re-check eligibility",
      icon: RefreshCw,
      write: true,
      disabled: recheckingEligibility,
      title: "Refresh sum-insured/coverage data from the payer without affecting the preauth decision",
    });
  }
  const canCancel = legs
    ? CANCELLABLE_PREAUTH.includes(legs.preauth) && !CLAIM_DECIDED.includes(legs.claim) && !caseClosed
    : isComplete && (isApproved || isPartial) && !caseClosed;
  const cancelNeedsNote = cancelReason === "other" && !cancelDesc.trim();

  // Requested → approved, as a statement.
  const notEligible = requestedValue != null && totals.eligible?.value != null ? requestedValue - totals.eligible.value : null;
  const statement = [
    { label: "Requested", value: requestedValue },
    notEligible > 0 && { label: "Disallowed", value: -notEligible, note: adjItems.map((it) => it.adjudication?.eligible?.reason).filter(Boolean).join(", ") },
    totals.copay?.value > 0 && { label: "Co-payment", value: -totals.copay.value, note: totals.copay.reason },
    deductibleTotal > 0 && { label: "Deductible", value: -deductibleTotal },
    { label: "Approved", value: approvedValue, total: true },
  ].filter(Boolean);

  const resubmitLines = resubmitItems.length > 0 ? resubmitItems : draftData?.editedItems ?? resubmitDraft?.items ?? [];
  const editResubmitLine = (index, field, raw) => {
    const value = Number(raw);
    setResubmitItems(
      resubmitLines.map((line, i) => {
        if (i !== index) return line;
        const next = { ...line, [field]: value };
        return { ...next, net_amount: (Number(next.quantity) || 0) * (Number(next.unit_price) || 0) };
      }),
    );
  };
  const resubmitDocs = resubmitDraft?.supporting_documents || [];
  const resubmitAsks = liveAsks(resubmitDraft?.payer_asks, resubmitDocs, resubmitForms);
  const resubmitAskCodes = new Set(resubmitAsks.filter((a) => a.kind === "document").map((a) => String(a.code).toUpperCase()));
  const resubmitOtherDocs = resubmitDocs.filter((d) => !resubmitAskCodes.has(String(d.code || "").toUpperCase()));
  const resubmitBlocked = resubmitAsks.some((a) => a.blocking);

  const lineName = (item, i) => {
    const named = statusData?.claim_items || [];
    const claimItem = named.find((c) => c.sequence === item.sequence) || named[i] || draftData?.editedItems?.[i] || draftData?.items?.[i] || item;
    return {
      name: claimItem?.service_name || claimItem?.name || claimItem?.description || `Item ${item.sequence ?? i + 1} (unnamed by payer)`,
      code: claimItem?.service_code || claimItem?.code || null,
      claimItem,
    };
  };

  const clinicalCount = (statusData?.diagnoses?.length || 0) + (statusData?.procedures?.length || 0);
  const groups = buildApprovalChecklist({
    failed: isFailed,
    notFound: isNotFound,
    complete: isComplete,
    approved: approvedValue,
    lines: adjItems,
    notes: statusData?.process_notes?.length || 0,
    readNotes: isQueried || isRejected,
    clinical: clinicalCount,
    enquiry: enquiryId ? (enquiry?.status === "failed" ? "failed" : enquiry?.status === "complete" ? "answered" : "waiting") : null,
    errors: statusData?.errors?.length || 0,
  });
  const open = picked && groups.some((g) => g.rows.some((r) => r.id === picked)) ? picked : firstApprovalItem(groups, isQueried || isRejected);
  const paneFor = (id) => ({ hidden: open !== id });

  // The first follow-up stays beside the primary; the rest sit in a quiet menu.
  const [firstAction, ...moreActions] = secondary;
  const barTone = { ok: "ok", warn: "warn", bad: "bad", pending: "info" }[verdict.tone] || "info";
  const notices = [
    isFailed && { tone: "bad", text: `The preauth could not be delivered to the payer. ${statusData?.error_message || statusData?.errors?.[0]?.detail || statusData?.errors?.[0]?.display || ""}` },
    cancelRefused && { tone: "warn", text: "The payer refused the cancellation, so this pre-auth still stands." },
    preauthReadOnly && { tone: "info", text: READ_ONLY_NOTICE },
    ambiguous && isComplete && { tone: "warn", text: `Verify this approval: the payer's raw outcome (${outcome}) does not corroborate it.` },
    enquiryError && { tone: "bad", text: enquiryError },
    pollError && { tone: "warn", text: `The last check failed, and this page keeps trying: ${pollError}` },
    ...(location.state?.preauthWarnings || []).map((w) => ({ tone: "warn", text: w })),
    !isFailed && (canAnswer || !(isQueried || isRejected)) && (guide.tone === "warn" || guide.tone === "bad") && { tone: guide.tone, text: guide.steps?.join(" ") || [guide.title, guide.text].filter(Boolean).join(". ") },
    pendingTasks.length > 0 && { tone: "info", text: `${pendingTasks.length} task${pendingTasks.length > 1 ? "s" : ""} for this preauth in the Work Queue.`, action: { label: "Open Work Queue", to: "/work-queue" } },
    recheckMessage && { tone: "info", text: recheckMessage },
  ].filter(Boolean);
  // What to do next stays visible when something needs staff; otherwise it is a tip.
  const tipText = guide.tone === "ok" || guide.tone === "info" ? guide.steps?.join(" ") || guide.text : null;

  return (
    <div className="cv-elig">
      <div className={`cv-notice cv-verdict is-${barTone}`}>
        <div className="cv-verdict-row">
          <StageBar ctx={ctx} />
          <span className={`cv-chip is-${verdict.tone === "pending" ? "info" : verdict.tone}`}>{verdict.label}</span>
          <span className="cv-notice-body">
            {(isApproved || isPartial) && approvedValue != null ? (
              <>
                <strong>{formatMoney(approvedValue)}</strong>
                {requestedValue != null ? ` of ${formatMoney(requestedValue)} requested` : " approved"}
              </>
            ) : !isComplete && !isFailed && !isNotFound ? (
              `Waiting ${Math.max(1, Math.round(pollElapsed / 60000))} min`
            ) : null}
            {statusData?.preauth_ref && <span className="cv-mono cv-card-meta cv-bar-ref">{statusData.preauth_ref}</span>}
          </span>
          <span className="cv-verdict-actions">
            {firstAction && <ActionButton action={firstAction} readOnly={readOnly} onRun={runAction} />}
            {(moreActions.length > 0 || canCancel) && (
              <details className="cv-more">
                <summary className="cv-btn" aria-label="More actions"><MoreHorizontal size={15} /></summary>
                <div className="cv-more-menu">
                  {moreActions.map((a) => <ActionButton key={a.id} action={a} readOnly={readOnly} onRun={runAction} />)}
                  {canCancel && (
                    <button type="button" className="cv-btn is-danger" disabled={readOnly} title={readOnly ? READ_ONLY_TITLE : undefined} onClick={() => runAction("cancel")}>
                      <X size={14} /> Cancel preauth
                    </button>
                  )}
                </div>
              </details>
            )}
            {primary && (
              <Button write={primary.write} variant="primary" size="small" icon={primary.icon} onClick={() => runAction(primary.id)}>
                {primary.label}
              </Button>
            )}
          </span>
        </div>
        {notices.map((n, i) => (
          <div key={i} className={`cv-notice-hint cv-verdict-note cv-verdict-line${n.tone === "bad" ? " is-bad" : ""}`}>
            <span>{n.text}</span>
            {n.action && <button type="button" className="cv-btn" onClick={() => navigate(n.action.to)}>{n.action.label}</button>}
          </div>
        ))}
        {tipText && <Tip className="cv-verdict-note">{tipText}</Tip>}
      </div>

      <div className="cv-work">
        <CaseChecklist groups={groups} open={open} onOpen={openItem} label="Approval checklist" />

        <div className="cv-work-pane" ref={paneRef}>
          {isNotFound && (
            <div {...paneFor("record")}>
              <Section id="ds-none-yet" title="No answer on record">
                <Fields cols={1} rows={[{ label: "Request ID", value: correlationId, mono: true }]} />
              </Section>
            </div>
          )}
          {isFailed && (
            <div {...paneFor("delivery")}>
              <Section id="ds-delivery" title="Not delivered">
                <Fields cols={1} rows={[{ label: "Reason", value: statusData?.error_message }, { label: "Request ID", value: correlationId, mono: true }]} />
              </Section>
            </div>
          )}
          {!isComplete && !isFailed && !isNotFound && (
            <div {...paneFor("waiting")}>
            <Section id="ds-waiting" info="waiting" title={knownDecision ? "Loading adjudication details" : "Waiting for the payer"}>
              <Fields
                cols={2}
                rows={[
                  { label: "Sent", value: statusData?.submitted_at ? formatDateTime(statusData.submitted_at) : null },
                  { label: "Waiting for", value: `${Math.max(1, Math.round(pollElapsed / 60000))} min` },
                  { label: "Checking every", value: `${POLL_INTERVAL_MS / 1000} seconds` },
                  { label: "Request ID", value: correlationId, mono: true },
                ]}
              />
              {pollError && <div className="ep-notice is-warn ds-notice-in">The last check failed, and this page keeps trying: {pollError}</div>}
              {showSoftWarning && (
                <div className="ep-notice ds-notice-in">
                  Payer decisions can take minutes to hours. You can leave this page; the result will appear in the Work
                  Queue when it arrives.
                </div>
              )}
            </Section>
            </div>
          )}
          {enquiryId && (
            <div {...paneFor("enquiry")}>
            <Section id="ds-enquiry" title="Status enquiry">
              {enquiry?.status === "failed" && (
                <div className="ep-notice is-bad">
                  The payer refused the enquiry. {enquiry.error_message || enquiry.errors?.[0]?.message || ""}
                </div>
              )}
              <Fields
                cols={2}
                rows={[
                  { label: "Asked", value: caseState.statusEnquiry?.asked_at ? formatDateTime(caseState.statusEnquiry.asked_at) : null },
                  {
                    label: "Payer's answer",
                    value: enquiry?.answer || (enquirySettled ? null : "Waiting for the payer"),
                  },
                  { label: "Detail", value: enquiry?.detail },
                  { label: "Answered", value: enquiry?.answered_at ? formatDateTime(enquiry.answered_at) : null },
                  { label: "Enquiry ID", value: enquiryId, mono: true },
                ]}
              />
            </Section>
            </div>
          )}
          {isComplete && (
            <>
              <div {...paneFor("amounts")}>
              <Section id="ds-amounts" title="Amount breakdown" tip="What you asked for, what the payer cut and why, and what it approved.">
                <dl className="ds-statement">
                  {statement.map((r) => (
                    <div key={r.label} className={r.total ? "is-total" : undefined}>
                      <dt>
                        {r.label}
                        {r.note && <span className="ep-muted"> · {r.note}</span>}
                      </dt>
                      <dd className="ep-mono">
                        {r.value == null ? "—" : r.value < 0 ? `− ${formatMoney(-r.value)}` : formatMoney(r.value)}
                      </dd>
                    </div>
                  ))}
                </dl>
              </Section>
              </div>
              {adjItems.length > 0 && (
                <div {...paneFor("lines")}>
                <Section id="ds-lines" title="Line adjudication" tip="The payer's answer for each line of the request.">
                  <div className="ep-table-wrap">
                    <table className="ep-table ds-lines-table">
                      <thead>
                        <tr>
                          <th>Service</th>
                          <th className="ep-num">Requested</th>
                          <th className="ep-num">Eligible</th>
                          <th className="ep-num">Co-pay</th>
                          <th className="ep-num">Approved</th>
                          <th>Reason / note</th>
                        </tr>
                      </thead>
                      <tbody>
                        {adjItems.map((item, i) => {
                          const adj = item.adjudication || {};
                          const { name, code, claimItem } = lineName(item, i);
                          // Reasons inline; payer notes by number (their text is in "Payer notes").
                          const notes = [
                            adj.eligible?.reason,
                            adj.benefit?.reason,
                            adj.reason?.text || adj.reason?.raw,
                            ...(item.notes || []).map((n) => (notesByNumber[n] ? `Note ${n}` : null)),
                          ].filter((v, idx, a) => v && a.indexOf(v) === idx);
                          return (
                            <tr key={i}>
                              <td className="ep-col-name">
                                <div className="ep-strong">{name}</div>
                                <div className="ep-muted">
                                  {[code, claimItem?.category, claimItem?.quantity != null && `Qty ${claimItem.quantity}`].filter(Boolean).join(" · ")}
                                </div>
                              </td>
                              <td className="ep-num ep-mono">{formatMoney(adj.submitted?.value ?? netAmountOf(claimItem, adj))}</td>
                              <td className="ep-num ep-mono">{formatMoney(adj.eligible?.value)}</td>
                              <td className="ep-num ep-mono">{formatMoney(adj.copay?.value)}</td>
                              <td className="ep-num ep-mono ep-strong">{formatMoney(adj.benefit?.value ?? adj.eligible?.value)}</td>
                              <td>{notes.length ? notes.join(" · ") : <span className="ep-muted">—</span>}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </Section>
                </div>
              )}
              {statusData?.process_notes?.length > 0 && (
                <div {...paneFor("notes")}>
                <Section id="ds-notes" title="Payer notes" tip="The payer's own words. Read these first when a preauth is queried, cut or rejected.">
                  <ol className="ds-notes">
                    {statusData.process_notes.map((n, i) => (
                      <li key={n.number ?? i}>
                        <span className="ep-mono ep-muted">{n.number ?? i + 1}</span>
                        <span>{n.text}</span>
                      </li>
                    ))}
                  </ol>
                </Section>
                </div>
              )}
              {clinicalCount > 0 && (
                <div {...paneFor("clinical")}>
                <Section id="ds-clinical" title="Clinical basis">
                  <Fields
                    cols={1}
                    rows={[
                      ...(statusData.diagnoses || []).map((d, i) => ({
                        label: i === 0 ? "Diagnoses" : " ",
                        value: `${d.name}${d.primary ? " (principal)" : ""}`,
                        sub: d.code,
                      })),
                      ...(statusData.procedures || []).map((p, i) => ({
                        label: i === 0 ? "Procedures" : " ",
                        value: `${p.name}${p.date ? ` · ${formatDate(p.date)}` : ""}`,
                        sub: p.code,
                      })),
                    ]}
                  />
                </Section>
                </div>
              )}
              <div {...paneFor("response")}>
              <Section
                id="ds-response"
                title="Payer response"
                meta="As received over NHCX"
                info={{ title: "Payer response", text: "Technical details of the payer's answer. Useful for your IT team; you don't need them to act." }}
              >
                <Fields
                  cols={3}
                  rows={[
                    { label: "Classified decision", value: decision ? String(decision).replace(/_/g, " ").toLowerCase() : null },
                    { label: "Raw outcome", value: preauthProvenance?.raw_outcome ?? outcome, mono: true },
                    { label: "Reason codes", value: preauthProvenance?.reason_codes?.join(", "), mono: true },
                    { label: "Classified by", value: preauthProvenance?.classified_by, mono: true },
                    { label: "NHCX workflow", value: preauthProvenance?.nhcx_workflow_id != null ? String(preauthProvenance.nhcx_workflow_id) : null, mono: true },
                    { label: "Preauth reference", value: statusData?.preauth_ref, mono: true },
                    { label: "Request ID", value: correlationId, mono: true },
                  ]}
                />
              </Section>
              </div>
            </>
          )}
          {statusData?.errors?.length > 0 && (
            <div {...paneFor("errors")}>
                <Section id="ds-errors" title="Payer errors">
                  <div className="ep-pad">
                    <PayrErrorList errors={statusData.errors} />
                  </div>
                </Section>
            </div>
          )}
        </div>
      </div>

      <Drawer open={showQueryDrawer} onClose={() => { setShowQueryDrawer(false); setQueryError(null); }} title="Respond to Payer Query">
        <p className="cv-drawer-intro">
          Provide a clinical justification and attach any documents requested by the payer.
        </p>
        <QueryResponseFields
          label="Clinical Justification"
          answer={queryAnswer}
          onAnswerChange={setQueryAnswer}
          documents={queryDoc}
          onDocumentsChange={(files) => { setQueryDoc(files); setQueryDocs(files.map(documentFromFile)); }}
        />
        {queryError && (
          <div className="cv-notice is-bad cv-drawer-note"><div className="cv-notice-body">{queryError}</div></div>
        )}
        <Button write
          variant="primary"
          className="w-full"
          disabled={!queryAnswer || submitting}
          onClick={handleQuerySubmit}
          style={{ justifyContent: "center" }}
        >
          {submitting ? "Submitting…" : "Submit Response"}
        </Button>
      </Drawer>

      <Drawer open={showResubmitDrawer} onClose={() => { setShowResubmitDrawer(false); setResubmitError(null); }} title="Resubmit Preauth">
        <p className="cv-drawer-intro">
          Correct the lines and attach what the payer asks for. Only the lines you change are sent; everything else is
          rebuilt from the hospital records.
        </p>
        {!resubmitDraft && !resubmitError && <LoadingBlock compact text="Loading the draft…" />}
        {resubmitLines.length > 0 && (
          <div style={{ marginBottom: "var(--space-5)" }}>
            <div className="cv-drawer-label">Line items</div>
            <div className="table-responsive-wrapper">
              <table className="table-modern" style={{ fontSize: "12px" }}>
                <thead>
                  <tr>
                    <th>Service</th>
                    <th>Qty</th>
                    <th>Unit Price</th>
                    <th style={{ textAlign: "right" }}>Net Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {resubmitLines.map((item, i) => (
                    <tr key={i}>
                      <td>{item.service_name || `Line ${item.sequence ?? i + 1}`}</td>
                      <td>
                        <input
                          className="input-modern"
                          style={{ width: "60px", fontSize: "11px", padding: "3px 6px" }}
                          type="number"
                          min="1"
                          aria-label="Quantity"
                          value={item.quantity ?? ""}
                          onChange={(e) => editResubmitLine(i, "quantity", e.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          className="input-modern"
                          style={{ width: "90px", fontSize: "11px", padding: "3px 6px" }}
                          type="number"
                          min="0"
                          aria-label="Unit price"
                          value={item.unit_price ?? ""}
                          onChange={(e) => editResubmitLine(i, "unit_price", e.target.value)}
                        />
                      </td>
                      <td style={{ textAlign: "right" }}>{formatMoney(item.net_amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        {resubmitDraft && (
          <>
            <div style={{ marginBottom: "var(--space-4)" }}>
              <PayerAsks
                caseId={resolvedCashlessCaseId}
                stage="preauth"
                asks={resubmitDraft.payer_asks}
                documents={resubmitDocs}
                readOnly={readOnly || caseClosed}
                onAttach={attachResubmitAsk}
                onFormsChange={setResubmitForms}
              />
            </div>
            <div style={{ marginBottom: "var(--space-4)" }}>
              <DocumentChecklist
                documents={resubmitOtherDocs}
                onUpload={(doc, uploaded) => setResubmitDocs((list) => list.map((d) => (d.code === doc.code ? { ...d, ...uploaded } : d)))}
                onAddDocument={() => setResubmitDocs((list) => [...list, { code: `CUSTOM-${Date.now()}`, name: "", category: "additional", optional: true, custom: true }])}
                onRenameDocument={(i, name) => setResubmitDocs((list) => list.map((d) => (d === resubmitOtherDocs[i] ? { ...d, name } : d)))}
                onRemoveDocument={(i) => setResubmitDocs((list) => list.filter((d) => d !== resubmitOtherDocs[i]))}
                readOnly={readOnly || caseClosed}
                hideSummary
              />
            </div>
          </>
        )}
        {resubmitError && (
          <div className="cv-notice is-bad cv-drawer-note"><div className="cv-notice-body">{resubmitError}</div></div>
        )}
        <Button write
          variant="primary"
          className="w-full"
          disabled={submitting || !resubmitDraft || resubmitBlocked}
          onClick={handleResubmitSubmit}
          style={{ justifyContent: "center" }}
        >
          {submitting ? "Resubmitting…" : "Resubmit to Payer"}
        </Button>
      </Drawer>

      <Modal open={showCancelModal} onClose={() => { setShowCancelModal(false); setCancelError(null); }} title="Cancel Preauthorization">
        <p className="cv-drawer-intro">
          {statusData?.preauth_ref ? (
            <>
              Cancellation is irreversible. The preauth reference <strong>{statusData.preauth_ref}</strong>
              {(statusData.totals?.benefit?.value ?? statusData.totals?.eligible?.value) != null && (
                <> and its approved amount of <strong style={{ color: "var(--error)" }}>{formatMoney(statusData.totals.benefit?.value ?? statusData.totals.eligible?.value)}</strong></>
              )} will be permanently voided with the payer.
            </>
          ) : (
            "Cancellation is irreversible. This request is withdrawn from the payer before it decides."
          )}
        </p>
        <div style={{ marginBottom: "14px" }}>
          <label className="cv-drawer-label">Reason</label>
          <select
            className="input-modern"
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
          >
            <option value="" disabled>Choose a reason</option>
            {CANCEL_REASONS.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
        </div>
        <div style={{ marginBottom: "var(--space-5)" }}>
          <label className="cv-drawer-label">{cancelReason === "other" ? "Reason (the payer reads only this)" : "Description (optional)"}</label>
          <textarea
            className="input-modern"
            style={{ height: "80px", resize: "vertical" }}
            placeholder="Additional context for the cancellation…"
            value={cancelDesc}
            onChange={(e) => setCancelDesc(e.target.value)}
          />
        </div>
        {cancelError && (
          <div className="cv-notice is-bad cv-drawer-note"><div className="cv-notice-body">{cancelError}</div></div>
        )}
        <div style={{ display: "flex", gap: "var(--space-3)", justifyContent: "flex-end" }}>
          <Button variant="outline" onClick={() => { setShowCancelModal(false); setCancelError(null); }}>Keep Preauth</Button>
          <Button write variant="primary" className="ds-danger-btn" disabled={submitting || !cancelReason || cancelNeedsNote} onClick={handleCancelSubmit}>
            {submitting ? "Cancelling…" : "Confirm Cancellation"}
          </Button>
        </div>
      </Modal>

      <SendCommunicationModal
        open={showSendModal}
        onClose={() => setShowSendModal(false)}
        defaultPayerId={payerId}
        defaultClaimReference={statusData?.preauth_ref || ""}
        claimId={claim_id}
        cashlessCaseId={cashless_case_id}
      />

    </div>
  );
}
