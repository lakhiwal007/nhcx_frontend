import { useState, useEffect, useCallback } from "react";
import { User, Plus, ArrowLeft, AlertCircle } from "lucide-react";
import { api } from "../api";
import { Button, EmptyState, LoadingBlock, SkeletonTable, TablePagination, formatMoney } from "./Common";
import { Section, Fields } from "./case/CaseFile";
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

  const statusTone = (claim) => {
    const cls = resolveCaseStatus(claim).badgeClass;
    return cls === "badge-success" ? "ok" : cls === "badge-error" ? "bad" : cls === "badge-warning" ? "warn" : "info";
  };

  const latest = patient.latest_claim;
  const visits = patient.visits || [];
  // A visit's claim row has no journey step, so the latest-case summary wins for that case's status.
  const visitCases = visits.flatMap((v) =>
    (v.claims || []).map((c) => ({
      ...c,
      ...(latest && c.cashless_case_id === latest.cashless_case_id ? latest : {}),
      admission_no: v.admission_no,
    })),
  );
  const cases = visitCases.length ? visitCases : latest ? [latest] : [];
  const caseCount = Math.max(patient.cashless_cases_count || 0, cases.length);
  const gender = patient.gender && patient.gender[0].toUpperCase() + patient.gender.slice(1);
  const openCase = (c) => resumeCase(c.cashless_case_id ? c : null);

  return (
    <div className="pd-screen ep-screen pt-screen">
      <div className="wq-header">
        <div>
          <h1 className="wq-title">{patient.name}</h1>
        </div>
      </div>

      <div className="pd-layout">
        <div className="pd-main">
          <Section id="pt-patient" title="Patient">
            <div className="ep-pad">
              <Fields
                cols={3}
                rows={[
                  { label: "Child ID", value: `#${patient.child_id}`, mono: true },
                  { label: "Gender", value: gender },
                  { label: "Date of birth", value: patient.dob && formatDate(patient.dob), sub: age !== null ? `${age} yrs` : null },
                  { label: "Mobile", value: patient.mobile && formatPhone(patient.mobile), mono: true },
                  { label: "ABHA", value: patient.abha_number || "Not linked", mono: !!patient.abha_number, tone: patient.abha_number ? null : "warn" },
                  { label: "Registered", value: patient.created_at && formatDate(patient.created_at) },
                ]}
              />
            </div>
          </Section>

          <Section id="pt-cases" title="Cashless cases" meta={`${caseCount} on record`}>
            {cases.length === 0 ? (
              <p className="ds-empty">No cashless case has been started for this patient.</p>
            ) : (
              <div className="ep-table-wrap">
                <table className="ep-table">
                  <thead>
                    <tr>
                      <th>Case</th>
                      <th>Payer · Policy</th>
                      <th>Status</th>
                      <th className="ep-num">Billed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cases.map((c, i) => (
                      <tr
                        key={c.cashless_case_id ?? c.claim_id ?? i}
                        className="pt-row"
                        tabIndex={0}
                        title="Open case"
                        onClick={() => openCase(c)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") openCase(c);
                        }}
                      >
                        <td>
                          <div className="ep-mono ep-strong">
                            {c.cashless_case_id ? formatCaseRef(c.cashless_case_id) : `Claim #${c.claim_id}`}
                          </div>
                          {c.admission_no && <div className="ep-muted">{c.admission_no}</div>}
                        </td>
                        <td>
                          <div>{c.payer_name || c.payer_id || "—"}</div>
                          {c.policy_number && <div className="ep-muted ep-mono">{c.policy_number}</div>}
                        </td>
                        <td>
                          <span className={`ds-verdict is-${statusTone(c)} pt-status`}>
                            <span className="ep-dot" aria-hidden="true" />
                            {resolveCaseStatus(c).label}
                          </span>
                          {(c.claim_decision || c.payment_status) && (
                            <div className="ep-muted ep-cap">
                              {[
                                c.claim_decision && `Claim ${c.claim_decision.replace(/_/g, " ").toLowerCase()}`,
                                c.payment_status && `Payment ${c.payment_status.replace(/_/g, " ").toLowerCase()}`,
                              ]
                                .filter(Boolean)
                                .join(" · ")}
                            </div>
                          )}
                        </td>
                        <td className="ep-num ep-mono">{c.total_billed != null ? formatMoney(c.total_billed) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {cases.length < caseCount && (
                  <p className="ds-empty pt-note">Only the latest case is listed here. Older cases are in Cashless Cases.</p>
                )}
              </div>
            )}
          </Section>

          {visits.length === 0 ? (
            <Section id="pt-visits" title="Visits">
              <p className="ds-empty">No visits on record.</p>
            </Section>
          ) : (
            visits.map((visit, vi) => {
              const invoices = visit.invoices || [];
              const lines = invoices.flatMap((inv) =>
                (inv.line_items || []).map((li) => ({ ...li, invoice_no: inv.invoice_no })),
              );
              const paid = [
                ...(visit.advance_payments || []).map((p) => ({ ...p, kind: "Advance" })),
                ...(visit.payments || []).map((p) => ({ ...p, kind: "Collected" })),
              ];
              const paidTotal = paid.reduce((s, p) => s + (Number(p.amount) || 0), 0);
              const doctorSub = [
                visit.primary_doctor?.specialization,
                visit.primary_doctor?.registration_no && `Reg ${visit.primary_doctor.registration_no}`,
              ]
                .filter(Boolean)
                .join(" · ");
              return (
                <Section
                  key={visit.admission_id ?? vi}
                  id={`pt-visit-${vi}`}
                  title={`${visit.admission_no || `Visit ${vi + 1}`} · ${(visit.visit_type || "visit").toUpperCase()}`}
                  meta={
                    <Button variant="outline" size="small" icon={Plus} onClick={() => startWorkflow(visit)}>
                      Start case for this visit
                    </Button>
                  }
                >
                  <div className="ep-pad">
                    <Fields
                      cols={3}
                      rows={[
                        { label: "Started", value: visit.started_at && formatDate(visit.started_at) },
                        { label: "Status", value: visit.status && visit.status[0].toUpperCase() + visit.status.slice(1).replace(/_/g, " ") },
                        { label: "Reason", value: visit.reason },
                        { label: "Diagnosis", value: visit.diagnosis },
                        { label: "Primary doctor", value: visit.primary_doctor?.name, sub: doctorSub || null },
                      ]}
                    />
                  </div>

                  {visit.procedures?.length > 0 && (
                    <div className="ep-table-wrap">
                      <table className="ep-table">
                        <thead>
                          <tr>
                            <th>Procedure code</th>
                            <th>Procedure</th>
                          </tr>
                        </thead>
                        <tbody>
                          {visit.procedures.map((p, pi) => (
                            <tr key={pi}>
                              <td className="ep-mono">{p.code || "—"}</td>
                              <td>{p.name}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {invoices.length > 0 && (
                    <div className="ep-table-wrap">
                      <table className="ep-table">
                        <thead>
                          <tr>
                            <th>Invoice</th>
                            <th>Date</th>
                            <th>Billing</th>
                            <th className="ep-num">Billed</th>
                            <th className="ep-num">Discount</th>
                            <th className="ep-num">Final</th>
                          </tr>
                        </thead>
                        <tbody>
                          {invoices.map((inv, ii) => (
                            <tr key={inv.invoice_id ?? ii}>
                              <td className="ep-mono">{inv.invoice_no || "—"}</td>
                              <td>{inv.invoice_date ? formatDate(inv.invoice_date) : "—"}</td>
                              <td className="ep-cap">{inv.billing_status?.replace(/_/g, " ") || "—"}</td>
                              <td className="ep-num ep-mono">{formatMoney(inv.amount_billed)}</td>
                              <td className="ep-num ep-mono">{inv.final_discount ? formatMoney(inv.final_discount) : "—"}</td>
                              <td className="ep-num ep-mono ep-strong">{formatMoney(inv.final_amount ?? inv.amount_billed)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {lines.length > 0 && (
                    <div className="ep-table-wrap">
                      <table className="ep-table">
                        <thead>
                          <tr>
                            <th>Code</th>
                            <th>Bill item</th>
                            <th>Category</th>
                            <th className="ep-num">Qty</th>
                            <th className="ep-num">Unit price</th>
                            <th className="ep-num">Net</th>
                          </tr>
                        </thead>
                        <tbody>
                          {lines.map((li, n) => (
                            <tr key={li.line_item_id ?? n}>
                              <td className="ep-mono">{li.code || "—"}</td>
                              <td>
                                {li.name}
                                {invoices.length > 1 && <div className="ep-muted">{li.invoice_no}</div>}
                              </td>
                              <td className="ep-cap">{li.category || "—"}</td>
                              <td className="ep-num ep-mono">{li.quantity ?? "—"}</td>
                              <td className="ep-num ep-mono">{li.unit_price != null ? formatMoney(li.unit_price) : "—"}</td>
                              <td className="ep-num ep-mono">{li.net_amount != null ? formatMoney(li.net_amount) : "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {paid.length > 0 && (
                    <div className="ep-table-wrap">
                      <table className="ep-table">
                        <thead>
                          <tr>
                            <th>Patient payment</th>
                            <th>Mode</th>
                            <th>Date</th>
                            <th className="ep-num">Amount</th>
                          </tr>
                        </thead>
                        <tbody>
                          {paid.map((p, pi) => (
                            <tr key={pi}>
                              <td>{p.kind}</td>
                              <td className="ep-cap">{p.mode || "—"}</td>
                              <td>{p.date ? formatDate(p.date) : "—"}</td>
                              <td className="ep-num ep-mono">{formatMoney(p.amount)}</td>
                            </tr>
                          ))}
                          {paid.length > 1 && (
                            <tr className="pd-total-row">
                              <td colSpan={3}>Total collected</td>
                              <td className="ep-num ep-mono">{formatMoney(paidTotal)}</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {invoices.length === 0 && paid.length === 0 && <p className="ds-empty">No billing on this visit yet.</p>}
                </Section>
              );
            })
          )}

          <Section id="pt-tasks" title="Pending tasks" meta={loadingExtra ? null : String(tasks.length)}>
            {loadingExtra ? (
              <p className="ds-empty">Loading…</p>
            ) : tasks.length === 0 ? (
              <p className="ds-empty">No pending tasks.</p>
            ) : (
              <div className="ep-table-wrap">
                <table className="ep-table">
                  <thead>
                    <tr>
                      <th>Task</th>
                      <th>Workflow</th>
                      <th>Priority</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tasks.map((task, ti) => (
                      <tr key={task.id ?? task.task_id ?? ti}>
                        <td>{task.title}</td>
                        <td className="ep-cap">{task.workflow?.replace(/_/g, " ") || "—"}</td>
                        <td className={`ep-cap${task.priority === "urgent" || task.priority === "high" ? " is-bad" : ""}`}>
                          {task.priority || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          <Section id="pt-comms" title="Payer communications" meta={loadingExtra ? null : String(communications.length)}>
            {loadingExtra ? (
              <p className="ds-empty">Loading…</p>
            ) : communications.length === 0 ? (
              <p className="ds-empty">No communications.</p>
            ) : (
              <div className="ep-table-wrap">
                <table className="ep-table">
                  <thead>
                    <tr>
                      <th>Topic</th>
                      <th>From</th>
                      <th>Priority</th>
                    </tr>
                  </thead>
                  <tbody>
                    {communications.map((comm, ci) => (
                      <tr key={comm.correlation_id ?? ci}>
                        <td>{comm.topic_display || <span className="ep-muted">No subject</span>}</td>
                        <td className="ep-mono">{comm.payer_id || "—"}</td>
                        <td className={`ep-cap${comm.priority === "urgent" || comm.priority === "stat" ? " is-bad" : ""}`}>
                          {comm.priority || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>
        </div>

        <aside className="pd-side">
          <section className="ep-section pd-request">
            <header className="ep-section-head">
              <h3 className="ep-section-title">Cashless</h3>
            </header>
            {latest ? (
              <>
                <div className={`ds-verdict is-${statusTone(latest)}`}>
                  <span className="ep-dot" aria-hidden="true" />
                  <span className="ds-verdict-label">{resolveCaseStatus(latest).label}</span>
                </div>
                <div className="ds-ref">
                  <span className="ep-muted">Latest case</span>
                  <span className="ep-mono">{formatCaseRef(latest.cashless_case_id)}</span>
                </div>
                <div className="ds-ref">
                  <span className="ep-muted">Payer</span>
                  <span className="ep-mono">{latest.payer_name || latest.payer_id || "—"}</span>
                </div>
              </>
            ) : (
              <p className="ds-empty">No case yet.</p>
            )}
            {totalBilled > 0 && (
              <div className="pd-amount">
                <div className="ep-muted">Billed across visits</div>
                <div className="pd-amount-value ep-mono">{formatMoney(totalBilled)}</div>
              </div>
            )}
            <div className="pd-submit">
              {latest ? (
                <>
                  <Button variant="primary" onClick={() => resumeCase(latest)} className="pd-submit-btn">
                    Resume {formatCaseRef(latest.cashless_case_id)}
                  </Button>
                  <button type="button" className="pd-text-btn" onClick={() => startWorkflow(visits[0])}>
                    <Plus size={13} /> Start a new cashless case
                  </button>
                </>
              ) : (
                <Button variant="primary" icon={Plus} onClick={() => startWorkflow(visits[0])} className="pd-submit-btn">
                  Start cashless case
                </Button>
              )}
            </div>
          </section>
        </aside>
      </div>
    </div>
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
