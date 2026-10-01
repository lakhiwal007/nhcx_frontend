import { useState, useEffect, useRef } from "react";
import { usePoll } from "../../hooks/usePoll";
import { useNavigate, useLocation } from "react-router-dom";
import { ArrowRight, RefreshCw, PlusCircle, X, Wifi, Send } from "lucide-react";
import { api } from "../../api";
import { Button, QueryResponseFields, formatMoney } from "../Common";
import { formatDate, formatDateTime } from "../../format.js";
import { Section, Fields } from "../case/CaseFile";
import { Drawer, Modal } from "../Overlay";
import { buildQueryResponseBody, documentFromFile } from "../../queryResponse.js";
import PayrErrorList from "../PayrErrorList";
import PreauthEnhancement from "./PreauthEnhancement";
import SendCommunicationModal, { OUTBOUND_COMMUNICATIONS_ENABLED } from "../SendCommunicationModal";

const POLL_INTERVAL_MS = 7000;
const SOFT_WARNING_MS = 120_000;
const GATEWAY_RECOVERY_MS = 300_000;
const CANCEL_REASONS = [
  { value: "treatmentplanchanged", label: "Treatment plan changed" },
  { value: "patientrequest", label: "Patient request" },
  { value: "financialconstraints", label: "Financial constraints" },
  { value: "alternativetreatment", label: "Alternative treatment" },
  { value: "duplicateclaim", label: "Duplicate claim" },
  { value: "administrativeerror", label: "Administrative error" },
  { value: "other", label: "Other" },
];

function netAmountOf(claimItem, adj) {
  if (claimItem?.net_amount != null) return claimItem.net_amount;
  const unit = claimItem?.unit_price ?? claimItem?.amount;
  if (unit != null) return (claimItem?.quantity ?? 1) * unit;
  return adj?.submitted?.value ?? null;
}

export default function PreauthStatus({ ctx }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { caseState, updateCaseState, cashlessCase, setCashlessCase, timelineEvents } = ctx;
  const { preauthCorrelationId, claim_id, cashless_case_id, draftData } = caseState;
  const payerId = caseState.payer?.code || cashlessCase?.payer_id || "";
  const policyNumber = caseState.policy?.policyNumber || caseState.policy?.policy_number || cashlessCase?.policy_number || "";

  const [statusData, setStatusData] = useState(null);
  const [polling, setPolling] = useState(true);
  const [pollElapsed, setPollElapsed] = useState(0);
  const [showEnhancement, setShowEnhancement] = useState(false);
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
  const [cancelReason, setCancelReason] = useState("treatmentplanchanged");
  const [cancelDesc, setCancelDesc] = useState("");
  const [cancelError, setCancelError] = useState(null);

  const [submitting, setSubmitting] = useState(false);
  const [recheckingEligibility, setRecheckingEligibility] = useState(false);
  const [recheckMessage, setRecheckMessage] = useState("");

  const correlationId = preauthCorrelationId;
  const startTimeRef = useRef(Date.now());
  const elapsedRef = useRef(null);

  const pollStatus = async (signal) => {
    try {
      const res = await api.getPreauthStatus(correlationId, signal);
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
    } catch (_) {}
  };

  // Restarts automatically when the correlation id changes (e.g. after a query
  // response or resubmit calls restartPoll), with an immediate fetch.
  usePoll(pollStatus, {
    active: polling && correlationId ? correlationId : null,
    intervalMs: POLL_INTERVAL_MS,
  });

  useEffect(() => {
    if (correlationId) return;
    if (!cashless_case_id) { setPolling(false); return; }
    // Recover the correlation id from the live case so a page refresh doesn't
    // leave users stranded on the "no submission found" dead-end screen.
    const recover = async () => {
      try {
        const res = await api.getCashlessStatus(cashless_case_id);
        if (res.preauth?.correlation_id) {
          updateCaseState({ preauthCorrelationId: res.preauth.correlation_id });
        } else {
          setPolling(false);
        }
      } catch (_) {
        setPolling(false);
      }
    };
    recover();
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
      setQueryDoc(null);
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
      const baseItems = draftData?.editedItems ?? draftData?.items ?? statusData?.claim_items ?? statusData?.items ?? [];
      const editableItems = (resubmitItems.length > 0 ? resubmitItems : baseItems).map((item) => {
        const quantity = Number(item.quantity) || 1;
        const unitPrice = Number(item.unit_price ?? item.amount ?? item.net_amount ?? 0) || 0;
        const netAmount = Number(item.net_amount) || quantity * unitPrice;
        return {
          ...item,
          quantity,
          unit_price: unitPrice,
          net_amount: netAmount,
        };
      });
      const totalAmount = editableItems.reduce((sum, item) => sum + (Number(item.net_amount) || 0), 0);
      const procedures = editableItems.map((item) => ({
        code: item.service_code || item.code || item.service_name || "",
        description: item.service_name || item.description || item.name || "Service",
        quantity: Number(item.quantity) || 1,
        unit_price: Number(item.unit_price || item.amount || 0),
        amount: Number(item.net_amount) || (Number(item.quantity) || 1) * (Number(item.unit_price || item.amount || 0)),
      }));
      const body = {
        ...(resolvedCashlessCaseId ? { cashless_case_id: resolvedCashlessCaseId } : {}),
        ...(claim_id ? { claim_id } : {}),
        ...(payerId ? { payer_id: payerId } : {}),
        ...(policyNumber ? { policy_number: policyNumber, policyNumber } : {}),
        ...(statusData?.preauth_ref ? { preauth_ref: statusData.preauth_ref } : {}),
        total_amount: totalAmount,
        items: editableItems,
        procedures,
        ...(draftData?.editedDiagnoses || statusData?.diagnoses?.length ? { diagnoses: draftData?.editedDiagnoses ?? statusData?.diagnoses } : {}),
      };
      const res = await api.resubmitPreauth(body);
      if (res.status === "failed") {
        setResubmitError(res.message || res.error?.message || "Preauthorization resubmission failed. Please try again.");
        return;
      }
      setShowResubmitDrawer(false);
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
      restartPoll(res.correlation_id);
    } catch (err) {
      setCancelError(err.message || "Cancellation failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleGatewayStatus = async () => {
    try {
      await api.requestGatewayStatus({ correlation_id: correlationId, claim_id, use_case: "preauth" });
    } catch (_) {}
  };

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
    } catch (_) {
      setRecheckMessage("Could not refresh eligibility data.");
    } finally {
      setRecheckingEligibility(false);
    }
  };
  const isComplete = statusData?.status === "complete";
  const isFailed = statusData?.status === "failed";
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
  const hasClaimContext = Boolean(claim_id || statusData?.claim_id || cashlessCase?.claim_id || caseState.draftData?.claim_id);

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
        setShowEnhancement(true);
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
          <div className="ds-empty-actions">
            <Button variant="primary" size="small" onClick={() => navigate("../review")}>
              Open preauth draft
            </Button>
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
  const adjItems = statusData?.claim_items?.length > 0 ? statusData.claim_items : statusData?.items || [];
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
                : { tone: "pending", label: "Decision unclear" };

  // Actions are described by id and run from one event handler.
  const runAction = (id) => {
    if (id === "claim") navigate("../claim", { state: { claim_id: statusData?.claim_id || caseState.claim_id } });
    else if (id === "query") setShowQueryDrawer(true);
    else if (id === "resubmit") setShowResubmitDrawer(true);
    else if (id === "refresh") restartPoll(correlationId);
    else if (id === "gateway") handleGatewayStatus();
    else if (id === "enhance") setShowEnhancement(true);
    else if (id === "reprocess") navigate("../reprocess");
    else if (id === "message") setShowSendModal(true);
    else if (id === "recheck") handleRecheckEligibility();
    else if (id === "cancel") setShowCancelModal(true);
  };

  // One primary action per decision; everything else is listed under it.
  const primary = !isComplete
    ? null
    : isApproved || isPartial
      ? { id: "claim", label: "Proceed to claim", icon: ArrowRight }
      : isQueried
        ? { id: "query", label: "Respond to query" }
        : isRejected
          ? { id: "resubmit", label: "Resubmit preauth" }
          : { id: "refresh", label: "Refresh decision", icon: RefreshCw };

  const secondary = [];
  if (!isComplete && !isFailed) {
    secondary.push({ id: "refresh", label: "Refresh now", icon: RefreshCw });
    if (showGatewayRecovery) secondary.push({ id: "gateway", label: "Request gateway status", icon: Wifi });
  }
  if (isComplete) {
    if (isApproved || isPartial) secondary.push({ id: "enhance", label: "Request enhancement", icon: PlusCircle });
    if (isQueried) secondary.push({ id: "resubmit", label: "Resubmit with corrections" });
    if (isPartial) secondary.push({ id: "resubmit", label: "Resubmit preauth" });
    if ((isRejected || isPartial) && hasClaimContext) secondary.push({ id: "reprocess", label: "Appeal / reprocess" });
    if ((isQueried || isRejected || isPartial) && OUTBOUND_COMMUNICATIONS_ENABLED)
      secondary.push({ id: "message", label: "Message payer", icon: Send });
    if (isUnknown) secondary.push({ id: "gateway", label: "Request gateway status", icon: Wifi });
  }
  if (resolvedCashlessCaseId && (isComplete || isFailed)) {
    secondary.push({
      id: "recheck",
      label: recheckingEligibility ? "Re-checking eligibility…" : "Re-check eligibility",
      icon: RefreshCw,
      disabled: recheckingEligibility,
      title: "Refresh sum-insured/coverage data from the payer without affecting the preauth decision",
    });
  }
  const canCancel = isComplete && (isApproved || isPartial);

  // Requested → approved, as a statement.
  const notEligible = requestedValue != null && totals.eligible?.value != null ? requestedValue - totals.eligible.value : null;
  const statement = [
    { label: "Requested", value: requestedValue },
    notEligible > 0 && { label: "Not eligible", value: -notEligible, note: adjItems.map((it) => it.adjudication?.eligible?.reason).filter(Boolean).join(", ") },
    totals.copay?.value > 0 && { label: "Co-payment", value: -totals.copay.value, note: totals.copay.reason },
    deductibleTotal > 0 && { label: "Deductible", value: -deductibleTotal },
    { label: "Approved", value: approvedValue, total: true },
  ].filter(Boolean);

  const lineName = (item, i) => {
    const claimItem = statusData?.claim_items?.[i] || draftData?.editedItems?.[i] || draftData?.items?.[i] || item;
    return {
      name: claimItem?.service_name || claimItem?.name || claimItem?.description || `Line ${item.sequence ?? i + 1}`,
      code: claimItem?.service_code || claimItem?.code || null,
      claimItem,
    };
  };

  return (
    <div className="wizard-step pd-screen">
      {isFailed && (
        <div className="ep-notice is-bad">
          <strong>The preauth could not be delivered to the payer.</strong>{" "}
          {statusData?.error_message || statusData?.errors?.[0]?.detail || statusData?.errors?.[0]?.display || ""}
          <button type="button" className="pd-inline-link" onClick={() => navigate("../review")}>
            Back to preauth draft →
          </button>
        </div>
      )}
      {ambiguous && isComplete && (
        <div className="ep-notice is-warn">
          Verify this approval: the payer's raw outcome ({outcome}) does not corroborate it.
        </div>
      )}
      {pendingTasks.length > 0 && (
        <div className="ep-notice">
          {pendingTasks.length} task{pendingTasks.length > 1 ? "s" : ""} for this preauth in the Work Queue.
          <button type="button" className="pd-inline-link" onClick={() => navigate("/work-queue")}>
            Open Work Queue →
          </button>
        </div>
      )}

      <div className="pd-layout">
        <div className="pd-main">
          {!isComplete && !isFailed && (
            <Section id="ds-waiting" title={knownDecision ? "Loading adjudication details" : "Waiting for the payer"}>
              <Fields
                cols={2}
                rows={[
                  { label: "Sent", value: statusData?.submitted_at ? formatDateTime(statusData.submitted_at) : null },
                  { label: "Waiting for", value: `${Math.max(1, Math.round(pollElapsed / 60000))} min` },
                  { label: "Checking every", value: `${POLL_INTERVAL_MS / 1000} seconds` },
                  { label: "Request ID", value: correlationId, mono: true },
                ]}
              />
              {showSoftWarning && (
                <div className="ep-notice ds-notice-in">
                  Payer decisions can take minutes to hours. You can leave this page; the result will appear in the Work
                  Queue when it arrives.
                </div>
              )}
            </Section>
          )}

          {isComplete && (
            <>
              <Section id="ds-amounts" title="Amount breakdown">
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

              {adjItems.length > 0 && (
                <Section id="ds-lines" title="Line adjudication">
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
                            adj.reason?.raw,
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
              )}

              {statusData?.process_notes?.length > 0 && (
                <Section id="ds-notes" title="Payer notes">
                  <ol className="ds-notes">
                    {statusData.process_notes.map((n, i) => (
                      <li key={n.number ?? i}>
                        <span className="ep-mono ep-muted">{n.number ?? i + 1}</span>
                        <span>{n.text}</span>
                      </li>
                    ))}
                  </ol>
                </Section>
              )}

              {(statusData?.diagnoses?.length > 0 || statusData?.procedures?.length > 0) && (
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
              )}

              {statusData?.errors?.length > 0 && (
                <Section id="ds-errors" title="Payer errors">
                  <div className="ep-pad">
                    <PayrErrorList errors={statusData.errors} />
                  </div>
                </Section>
              )}

              <Section id="ds-response" title="Payer response" meta="As received over NHCX">
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
            </>
          )}
        </div>

        <aside className="pd-side">
          <section className="ep-section pd-request">
            <header className="ep-section-head">
              <h3 className="ep-section-title">Preauth decision</h3>
            </header>
            <div className={`ds-verdict is-${verdict.tone}`}>
              <span className="ep-dot" aria-hidden="true" />
              <span className="ds-verdict-label">{verdict.label}</span>
              {!isComplete && !isFailed && <span className="spinner ds-spinner" aria-hidden="true" />}
            </div>
            {statusData?.preauth_ref && (
              <div className="ds-ref">
                <span className="ep-muted">Reference</span>
                <span className="ep-mono">{statusData.preauth_ref}</span>
              </div>
            )}
            {isComplete && !isCancelled && approvedValue != null && (
              <div className="pd-amount">
                <div className="ep-muted">Approved</div>
                <div className="pd-amount-value ep-mono">{formatMoney(approvedValue)}</div>
                {requestedValue != null && <div className="ep-muted">of {formatMoney(requestedValue)} requested</div>}
              </div>
            )}

            <div className="pd-submit">
              {primary && (
                <Button variant="primary" icon={primary.icon} onClick={() => runAction(primary.id)} className="pd-submit-btn">
                  {primary.label}
                </Button>
              )}
              {secondary.length > 0 && (
                <ul className="ds-actions">
                  {secondary.map((a) => (
                    <li key={a.label}>
                      <button type="button" disabled={a.disabled} title={a.title} onClick={() => runAction(a.id)}>
                        {a.icon && <a.icon size={14} />}
                        {a.label}
                      </button>
                    </li>
                  ))}
                  {canCancel && (
                    <li>
                      <button type="button" className="is-danger" onClick={() => runAction("cancel")}>
                        <X size={14} />
                        Cancel preauth
                      </button>
                    </li>
                  )}
                </ul>
              )}
              {recheckMessage && <div className="ep-muted">{recheckMessage}</div>}
            </div>
          </section>
        </aside>
      </div>

      <Drawer open={showQueryDrawer} onClose={() => { setShowQueryDrawer(false); setQueryError(null); }} title="Respond to Payer Query">
        <p style={{ fontSize: "14px", color: "var(--text-muted)", marginBottom: "var(--space-5)" }}>
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
          <div style={{ padding: "10px 14px", background: "rgba(239,68,68,0.06)", border: "1px solid var(--error)", borderRadius: "var(--radius-sm)", marginBottom: "var(--space-4)", fontSize: "12px", color: "var(--error)", fontWeight: 600 }}>
            {queryError}
          </div>
        )}
        <Button
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
        <p style={{ fontSize: "14px", color: "var(--text-muted)", marginBottom: "var(--space-5)" }}>
          Correct clinical or billing data and resubmit. Only the fields you change here will be sent; everything else is re-derived from the hospital DB.
        </p>
        {(() => {
          // Prefer saved draft items, fall back to adjudicated items from status
          const baseItems = draftData?.editedItems ?? draftData?.items ?? statusData?.claim_items ?? statusData?.items ?? [];
          const displayItems = resubmitItems.length > 0 ? resubmitItems : baseItems;
          return baseItems.length > 0 ? (
            <div style={{ marginBottom: "var(--space-5)" }}>
              <div style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", marginBottom: "var(--space-2)" }}>Line Items (editable)</div>
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
                    {displayItems.map((item, i) => (
                      <tr key={i}>
                        <td>{item.service_name || `Seq #${item.sequence}`}</td>
                        <td>
                          <input
                            className="input-modern"
                            style={{ width: "60px", fontSize: "11px", padding: "3px 6px" }}
                            type="number"
                            min="1"
                            value={item.quantity ?? ""}
                            onChange={(e) => {
                              const updated = (resubmitItems.length > 0 ? resubmitItems : baseItems).map((it, idx) => {
                                if (idx !== i) return it;
                                const qty = Number(e.target.value);
                                return { ...it, quantity: qty, net_amount: qty * (it.unit_price || 0) };
                              });
                              setResubmitItems(updated);
                            }}
                          />
                        </td>
                        <td>
                          <input
                            className="input-modern"
                            style={{ width: "90px", fontSize: "11px", padding: "3px 6px" }}
                            type="number"
                            min="0"
                            value={item.unit_price ?? ""}
                            onChange={(e) => {
                              const updated = (resubmitItems.length > 0 ? resubmitItems : baseItems).map((it, idx) => {
                                if (idx !== i) return it;
                                const price = Number(e.target.value);
                                return { ...it, unit_price: price, net_amount: (it.quantity || 0) * price };
                              });
                              setResubmitItems(updated);
                            }}
                          />
                        </td>
                        <td style={{ textAlign: "right" }}>{formatMoney(item.net_amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null;
        })()}
        {resubmitError && (
          <div style={{ padding: "10px 14px", background: "rgba(239,68,68,0.06)", border: "1px solid var(--error)", borderRadius: "var(--radius-sm)", marginBottom: "var(--space-4)", fontSize: "12px", color: "var(--error)", fontWeight: 600 }}>
            {resubmitError}
          </div>
        )}
        <Button
          variant="primary"
          className="w-full"
          disabled={submitting}
          onClick={handleResubmitSubmit}
          style={{ justifyContent: "center" }}
        >
          {submitting ? "Resubmitting…" : "Resubmit to Payer"}
        </Button>
      </Drawer>

      <Modal open={showCancelModal} onClose={() => { setShowCancelModal(false); setCancelError(null); }} title="Cancel Preauthorization">
        <p style={{ fontSize: "14px", color: "var(--text-muted)", marginBottom: "var(--space-5)" }}>
          Cancellation is irreversible. The preauth reference <strong>{statusData?.preauth_ref}</strong>
          {(statusData?.totals?.benefit?.value ?? statusData?.totals?.eligible?.value) != null && (
            <> and its approved amount of <strong style={{ color: "var(--error)" }}>{formatMoney(statusData.totals.benefit?.value ?? statusData.totals.eligible?.value)}</strong></>
          )} will be permanently voided with the payer.
        </p>
        <div style={{ marginBottom: "14px" }}>
          <label style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-muted)", display: "block", marginBottom: "6px" }}>Reason</label>
          <select
            className="input-modern"
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
          >
            {CANCEL_REASONS.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
        </div>
        <div style={{ marginBottom: "var(--space-5)" }}>
          <label style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-muted)", display: "block", marginBottom: "6px" }}>Description (optional)</label>
          <textarea
            className="input-modern"
            style={{ height: "80px", resize: "vertical" }}
            placeholder="Additional context for the cancellation…"
            value={cancelDesc}
            onChange={(e) => setCancelDesc(e.target.value)}
          />
        </div>
        {cancelError && (
          <div style={{ padding: "10px 14px", background: "rgba(239,68,68,0.06)", border: "1px solid var(--error)", borderRadius: "var(--radius-sm)", marginBottom: "var(--space-4)", fontSize: "12px", color: "var(--error)", fontWeight: 600 }}>
            {cancelError}
          </div>
        )}
        <div style={{ display: "flex", gap: "var(--space-3)", justifyContent: "flex-end" }}>
          <Button variant="outline" onClick={() => { setShowCancelModal(false); setCancelError(null); }}>Keep Preauth</Button>
          <Button variant="primary" className="ds-danger-btn" disabled={submitting} onClick={handleCancelSubmit}>
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

      <Modal open={showEnhancement} onClose={() => setShowEnhancement(false)} title="Request preauth enhancement" width={680}>
        <PreauthEnhancement ctx={ctx} onClose={() => setShowEnhancement(false)} onSubmitted={restartPoll} />
      </Modal>
    </div>
  );
}
