import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search, User, Calendar, Phone, ChevronDown, ChevronRight, ChevronLeft,
  BadgeIndianRupee, Plus, ArrowLeft, Activity, AlertCircle, LayoutGrid, List
} from "lucide-react";
import { api } from "../api";
import { Card, StatusBadge, Button, Input, PatientCard, EmptyState, LoadingBlock } from "./Common";
import { useNavigate } from "react-router-dom";

function calculateAge(dob) {
  if (!dob) return null;
  const years = Math.floor((Date.now() - new Date(dob)) / (365.25 * 24 * 3600 * 1000));
  return years;
}

const STEP_LABELS = {
  insurance_and_eligibility: "Eligibility Check",
  preauth_ready: "Ready for Preauth",
  preauth_submitted: "Preauth Submitted",
  preauth_decided: "Preauth Decided",
  claim_submitted: "Claim Submitted",
  claim_decided: "Claim Decided",
  payment_pending: "Payment Pending",
  settled: "Settled",
};

const DECISION_CONFIG = {
  APPROVED:            { label: "Preauth Approved",    badgeClass: "badge-success" },
  PARTIALLY_APPROVED:  { label: "Partially Approved",  badgeClass: "badge-warning" },
  QUERIED:             { label: "Payer Query",          badgeClass: "badge-error"   },
  REJECTED:            { label: "Preauth Rejected",     badgeClass: "badge-error"   },
};

const STATUS_CONFIG = {
  complete: { label: "Complete",  badgeClass: "badge-success" },
  pending:  { label: "In Progress", badgeClass: "badge-warning" },
  partial:  { label: "Partial",   badgeClass: "badge-info"    },
  failed:   { label: "Failed",    badgeClass: "badge-error"   },
  draft:    { label: "Draft",     badgeClass: "badge-info"    },
};

function CaseStatusChip({ claim }) {
  if (claim.preauth_status && DECISION_CONFIG[claim.preauth_status?.toUpperCase()]) {
    const cfg = DECISION_CONFIG[claim.preauth_status.toUpperCase()];
    return <span className={`badge-modern ${cfg.badgeClass}`}>{cfg.label}</span>;
  }
  const step = claim.current_step;
  if (step && STEP_LABELS[step]) {
    const cfg = STATUS_CONFIG[claim.status] ?? STATUS_CONFIG.pending;
    return (
      <span className={`badge-modern ${cfg.badgeClass}`}>
        {STEP_LABELS[step]}
      </span>
    );
  }
  const cfg = STATUS_CONFIG[claim.status] ?? STATUS_CONFIG.pending;
  return <span className={`badge-modern ${cfg.badgeClass}`}>{cfg.label}</span>;
}

function PatientDetail({ patient, onBack }) {
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
      api.listTasks({ child_id: patient.child_id }),
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
      if (pendingTasks.length > 0) {
        navigate(`/work-queue?task_id=${pendingTasks[0].id}`);
        return;
      }

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

      let dest = "payer";

      if (claim?.payment_status === "PAYMENT_SETTLED" || claim?.payment_status === "PAYMENT_INITIATED") {
        dest = "payment";
      } else if (cDecision === "APPROVED" || cDecision === "PARTIALLY_APPROVED") {
        dest = "payment";
      } else if (claim?.correlation_id && !cDecision) {
        dest = "claim";
      } else if (pDecision === "APPROVED" || pDecision === "PARTIALLY_APPROVED") {
        dest = "claim";
      } else if (pDecision === "QUERIED" || pDecision === "REJECTED") {
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

      navigate(`/case/${patient.child_id}/${dest}`, {
        state: { cashless_case_id: fullCase.cashless_case_id },
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
                  <Phone size={13} /> {patient.mobile}
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
              patient.visits.map((visit, vi) => (
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
                      <span>{new Date(visit.started_at).toLocaleDateString()}</span>
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

                          {visit.invoices?.length > 0 && (
                            <div style={{ marginBottom: "var(--space-4)" }}>
                              <div style={{ fontSize: "12px", fontWeight: 700, marginBottom: "var(--space-2)", color: "var(--text-muted)", textTransform: "uppercase" }}>Invoices</div>
                              {visit.invoices.map((inv, ii) => (
                                <div key={ii} style={{ padding: "10px 12px", background: "var(--bg-main)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-color)", marginBottom: "var(--space-2)", fontSize: "13px" }}>
                                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "var(--space-1)" }}>
                                    <strong>{inv.invoice_no}</strong>
                                    <StatusBadge status={inv.billing_status} />
                                  </div>
                                  <div style={{ display: "flex", gap: "var(--space-5)", color: "var(--text-muted)" }}>
                                    <span>Billed: <strong style={{ color: "var(--text-main)" }}>₹{inv.amount_billed?.toLocaleString()}</strong></span>
                                    {inv.final_discount > 0 && <span>Discount: <strong style={{ color: "var(--success)" }}>-₹{inv.final_discount?.toLocaleString()}</strong></span>}
                                    <span>Final: <strong style={{ color: "var(--primary)" }}>₹{inv.final_amount?.toLocaleString()}</strong></span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}

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
                                        {claim.cashless_case_id ? `Case #${claim.cashless_case_id}` : `Claim #${claim.claim_id}`}
                                      </div>
                                      <div style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "2px" }}>
                                        {claim.payer_name} · {claim.policy_number}
                                      </div>
                                    </div>
                                    <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "center", flexShrink: 0 }}>
                                      <div style={{ textAlign: "right" }}>
                                        <div style={{ fontSize: "10px", color: "var(--text-muted)" }}>Billed</div>
                                        <div style={{ fontWeight: 700, color: "var(--primary)" }}>₹{claim.total_billed?.toLocaleString()}</div>
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
              ))
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
  const [viewMode, setViewMode] = useState(() => localStorage.getItem("registry_viewMode") || "grid");
  const [sortBy, setSortBy] = useState("newest");
  
  useEffect(() => { localStorage.setItem("registry_viewMode", viewMode); }, [viewMode]);

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

  const handleSelectPatient = useCallback(async (child) => {
    setLoadingDetail(true);
    try {
      const res = await api.searchChildren({ child_id: child.child_id });
      const full = res?.children?.[0] || child;
      setSelectedPatient(full);
    } catch (_) {
      setSelectedPatient(child);
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  useEffect(() => {
    loadChildren("", 1);
  }, [loadChildren]);

  const handleSearch = () => {
    setHasSearched(true);
    setPage(1);
    loadChildren(searchQuery, 1);
  };

  const handlePageChange = (newPage) => {
    setPage(newPage);
    loadChildren(searchQuery, newPage);
  };

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);
  const startItem = totalCount === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const endItem = Math.min(page * PAGE_SIZE, totalCount);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-5)" }}>
      {loadError && (
        <div className="inline-error-banner">
          <AlertCircle size={16} />
          Could not load patients. Showing the last known results, if any.
        </div>
      )}

      <div style={{ display: "flex", gap: "var(--space-3)", maxWidth: "560px" }}>
        <div style={{ flex: 1 }}>
          <Input
            icon={Search}
            placeholder="Search by name, ID or mobile…"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              if (!e.target.value.trim()) {
                setHasSearched(false);
                setPage(1);
                loadChildren("", 1);
              }
            }}
            onKeyDown={(e) => { if (e.key === "Enter") handleSearch(); }}
          />
        </div>
        
        <select
          className="input-modern"
          style={{ width: "auto", minWidth: "140px" }}
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
        >
          <option value="newest">Newest First</option>
          <option value="oldest">Oldest First</option>
        </select>
        
        <div style={{ display: "flex", background: "var(--bg-card)", border: "1px solid var(--border-color)", borderRadius: "var(--radius-md)", padding: "var(--space-1)", gap: "var(--space-1)" }}>
          <button
            title="Grid View"
            onClick={() => setViewMode("grid")}
            style={{ padding: "6px 12px", background: viewMode === "grid" ? "var(--bg-main)" : "transparent", color: viewMode === "grid" ? "var(--text-main)" : "var(--text-muted)", border: viewMode === "grid" ? "1px solid var(--border-color)" : "1px solid transparent", borderRadius: "var(--radius-sm)", cursor: "pointer", display: "flex", alignItems: "center", boxShadow: viewMode === "grid" ? "0 1px 3px rgba(0,0,0,0.05)" : "none", transition: "all 0.2s ease" }}
          >
            <LayoutGrid size={16} />
          </button>
          <button
            title="Table View"
            onClick={() => setViewMode("list")}
            style={{ padding: "6px 12px", background: viewMode === "list" ? "var(--bg-main)" : "transparent", color: viewMode === "list" ? "var(--text-main)" : "var(--text-muted)", border: viewMode === "list" ? "1px solid var(--border-color)" : "1px solid transparent", borderRadius: "var(--radius-sm)", cursor: "pointer", display: "flex", alignItems: "center", boxShadow: viewMode === "list" ? "0 1px 3px rgba(0,0,0,0.05)" : "none", transition: "all 0.2s ease" }}
          >
            <List size={16} />
          </button>
        </div>
        {selectedPatient && (
          <Button variant="outline" icon={ArrowLeft} onClick={() => setSelectedPatient(null)}>
            All Patients
          </Button>
        )}
      </div>

      {selectedPatient ? (
        <PatientDetail patient={selectedPatient} onBack={() => setSelectedPatient(null)} />
      ) : (
        <div>
          {loading || loadingDetail ? (
            <LoadingBlock text={loadingDetail ? "Loading patient details…" : "Loading patients…"} />
          ) : children.length === 0 ? (
            <EmptyState
              icon={User}
              title={hasSearched ? "No patients found" : "Search for a patient"}
              description={
                hasSearched
                  ? "Try a different name or ID number."
                  : "Enter a patient name or ID number above and click Search."
              }
            />
          ) : (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--space-3)" }}>
                <span style={{ fontSize: "13px", color: "var(--text-muted)", fontWeight: 600 }}>
                  Showing {startItem}–{endItem} of {totalCount} patient{totalCount !== 1 ? "s" : ""}
                </span>
                {totalPages > 1 && (
                  <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                    <button
                      onClick={() => handlePageChange(page - 1)}
                      disabled={page === 1}
                      style={{
                        display: "flex", alignItems: "center", gap: "var(--space-1)",
                        padding: "6px 12px", borderRadius: "var(--radius-sm)", fontSize: "13px", fontWeight: 600,
                        border: "1.5px solid var(--border-color)", background: "var(--bg-card)",
                        color: page === 1 ? "var(--text-muted)" : "var(--text-main)",
                        cursor: page === 1 ? "not-allowed" : "pointer", opacity: page === 1 ? 0.5 : 1,
                      }}
                    >
                      <ChevronLeft size={15} /> Prev
                    </button>
                    <span style={{ fontSize: "13px", color: "var(--text-muted)", minWidth: "80px", textAlign: "center" }}>
                      Page {page} of {totalPages}
                    </span>
                    <button
                      onClick={() => handlePageChange(page + 1)}
                      disabled={page === totalPages}
                      style={{
                        display: "flex", alignItems: "center", gap: "var(--space-1)",
                        padding: "6px 12px", borderRadius: "var(--radius-sm)", fontSize: "13px", fontWeight: 600,
                        border: "1.5px solid var(--border-color)", background: "var(--bg-card)",
                        color: page === totalPages ? "var(--text-muted)" : "var(--text-main)",
                        cursor: page === totalPages ? "not-allowed" : "pointer", opacity: page === totalPages ? 0.5 : 1,
                      }}
                    >
                      Next <ChevronRight size={15} />
                    </button>
                  </div>
                )}
              </div>
              {viewMode === "grid" ? (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 340px), 1fr))", gap: "10px" }}>
                  {[...children].sort((a,b) => sortBy === "oldest" ? Date.parse(a.created_at) - Date.parse(b.created_at) : Date.parse(b.created_at) - Date.parse(a.created_at)).map((child) => (
                    <PatientCard
                      key={child.child_id}
                      patient={child}
                      age={calculateAge(child.dob)}
                      isSelected={selectedPatient?.child_id === child.child_id}
                      onClick={() => handleSelectPatient(child)}
                      statusSlot={child.latest_claim && (
                        <>
                          <CaseStatusChip claim={child.latest_claim} />
                          {(child.latest_claim.payer_name || child.latest_claim.payer_id) && (
                            <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>{child.latest_claim.payer_name || child.latest_claim.payer_id}</span>
                          )}
                        </>
                      )}
                    />
                  ))}
                </div>
              ) : (
                <Card style={{ padding: 0, overflow: "hidden" }}>
                  <div className="table-responsive-wrapper">
                    <table className="table-modern">
                      <thead>
                        <tr>
                          <th>Patient Name</th>
                          <th>ID</th>
                          <th>Gender</th>
                          <th>Age</th>
                          <th>Mobile</th>
                          <th>Latest Case</th>
                          <th>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...children].sort((a,b) => sortBy === "oldest" ? Date.parse(a.created_at) - Date.parse(b.created_at) : Date.parse(b.created_at) - Date.parse(a.created_at)).map((child) => {
                          const age = calculateAge(child.dob);
                          return (
                            <tr key={child.child_id} onClick={() => handleSelectPatient(child)} style={{ cursor: "pointer" }}>
                              <td style={{ fontWeight: 700 }}>{child.name}</td>
                              <td className="mono-cell" style={{ fontSize: "12px", color: "var(--text-muted)" }}>#{child.child_id}</td>
                              <td style={{ textTransform: "capitalize" }}>{child.gender}</td>
                              <td>{age !== null ? `${age} yrs` : "-"}</td>
                              <td>{child.mobile || "-"}</td>
                              <td>
                                {child.latest_claim ? (
                                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                    <CaseStatusChip claim={child.latest_claim} />
                                    {(child.latest_claim.payer_name || child.latest_claim.payer_id) && (
                                      <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>{child.latest_claim.payer_name || child.latest_claim.payer_id}</span>
                                    )}
                                  </div>
                                ) : (
                                  <span style={{ color: "var(--text-muted)", fontSize: "12px" }}>No Cases</span>
                                )}
                              </td>
                              <td>
                                <Button variant="outline" size="small" onClick={(e) => { e.stopPropagation(); handleSelectPatient(child); }}>
                                  View
                                </Button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </Card>
              )}
              {totalPages > 1 && (
                <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: "var(--space-2)", marginTop: "var(--space-5)" }}>
                  <button
                    onClick={() => handlePageChange(page - 1)}
                    disabled={page === 1}
                    style={{
                      display: "flex", alignItems: "center", gap: "var(--space-1)",
                      padding: "6px 12px", borderRadius: "var(--radius-sm)", fontSize: "13px", fontWeight: 600,
                      border: "1.5px solid var(--border-color)", background: "var(--bg-card)",
                      color: page === 1 ? "var(--text-muted)" : "var(--text-main)",
                      cursor: page === 1 ? "not-allowed" : "pointer", opacity: page === 1 ? 0.5 : 1,
                    }}
                  >
                    <ChevronLeft size={15} /> Prev
                  </button>
                  <span style={{ fontSize: "13px", color: "var(--text-muted)", minWidth: "80px", textAlign: "center" }}>
                    Page {page} of {totalPages}
                  </span>
                  <button
                    onClick={() => handlePageChange(page + 1)}
                    disabled={page === totalPages}
                    style={{
                      display: "flex", alignItems: "center", gap: "var(--space-1)",
                      padding: "6px 12px", borderRadius: "var(--radius-sm)", fontSize: "13px", fontWeight: 600,
                      border: "1.5px solid var(--border-color)", background: "var(--bg-card)",
                      color: page === totalPages ? "var(--text-muted)" : "var(--text-main)",
                      cursor: page === totalPages ? "not-allowed" : "pointer", opacity: page === totalPages ? 0.5 : 1,
                    }}
                  >
                    Next <ChevronRight size={15} />
                  </button>
                </div>
              )}
            </motion.div>
          )}
        </div>
      )}
    </div>
  );
}
