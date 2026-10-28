import { useState, useEffect, useCallback, useRef } from "react";
import { User, Plus, ArrowLeft, ArrowRight, AlertCircle, ChevronRight, Paperclip } from "lucide-react";
import { api } from "../api";
import { Button, EmptyState, LoadingBlock, SkeletonTable, TablePagination, formatMoney, InfoTip, Tip } from "./Common";
import { formatDate, formatPhone, formatCaseRef, formatRelative, humanize, priorityLabel, safeHref, photoSrc } from "../format.js";
import { taskStep, taskScreen, taskNavState } from "../taskRoutes";
import { isSettled, needsAttention } from "../caseStatus.js";
import { routeAtOrAfter } from "../workflowStorage";
import { useNavigate, useSearchParams } from "react-router-dom";
import PayerName from "./PayerName";
import Dropdown from "./Dropdown";
import { CaseStatusChip, StageTrack } from "./caseJourney";
import CommunicationDetailDrawer, { commHeadline, commPreview } from "./CommunicationDetail";

function calculateAge(dob) {
  if (!dob) return null;
  const years = Math.floor((Date.now() - new Date(dob)) / (365.25 * 24 * 3600 * 1000));
  return years;
}

const capitalize = (v) => (v ? v[0].toUpperCase() + v.slice(1) : null);

function Avatar({ patient, large = false }) {
  const [broken, setBroken] = useState(false);
  const cls = `pt-avatar${large ? " is-lg" : ""}`;
  if (photoSrc(patient.profile_photo) && !broken) {
    return <img className={cls} src={photoSrc(patient.profile_photo)} alt="" onError={() => setBroken(true)} />;
  }
  return (
    <span className={cls} aria-hidden="true">
      {patient.name?.trim()?.[0]?.toUpperCase() || "?"}
    </span>
  );
}

// HIS billing_status: 0 billed and unpaid, 1 paid, 2 refunded or cancelled, null draft.
const BILLING_STATUS = { 0: "Unpaid", 1: "Paid", 2: "Refunded" };
const billingLabel = (v) => (v == null || v === "" ? "Draft" : BILLING_STATUS[v] ?? humanize(String(v)));

const sum = (list, pick) => list.reduce((s, x) => s + (Number(pick(x)) || 0), 0);

// Latest admission still in the bed, else the latest one.
function currentAdmission(visits) {
  return visits.find((v) => !v.ended_at) || visits[0] || null;
}

function isOpenCase(c) {
  return !!c && !isSettled(c) && !/CANCELLED/i.test(c.preauth_status || "") && c.status !== "superseded";
}

function admissionMoney(visit) {
  const invoices = visit.invoices || [];
  const paid = [
    ...(visit.advance_payments || []).map((p) => ({
      kind: p.payment_type || "Advance",
      mode: p.payment_mode,
      ref: null,
      date: p.date,
      amount: p.amount,
      advance: true,
    })),
    ...(visit.payments || []).map((p) => ({
      kind: "Collected",
      mode: p.payment_mode,
      ref: p.online_txn_id,
      date: p.collected_at,
      amount: p.amount,
    })),
  ];
  const billed = sum(invoices, (i) => i.amount_billed);
  const discount = sum(invoices, (i) => i.final_discount);
  const finalBill = sum(invoices, (i) => i.final_amount ?? i.amount_billed);
  const settled = sum(paid, (p) => p.amount);
  return { invoices, paid, billed, discount, finalBill, outstanding: finalBill - settled };
}

const daysBetween = (from, to) => {
  if (!from) return null;
  const ms = new Date(to || Date.now()) - new Date(from);
  return Number.isFinite(ms) ? Math.max(0, Math.round(ms / 86400000)) : null;
};

const money = (v) => (v == null ? "—" : v < 0 ? `− ${formatMoney(-v)}` : formatMoney(v));

// A ledger row that opens a detail row under it; one open per table.
function ExpandRow({ open, onToggle, cols, label, children, detail }) {
  return (
    <>
      <tr
        className={`pt-row${open ? " is-on" : ""}`}
        tabIndex={0}
        aria-expanded={open}
        title={open ? `Hide ${label}` : `Show ${label}`}
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggle();
          }
        }}
      >
        <td className="pt-chev-col">
          <ChevronRight size={13} className={`pt-chev${open ? " is-open" : ""}`} aria-hidden="true" />
        </td>
        {children}
      </tr>
      {open && (
        <tr className="pt-expand">
          <td colSpan={cols}>{detail}</td>
        </tr>
      )}
    </>
  );
}

function MoneyCard({ title = "Money", rows }) {
  return (
    <div className="pt-card pt-inner">
      <div className="pt-inner-head">{title}</div>
      <table className="pt-mini">
        <thead>
          <tr>
            <th>Entry</th>
            <th className="pt-num">Amount</th>
          </tr>
        </thead>
        <tbody>
          {rows.filter(Boolean).map((r, i) => (
            <tr key={`${r.label}-${i}`} className={r.total ? "pt-total" : undefined}>
              <td>
                {r.label}
                {r.sub && <div className="pt-sub">{r.sub}</div>}
              </td>
              <td className={`pt-num mono${r.total && r.tone ? ` pt-${r.tone}` : ""}`}>{money(r.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AdmissionDetail({ visit, onStartCase, canStart }) {
  const { invoices, paid, billed, discount, outstanding } = admissionMoney(visit);
  const lines = invoices.flatMap((inv) => (inv.line_items || []).map((li) => ({ ...li, invoice_no: inv.invoice_no })));
  const sponsors = [...new Set(invoices.map((i) => i.sponsor).filter(Boolean))];
  const procedures = visit.procedures || [];
  const billHeads = invoices.map((inv) => [inv.invoice_no, billingLabel(inv.billing_status), inv.payment_mode].filter(Boolean).join(" · "));

  return (
    <>
      <div className="pt-detail-facts">
        {visit.reason && (
          <span>
            <span className="pt-k">Reason</span>
            {visit.reason}
          </span>
        )}
        {procedures.length > 0 && (
          <span>
            <span className="pt-k">Procedure{procedures.length > 1 ? "s" : ""}</span>
            {procedures.map((p, i) => (
              <span key={i}>
                {i > 0 && ", "}
                {p.code && <span className="mono">{p.code} </span>}
                {p.name}
              </span>
            ))}
          </span>
        )}
        {sponsors.length > 0 && (
          <span>
            <span className="pt-k">Sponsor tag</span>
            {sponsors.join(", ")}
          </span>
        )}
        {canStart && (
          <span className="pt-detail-action">
            <Button variant="outline" size="small" icon={Plus} onClick={() => onStartCase(visit)}>
              Start case for this admission
            </Button>
          </span>
        )}
      </div>

      {invoices.length === 0 ? (
        <p className="pt-empty">No billing on this admission yet.</p>
      ) : (
        <div className="pt-detail-grid">
          <div className="pt-card pt-inner">
            <div className="pt-inner-head">
              <span>Bill</span>
              <span className="pt-sub">{billHeads.join("  |  ")}</span>
            </div>
            <table className="pt-mini">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Item</th>
                  <th>Category</th>
                  <th className="pt-num">Qty</th>
                  <th className="pt-num">Rate</th>
                  <th className="pt-num">Net</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((li, n) => (
                  <tr key={li.line_item_id ?? n}>
                    <td className="mono">{li.code || "—"}</td>
                    <td>
                      {li.name}
                      {invoices.length > 1 && li.invoice_no && <div className="pt-sub">{li.invoice_no}</div>}
                    </td>
                    <td className="ep-cap">{li.category || "—"}</td>
                    <td className="pt-num mono">{li.quantity ?? "—"}</td>
                    <td className="pt-num mono">{li.unit_price != null ? formatMoney(li.unit_price) : "—"}</td>
                    <td className="pt-num mono">{li.net_amount != null ? formatMoney(li.net_amount) : "—"}</td>
                  </tr>
                ))}
                <tr className="pt-total">
                  <td />
                  <td colSpan={4}>Billed</td>
                  <td className="pt-num mono">{formatMoney(billed)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <MoneyCard
            rows={[
              { label: "Billed", value: billed },
              discount > 0 && { label: "Discount", value: -discount },
              ...paid.map((p) => ({
                label: p.kind,
                sub: [p.mode, p.ref, p.date && formatDate(p.date)].filter(Boolean).join(" · ") || null,
                value: -(Number(p.amount) || 0),
              })),
              { label: "To collect", value: outstanding, total: true, tone: outstanding > 0 ? "warn" : null },
            ]}
          />
        </div>
      )}
    </>
  );
}

const amountOf = (totals) => totals?.benefit?.value ?? totals?.eligible?.value ?? null;
const decisionLabel = (v) => (v ? humanize(String(v).toLowerCase()) : null);

function CaseDetail({ summary, tasks, onOpenCase, onOpenTask }) {
  const [state, setState] = useState(() => ({ loading: !!summary.cashless_case_id, full: null }));
  useEffect(() => {
    if (!summary.cashless_case_id) return undefined;
    let live = true;
    api
      .getCashlessStatus(summary.cashless_case_id)
      .then((full) => live && setState({ loading: false, full }))
      .catch(() => live && setState({ loading: false, full: null }));
    return () => {
      live = false;
    };
  }, [summary.cashless_case_id]);

  if (state.loading) return <p className="pt-empty">Loading the case…</p>;

  const full = state.full;
  const preauth = full?.preauth;
  const claim = full?.claim;
  const payment = full?.payment;
  const caseTasks = full?.pending_tasks?.length ? full.pending_tasks : tasks;

  return (
    <>
      <div className="pt-detail-facts">
        <span>
          <span className="pt-k">Pre-auth</span>
          {decisionLabel(preauth?.decision) || decisionLabel(summary.preauth_status) || "Not sent"}
          {preauth?.preauth_ref && <span className="mono"> · {preauth.preauth_ref}</span>}
        </span>
        <span>
          <span className="pt-k">Claim</span>
          {decisionLabel(claim?.decision) || (claim ? "With the payer" : "Not sent")}
        </span>
        <span>
          <span className="pt-k">Payment</span>
          {payment?.settled ? "Settled" : payment?.latest_stage ? humanize(payment.latest_stage) : "None yet"}
          {payment?.utr && <span className="mono"> · UTR {payment.utr}</span>}
        </span>
        <span className="pt-detail-action">
          <Button variant="outline" size="small" icon={ArrowRight} onClick={onOpenCase}>
            Open case
          </Button>
        </span>
      </div>
      <div className="pt-detail-grid">
        <div className="pt-card pt-inner">
          <div className="pt-inner-head">Pending tasks</div>
          {caseTasks.length === 0 ? (
            <p className="pt-empty" style={{ padding: "4px 14px 10px" }}>Nothing is waiting on this case.</p>
          ) : (
            <table className="pt-mini">
              <thead>
                <tr>
                  <th>Task</th>
                  <th>Raised</th>
                  <th className="pt-num">
                    <span className="sr-only">Action</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {caseTasks.map((t, ti) => (
                  <tr key={t.id ?? t.task_id ?? ti}>
                    <td>
                      <div className="pt-strong">{t.title || humanize(t.task_type)}</div>
                      {(t.priority === "urgent" || t.priority === "high") && <div className="pt-sub pt-bad">{priorityLabel(t.priority)}</div>}
                    </td>
                    <td>{formatRelative(t.created_at)}</td>
                    <td className="pt-num">
                      <button type="button" className="cc-act" onClick={() => onOpenTask(t)}>
                        Do this
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <MoneyCard
          rows={[
            { label: "Billed", value: summary.total_billed ?? preauth?.totals?.submitted?.value ?? null },
            preauth && { label: "Pre-auth approved", value: amountOf(preauth.totals) },
            claim && { label: "Claim approved", value: amountOf(claim.totals) },
            { label: "Paid by the payer", value: payment?.net ?? null, total: true },
          ]}
        />
      </div>
    </>
  );
}

function MessageDetail({ comm, onOpen }) {
  const texts = (comm.payload || []).filter((p) => p.content_string);
  const files = (comm.payload || []).filter((p) => safeHref(p.content_attachment));
  return (
    <>
      {texts.length ? (
        texts.map((p, i) => (
          <p key={i} className="pt-message">
            {p.content_string}
          </p>
        ))
      ) : (
        <p className="pt-empty">{commPreview(comm) || "The payer sent no text with this message."}</p>
      )}
      <div className="pt-actions">
        {files.map((p, i) => (
          <a key={i} className="cc-act pt-link" href={safeHref(p.content_attachment)} target="_blank" rel="noreferrer">
            <Paperclip size={12} /> Attachment{files.length > 1 ? ` ${i + 1}` : ""}
          </a>
        ))}
        <button type="button" className="cc-act" onClick={onOpen}>
          {comm.kind === "query" || !comm.kind ? "Reply / open" : "Open"}
        </button>
      </div>
    </>
  );
}

function PatientDetail({ patient }) {
  const navigate = useNavigate();
  const [tasks, setTasks] = useState([]);
  const [communications, setCommunications] = useState([]);
  const [loadingExtra, setLoadingExtra] = useState(false);
  const [drawerComm, setDrawerComm] = useState(null);
  const [tab, setTab] = useState("admissions");
  const [openAdmission, setOpenAdmission] = useState(null);
  const [openCaseKey, setOpenCaseKey] = useState(null);
  const [openCommId, setOpenCommId] = useState(null);

  const age = calculateAge(patient.dob);
  const visits = [...(patient.visits || [])].sort((a, b) => String(b.started_at || "").localeCompare(String(a.started_at || "")));
  const current = currentAdmission(visits);

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
  const openTask = (task) => {
    const path = taskScreen(task.task_type, patient.child_id) || `/case/${patient.child_id}/`;
    navigate(path, { state: taskNavState(task) });
  };

  const latest = patient.latest_claim;
  // A visit's claim row has no journey step, so the latest-case summary wins for that case's status.
  const visitCases = visits.flatMap((v) =>
    (v.claims || []).map((c) => ({
      ...c,
      ...(latest && c.cashless_case_id === latest.cashless_case_id ? latest : {}),
      admission_no: v.admission_no,
    })),
  );
  const cases = (visitCases.length ? visitCases : latest ? [latest] : []).sort((a, b) =>
    String(b.created_at || "").localeCompare(String(a.created_at || "")),
  );
  const caseCount = Math.max(patient.cashless_cases_count || 0, cases.length);
  const latestOpen = isOpenCase(latest);
  const sameCase = (t, c) => c.cashless_case_id != null && String(t.cashless_case_id) === String(c.cashless_case_id);
  const tasksFor = (c) => tasks.filter((t) => sameCase(t, c));
  const looseTasks = tasks.filter((t) => !cases.some((c) => sameCase(t, c)));
  const casesForVisit = (v) => (v.claims || []).map((c) => c.cashless_case_id).filter(Boolean);
  const unread = communications.filter((c) => !c.provider_read).length;
  const sortedComms = [...communications].sort((a, b) =>
    String(b.received_at || b.sent_at || "").localeCompare(String(a.received_at || a.sent_at || "")),
  );

  const toggleComm = (comm) => {
    const next = openCommId === comm.correlation_id ? null : comm.correlation_id;
    setOpenCommId(next);
    if (next && !comm.provider_read) {
      api
        .markCommunicationRead(comm.correlation_id)
        .then(() => setCommunications((prev) => prev.map((c) => (c.correlation_id === comm.correlation_id ? { ...c, provider_read: true } : c))))
        .catch(() => {});
    }
  };

  const stay = current
    ? current.ended_at
      ? `Discharged ${formatDate(current.ended_at)}`
      : `In hospital · ${current.admission_no || "admitted"}`
    : "No admission";

  const TABS = [
    { key: "admissions", label: "Admissions", count: visits.length },
    { key: "cases", label: "Cashless cases", count: caseCount, alert: tasks.length ? `${tasks.length} task${tasks.length === 1 ? "" : "s"}` : null },
    { key: "messages", label: "Payer messages", count: loadingExtra ? "–" : communications.length, alert: unread ? `${unread} unread` : null },
  ];

  return (
    <div className="pt-screen">
      <section className="pt-card pt-head">
        <div className="pt-head-top">
          <Avatar patient={patient} large />
          <div className="pt-head-id">
            <h1 className="pt-head-name">{patient.name}</h1>
            <div className="pt-head-meta">
              Patient <span className="mono">#{patient.child_id}</span>
              {patient.created_at && ` · registered ${formatDate(patient.created_at)}`}
            </div>
          </div>
          <div className="pt-head-actions">
            {latestOpen ? (
              <>
                <Button variant="outline" icon={Plus} onClick={() => startWorkflow(current)}>
                  New case
                </Button>
                <Button variant="primary" onClick={() => resumeCase(latest)}>
                  Resume {formatCaseRef(latest.cashless_case_id)} →
                </Button>
              </>
            ) : (
              <Button variant="primary" icon={Plus} onClick={() => startWorkflow(current)}>
                {current && !current.ended_at ? `Start case for ${current.admission_no || "this admission"}` : "Start cashless case"}
              </Button>
            )}
          </div>
        </div>
        <div className="pt-facts">
          <div className="pt-fact">
            <div className="pt-fact-label">Gender · age</div>
            <div className="pt-fact-value">{[capitalize(patient.gender), age !== null && `${age} yrs`].filter(Boolean).join(" · ") || "—"}</div>
          </div>
          <div className="pt-fact">
            <div className="pt-fact-label">Date of birth</div>
            <div className="pt-fact-value">{formatDate(patient.dob)}</div>
          </div>
          <div className="pt-fact">
            <div className="pt-fact-label">Mobile</div>
            <div className="pt-fact-value mono">{formatPhone(patient.mobile)}</div>
          </div>
          <div className="pt-fact">
            <div className="pt-fact-label">
              ABHA
              <InfoTip term="abha" />
            </div>
            <div className={`pt-fact-value${patient.abha_number ? " mono" : " is-warn"}`} title={patient.abha_number || undefined}>
              {patient.abha_number || "Not linked"}
            </div>
          </div>
          <div className="pt-fact">
            <div className="pt-fact-label">Now</div>
            <div className="pt-fact-value" title={stay}>{stay}</div>
          </div>
        </div>
      </section>

      <section className="pt-card pt-panel">
        <nav className="pt-tabs" role="tablist" aria-label="Patient sections">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={tab === t.key}
              className={`pt-tab${tab === t.key ? " is-on" : ""}`}
              onClick={() => setTab(t.key)}
            >
              {t.label}
              <span className="pt-count">{t.count}</span>
              {t.alert && <span className="pt-count is-alert">{t.alert}</span>}
            </button>
          ))}
        </nav>

        <div className="pt-tab-body" role="tabpanel">
          {tab === "admissions" &&
            (visits.length === 0 ? (
              <p className="pt-empty">No admissions on record. Admissions are created in the hospital system and appear here.</p>
            ) : (
              <table className="pt-ledger">
                <thead>
                  <tr>
                    <th className="pt-chev-col" aria-hidden="true" />
                    <th>Admission</th>
                    <th>Admitted</th>
                    <th>Discharged</th>
                    <th>Diagnosis</th>
                    <th>Doctor</th>
                    <th className="pt-num pt-money">Final bill</th>
                    <th className="pt-num">To collect</th>
                  </tr>
                </thead>
                <tbody>
                  {visits.map((v, vi) => {
                    const key = v.admission_id ?? `v${vi}`;
                    const m = admissionMoney(v);
                    const linked = casesForVisit(v);
                    const days = daysBetween(v.started_at, v.ended_at);
                    return (
                      <ExpandRow
                        key={key}
                        open={openAdmission === key}
                        onToggle={() => setOpenAdmission(openAdmission === key ? null : key)}
                        cols={8}
                        label="admission"
                        detail={
                          <AdmissionDetail
                            visit={v}
                            onStartCase={startWorkflow}
                            canStart={!(latestOpen && linked.includes(latest.cashless_case_id))}
                          />
                        }
                      >
                        <td>
                          <span className="mono pt-strong">{v.admission_no || `Admission ${vi + 1}`}</span>
                          <div className="pt-sub mono">{linked.length ? linked.map((id) => formatCaseRef(id)).join(", ") : "No case"}</div>
                        </td>
                        <td className="ep-nowrap">{formatDate(v.started_at)}</td>
                        <td className="ep-nowrap">
                          {v.ended_at ? formatDate(v.ended_at) : <span className="pt-strong">In hospital</span>}
                          {days != null && <div className="pt-sub">{v.ended_at ? `${days} day${days === 1 ? "" : "s"}` : `Day ${days + 1}`}</div>}
                        </td>
                        <td>
                          <div className="pt-clip" title={v.diagnosis || undefined}>{v.diagnosis || "—"}</div>
                        </td>
                        <td>
                          {v.primary_doctor?.name || "—"}
                          {v.primary_doctor?.specialization && <div className="pt-sub">{v.primary_doctor.specialization}</div>}
                        </td>
                        <td className="pt-num pt-money mono">{m.invoices.length ? formatMoney(m.finalBill) : "—"}</td>
                        <td className={`pt-num mono${m.outstanding > 0 ? " pt-warn" : ""}`}>{m.invoices.length ? formatMoney(m.outstanding) : "—"}</td>
                      </ExpandRow>
                    );
                  })}
                </tbody>
              </table>
            ))}

          {tab === "cases" &&
            (cases.length === 0 && looseTasks.length === 0 ? (
              <p className="pt-empty">
                No cashless case has been started for this patient. If they are admitted and insured, press Start case.
              </p>
            ) : (
              <>
                <table className="pt-ledger">
                  <thead>
                    <tr>
                      <th className="pt-chev-col" aria-hidden="true" />
                      <th>Case</th>
                      <th>Admission</th>
                      <th>Payer · policy</th>
                      <th>Stage</th>
                      <th>Status</th>
                      <th className="pt-num pt-money">Billed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cases.map((c, i) => {
                      const key = c.cashless_case_id ?? c.claim_id ?? `c${i}`;
                      const caseTasks = tasksFor(c);
                      return (
                        <ExpandRow
                          key={key}
                          open={openCaseKey === key}
                          onToggle={() => setOpenCaseKey(openCaseKey === key ? null : key)}
                          cols={7}
                          label="case"
                          detail={<CaseDetail summary={c} tasks={caseTasks} onOpenCase={() => resumeCase(c.cashless_case_id ? c : null)} onOpenTask={openTask} />}
                        >
                          <td>
                            <span className="mono pt-strong">{c.cashless_case_id ? formatCaseRef(c.cashless_case_id) : `Claim #${c.claim_id}`}</span>
                            <div className="pt-sub">{c.created_at ? `Opened ${formatDate(c.created_at)}` : "—"}</div>
                          </td>
                          <td className="mono">{c.admission_no || "—"}</td>
                          <td>
                            <PayerName id={c.payer_id} name={c.payer_name} />
                            {c.policy_number && <div className="pt-sub mono">{c.policy_number}</div>}
                          </td>
                          <td>
                            <StageTrack claim={c} />
                          </td>
                          <td>
                            <CaseStatusChip claim={c} />
                            {caseTasks.length > 0 && (
                              <div className="pt-sub pt-warn">
                                {caseTasks.length} task{caseTasks.length === 1 ? "" : "s"} waiting
                              </div>
                            )}
                          </td>
                          <td className="pt-num pt-money mono">{c.total_billed != null ? formatMoney(c.total_billed) : "—"}</td>
                        </ExpandRow>
                      );
                    })}
                    {looseTasks.map((t, ti) => (
                      <tr key={`loose-${t.id ?? t.task_id ?? ti}`}>
                        <td className="pt-chev-col" />
                        <td colSpan={5}>
                          <div className="pt-strong">{t.title || humanize(t.task_type)}</div>
                          <div className="pt-sub">Pending task not tied to a case listed here</div>
                        </td>
                        <td className="pt-num">
                          <button type="button" className="cc-act" onClick={() => openTask(t)}>
                            Do this
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {cases.length < caseCount && <p className="pt-empty">Only the latest case is listed here. Older cases are in Cashless Cases.</p>}
              </>
            ))}

          {tab === "messages" &&
            (loadingExtra ? (
              <p className="pt-empty">Loading…</p>
            ) : sortedComms.length === 0 ? (
              <p className="pt-empty">No messages from payers.</p>
            ) : (
              <table className="pt-ledger">
                <thead>
                  <tr>
                    <th className="pt-chev-col" aria-hidden="true" />
                    <th>Message</th>
                    <th>Payer</th>
                    <th>Case</th>
                    <th>Received</th>
                    <th>
                      <span className="sr-only">Flags</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedComms.map((c) => {
                    const flag = !c.provider_read
                      ? { text: "Unread", cls: "pt-warn" }
                      : c.priority === "urgent" || c.priority === "stat"
                        ? { text: priorityLabel(c.priority), cls: "pt-bad" }
                        : null;
                    return (
                      <ExpandRow
                        key={c.correlation_id}
                        open={openCommId === c.correlation_id}
                        onToggle={() => toggleComm(c)}
                        cols={6}
                        label="message"
                        detail={<MessageDetail comm={c} onOpen={() => setDrawerComm(c.correlation_id)} />}
                      >
                        <td>
                          <div className={c.provider_read ? undefined : "pt-strong"}>{commHeadline(c)}</div>
                          {commPreview(c) && <div className="pt-sub pt-clip">{commPreview(c)}</div>}
                        </td>
                        <td>
                          <PayerName id={c.payer_id} name={c.payer_name} />
                        </td>
                        <td className="mono">{c.cashless_case_id ? formatCaseRef(c.cashless_case_id) : "—"}</td>
                        <td className="ep-nowrap" title={c.received_at ? formatDate(c.received_at) : undefined}>
                          {formatRelative(c.received_at || c.sent_at)}
                        </td>
                        <td className={`ep-nowrap ${flag?.cls || ""}`}>{flag?.text || ""}</td>
                      </ExpandRow>
                    );
                  })}
                </tbody>
              </table>
            ))}
        </div>
      </section>

      <CommunicationDetailDrawer
        correlationId={drawerComm}
        open={!!drawerComm}
        onClose={() => setDrawerComm(null)}
        onRead={(id) => setCommunications((prev) => prev.map((c) => (c.correlation_id === id ? { ...c, provider_read: true } : c)))}
        showOpenCase
      />
    </div>
  );
}

const PAGE_SIZE = 20;

// Case-state chips; counts come from the server for the whole search, not the page.
const CASE_STATE_TABS = [
  { key: "any", label: "All" },
  { key: "open_case", label: "Open case", dot: "var(--info)" },
  { key: "with_case", label: "Has cases", dot: "var(--success)" },
  { key: "no_case", label: "No case", dot: "var(--text-muted)" },
];

const SORT_OPTIONS = [
  { value: "newest", label: "Newest first" },
  { value: "recent_activity", label: "Recent activity" },
  { value: "name", label: "Name A–Z" },
];

export default function PatientProfile() {
  const [children, setChildren] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [caseState, setCaseState] = useState("any");
  const [sortBy, setSortBy] = useState("newest");
  const [stateCounts, setStateCounts] = useState({});
  const searchTimer = useRef(null);
  useEffect(() => () => clearTimeout(searchTimer.current), []);
  const [hasSearched, setHasSearched] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const loadChildren = useCallback(async (query = "", pageNum = 1, state = "any", sort = "newest") => {
    setLoading(true);
    setLoadError(false);
    try {
      const params = { limit: PAGE_SIZE, offset: (pageNum - 1) * PAGE_SIZE, case_state: state, sort };
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
      setStateCounts(res?.state_counts || {});
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
    loadChildren(searchQuery, 1, caseState, sortBy);
  };

  const handlePageChange = (newPage) => {
    setPage(newPage);
    loadChildren(searchQuery, newPage, caseState, sortBy);
  };

  const changeCaseState = (state) => {
    setCaseState(state);
    setPage(1);
    loadChildren(searchQuery, 1, state, sortBy);
  };

  const changeSort = (sort) => {
    setSortBy(sort);
    setPage(1);
    loadChildren(searchQuery, 1, caseState, sort);
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

      {loadError && (
        <div className="inline-error-banner" style={{ margin: 0 }}>
          <AlertCircle size={16} />
          Could not load patients. Showing the last known results, if any.
        </div>
      )}

      <Tip className="wq-page-tip">
        Find the admitted patient by name, ID, mobile or ABHA, then press Start case to begin an insurance case.
      </Tip>

      <div className="wq-panel">
        <div className="wq-toolbar">
          <input
            className="input-modern wq-search"
            placeholder="Search name, ID or mobile…"
            aria-label="Search patients"
            value={searchQuery}
            onChange={(e) => {
              const value = e.target.value;
              setSearchQuery(value);
              // Live like every other list: search once typing pauses.
              clearTimeout(searchTimer.current);
              searchTimer.current = setTimeout(() => {
                setHasSearched(!!value.trim());
                setPage(1);
                loadChildren(value, 1, caseState, sortBy);
              }, 300);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                clearTimeout(searchTimer.current);
                handleSearch();
              }
            }}
          />
          <div className="wq-chips" role="tablist" aria-label="Case state">
            {CASE_STATE_TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={caseState === t.key}
                className={`wq-chip${caseState === t.key ? " is-on" : ""}`}
                onClick={() => changeCaseState(t.key)}
              >
                {t.dot && <span className="wq-chip-dot" style={{ "--wq-dot": t.dot }} />}
                {t.label}
                <span className="wq-chip-count">{loading ? "–" : stateCounts[t.key] ?? 0}</span>
              </button>
            ))}
          </div>
          <div className="wq-toolbar-spacer" />
          <div style={{ width: "160px" }}>
            <Dropdown compact ariaLabel="Sort" value={sortBy} options={SORT_OPTIONS} onChange={changeSort} />
          </div>
        </div>

        {loading ? (
          <SkeletonTable rows={6} cols={8} />
        ) : children.length === 0 ? (
          <EmptyState
            icon={User}
            title={hasSearched || caseState !== "any" ? "No patients found" : "No patients registered yet"}
            description={
              caseState !== "any"
                ? "No patient in this group matches. Try another chip or clear the search."
                : hasSearched
                  ? "Try a different name, ID or mobile number."
                  : "Patients registered in the hospital system show up here."
            }
          />
        ) : (
          <div className="wq-table-scroll">
            <table className="wq-table cc-table">
              <thead>
                <tr>
                  <th className="cc-edge-col" aria-hidden="true" />
                  <th>Patient</th>
                  <th>Mobile</th>
                  <th>ABHA</th>
                  <th>Latest case</th>
                  <th>Stage</th>
                  <th className="cc-num">Cases</th>
                  <th>Last activity</th>
                  <th className="cc-actions-col"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {children.map((child) => {
                  const age = calculateAge(child.dob);
                  const claim = child.latest_claim;
                  const open = isOpenCase(claim);
                  return (
                    <tr
                      key={child.child_id}
                      tabIndex={0}
                      title="Open patient"
                      onClick={() => handleSelectPatient(child)}
                      onKeyDown={(e) => { if (e.key === "Enter") handleSelectPatient(child); }}
                    >
                      <td className="cc-edge-col">
                        {claim && needsAttention(claim) && <span className="wq-edge is-high" />}
                      </td>
                      <td>
                        <div className="pt-person">
                          <Avatar patient={child} />
                          <div>
                            <div className="cc-patient">{child.name}</div>
                            <div className="wq-sub">
                              {[`#${child.child_id}`, capitalize(child.gender), age !== null && `${age} yrs`].filter(Boolean).join(" · ")}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="wq-mono">{child.mobile ? formatPhone(child.mobile) : "—"}</td>
                      <td className={child.abha_number ? "wq-mono" : "pt-warn"}>{child.abha_number || "Not linked"}</td>
                      <td>
                        {claim ? (
                          <>
                            <div className="wq-mono cc-case-id">{formatCaseRef(claim.cashless_case_id)}</div>
                            <div className="wq-sub cc-payer">
                              <PayerName id={claim.payer_id} name={claim.payer_name} />
                              {claim.policy_number && ` · ${claim.policy_number}`}
                            </div>
                          </>
                        ) : (
                          <span className="ep-muted">No case yet</span>
                        )}
                      </td>
                      <td>{claim ? <StageTrack claim={claim} /> : null}</td>
                      <td className="cc-num wq-mono">{child.cashless_cases_count ?? (claim ? 1 : 0)}</td>
                      <td className="wq-sub" title={child.last_activity ? formatDate(child.last_activity) : undefined}>
                        {child.last_activity ? formatRelative(child.last_activity) : "—"}
                      </td>
                      <td className="cc-actions-col">
                        <div className="cc-actions" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            className="cc-act pt-act"
                            onClick={() =>
                              open
                                ? navigate(`/case/${child.child_id}/`, { state: { cashless_case_id: claim.cashless_case_id, claim_id: claim.claim_id ?? null } })
                                : navigate(`/case/${child.child_id}/payer`, { state: { newCase: true } })
                            }
                          >
                            {open ? "Resume case" : "Start case"}
                          </button>
                        </div>
                      </td>
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
