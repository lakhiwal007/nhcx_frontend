import { useState, useEffect, useRef } from "react";
import { usePoll } from "../../hooks/usePoll";
import { useNavigate, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, RefreshCw, PlusCircle, AlertCircle, X, Radio, Wifi, Send } from "lucide-react";
import { api } from "../../api";
import { Card, Button, DecisionBanner, AmountGrid, StatusBadge, DocumentChecklist } from "../Common";
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

function Drawer({ open, onClose, title, children }) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", backdropFilter: "blur(4px)", zIndex: 90 }}
            onClick={onClose}
          />
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 26, stiffness: 300 }}
            style={{ position: "fixed", right: 0, top: 0, bottom: 0, width: "min(520px, 95vw)", background: "var(--bg-card)", borderLeft: "1px solid var(--border-color)", zIndex: 91, display: "flex", flexDirection: "column" }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "20px 24px", borderBottom: "1px solid var(--border-color)" }}>
              <h3 style={{ margin: 0, fontSize: "18px", fontWeight: 800 }}>{title}</h3>
              <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", display: "flex" }}>
                <X size={22} />
              </button>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: "var(--space-6)" }}>
              {children}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function ConfirmModal({ open, onClose, title, children }) {
  return (
    <AnimatePresence>
      {open && (
        <div style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)" }}
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            style={{ position: "relative", background: "var(--bg-card)", width: "100%", maxWidth: "500px", padding: "28px", borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-lg)", border: "1px solid var(--border-color)", zIndex: 101, margin: "0 16px" }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--space-5)" }}>
              <h3 style={{ margin: 0, fontSize: "20px", fontWeight: 800 }}>{title}</h3>
              <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", display: "flex" }}>
                <X size={22} />
              </button>
            </div>
            {children}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

export default function PreauthStatus({ ctx }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { caseState, updateCaseState, cashlessCase, setCashlessCase } = ctx;
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
  const [resubmitItems, setResubmitItems] = useState([]);
  const [cancelReason, setCancelReason] = useState("treatmentplanchanged");
  const [cancelDesc, setCancelDesc] = useState("");

  const [submitting, setSubmitting] = useState(false);

  const correlationId = preauthCorrelationId;
  const startTimeRef = useRef(Date.now());
  const elapsedRef = useRef(null);

  const pollStatus = async (signal) => {
    try {
      const res = await api.getPreauthStatus(correlationId, signal);
      setStatusData(res);
      const stateUpdates = {};
      if (res.preauth_ref) { stateUpdates.preauthRef = res.preauth_ref; stateUpdates.preauthDecision = res.decision; }
      if (res.claim_id && !claim_id) stateUpdates.claim_id = res.claim_id;
      if (res.cashless_case_id && !cashless_case_id) stateUpdates.cashless_case_id = res.cashless_case_id;
      if (res.status === "complete" && res.totals?.eligible?.value != null) {
        stateUpdates.approvedAmount = res.totals.eligible.value;
      }
      if (Object.keys(stateUpdates).length) updateCaseState(stateUpdates);
      if (res.status === "complete" || res.status === "not_found") setPolling(false);
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
    if (!cashless_case_id && !claim_id) { setPolling(false); return; }
    // Recover the correlation id from the live case so a page refresh doesn't
    // leave users stranded on the "no submission found" dead-end screen.
    const recover = async () => {
      try {
        const res = await api.getCashlessStatus(cashless_case_id || claim_id);
        if (res.preauth_correlation_id) {
          updateCaseState({ preauthCorrelationId: res.preauth_correlation_id });
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
    updateCaseState({ preauthCorrelationId: newCorrelationId, preauthDecision: null, approvedAmount: null });
    setCashlessCase?.((prev) => (prev ? { ...prev, preauth_status: null } : prev));
  };

  const handleQuerySubmit = async () => {
    setSubmitting(true);
    try {
      const body = {
        ...(resolvedCashlessCaseId ? { cashless_case_id: resolvedCashlessCaseId } : {}),
        ...(claim_id ? { claim_id } : {}),
        supporting_documents: queryDocs,
        ...(queryAnswer && {
          questionnaire_response: {
            status: "completed",
            item: [{ linkId: "query-1", answer: [{ valueString: queryAnswer }] }],
          },
        }),
      };
      const res = await api.respondPreauthQuery(body);
      setShowQueryDrawer(false);
      setQueryAnswer("");
      setQueryDocs([]);
      restartPoll(res.correlation_id);
    } catch (_) {
    } finally {
      setSubmitting(false);
    }
  };

  const handleResubmitSubmit = async () => {
    setSubmitting(true);
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
      setShowResubmitDrawer(false);
      restartPoll(res.correlation_id);
    } catch (_) {
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelSubmit = async () => {
    setSubmitting(true);
    try {
      const body = {
        ...(resolvedCashlessCaseId ? { cashless_case_id: resolvedCashlessCaseId } : {}),
        ...(claim_id ? { claim_id } : {}),
        preauth_ref: statusData?.preauth_ref,
        reason: cancelReason,
        description: cancelDesc,
      };
      await api.cancelPreauth(body);
      setShowCancelModal(false);
      navigate("/dashboard");
    } catch (_) {
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
  const isComplete = statusData?.status === "complete";
  const decision = statusData?.decision || caseState.preauthDecision;
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
    if (action !== "resubmit_preauth" && action !== "respond_preauth_query") return;
    const canResubmit = Boolean(resolvedCashlessCaseId || claim_id || statusData?.claim_id || cashlessCase?.claim_id);
    if (canResubmit && (isQueried || isRejected || isPartial)) {
      if (resolvedCashlessCaseId) {
        updateCaseState({ cashless_case_id: resolvedCashlessCaseId });
      }
      if (action === "resubmit_preauth") {
        setShowResubmitDrawer(true);
      } else if (action === "respond_preauth_query") {
        setShowQueryDrawer(true);
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
      <div className="wizard-step">
        <Card>
          <div style={{ display: "flex", gap: "var(--space-3)", alignItems: "flex-start" }}>
            <AlertCircle size={22} color="var(--text-muted)" style={{ flexShrink: 0, marginTop: "2px" }} />
            <div>
              <div style={{ fontWeight: 700, marginBottom: "6px" }}>No preauth submission found for this session</div>
              <p style={{ fontSize: "13px", color: "var(--text-muted)", margin: "0 0 16px" }}>
                If you submitted a preauth earlier, the result will appear in your Work Queue when the payer responds. You can also go back and resubmit from the Preauth Draft screen.
              </p>
              <div style={{ display: "flex", gap: "var(--space-3)" }}>
                <Button variant="primary" onClick={() => navigate("/work-queue")}>Go to Work Queue</Button>
                <Button variant="outline" onClick={() => navigate("../review")}>Back to Preauth Draft</Button>
              </div>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="wizard-step">
      {!isComplete && !knownDecision && (
        <Card className="mb-6">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
              <div className="spinner" style={{ width: "24px", height: "24px", borderTopColor: "var(--warning)" }} />
              <div>
                <div style={{ fontWeight: 700 }}>Awaiting payer decision</div>
                <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                  {correlationId} · Polling every {POLL_INTERVAL_MS / 1000}s
                </div>
              </div>
            </div>
            <div style={{ display: "flex", gap: "var(--space-2)" }}>
              {showGatewayRecovery && (
                <Button variant="outline" size="small" icon={Wifi} onClick={handleGatewayStatus}>
                  Request Gateway Status
                </Button>
              )}
              <Button variant="outline" size="small" icon={RefreshCw} onClick={() => restartPoll(correlationId)}>
                Refresh
              </Button>
            </div>
          </div>
          {showSoftWarning && (
            <div style={{ marginTop: "var(--space-3)", padding: "10px 14px", background: "rgba(245,158,11,0.08)", borderRadius: "var(--radius-sm)", border: "1px solid var(--warning)", fontSize: "13px", color: "var(--text-main)" }}>
              Payer decisions can take minutes to hours. You can safely leave this page - the result will appear in your Work Queue when it arrives.
            </div>
          )}
        </Card>
      )}

      {!isComplete && knownDecision && (
        <Card className="mb-6">
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
            <div className="spinner" style={{ width: "24px", height: "24px", borderTopColor: "var(--primary)" }} />
            <div>
              <div style={{ fontWeight: 700 }}>Loading adjudication details...</div>
              <div style={{ fontSize: "12px", color: "var(--text-muted)", textTransform: "capitalize" }}>
                Decision: {String(decision).toLowerCase().replace(/_/g, " ")}
              </div>
            </div>
          </div>
        </Card>
      )}

      {pendingTasks.length > 0 && (
        <div style={{ marginBottom: "var(--space-4)", padding: "12px 16px", background: "rgba(245,158,11,0.06)", border: "1px solid var(--warning)", borderRadius: "var(--radius-md)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: "13px", fontWeight: 600 }}>
            {pendingTasks.length} pending task{pendingTasks.length > 1 ? "s" : ""} in your Work Queue
          </div>
          <Button size="small" variant="outline" onClick={() => navigate("/work-queue")}>View Queue</Button>
        </div>
      )}

          {/* Totals summary */}
      {isComplete && (
        <>
          <DecisionBanner
            decision={decision}
            outcome={statusData?.outcome}
            approvedAmount={statusData?.totals?.eligible?.value}
            message={statusData?.process_notes?.[0]?.text}
          />

          <Card title="Adjudication Summary" className="mb-6">
            <div style={{ display: "flex", gap: "var(--space-4)", flexWrap: "wrap", marginBottom: statusData?.items?.length > 0 ? "16px" : 0 }}>
              {[
                { label: "Eligible Amount", value: statusData?.totals?.eligible?.value, currency: statusData?.totals?.eligible?.currency, color: "var(--success)" },
                { label: "Benefit", value: statusData?.totals?.benefit?.value, currency: statusData?.totals?.benefit?.currency, color: "var(--primary)" },
                { label: "Copay", value: statusData?.totals?.copay?.value, currency: statusData?.totals?.copay?.currency, color: "var(--error)" },
                { label: "Submitted", value: statusData?.totals?.submitted?.value, currency: statusData?.totals?.submitted?.currency, color: "var(--text-main)" },
              ].filter(t => t.value != null).map((t, i) => (
                <div key={i} style={{ flex: "1 1 120px", padding: "12px 16px", background: "var(--bg-main)", borderRadius: "var(--radius-md)", textAlign: "center" }}>
                  <div style={{ fontSize: "11px", color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase", marginBottom: "var(--space-1)" }}>{t.label}</div>
                  <div style={{ fontSize: "20px", fontWeight: 800, color: t.color }}>
                    {t.currency === "INR" ? "₹" : (t.currency || "")}{t.value?.toLocaleString()}
                  </div>
                </div>
              ))}
              {/* If all totals are null, fallback AmountGrid */}
              {!statusData?.totals?.eligible?.value && !statusData?.totals?.benefit?.value && (
                <AmountGrid totals={statusData?.totals} />
              )}
            </div>

            {/* Claim Items table */}
            {(statusData?.claim_items?.length > 0 || statusData?.items?.length > 0) && (
              <div className="table-responsive-wrapper">
                <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", marginBottom: "var(--space-2)" }}>Claim Items</div>
                <table className="table-modern" style={{ fontSize: "13px" }}>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Service</th>
                      <th>Category</th>
                      <th style={{ textAlign: "right" }}>Qty</th>
                      <th style={{ textAlign: "right" }}>Unit Price</th>
                      <th style={{ textAlign: "right" }}>Net Amount</th>
                      <th style={{ textAlign: "right" }}>Eligible</th>
                      <th>Decision</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(statusData?.claim_items?.length > 0 ? statusData.claim_items : statusData.items).map((item, i) => {
                      const adj = item.adjudication;
                      const claimItem = statusData?.claim_items?.[i];
                      return (
                        <tr key={i}>
                          <td style={{ color: "var(--text-muted)" }}>{item.sequence ?? i + 1}</td>
                          <td>
                            <div style={{ fontWeight: 600 }}>{claimItem?.service_name || `Seq #${item.sequence}`}</div>
                            {claimItem?.service_code && <code style={{ fontSize: "11px", color: "var(--text-muted)" }}>{claimItem.service_code}</code>}
                          </td>
                          <td>{claimItem?.category ? <span className="badge-modern badge-info" style={{ fontSize: "10px" }}>{claimItem.category}</span> : "-"}</td>
                          <td style={{ textAlign: "right" }}>{claimItem?.quantity ?? "-"}</td>
                          <td style={{ textAlign: "right" }}>{claimItem?.unit_price != null ? `₹${claimItem.unit_price.toLocaleString()}` : "-"}</td>
                          <td style={{ textAlign: "right", fontWeight: 600 }}>{claimItem?.net_amount != null ? `₹${claimItem.net_amount.toLocaleString()}` : "-"}</td>
                          <td style={{ textAlign: "right", color: "var(--success)", fontWeight: 700 }}>
                            {adj?.eligible?.value != null ? `₹${adj.eligible.value.toLocaleString()}` : "-"}
                          </td>
                          <td>
                            {adj?.eligible?.reason ? (
                              <span className="badge-modern badge-success" style={{ fontSize: "10px" }}>{adj.eligible.reason}</span>
                            ) : "-"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {/* Procedures + Diagnoses side by side */}
          {(statusData?.procedures?.length > 0 || statusData?.diagnoses?.length > 0) && (
            <div className="grid-2-col" style={{ gap: "var(--space-4)", marginBottom: "var(--space-4)" }}>
              {statusData?.procedures?.length > 0 && (
                <Card title="Procedures">
                  {statusData.procedures.map((p, i) => (
                    <div key={i} style={{ padding: "8px 0", borderBottom: "1px solid var(--border-color)", fontSize: "13px" }}>
                      <div style={{ fontWeight: 600 }}>{p.name}</div>
                      <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                        {p.date && new Date(p.date).toLocaleDateString()}
                        {p.code && <> · <code>{p.code}</code></>}
                      </div>
                    </div>
                  ))}
                </Card>
              )}
              {statusData?.diagnoses?.length > 0 && (
                <Card title="Diagnoses">
                  {statusData.diagnoses.map((d, i) => (
                    <div key={i} style={{ padding: "8px 0", borderBottom: "1px solid var(--border-color)", fontSize: "13px", display: "flex", gap: "var(--space-2)", alignItems: "flex-start" }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600 }}>{d.name}</div>
                        <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                          <code>{d.code}</code>
                          {d.primary && <span className="badge-modern badge-info" style={{ fontSize: "10px", marginLeft: "6px" }}>Primary</span>}
                          {d.on_admission && <span className="badge-modern badge-success" style={{ fontSize: "10px", marginLeft: "4px" }}>On Admission</span>}
                        </div>
                      </div>
                    </div>
                  ))}
                </Card>
              )}
            </div>
          )}

          {statusData?.errors?.length > 0 && (
            <Card className="mb-6">
              <PayrErrorList errors={statusData.errors} />
            </Card>
          )}


          <div style={{ display: "flex", justifyContent: "space-between", marginTop: "var(--space-6)" }}>
            <Button variant="outline" onClick={() => navigate("/")}>Save & Close</Button>
            <div style={{ display: "flex", gap: "var(--space-3)", flexWrap: "wrap" }}>
              {(isApproved || isPartial) && (
                <>
                  <Button variant="outline" icon={PlusCircle} onClick={() => setShowEnhancement(true)}>
                    Request Enhancement
                  </Button>
                  <Button variant="outline" onClick={() => setShowCancelModal(true)}>
                    Cancel Preauth
                  </Button>
                </>
              )}
              {isQueried && (
                <>
                  <Button variant="outline" onClick={() => setShowQueryDrawer(true)}>
                    Respond to Query
                  </Button>
                  <Button variant="outline" onClick={() => setShowResubmitDrawer(true)}>
                    Resubmit with Corrections
                  </Button>
                </>
              )}
              {(isRejected || isPartial) && (
                <>
                  <Button variant="outline" onClick={() => setShowResubmitDrawer(true)}>
                    Resubmit Preauth
                  </Button>
                  {hasClaimContext && (
                    <Button variant="outline" onClick={() => navigate("../reprocess")}>
                      Appeal / Reprocess
                    </Button>
                  )}
                </>
              )}
              {(isQueried || isRejected || isPartial) && OUTBOUND_COMMUNICATIONS_ENABLED && (
                <Button variant="outline" icon={Send} onClick={() => setShowSendModal(true)}>
                  Message Payer
                </Button>
              )}
              {isUnknown && (
                <>
                  <Button variant="outline" icon={RefreshCw} onClick={() => restartPoll(correlationId)}>
                    Refresh
                  </Button>
                  <Button variant="outline" icon={Wifi} onClick={handleGatewayStatus}>
                    Request Gateway Status
                  </Button>
                </>
              )}
              {isCancelled && (
                <Button variant="outline" icon={RefreshCw} onClick={() => restartPoll(correlationId)}>
                  Refresh
                </Button>
              )}
              {!isCancelled && (
                <Button
                  variant="primary"
                  disabled={!isApproved && !isPartial}
                  onClick={() => navigate("../claim", { state: { claim_id: statusData?.claim_id || caseState.claim_id } })}
                >
                  Proceed to Claim <ArrowRight size={18} style={{ marginLeft: "8px" }} />
                </Button>
              )}
            </div>
          </div>
        </>
      )}

      <Drawer open={showQueryDrawer} onClose={() => setShowQueryDrawer(false)} title="Respond to Payer Query">
        <p style={{ fontSize: "14px", color: "var(--text-muted)", marginBottom: "var(--space-5)" }}>
          Provide a clinical justification and attach any documents requested by the payer.
        </p>
        <div style={{ marginBottom: "var(--space-4)" }}>
          <label style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-muted)", display: "block", marginBottom: "6px" }}>Clinical Justification</label>
          <textarea
            className="input-modern"
            style={{ height: "100px", resize: "vertical" }}
            placeholder="Describe the clinical justification for the requested service…"
            value={queryAnswer}
            onChange={(e) => setQueryAnswer(e.target.value)}
          />
        </div>
        <div style={{ marginBottom: "var(--space-5)" }}>
          <label style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-muted)", display: "block", marginBottom: "6px" }}>Supporting Document URL</label>
          <input
            className="input-modern"
            placeholder="https://hospital.example/records/doc.pdf"
            value={queryDocs[0]?.url || ""}
            onChange={(e) =>
              setQueryDocs(
                e.target.value
                  ? [{ category: "attachment", name: "Supporting Document", code: "ATTACHMENT", url: e.target.value }]
                  : []
              )
            }
          />
        </div>
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

      <Drawer open={showResubmitDrawer} onClose={() => setShowResubmitDrawer(false)} title="Resubmit Preauth">
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
                        <td style={{ textAlign: "right" }}>₹{Number(item.net_amount)?.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null;
        })()}
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

      <ConfirmModal open={showCancelModal} onClose={() => setShowCancelModal(false)} title="Cancel Preauthorization">
        <p style={{ fontSize: "14px", color: "var(--text-muted)", marginBottom: "var(--space-5)" }}>
          Cancellation is irreversible. The preauth reference <strong>{statusData?.preauth_ref}</strong>
          {statusData?.totals?.eligible?.value != null && (
            <> and its approved amount of <strong style={{ color: "var(--error)" }}>₹{statusData.totals.eligible.value.toLocaleString()}</strong></>
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
        <div style={{ display: "flex", gap: "var(--space-3)", justifyContent: "flex-end" }}>
          <Button variant="outline" onClick={() => setShowCancelModal(false)}>Keep Preauth</Button>
          <Button variant="primary" disabled={submitting} onClick={handleCancelSubmit}
            style={{ background: "var(--error)", borderColor: "var(--error)" }}>
            {submitting ? "Cancelling…" : "Confirm Cancellation"}
          </Button>
        </div>
      </ConfirmModal>

      <SendCommunicationModal
        open={showSendModal}
        onClose={() => setShowSendModal(false)}
        defaultPayerId={payerId}
        defaultClaimReference={statusData?.preauth_ref || ""}
        claimId={claim_id}
        cashlessCaseId={cashless_case_id}
      />

      <AnimatePresence>
        {showEnhancement && (
          <div style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)" }}
              onClick={() => setShowEnhancement(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              style={{ position: "relative", background: "var(--bg-card)", width: "100%", maxWidth: "640px", padding: "28px", borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-lg)", border: "1px solid var(--border-color)", zIndex: 101, margin: "0 16px", maxHeight: "90vh", overflowY: "auto" }}
            >
              <h3 style={{ fontSize: "20px", fontWeight: 800, marginBottom: "var(--space-5)" }}>Request Preauth Enhancement</h3>
              <PreauthEnhancement ctx={ctx} onClose={() => setShowEnhancement(false)} />
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
