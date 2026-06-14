import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, RefreshCw, PlusCircle, AlertCircle, X, Radio, Wifi } from "lucide-react";
import { api } from "../../api";
import { Card, Button, DecisionBanner, AmountGrid, StatusBadge, DocumentChecklist } from "../Common";
import PreauthEnhancement from "./PreauthEnhancement";

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
            <div style={{ flex: 1, overflowY: "auto", padding: "24px" }}>
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
            style={{ position: "relative", background: "var(--bg-card)", width: "100%", maxWidth: "500px", padding: "28px", borderRadius: "16px", boxShadow: "var(--shadow-lg)", border: "1px solid var(--border-color)", zIndex: 101, margin: "0 16px" }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
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
  const { caseState, updateCaseState } = ctx;
  const { preauthCorrelationId, claim_id, cashless_case_id, draftData } = caseState;

  const [statusData, setStatusData] = useState(null);
  const [polling, setPolling] = useState(true);
  const [pollElapsed, setPollElapsed] = useState(0);
  const [showEnhancement, setShowEnhancement] = useState(false);
  const [showQueryDrawer, setShowQueryDrawer] = useState(false);
  const [showResubmitDrawer, setShowResubmitDrawer] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);

  const [queryAnswer, setQueryAnswer] = useState("");
  const [queryDocs, setQueryDocs] = useState([]);
  const [resubmitItems, setResubmitItems] = useState([]);
  const [cancelReason, setCancelReason] = useState("treatmentplanchanged");
  const [cancelDesc, setCancelDesc] = useState("");

  const [submitting, setSubmitting] = useState(false);

  const correlationId = preauthCorrelationId;
  const pollRef = useRef(null);
  const startTimeRef = useRef(Date.now());
  const elapsedRef = useRef(null);

  useEffect(() => {
    if (!correlationId) {
      setPolling(false);
      return;
    }
    const doPoll = async () => {
      try {
        const res = await api.getPreauthStatus(correlationId);
        setStatusData(res);
        if (res.preauth_ref) updateCaseState({ preauthRef: res.preauth_ref, preauthDecision: res.decision });
        if (res.claim_id && !caseState.claim_id) updateCaseState({ claim_id: res.claim_id });
        if (res.cashless_case_id && !caseState.cashless_case_id) updateCaseState({ cashless_case_id: res.cashless_case_id });
        if (res.status === "complete" || res.status === "not_found") {
          setPolling(false);
          clearInterval(pollRef.current);
        }
      } catch (_) {}
    };
    doPoll();
    pollRef.current = setInterval(doPoll, POLL_INTERVAL_MS);
    return () => clearInterval(pollRef.current);
  }, []);

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

  const restartPoll = (newCorrelationId) => {
    clearInterval(pollRef.current);
    startTimeRef.current = Date.now();
    setPollElapsed(0);
    setPolling(true);
    setStatusData(null);
    updateCaseState({ preauthCorrelationId: newCorrelationId });
    const doPoll = async () => {
      try {
        const res = await api.getPreauthStatus(newCorrelationId);
        setStatusData(res);
        if (res.claim_id && !caseState.claim_id) updateCaseState({ claim_id: res.claim_id });
        if (res.cashless_case_id && !caseState.cashless_case_id) updateCaseState({ cashless_case_id: res.cashless_case_id });
        if (res.status === "complete" || res.status === "not_found") {
          setPolling(false);
          clearInterval(pollRef.current);
        }
      } catch (_) {}
    };
    doPoll();
    pollRef.current = setInterval(doPoll, POLL_INTERVAL_MS);
  };

  const handleQuerySubmit = async () => {
    setSubmitting(true);
    try {
      const body = {
        ...(cashless_case_id ? { cashless_case_id } : { claim_id }),
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
      const body = {
        ...(cashless_case_id ? { cashless_case_id } : { claim_id }),
        ...(resubmitItems.length > 0 && { items: resubmitItems }),
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
        claim_id,
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
      await api.requestGatewayStatus({ correlation_id: correlationId, claim_id });
    } catch (_) {}
  };

  if (!correlationId) {
    return (
      <div className="wizard-step">
        <Card>
          <div style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
            <AlertCircle size={22} color="var(--text-muted)" style={{ flexShrink: 0, marginTop: "2px" }} />
            <div>
              <div style={{ fontWeight: 700, marginBottom: "6px" }}>No preauth submission found for this session</div>
              <p style={{ fontSize: "13px", color: "var(--text-muted)", margin: "0 0 16px" }}>
                If you submitted a preauth earlier, the result will appear in your Work Queue when the payer responds. You can also go back and resubmit from the Preauth Draft screen.
              </p>
              <div style={{ display: "flex", gap: "12px" }}>
                <Button variant="primary" onClick={() => navigate("/work-queue")}>Go to Work Queue</Button>
                <Button variant="outline" onClick={() => navigate("../review")}>Back to Preauth Draft</Button>
              </div>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  const isComplete = statusData?.status === "complete";
  const decision = statusData?.decision;
  const isApproved = decision === "APPROVED";
  const isPartial = decision === "PARTIALLY_APPROVED";
  const isQueried = decision === "QUERIED";
  const isRejected = decision === "REJECTED";
  const pendingTasks = statusData?.pending_tasks ?? [];
  const showSoftWarning = polling && pollElapsed > SOFT_WARNING_MS;
  const showGatewayRecovery = polling && pollElapsed > GATEWAY_RECOVERY_MS;

  return (
    <div className="wizard-step">
      {!isComplete && (
        <Card className="mb-6">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <div className="spinner" style={{ width: "24px", height: "24px", borderTopColor: "var(--warning)" }} />
              <div>
                <div style={{ fontWeight: 700 }}>Awaiting payer decision</div>
                <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                  {correlationId} · Polling every {POLL_INTERVAL_MS / 1000}s
                </div>
              </div>
            </div>
            <div style={{ display: "flex", gap: "8px" }}>
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
            <div style={{ marginTop: "12px", padding: "10px 14px", background: "rgba(245,158,11,0.08)", borderRadius: "8px", border: "1px solid var(--warning)", fontSize: "13px", color: "var(--text-main)" }}>
              Payer decisions can take minutes to hours. You can safely leave this page — the result will appear in your Work Queue when it arrives.
            </div>
          )}
        </Card>
      )}

      {pendingTasks.length > 0 && (
        <div style={{ marginBottom: "16px", padding: "12px 16px", background: "rgba(245,158,11,0.06)", border: "1px solid var(--warning)", borderRadius: "10px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
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
            approvedAmount={statusData?.totals?.eligible?.value}
            message={statusData?.process_notes?.[0]?.text}
          />

          <Card title="Adjudication Summary" className="mb-6">
            <div style={{ display: "flex", gap: "16px", flexWrap: "wrap", marginBottom: statusData?.items?.length > 0 ? "16px" : 0 }}>
              {[
                { label: "Eligible Amount", value: statusData?.totals?.eligible?.value, currency: statusData?.totals?.eligible?.currency, color: "var(--success)" },
                { label: "Benefit", value: statusData?.totals?.benefit?.value, currency: statusData?.totals?.benefit?.currency, color: "var(--primary)" },
                { label: "Copay", value: statusData?.totals?.copay?.value, currency: statusData?.totals?.copay?.currency, color: "var(--error)" },
                { label: "Submitted", value: statusData?.totals?.submitted?.value, currency: statusData?.totals?.submitted?.currency, color: "var(--text-main)" },
              ].filter(t => t.value != null).map((t, i) => (
                <div key={i} style={{ flex: "1 1 120px", padding: "12px 16px", background: "var(--bg-main)", borderRadius: "10px", textAlign: "center" }}>
                  <div style={{ fontSize: "11px", color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase", marginBottom: "4px" }}>{t.label}</div>
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
                <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", marginBottom: "8px" }}>Claim Items</div>
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
                          <td>{claimItem?.category ? <span className="badge-modern badge-info" style={{ fontSize: "10px" }}>{claimItem.category}</span> : "—"}</td>
                          <td style={{ textAlign: "right" }}>{claimItem?.quantity ?? "—"}</td>
                          <td style={{ textAlign: "right" }}>{claimItem?.unit_price != null ? `₹${claimItem.unit_price.toLocaleString()}` : "—"}</td>
                          <td style={{ textAlign: "right", fontWeight: 600 }}>{claimItem?.net_amount != null ? `₹${claimItem.net_amount.toLocaleString()}` : "—"}</td>
                          <td style={{ textAlign: "right", color: "var(--success)", fontWeight: 700 }}>
                            {adj?.eligible?.value != null ? `₹${adj.eligible.value.toLocaleString()}` : "—"}
                          </td>
                          <td>
                            {adj?.eligible?.reason ? (
                              <span className="badge-modern badge-success" style={{ fontSize: "10px" }}>{adj.eligible.reason}</span>
                            ) : "—"}
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
            <div className="grid-2-col" style={{ gap: "16px", marginBottom: "16px" }}>
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
                    <div key={i} style={{ padding: "8px 0", borderBottom: "1px solid var(--border-color)", fontSize: "13px", display: "flex", gap: "8px", alignItems: "flex-start" }}>
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
              {statusData.errors.map((err, i) => (
                <div key={i} style={{ display: "flex", gap: "8px", alignItems: "center", fontSize: "13px", color: "var(--error)", padding: "6px 0" }}>
                  <AlertCircle size={14} />
                  {err.detail || err.display || err.code}
                </div>
              ))}
            </Card>
          )}


          <div style={{ display: "flex", justifyContent: "space-between", marginTop: "24px" }}>
            <Button variant="outline" onClick={() => navigate("/")}>Save & Close</Button>
            <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
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
                  <Button variant="outline" onClick={() => navigate("../reprocess")}>
                    Appeal / Reprocess
                  </Button>
                </>
              )}
              <Button
                variant="primary"
                disabled={!isApproved && !isPartial}
                onClick={() => navigate("../claim", { state: { claim_id: statusData?.claim_id || caseState.claim_id } })}
              >
                Proceed to Claim <ArrowRight size={18} style={{ marginLeft: "8px" }} />
              </Button>
            </div>
          </div>
        </>
      )}

      <Drawer open={showQueryDrawer} onClose={() => setShowQueryDrawer(false)} title="Respond to Payer Query">
        <p style={{ fontSize: "14px", color: "var(--text-muted)", marginBottom: "20px" }}>
          Provide a clinical justification and attach any documents requested by the payer.
        </p>
        <div style={{ marginBottom: "16px" }}>
          <label style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-muted)", display: "block", marginBottom: "6px" }}>Clinical Justification</label>
          <textarea
            className="input-modern"
            style={{ height: "100px", resize: "vertical" }}
            placeholder="Describe the clinical justification for the requested service…"
            value={queryAnswer}
            onChange={(e) => setQueryAnswer(e.target.value)}
          />
        </div>
        <div style={{ marginBottom: "20px" }}>
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
        <p style={{ fontSize: "14px", color: "var(--text-muted)", marginBottom: "20px" }}>
          Correct clinical or billing data and resubmit. Only the fields you change here will be sent; everything else is re-derived from the hospital DB.
        </p>
        {(() => {
          // Prefer saved draft items, fall back to adjudicated items from status
          const baseItems = draftData?.editedItems ?? draftData?.items ?? statusData?.claim_items ?? statusData?.items ?? [];
          const displayItems = resubmitItems.length > 0 ? resubmitItems : baseItems;
          return baseItems.length > 0 ? (
            <div style={{ marginBottom: "20px" }}>
              <div style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", marginBottom: "8px" }}>Line Items (editable)</div>
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
        <p style={{ fontSize: "14px", color: "var(--text-muted)", marginBottom: "20px" }}>
          Cancellation is irreversible. The preauth reference <strong>{statusData?.preauth_ref}</strong> will be voided with the payer.
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
        <div style={{ marginBottom: "20px" }}>
          <label style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-muted)", display: "block", marginBottom: "6px" }}>Description (optional)</label>
          <textarea
            className="input-modern"
            style={{ height: "80px", resize: "vertical" }}
            placeholder="Additional context for the cancellation…"
            value={cancelDesc}
            onChange={(e) => setCancelDesc(e.target.value)}
          />
        </div>
        <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end" }}>
          <Button variant="outline" onClick={() => setShowCancelModal(false)}>Keep Preauth</Button>
          <Button variant="primary" disabled={submitting} onClick={handleCancelSubmit}
            style={{ background: "var(--error)", borderColor: "var(--error)" }}>
            {submitting ? "Cancelling…" : "Confirm Cancellation"}
          </Button>
        </div>
      </ConfirmModal>

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
              style={{ position: "relative", background: "var(--bg-card)", width: "100%", maxWidth: "640px", padding: "28px", borderRadius: "16px", boxShadow: "var(--shadow-lg)", border: "1px solid var(--border-color)", zIndex: 101, margin: "0 16px", maxHeight: "90vh", overflowY: "auto" }}
            >
              <h3 style={{ fontSize: "20px", fontWeight: 800, marginBottom: "20px" }}>Request Preauth Enhancement</h3>
              <PreauthEnhancement ctx={ctx} onClose={() => setShowEnhancement(false)} />
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
