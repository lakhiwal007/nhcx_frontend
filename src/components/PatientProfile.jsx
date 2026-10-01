import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  User, Calendar, Phone, ChevronDown, ChevronRight,
  BadgeIndianRupee, Plus, ArrowLeft, Activity, AlertCircle
} from "lucide-react";
import { api } from "../api";
import { Card, StatusBadge, Button, EmptyState, LoadingBlock, SkeletonTable, TablePagination, formatMoney } from "./Common";
import { formatDate, formatPhone, formatCaseRef } from "../format.js";
import { taskStep } from "../taskRoutes";
import { resolveCaseStatus } from "../caseStatus.js";
import { routeAtOrAfter } from "../workflowStorage";
import { useNavigate, useSearchParams } from "react-router-dom";

function calculateAge(dob) {
  if (!dob) return null;
  const years = Math.floor((Date.now() - new Date(dob)) / (365.25 * 24 * 3600 * 1000));
  return years;
}

function CaseStatusChip({ claim }) {
  const cfg = resolveCaseStatus(claim);
  return <span className={`badge-modern ${cfg.badgeClass}`}>{cfg.label}</span>;
}

function PatientDetail({ patient }) {
  const navigate = useNavigate();
  const [tasks, setTasks] = useState([]);
  const [communications, setCommunications] = useState([]);
  const [loadingExtra, setLoadingExtra] = useState(false);
  const [expandedVisit, setExpandedVisit] = useState(0);
  const [headerPhotoError, setHeaderPhotoError] = useState(false);

  const age = calculateAge(patient.dob);

  const totalBilled = patient.visits?.reduce((sum, visit) => {
    return sum + (visit.invoices?.reduce((invSum, inv) => invSum + (inv.amount_billed || 0), 0) || 0);
  }, 0);

  useEffect(() => {
    setLoadingExtra(true);
    Promise.all([
      api.listTasks({ child_id: patient.child_id, status: "pending" }),
      api.listCommunications({ child_id: patient.child_id }),
    ])
      .then(([tasksRes, commsRes]) => {
        setTasks(tasksRes?.tasks || []);
        setCommunications(commsRes?.communications || []);
      })
      .catch(() => {})
      .finally(() => setLoadingExtra(false));
  }, [patient.child_id]);

  const startWorkflow = (visit) => {
    // Thread the visit's known bill total forward so the payer/policy step can
    // warn when a policy's sum_insured looks too low — this is the only point
    // in the journey where an invoice total is on hand before a case exists.
    const estimatedBillAmount = visit?.invoices?.reduce(
      (sum, inv) => sum + (inv.final_amount ?? inv.amount_billed ?? 0),
      0,
    ) || null;
    navigate(`/case/${patient.child_id}/payer`, {
      state: { admission_id: visit?.admission_no, newCase: true, estimatedBillAmount },
    });
  };

  const resumeCase = async (claimSummary) => {
    if (!claimSummary) {
      navigate(`/case/${patient.child_id}/payer`);
      return;
    }
    
    try {
      const fullCase = await api.getCashlessStatus(claimSummary.cashless_case_id);
      const pendingTasks = fullCase.pending_tasks || [];

      const {
        status,
        current_step,
        next_actions,
        policy_number,
        payer_id,
        claim,
        preauth,
      } = fullCase;

      // `preauth`/`claim` are only present once current_step reaches
      // preauth_submitted / claim_submitted or later respectively (see
      // FRONTEND_API.yaml CashlessCase.preauth / .claim) — same shape as
      // GET /cashless/preauth/status/{cid} and /cashless/claims/status/{cid}.
      const pDecision = preauth?.decision || claimSummary.preauth_status;
      const cDecision = claim?.decision || claimSummary.claim_decision;
      const cancellationPending = preauth?.purpose === "cancel" && preauth?.status === "pending";

      let dest = "payer";

      if (cancellationPending) {
        dest = "status";
      } else if (claim?.payment_status === "PAYMENT_SETTLED" || claim?.payment_status === "PAYMENT_INITIATED") {
        dest = "payment";
      } else if (cDecision === "APPROVED" || cDecision === "PARTIALLY_APPROVED") {
        dest = "payment";
      } else if (claim?.correlation_id && !cDecision) {
        dest = "claim";
      } else if (pDecision === "APPROVED" || pDecision === "PARTIALLY_APPROVED") {
        dest = "claim";
      } else if (pDecision === "QUERIED" || pDecision === "REJECTED" || pDecision === "CANCELLED") {
        dest = "status";
      } else if (preauth?.correlation_id && (!pDecision || pDecision === "pending")) {
        dest = "status";
      } else if (current_step === "claim_submitted" || current_step === "claim_decided") {
        // Decision/correlation fields above didn't resolve it, but current_step
        // is the authoritative journey position — don't fall back to Eligibility Prep.
        dest = "claim";
      } else if (current_step === "payment_pending" || current_step === "settled") {
        dest = "payment";
      } else if (current_step === "preauth_submitted" || current_step === "preauth_decided") {
        dest = "status";
      } else if (next_actions?.includes("prepare_preauth") || next_actions?.includes("submit_preauth")) {
        dest = "review";
      } else if (status === "pending" || status === "partial" || next_actions?.includes("refresh")) {
        dest = "prep";
      } else if (policy_number) {
        dest = "prep";
      } else if (payer_id) {
        dest = "payer";
      }

      const actionable = cancellationPending ? null : pendingTasks.find((t) => taskStep(t.task_type));
      const taskRoute = actionable ? taskStep(actionable.task_type) : null;
      const target = taskRoute && routeAtOrAfter(taskRoute, dest) ? taskRoute : dest;

      navigate(`/case/${patient.child_id}/${target}`, {
        state: {
          cashless_case_id: fullCase.cashless_case_id,
          claim_id: claimSummary.claim_id ?? claim?.claim_id ?? null,
        },
      });
    } catch (err) {
      console.error(err);
      navigate(`/case/${patient.child_id}/payer`);
    }
  };

  return (
    <motion.div
      key={patient.child_id}
      initial={{ opacity: 0, x: 16 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 16 }}
      transition={{ duration: 0.2 }}
      style={{ display: "flex", flexDirection: "column", gap: "var(--space-5)" }}
    >
      <div className="patient-detail-header" style={{
        background: "var(--bg-card)", border: "1px solid var(--border-color)",
        borderRadius: "var(--radius-lg)", padding: "20px 24px",
        display: "flex", justifyContent: "space-between", alignItems: "center", gap: "var(--space-4)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-4)" }}>
          <div style={{
            width: "56px", height: "56px", borderRadius: "50%",
            background: "var(--primary)", color: "white",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontWeight: 800, fontSize: "24px", flexShrink: 0, overflow: "hidden",
          }}>
            {patient.profile_photo && !headerPhotoError
              ? <img src={patient.profile_photo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={() => setHeaderPhotoError(true)} />
              : patient.name?.[0]?.toUpperCase()
            }
          </div>
          <div>
            <h2 style={{ fontSize: "22px", fontWeight: 800, marginBottom: "6px" }}>{patient.name}</h2>
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", fontSize: "13px", color: "var(--text-muted)" }}>
              <span className="badge-modern badge-info">#{patient.child_id}</span>
              <span style={{ textTransform: "capitalize", display: "flex", alignItems: "center", gap: "var(--space-1)" }}>
                <User size={13} /> {patient.gender}
              </span>
              {age !== null && (
                <span style={{ display: "flex", alignItems: "center", gap: "var(--space-1)" }}>
                  <Calendar size={13} /> {patient.dob} ({age} yrs)
                </span>
              )}
              {patient.mobile && (
                <span style={{ display: "flex", alignItems: "center", gap: "var(--space-1)" }}>
                  <Phone size={13} /> {formatPhone(patient.mobile)}
                </span>
              )}
              {patient.abha_number
                ? <span className="badge-modern badge-success" style={{ fontSize: "11px" }}>{patient.abha_number}</span>
                : <span className="badge-modern badge-warning" style={{ fontSize: "11px" }}>Not ABHA-linked</span>
              }
              {patient.cashless_cases_count > 0 && (
                <span className="badge-modern badge-info" style={{ fontSize: "11px" }}>{patient.cashless_cases_count} case{patient.cashless_cases_count !== 1 ? "s" : ""}</span>
              )}
              {totalBilled > 0 && (
                <span className="badge-modern badge-warning" style={{ fontSize: "11px", display: "flex", alignItems: "center", gap: "var(--space-1)" }}>
                  ₹{totalBilled.toLocaleString("en-IN")} billed
                </span>
              )}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: "10px", flexShrink: 0 }}>
          {patient.latest_claim && (
            <Button variant="outline" onClick={() => resumeCase(patient.latest_claim)}>
              Resume Case
            </Button>
          )}
          <Button variant="primary" icon={Plus} onClick={() => startWorkflow(patient.visits?.[0])}>
            New Cashless
          </Button>
        </div>
      </div>

      {patient.latest_claim && (
        <div style={{
          padding: "12px 16px", borderRadius: "var(--radius-md)",
          background: "rgba(79,70,229,0.05)", border: "1px solid var(--primary-light)",
          display: "flex", gap: "var(--space-5)", flexWrap: "wrap", fontSize: "13px",
        }}>
          <div>
            <span style={{ color: "var(--text-muted)", fontSize: "11px", fontWeight: 700, textTransform: "uppercase", display: "block", marginBottom: "2px" }}>Latest Case</span>
            <span style={{ fontWeight: 600 }}>#{patient.latest_claim.cashless_case_id}</span>
          </div>
          <div>
            <span style={{ color: "var(--text-muted)", fontSize: "11px", fontWeight: 700, textTransform: "uppercase", display: "block", marginBottom: "2px" }}>Step</span>
            <span style={{ fontWeight: 600 }}>{patient.latest_claim.current_step?.replace(/_/g, " ")}</span>
          </div>
          <div>
            <span style={{ color: "var(--text-muted)", fontSize: "11px", fontWeight: 700, textTransform: "uppercase", display: "block", marginBottom: "2px" }}>Payer</span>
            <span style={{ fontWeight: 600 }}>{patient.latest_claim.payer_name || patient.latest_claim.payer_id || "-"}</span>
          </div>
          <div>
            <span style={{ color: "var(--text-muted)", fontSize: "11px", fontWeight: 700, textTransform: "uppercase", display: "block", marginBottom: "2px" }}>Policy</span>
            <span style={{ fontWeight: 600 }}>{patient.latest_claim.policy_number}</span>
          </div>
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
            <CaseStatusChip claim={patient.latest_claim} />
          </div>
        </div>
      )}

      <div className="grid-1-to-3" style={{ gap: "var(--space-5)" }}>
        <div className="col-span-2" style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
          <Card title="Visits & Admissions">
            {!patient.visits?.length ? (
              <div className="text-muted text-sm" style={{ padding: "20px 0", textAlign: "center" }}>No visits on record.</div>
            ) : (
              patient.visits.map((visit, vi) => {
                const visitBilled = (visit.invoices || []).reduce(
                  (s, inv) => s + Math.max(Number(inv.amount_billed) || 0, Number(inv.final_amount) || 0),
                  0,
                );
                const visitPaid = [...(visit.payments || []), ...(visit.advance_payments || [])].reduce(
                  (s, p) => s + (Number(p.amount) || 0),
                  0,
                );
                const hasBillingActivity = visitBilled > 0 || visitPaid > 0 || visit.claims?.length > 0;
                return (
                <div key={vi} style={{ marginBottom: "var(--space-3)", border: "1px solid var(--border-color)", borderRadius: "var(--radius-md)", overflow: "hidden" }}>
                  <div
                    onClick={() => setExpandedVisit(expandedVisit === vi ? null : vi)}
                    style={{ padding: "14px 16px", background: "var(--bg-main)", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <span className="badge-modern badge-info" style={{ textTransform: "uppercase" }}>{visit.visit_type}</span>
                      <strong style={{ fontSize: "14px" }}>{visit.admission_no || `Visit ${vi + 1}`}</strong>
                      <StatusBadge status={visit.status} />
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px", color: "var(--text-muted)", fontSize: "13px" }}>
                      <span>{formatDate(visit.started_at)}</span>
                      {expandedVisit === vi ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    </div>
                  </div>
                  <AnimatePresence>
                    {expandedVisit === vi && (
                      <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }} style={{ overflow: "hidden" }}>
                        <div style={{ padding: "var(--space-4)", borderTop: "1px solid var(--border-color)" }}>
                          <div className="grid-2-col" style={{ gap: "var(--space-4)", marginBottom: "var(--space-4)", fontSize: "13px" }}>
                            <div>
                              <div style={{ fontSize: "11px", color: "var(--text-muted)", fontWeight: 700, textTransform: "uppercase", marginBottom: "var(--space-1)" }}>Diagnosis</div>
                              <div>{visit.diagnosis || "-"}</div>
                            </div>
                            <div>
                              <div style={{ fontSize: "11px", color: "var(--text-muted)", fontWeight: 700, textTransform: "uppercase", marginBottom: "var(--space-1)" }}>Primary Doctor</div>
                              <div style={{ fontWeight: 600 }}>{visit.primary_doctor?.name || "-"}</div>
                              {visit.primary_doctor?.registration_no && (
                                <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>Reg: {visit.primary_doctor.registration_no}</div>
                              )}
                            </div>
                          </div>

                          {visit.procedures?.length > 0 && (
                            <div style={{ marginBottom: "var(--space-4)" }}>
                              <div style={{ fontSize: "12px", fontWeight: 700, marginBottom: "var(--space-2)", color: "var(--text-muted)", textTransform: "uppercase" }}>Procedures</div>
                              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                                {visit.procedures.map((proc, pi) => (
                                  <span key={pi} className="badge-modern badge-info" style={{ fontSize: "11px", display: "inline-flex", alignItems: "center", gap: "var(--space-1)" }}>
                                    <Activity size={10} />
                                    {proc.code && <code style={{ fontSize: "10px" }}>{proc.code}</code>}
                                    {proc.name}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}

                          {visit.invoices?.length > 0 && visitBilled > 0 && (
                            <div style={{ marginBottom: "var(--space-4)" }}>
                              <div style={{ fontSize: "12px", fontWeight: 700, marginBottom: "var(--space-2)", color: "var(--text-muted)", textTransform: "uppercase" }}>Invoices</div>
                              {visit.invoices.map((inv, ii) => (
                                <div key={ii} style={{ padding: "10px 12px", background: "var(--bg-main)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-color)", marginBottom: "var(--space-2)", fontSize: "13px" }}>
                                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "var(--space-1)" }}>
                                    <strong>{inv.invoice_no}</strong>
                                    <StatusBadge status={inv.billing_status} />
                                  </div>
                                  <div style={{ display: "flex", gap: "var(--space-5)", color: "var(--text-muted)" }}>
                                    <span>Billed: <strong style={{ color: "var(--text-main)" }}>{formatMoney(inv.amount_billed)}</strong></span>
                                    {inv.final_discount > 0 && <span>Discount: <strong style={{ color: "var(--success)" }}>-{formatMoney(inv.final_discount)}</strong></span>}
                                    <span>Final: <strong style={{ color: "var(--primary)" }}>{formatMoney(inv.final_amount)}</strong></span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}

                          {(visit.payments?.length > 0 || visit.advance_payments?.length > 0) && (() => {
                            // Cash the patient has already paid (deposits/advances +
                            // collected) — needed to reconcile against the payer
                            // settlement and compute any refund at discharge.
                            const rows = [
                              ...(visit.advance_payments || []).map((p) => ({ ...p, kind: "Advance" })),
                              ...(visit.payments || []).map((p) => ({ ...p, kind: "Collected" })),
                            ];
                            const total = rows.reduce((s, p) => s + (Number(p.amount) || 0), 0);
                            return (
                              <div style={{ marginBottom: "var(--space-4)" }}>
                                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", fontWeight: 700, marginBottom: "var(--space-2)", color: "var(--text-muted)", textTransform: "uppercase" }}>
                                  <span>Patient Payments</span>
                                  <span style={{ color: "var(--text-main)" }}>{formatMoney(total)} collected</span>
                                </div>
                                {rows.map((p, pi) => (
                                  <div key={pi} style={{ display: "flex", justifyContent: "space-between", padding: "6px 12px", background: "var(--bg-main)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-color)", marginBottom: "6px", fontSize: "12px" }}>
                                    <span style={{ color: "var(--text-muted)" }}>{p.kind}{p.mode ? ` · ${p.mode}` : ""}{p.date ? ` · ${p.date}` : ""}</span>
                                    <strong>{formatMoney(p.amount)}</strong>
                                  </div>
                                ))}
                              </div>
                            );
                          })()}

                          {visit.claims?.length > 0 && (
                            <div>
                              <div style={{ fontSize: "12px", fontWeight: 700, marginBottom: "var(--space-2)", display: "flex", alignItems: "center", gap: "6px", color: "var(--text-muted)", textTransform: "uppercase" }}>
                                <BadgeIndianRupee size={13} /> Claims
                              </div>
                              {visit.claims.map((claim, ci) => (
                                <div key={ci} style={{ background: "var(--bg-main)", border: "1px solid var(--border-color)", borderRadius: "var(--radius-sm)", padding: "10px 12px", marginBottom: "var(--space-2)" }}>
                                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "6px" }}>
                                    <div>
                                      <div style={{ fontWeight: 700, fontSize: "13px" }}>
                                        {claim.cashless_case_id ? formatCaseRef(claim.cashless_case_id) : `Claim #${claim.claim_id}`}
                                      </div>
                                      <div style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "2px" }}>
                                        {claim.payer_name} · {claim.policy_number}
                                      </div>
                                    </div>
                                    <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "center", flexShrink: 0 }}>
                                      <div style={{ textAlign: "right" }}>
                                        <div style={{ fontSize: "10px", color: "var(--text-muted)" }}>Billed</div>
                                        <div style={{ fontWeight: 700, color: "var(--primary)" }}>{formatMoney(claim.total_billed)}</div>
                                      </div>
                                      <Button variant="outline" size="small" onClick={() => resumeCase(claim.cashless_case_id ? claim : null)}>Open</Button>
                                    </div>
                                  </div>
                                  <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", alignItems: "center" }}>
                                    <CaseStatusChip claim={claim} />
                                    {claim.claim_decision && (
                                      <span className={`badge-modern badge-${claim.claim_decision === "APPROVED" ? "success" : claim.claim_decision === "REJECTED" ? "error" : "warning"}`} style={{ fontSize: "10px" }}>
                                        Claim: {claim.claim_decision}
                                      </span>
                                    )}
                                    {claim.payment_status && (
                                      <span className={`badge-modern badge-${claim.payment_status === "paid" ? "success" : claim.payment_status === "failed" ? "error" : "info"}`} style={{ fontSize: "10px" }}>
                                        Pay: {claim.payment_status}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}

                          {!hasBillingActivity && (
                            <div style={{ padding: "16px", textAlign: "center", color: "var(--text-muted)", fontSize: "13px", background: "var(--bg-main)", borderRadius: "var(--radius-sm)", border: "1px dashed var(--border-color)" }}>
                              {visit.invoices?.length > 0
                                ? `Invoice ${visit.invoices.map((inv) => inv.invoice_no).filter(Boolean).join(", ")} raised — nothing billed yet.`
                                : "No billing information yet."}
                            </div>
                          )}

                          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "var(--space-3)", paddingTop: "12px", borderTop: "1px solid var(--border-color)" }}>
                            <Button variant="primary" icon={Plus} onClick={() => startWorkflow(visit)}>
                              Start Cashless Case
                            </Button>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
                );
              })
            )}
          </Card>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
          <Card title="Pending Tasks">
            {loadingExtra ? (
              <div className="flex-center py-6"><div className="spinner" style={{ width: "24px", height: "24px" }} /></div>
            ) : tasks.length === 0 ? (
              <p className="text-muted text-sm" style={{ padding: "12px 0", textAlign: "center" }}>No pending tasks.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {tasks.map((task) => (
                  <div
                    key={task.id ?? task.task_id}
                    style={{
                      borderLeft: `3px solid ${task.priority === "urgent" ? "var(--error)" : task.priority === "high" ? "var(--warning)" : "var(--primary)"}`,
                      padding: "10px 12px", background: "var(--bg-main)", borderRadius: "var(--radius-sm)",
                      border: "1px solid var(--border-color)", borderLeftWidth: "3px",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "var(--space-1)" }}>
                      <span className={`badge-modern badge-${task.priority === "urgent" ? "error" : task.priority === "high" ? "warning" : "info"}`} style={{ fontSize: "10px" }}>
                        {task.priority?.toUpperCase()}
                      </span>
                      <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>{task.workflow}</span>
                    </div>
                    <div style={{ fontSize: "13px", fontWeight: 600 }}>{task.title}</div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card title="Communications">
            {loadingExtra ? (
              <div className="flex-center py-6"><div className="spinner" style={{ width: "24px", height: "24px" }} /></div>
            ) : communications.length === 0 ? (
              <p className="text-muted text-sm" style={{ padding: "12px 0", textAlign: "center" }}>No communications.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {communications.map((comm) => (
                  <div key={comm.correlation_id} style={{ padding: "10px 12px", background: "var(--bg-main)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-color)", fontSize: "13px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "var(--space-1)" }}>
                      <span style={{ fontWeight: 600 }}>{comm.topic_display}</span>
                      <span className={`badge-modern badge-${comm.priority === "high" ? "warning" : "info"}`} style={{ fontSize: "10px" }}>{comm.priority}</span>
                    </div>
                    <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>From: {comm.payer_id}</div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </motion.div>
  );
}

const PAGE_SIZE = 20;

export default function PatientProfile() {
  const [children, setChildren] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [hasSearched, setHasSearched] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [searchParams, setSearchParams] = useSearchParams();

  const loadChildren = useCallback(async (query = "", pageNum = 1) => {
    setLoading(true);
    setLoadError(false);
    try {
      const params = { limit: PAGE_SIZE, offset: (pageNum - 1) * PAGE_SIZE };
      if (query.trim()) {
        if (/^\d{10}$/.test(query.trim())) {
          params.mobile = query.trim();
        } else if (/^\d+$/.test(query.trim())) {
          params.child_id = Number(query.trim());
        } else {
          params.name = query.trim();
        }
      }
      const res = await api.searchChildren(params);
      setChildren(res?.children || []);
      setTotalCount(res?.total_count || 0);
    } catch (_) {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleSelectPatient = useCallback((child) => {
    const next = new URLSearchParams(searchParams);
    next.set("child_id", String(child.child_id));
    setSearchParams(next);
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    loadChildren("", 1);
  }, [loadChildren]);

  const deepLinkChildId = searchParams.get("child_id");

  useEffect(() => {
    if (!deepLinkChildId) {
      setSelectedPatient(null);
      return;
    }
    if (!/^\d+$/.test(deepLinkChildId)) return;
    let cancelled = false;
    setLoadingDetail(true);
    api
      .searchChildren({ child_id: Number(deepLinkChildId) })
      .then((res) => {
        const full = res?.children?.find((c) => String(c.child_id) === deepLinkChildId);
        if (!cancelled && full) setSelectedPatient(full);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoadingDetail(false); });
    return () => { cancelled = true; };
  }, [deepLinkChildId]);

  const clearSelection = useCallback(() => {
    setSelectedPatient(null);
    if (searchParams.has("child_id")) {
      const next = new URLSearchParams(searchParams);
      next.delete("child_id");
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const handleSearch = () => {
    setHasSearched(true);
    setPage(1);
    loadChildren(searchQuery, 1);
  };

  const handlePageChange = (newPage) => {
    setPage(newPage);
    loadChildren(searchQuery, newPage);
  };

  if (selectedPatient || loadingDetail) {
    return (
      <div className="cc-screen">
        <div>
          <Button variant="outline" size="small" icon={ArrowLeft} onClick={clearSelection}>
            All patients
          </Button>
        </div>
        {selectedPatient ? (
          <PatientDetail patient={selectedPatient} />
        ) : (
          <LoadingBlock text="Loading patient details…" />
        )}
      </div>
    );
  }

  return (
    <div className="cc-screen">
      <div className="wq-header">
        <div>
          <h1 className="wq-title">Child Registry</h1>
          <div className="wq-counts">
            <span>{loading ? "Loading patients…" : `${totalCount} patient${totalCount === 1 ? "" : "s"}`}</span>
          </div>
        </div>
      </div>

      {loadError && (
        <div className="inline-error-banner" style={{ margin: 0 }}>
          <AlertCircle size={16} />
          Could not load patients. Showing the last known results, if any.
        </div>
      )}

      <div className="wq-panel">
        <div className="wq-toolbar">
          <input
            className="input-modern wq-search"
            placeholder="Name, ID or mobile — press Enter"
            aria-label="Search patients"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              if (!e.target.value.trim() && hasSearched) {
                setHasSearched(false);
                setPage(1);
                loadChildren("", 1);
              }
            }}
            onKeyDown={(e) => { if (e.key === "Enter") handleSearch(); }}
          />
        </div>

        {loading ? (
          <SkeletonTable rows={6} cols={5} />
        ) : children.length === 0 ? (
          <EmptyState
            icon={User}
            title={hasSearched ? "No patients found" : "No patients registered yet"}
            description={hasSearched ? "Try a different name, ID or mobile number." : "Registered children will show up here."}
          />
        ) : (
          <div className="wq-table-scroll">
            <table className="wq-table">
              <thead>
                <tr>
                  <th>Patient</th>
                  <th>Mobile</th>
                  <th>Latest case</th>
                  <th>Cases</th>
                </tr>
              </thead>
              <tbody>
                {children.map((child) => {
                  const age = calculateAge(child.dob);
                  const claim = child.latest_claim;
                  return (
                    <tr
                      key={child.child_id}
                      tabIndex={0}
                      title="Open patient"
                      onClick={() => handleSelectPatient(child)}
                      onKeyDown={(e) => { if (e.key === "Enter") handleSelectPatient(child); }}
                    >
                      <td>
                        <div className="cc-patient">{child.name}</div>
                        <div className="wq-sub">
                          {[`#${child.child_id}`, child.gender && child.gender[0].toUpperCase() + child.gender.slice(1), age !== null && `${age} yrs`]
                            .filter(Boolean)
                            .join(" · ")}
                        </div>
                      </td>
                      <td className="wq-mono">{child.mobile ? formatPhone(child.mobile) : "—"}</td>
                      <td>
                        {claim ? (
                          <>
                            <CaseStatusChip claim={claim} />
                            {(claim.payer_name || claim.payer_id) && <div className="wq-sub">{claim.payer_name || claim.payer_id}</div>}
                          </>
                        ) : (
                          <span className="ep-muted">No cases</span>
                        )}
                      </td>
                      <td className="wq-mono">{child.cashless_cases_count ?? (claim ? 1 : 0)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {!loading && children.length > 0 && (
          <div className="wq-pagination">
            <TablePagination
              page={page - 1}
              pageSize={PAGE_SIZE}
              total={totalCount}
              onPageChange={(p) => handlePageChange(p + 1)}
              label="patients"
            />
          </div>
        )}
      </div>
    </div>
  );
}
