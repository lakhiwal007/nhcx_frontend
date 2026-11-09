import { useEffect, useState } from "react";
import { ArrowRight, Plus } from "lucide-react";
import { api, markHandled } from "../../api";
import { Button, LoadingBlock } from "../Common";
import { Drawer } from "../Overlay";
import PayerName from "../PayerName";
import TechnicalDetails from "../case/TechnicalDetails";
import { CaseStatusChip, StageTrack } from "../caseJourney";
import { formatDate, formatMoney, formatCaseRef, formatRelative, humanize, priorityLabel } from "../../format.js";
import { taskLabel } from "../../tasks";
import { commHeadline, commPreview } from "../../communications";
import { admissionMoney, amountOf, billingLabel, casesOfVisit, daysBetween, isOpenCase, money } from "./registryUtil";

function Ledger({ columns, rows, label, empty }) {
  if (!rows.length) return <p className="pt-empty">{empty}</p>;
  return (
    <div className="wq-table-scroll">
      <table className="pt-ledger" aria-label={label}>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} className={c.num ? "pt-num" : undefined}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.key}
              className={`pt-row${row.flag ? " is-flagged" : ""}`}
              tabIndex={0}
              onClick={row.onOpen}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  row.onOpen();
                }
              }}
            >
              {columns.map((c) => (
                <td key={c.key} className={c.num ? "pt-num" : undefined}>
                  {row.cells[c.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MoneyRows({ rows }) {
  return (
    <div className="pt-money-rows">
      {rows.filter(Boolean).map((r, i) => (
        <div key={`${r.label}-${i}`} className={`cv-kv${r.total ? " is-total" : ""}`}>
          <span>
            {r.label}
            {r.sub && <div className="pt-sub">{r.sub}</div>}
          </span>
          <span className={`money${r.total && r.tone ? ` pt-${r.tone}` : ""}`}>{money(r.value)}</span>
        </div>
      ))}
    </div>
  );
}

export function AdmissionsLedger({ visits, onOpen }) {
  const columns = [
    { key: "admission", label: "Admission" },
    { key: "stay", label: "Stay" },
    { key: "care", label: "Diagnosis · doctor" },
    { key: "bill", label: "Final bill · to collect", num: true },
  ];
  const rows = visits.map((v, i) => {
    const m = admissionMoney(v);
    const linked = casesOfVisit(v).map((c) => c.cashless_case_id).filter(Boolean);
    const days = daysBetween(v.started_at, v.ended_at);
    return {
      key: v.admission_id ?? `v${i}`,
      onOpen: () => onOpen(v),
      cells: {
        admission: (
          <>
            <span className="mono pt-strong">{v.admission_no || `Admission ${i + 1}`}</span>
            <div className="pt-sub mono">{linked.length ? linked.map((id) => formatCaseRef(id)).join(", ") : "No case"}</div>
          </>
        ),
        stay: (
          <>
            {formatDate(v.started_at)} {v.ended_at ? `– ${formatDate(v.ended_at)}` : ""}
            <div className="pt-sub">{v.ended_at ? `${days} day${days === 1 ? "" : "s"}` : <span className="pt-strong">In hospital · day {(days ?? 0) + 1}</span>}</div>
          </>
        ),
        care: (
          <>
            <div className="pt-clip" title={v.diagnosis || undefined}>{v.diagnosis || "—"}</div>
            <div className="pt-sub">{[v.primary_doctor?.name, v.primary_doctor?.specialization].filter(Boolean).join(" · ") || "—"}</div>
          </>
        ),
        bill: (
          <>
            <span className="mono">{m.invoices.length ? formatMoney(m.finalBill) : "—"}</span>
            <div className={`pt-sub mono${m.outstanding > 0 ? " pt-warn" : ""}`}>{m.invoices.length ? `${formatMoney(m.outstanding)} to collect` : "No billing yet"}</div>
          </>
        ),
      },
    };
  });
  return <Ledger columns={columns} rows={rows} label="Admissions" empty="No admissions on record. Admissions are created in the hospital system and appear here." />;
}

export function CasesLedger({ cases, tasksFor, onOpen }) {
  const columns = [
    { key: "case", label: "Case" },
    { key: "payer", label: "Payer · policy" },
    { key: "stage", label: "Stage" },
    { key: "billed", label: "Billed", num: true },
  ];
  const rows = cases.map((c, i) => {
    const caseTasks = tasksFor(c);
    return {
      key: c.cashless_case_id ?? c.claim_id ?? `c${i}`,
      flag: caseTasks.length > 0,
      onOpen: () => onOpen(c),
      cells: {
        case: (
          <>
            <span className="mono pt-strong">{c.cashless_case_id ? formatCaseRef(c.cashless_case_id) : `Claim #${c.claim_id}`}</span>
            <div className="pt-sub">{[c.admission_no, c.created_at && `opened ${formatDate(c.created_at)}`].filter(Boolean).join(" · ") || "—"}</div>
          </>
        ),
        payer: (
          <>
            <PayerName id={c.payer_id} name={c.payer_name} fallback="Not chosen yet" />
            {c.policy_number && <div className="pt-sub mono">{c.policy_number}</div>}
          </>
        ),
        stage: (
          <>
            <StageTrack claim={c} />
            <div className="pt-stage-line">
              <CaseStatusChip claim={c} />
              {caseTasks.length > 0 && <span className="pt-sub pt-warn">{caseTasks.length === 1 ? "1 task waiting" : `${caseTasks.length} tasks waiting`}</span>}
            </div>
          </>
        ),
        billed: <span className="mono">{c.total_billed != null ? formatMoney(c.total_billed) : "—"}</span>,
      },
    };
  });
  return <Ledger columns={columns} rows={rows} label="Cashless cases" empty="No cashless case has been started for this patient. If they are admitted and insured, press Start case." />;
}

export function MessagesLedger({ communications, onOpen }) {
  const columns = [
    { key: "message", label: "Message" },
    { key: "payer", label: "Payer · case" },
    { key: "received", label: "Received" },
    { key: "flag", label: "" },
  ];
  const rows = communications.map((c) => {
    const flag = !c.provider_read ? ["Unread", "pt-warn"] : c.priority === "urgent" || c.priority === "stat" ? [priorityLabel(c.priority), "pt-bad"] : null;
    return {
      key: c.correlation_id,
      flag: !c.provider_read,
      onOpen: () => onOpen(c),
      cells: {
        message: (
          <>
            <div className={c.provider_read ? undefined : "pt-strong"}>{commHeadline(c)}</div>
            {commPreview(c) && <div className="pt-sub pt-clip">{commPreview(c)}</div>}
          </>
        ),
        payer: (
          <>
            <PayerName id={c.payer_id} name={c.payer_name} />
            <div className="pt-sub mono">{c.cashless_case_id ? formatCaseRef(c.cashless_case_id) : "—"}</div>
          </>
        ),
        received: <span title={c.received_at ? formatDate(c.received_at) : undefined}>{formatRelative(c.received_at || c.sent_at)}</span>,
        flag: flag ? <span className={flag[1]}>{flag[0]}</span> : "",
      },
    };
  });
  return <Ledger columns={columns} rows={rows} label="Payer messages" empty="No messages from payers." />;
}

export function AdmissionDrawer({ visit, onClose, onStart, onResume, readOnly }) {
  const open = !!visit;
  const v = visit || {};
  const { invoices, paid, billed, discount, outstanding } = admissionMoney(v);
  const lines = invoices.flatMap((inv) => (inv.line_items || []).map((li) => ({ ...li, invoice_no: inv.invoice_no })));
  const sponsors = [...new Set(invoices.map((i) => i.sponsor).filter(Boolean))];
  const procedures = v.procedures || [];
  const cases = casesOfVisit(v);
  const openCase = cases.find(isOpenCase) || null;
  const days = daysBetween(v.started_at, v.ended_at);
  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={v.admission_no || "Admission"}
      subtitle={v.started_at ? `${formatDate(v.started_at)}${v.ended_at ? ` – ${formatDate(v.ended_at)} · ${days} day${days === 1 ? "" : "s"}` : ` · in hospital, day ${(days ?? 0) + 1}`}` : null}
      width={720}
      footer={
        !readOnly && (
          <div className="cv-drawer-actions">
            {openCase ? (
              <Button variant="primary" write icon={ArrowRight} onClick={() => onResume(openCase)}>
                Resume {formatCaseRef(openCase.cashless_case_id)}
              </Button>
            ) : (
              <Button variant="primary" write icon={Plus} onClick={() => onStart(v)}>
                Start case for this admission
              </Button>
            )}
          </div>
        )
      }
    >
      <div className="cv-card-body pt-drawer-facts">
        <div className="cv-kv"><span>Diagnosis</span><span>{v.diagnosis || "—"}</span></div>
        <div className="cv-kv"><span>Doctor</span><span>{[v.primary_doctor?.name, v.primary_doctor?.specialization].filter(Boolean).join(" · ") || "—"}</span></div>
        {v.reason && <div className="cv-kv"><span>Reason</span><span>{v.reason}</span></div>}
        {procedures.length > 0 && (
          <div className="cv-kv">
            <span>Procedure{procedures.length > 1 ? "s" : ""}</span>
            <span>{procedures.map((p) => [p.code, p.name].filter(Boolean).join(" ")).join(", ")}</span>
          </div>
        )}
        {sponsors.length > 0 && <div className="cv-kv"><span>Sponsor tag</span><span>{sponsors.join(", ")}</span></div>}
        {cases.length > 0 && <div className="cv-kv"><span>Cases</span><span className="mono">{cases.map((c) => formatCaseRef(c.cashless_case_id)).join(", ")}</span></div>}
      </div>
      {invoices.length === 0 ? (
        <p className="pt-empty">No billing on this admission yet.</p>
      ) : (
        <>
          <section className="cv-card">
            <div className="cv-card-head">
              <h3 className="cv-card-title">Bill</h3>
              <span className="cv-card-meta">{invoices.map((inv) => [inv.invoice_no, billingLabel(inv.billing_status), inv.payment_mode].filter(Boolean).join(" · ")).join(" | ")}</span>
            </div>
            <div className="cv-tw cv-in-card">
              <table>
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Category</th>
                    <th className="is-num">Qty</th>
                    <th className="is-num">Rate</th>
                    <th className="is-num">Net</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((li, n) => (
                    <tr key={li.line_item_id ?? n}>
                      <td>
                        {li.name}
                        <div className="cv-card-meta">{[li.code, invoices.length > 1 && li.invoice_no].filter(Boolean).join(" · ")}</div>
                      </td>
                      <td>{li.category ? humanize(li.category) : "—"}</td>
                      <td className="is-num">{li.quantity ?? "—"}</td>
                      <td className="is-num">{li.unit_price != null ? formatMoney(li.unit_price) : "—"}</td>
                      <td className="is-num">{li.net_amount != null ? formatMoney(li.net_amount) : "—"}</td>
                    </tr>
                  ))}
                  <tr className="is-total">
                    <td colSpan={4}>Billed</td>
                    <td className="is-num">{formatMoney(billed)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
          <section className="cv-card">
            <div className="cv-card-head">
              <h3 className="cv-card-title">Money</h3>
            </div>
            <div className="cv-card-body">
              <MoneyRows
                rows={[
                  { label: "Billed", value: billed },
                  discount > 0 && { label: "Discount", value: -discount },
                  ...paid.map((p) => ({ label: p.kind, sub: [p.mode, p.ref, p.date && formatDate(p.date)].filter(Boolean).join(" · ") || null, value: -(Number(p.amount) || 0) })),
                  { label: "To collect", value: outstanding, total: true, tone: outstanding > 0 ? "warn" : null },
                ]}
              />
            </div>
          </section>
        </>
      )}
    </Drawer>
  );
}

const decisionLabel = (v) => (v ? humanize(String(v).toLowerCase()) : null);

export function CaseDrawer({ summary, tasks = [], onClose, onOpenCase, onOpenTask, readOnly }) {
  const open = !!summary;
  const caseId = summary?.cashless_case_id || null;
  const [state, setState] = useState({ key: null, full: null, error: null });
  useEffect(() => {
    if (!caseId) return undefined;
    let live = true;
    api
      .getCashlessStatus(caseId)
      .then((full) => live && setState({ key: caseId, full, error: null }))
      .catch((err) => {
        markHandled(err);
        if (live) setState({ key: caseId, full: null, error: err?.message || "The case could not be read." });
      });
    return () => {
      live = false;
    };
  }, [caseId]);
  const loading = !!caseId && state.key !== caseId;
  const full = state.key === caseId ? state.full : null;
  const preauth = full?.preauth;
  const claim = full?.claim;
  const payment = full?.payment;
  const caseTasks = full?.pending_tasks?.length ? full.pending_tasks : tasks;
  const s = summary || {};
  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={caseId ? formatCaseRef(caseId) : `Claim #${s.claim_id}`}
      subtitle={[s.admission_no, s.created_at && `opened ${formatDate(s.created_at)}`].filter(Boolean).join(" · ") || null}
      width={680}
      footer={
        <div className="cv-drawer-actions">
          <Button variant="primary" icon={ArrowRight} onClick={() => onOpenCase(s)}>
            Open case
          </Button>
        </div>
      }
    >
      {loading ? (
        <LoadingBlock compact text="Reading the case…" />
      ) : (
        <>
          {state.key === caseId && state.error && (
            <div className="cv-notice is-warn cv-drawer-note">
              <div className="cv-notice-body">The case could not be read, so what is shown is the summary only: {state.error}</div>
            </div>
          )}
          <div className="cv-card-body pt-drawer-facts">
            <div className="cv-kv"><span>Payer</span><span><PayerName id={s.payer_id} name={s.payer_name} fallback="Not chosen yet" /></span></div>
            <div className="cv-kv"><span>Policy</span><span className="mono">{s.policy_number || "—"}</span></div>
            <div className="cv-kv"><span>Stage</span><span><CaseStatusChip claim={s} /></span></div>
            <div className="cv-kv">
              <span>Pre-auth</span>
              <span>
                {decisionLabel(preauth?.decision) || decisionLabel(s.preauth_status) || "Not sent"}
                {preauth?.preauth_ref && <span className="mono cv-card-meta"> · {preauth.preauth_ref}</span>}
              </span>
            </div>
            <div className="cv-kv"><span>Claim</span><span>{decisionLabel(claim?.decision) || (claim ? "With the payer" : "Not sent")}</span></div>
            <div className="cv-kv">
              <span>Payment</span>
              <span>
                {payment?.settled ? "Settled" : payment?.latest_stage ? humanize(payment.latest_stage) : "None yet"}
                {payment?.utr && <span className="mono cv-card-meta"> · UTR {payment.utr}</span>}
              </span>
            </div>
          </div>
          <section className="cv-card">
            <div className="cv-card-head">
              <h3 className="cv-card-title">Money</h3>
            </div>
            <div className="cv-card-body">
              <MoneyRows
                rows={[
                  { label: "Billed", value: s.total_billed ?? preauth?.totals?.submitted?.value ?? null },
                  preauth && { label: "Pre-auth approved", value: amountOf(preauth.totals) },
                  claim && { label: "Claim approved", value: amountOf(claim.totals) },
                  { label: "Paid by the payer", value: payment?.net ?? null, total: true },
                ]}
              />
            </div>
          </section>
          <section className="cv-card">
            <div className="cv-card-head">
              <h3 className="cv-card-title">Waiting on this case</h3>
            </div>
            {caseTasks.length === 0 ? (
              <p className="cv-card-intro">Nothing is waiting on this case.</p>
            ) : (
              <div className="cv-card-body">
                {caseTasks.map((t, ti) => (
                  <div key={t.id ?? t.task_id ?? ti} className="cv-kv pt-task-row">
                    <span>
                      <div className="pt-strong">{taskLabel(t.task_type) || t.title}</div>
                      <div className="pt-sub">
                        {[t.created_at && `raised ${formatRelative(t.created_at)}`, (t.priority === "urgent" || t.priority === "high") && priorityLabel(t.priority)].filter(Boolean).join(" · ")}
                      </div>
                    </span>
                    {!readOnly && (
                      <button type="button" className="cc-act" onClick={() => onOpenTask(t)}>
                        Do this
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
          <div className="cv-card-body">
            <TechnicalDetails ids={[{ label: "Case id", value: caseId }, { label: "Claim id", value: s.claim_id ?? claim?.claim_id }, { label: "Pre-auth request", value: preauth?.correlation_id }, { label: "Claim request", value: claim?.correlation_id }]} />
          </div>
        </>
      )}
    </Drawer>
  );
}
