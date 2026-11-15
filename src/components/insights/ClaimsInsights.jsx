import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, CheckCircle2, Clock, RefreshCw, ListChecks, BarChart3 } from "lucide-react";
import { api, markHandled } from "../../api";
import { Button, EmptyState, InfoTip, SkeletonTable } from "../ui/Common";
import PageActions from "../ui/PageActions";
import Dropdown from "../ui/Dropdown";
import PayerName from "../ui/PayerName";
import { formatMoney, formatPercent, formatDuration, formatDate, humanize } from "../../lib/format.js";
import "./insights.css";

const PERIODS = [
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
  { value: "180", label: "Last 6 months" },
  { value: "365", label: "Last 12 months" },
];

const WORKFLOW_LABELS = { preauth: "Pre-authorisation", claim: "Final claim", reprocess: "Reprocess" };
const SLA_NOTE = { preauth: "IRDAI: 1 hour", claim: "IRDAI: 3 hours" };
const TIPS = {
  outstanding: "Claims the payer has approved but not yet paid. The money is owed to the hospital.",
  approval: "Of the claims the payers decided in this period, the share they approved in full or in part.",
  realisation: "Of what the payers approved on settled claims, the share that reached the bank after deductions and TDS.",
  tds: "Tax the payer deducts at source and deposits with the tax department in the hospital's name. It is not lost, but it does not reach the bank.",
  ageing: "Money still owed on open claims, grouped by how long ago the patient was discharged. Older buckets need chasing.",
  sla: "The time limit the regulator gives a private insurer to answer: one hour for a pre-authorisation, three hours for a claim.",
};

const isoDay = (d) => d.toISOString().slice(0, 10);
const rupees = (v) => formatMoney(v == null ? v : Math.round(v));

function Bars({ rows, valueKey = "value", format = rupees, label = "label", tone, name }) {
  const max = Math.max(...rows.map((r) => Number(r[valueKey]) || 0), 0);
  return (
    <div className="an-bars" role="img" aria-label={`${name}: ${rows.map((r) => `${r[label]} ${format(Number(r[valueKey]) || 0)}`).join(", ")}`}>
      {rows.map((r) => {
        const v = Number(r[valueKey]) || 0;
        const pct = max > 0 ? Math.max((v / max) * 100, v > 0 ? 1.5 : 0) : 0;
        return (
          <div key={r[label]} className="an-bar-row" title={`${r[label]}: ${format(v)}${r.note ? ` · ${r.note}` : ""}`}>
            <span className="an-bar-label">{r[label]}</span>
            <span className="an-bar-track">
              <span className={`an-bar-fill${tone ? ` is-${tone}` : ""}`} style={{ width: `${pct}%` }} />
            </span>
            <span className="an-bar-value">
              {format(v)}
              {r.note && <span className="an-bar-note">{r.note}</span>}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function Panel({ title, hint, tip, children, className = "" }) {
  return (
    <section className={`wq-panel an-panel ${className}`} aria-label={title}>
      <header className="an-panel-head">
        <h2 className="an-panel-title">
          {title}
          {tip && <InfoTip title={title} text={tip} />}
        </h2>
        {hint && <p className="an-panel-hint">{hint}</p>}
      </header>
      {children}
    </section>
  );
}

function SlaState({ breached, label }) {
  if (breached == null) return <span className="ep-muted">—</span>;
  return breached ? (
    <span className="an-sla is-bad">
      <AlertTriangle size={13} aria-hidden="true" />
      {label || "Over the limit"}
    </span>
  ) : (
    <span className="an-sla is-ok">
      <CheckCircle2 size={13} aria-hidden="true" />
      {label || "Within the limit"}
    </span>
  );
}

function TatCard({ row }) {
  const sla = row.sla_minutes;
  const medianBreached = sla != null && row.median_minutes != null && row.median_minutes > sla;
  return (
    <div className="an-tat-card">
      <div className="an-tat-head">
        <span className="an-tat-name">{WORKFLOW_LABELS[row.workflow] || humanize(row.workflow)}</span>
        <span className="an-tat-sla">{SLA_NOTE[row.workflow] || "No regulatory limit"}</span>
      </div>
      <div className="an-tat-main">
        <span className="an-tat-value">{formatDuration(row.median_minutes)}</span>
        <span className="an-tat-sub">typical wait for the payer's answer</span>
      </div>
      <dl className="an-tat-facts">
        <div>
          <dt>Slowest tenth</dt>
          <dd>{formatDuration(row.p90_minutes)}</dd>
        </div>
        <div>
          <dt>Decided</dt>
          <dd>{row.decided}</dd>
        </div>
        <div>
          <dt>Over the limit</dt>
          <dd>{sla != null ? `${row.breached} (${formatPercent(row.breach_rate)})` : "—"}</dd>
        </div>
        <div>
          <dt>Waiting now</dt>
          <dd>
            {row.pending}
            {sla != null && row.pending_breached > 0 ? <span className="an-flag"> · {row.pending_breached} overdue</span> : null}
          </dd>
        </div>
      </dl>
      {sla != null && row.decided > 0 && <SlaState breached={medianBreached} label={medianBreached ? "Typical wait over the limit" : "Typical wait within the limit"} />}
    </div>
  );
}

export default function Analytics() {
  const navigate = useNavigate();
  const [period, setPeriod] = useState("90");
  const [payer, setPayer] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [state, setState] = useState({ key: null, data: null, error: null });
  const [payerList, setPayerList] = useState([]);

  const loadKey = `${period}|${payer}|${reloadKey}`;
  useEffect(() => {
    const [days, payerId] = loadKey.split("|");
    const to = new Date();
    const from = new Date(to.getTime() - Number(days) * 86400000);
    let live = true;
    api
      .getDashboardAnalytics({ from: isoDay(from), to: isoDay(to), payer_id: payerId || undefined })
      .then((res) => {
        if (!live) return;
        setState({ key: loadKey, data: res, error: null });
        if (!payerId) setPayerList((res?.revenue?.by_payer || []).map((p) => ({ value: p.payer_id, label: p.payer_name || p.payer_id })));
      })
      .catch((err) => {
        markHandled(err);
        if (live) setState((prev) => ({ ...prev, key: loadKey, error: err?.message || "The figures could not be loaded." }));
      });
    return () => {
      live = false;
    };
  }, [loadKey]);

  const loading = state.key !== loadKey;
  const data = state.data;
  const error = state.key === loadKey ? state.error : null;
  const refresh = () => setReloadKey((k) => k + 1);

  const totals = data?.revenue?.totals || {};
  const payerRows = data?.revenue?.by_payer || [];
  const payerOptions = [{ value: "", label: "All payers" }, ...payerList];
  if (payer && !payerOptions.some((o) => o.value === payer)) payerOptions.push({ value: payer, label: payerRows.find((p) => p.payer_id === payer)?.payer_name || payer });
  const empty = !loading && !!data && (totals.claims ?? payerRows.length) === 0;

  const kpis = [
    { key: "billed", label: "Billed", value: rupees(totals.billed) },
    { key: "approved", label: "Approved", value: rupees(totals.approved) },
    { key: "settled", label: "Settled (net)", value: rupees(totals.settled_net) },
    { key: "outstanding", label: "Approved, not yet paid", value: rupees(totals.outstanding), tip: TIPS.outstanding },
    { key: "approval", label: "Approval rate", value: formatPercent(totals.approval_rate), tip: TIPS.approval },
    { key: "realisation", label: "Realisation on settled", value: formatPercent(totals.realisation_rate), tip: TIPS.realisation },
  ];

  const funnel = [
    { label: "Billed", value: totals.billed },
    { label: "Approved", value: totals.approved },
    { label: "Settled (gross)", value: totals.settled_gross },
    { label: "Settled (net)", value: totals.settled_net },
  ];

  const leakage = [
    { label: "Disallowed by payer", value: totals.disallowed },
    { label: "Co-pay", value: totals.copay },
    { label: "Deductible", value: totals.deductible },
    { label: "TDS withheld", value: totals.tds },
  ];

  const ageing = (data?.revenue?.ageing || []).map((b) => ({ label: `${b.bucket} days`, value: b.amount, note: `${b.count} claim${b.count === 1 ? "" : "s"}`, raw: b }));

  const tat = data?.turnaround || {};
  const byWorkflow = tat.by_workflow || [];
  const waitingTotal = byWorkflow.reduce((s, r) => s + (Number(r.pending) || 0), 0);
  const overdueTotal = byWorkflow.reduce((s, r) => s + (Number(r.pending_breached) || 0), 0);

  return (
    <div className="cc-screen an-screen">
      <PageActions>
        <Button variant="outline" size="small" icon={RefreshCw} disabled={loading} onClick={refresh} title="Reload the figures">
          {loading ? "Refreshing…" : "Refresh"}
        </Button>
      </PageActions>

      <div className="an-toolbar">
        <div className="an-filter">
          <Dropdown compact ariaLabel="Period" value={period} options={PERIODS} onChange={setPeriod} />
        </div>
        <div className="an-filter">
          <Dropdown compact ariaLabel="Payer" value={payer} options={payerOptions} onChange={setPayer} />
        </div>
        <div className="wq-toolbar-spacer" />
        {data?.period && (
          <span className="an-period ep-muted">
            Claims created {formatDate(data.period.from)} – {formatDate(data.period.to)}
          </span>
        )}
      </div>

      {error && (
        <div className="cv-notice is-warn" role="alert">
          <div className="cv-notice-body">The figures could not be loaded{data ? ", so what is shown may be out of date" : ""}: {error}</div>
          <div className="cv-notice-actions">
            <button type="button" className="cc-act" onClick={refresh}>
              Retry
            </button>
          </div>
        </div>
      )}

      {loading && !data ? (
        <SkeletonTable rows={6} cols={4} />
      ) : !data ? null : empty ? (
        <EmptyState icon={BarChart3} title="No claims in this period" description={payer ? "This payer had no claims created in the period. Pick a longer period or all payers." : "Pick a longer period, or come back once cases have been sent to the payers."}>
          {(payer || period !== "365") && (
            <Button
              variant="outline"
              size="small"
              onClick={() => {
                setPayer("");
                setPeriod("365");
              }}
            >
              Show the last 12 months, all payers
            </Button>
          )}
        </EmptyState>
      ) : (
        <>
          <div className="cc-kpis">
            {kpis.map((k) => (
              <div key={k.key} className="cc-kpi">
                <div className="cc-kpi-label">
                  {k.label}
                  {k.tip && <InfoTip title={k.label} text={k.tip} />}
                </div>
                <div className="cc-kpi-value">{loading ? "–" : k.value}</div>
              </div>
            ))}
          </div>

          <Panel title="Payer turnaround" hint="Time from our submission to the payer's answer, against the regulator's limits for cashless care." tip={TIPS.sla}>
            <div className="an-tat-grid">
              {byWorkflow.map((row) => (
                <TatCard key={row.workflow} row={row} />
              ))}
            </div>
            <div className="an-wait">
              <ListChecks size={16} aria-hidden="true" />
              <span className="an-wait-text">
                {waitingTotal === 0 ? "Nothing is waiting on a payer right now." : <>{waitingTotal === 1 ? "1 request is" : `${waitingTotal} requests are`} waiting on a payer{overdueTotal ? <>, <strong>{overdueTotal} past the limit</strong></> : ""}. Each has a task in the Work Queue.</>}
              </span>
              {waitingTotal > 0 && (
                <button type="button" className="cv-btn" onClick={() => navigate("/work-queue")}>
                  Open the Work Queue
                </button>
              )}
            </div>
          </Panel>

          <div className="an-two">
            <Panel title="Money funnel" hint="Billed to settled for claims created in this period.">
              <Bars rows={funnel} name="Money funnel" />
            </Panel>
            <Panel title="Where the money went" hint="Amounts deducted between the bill and the bank credit." tip={TIPS.tds}>
              <Bars rows={leakage} tone="muted" name="Deductions" />
              <div className="an-foot">
                <span>Shortfall on settled claims</span>
                <span className="wq-num">{rupees(totals.leakage)}</span>
              </div>
            </Panel>
          </div>

          <Panel title="Receivables ageing" hint="Every open claim today, by days since discharge. Approved claims count their approved amount; claims still awaiting a decision count the billed amount." tip={TIPS.ageing}>
            {ageing.length === 0 ? (
              <p className="an-panel-hint">No open claims today.</p>
            ) : (
              <>
                <Bars rows={ageing} name="Receivables by age" />
                <div className="an-ageing-legend ep-muted">
                  {ageing.map((b) => (
                    <span key={b.label}>
                      {b.label}: {b.raw.awaiting_payment} awaiting payment · {b.raw.awaiting_decision} awaiting decision
                    </span>
                  ))}
                </div>
              </>
            )}
          </Panel>

          <Panel title="By payer" hint="Typical waits are for this period; the last column is the share of pre-authorisations answered later than the regulator's one hour.">
            <div className="wq-table-scroll">
              <table className="wq-table">
                <thead>
                  <tr>
                    <th>Payer</th>
                    <th className="cc-num">Claims</th>
                    <th className="cc-num">Billed</th>
                    <th className="cc-num">Approved</th>
                    <th className="cc-num">Settled (net)</th>
                    <th className="cc-num">Not yet paid</th>
                    <th className="cc-num">Approval</th>
                    <th className="cc-num">Pre-auth wait</th>
                    <th className="cc-num">Over the limit</th>
                  </tr>
                </thead>
                <tbody>
                  {payerRows.map((p) => {
                    const pre = (tat.by_payer || []).find((t) => t.payer_id === p.payer_id && t.workflow === "preauth");
                    return (
                      <tr key={p.payer_id || "unknown"}>
                        <td>
                          <PayerName id={p.payer_id} name={p.payer_name} />
                        </td>
                        <td className="wq-num cc-num">{p.claims}</td>
                        <td className="wq-num cc-num">{rupees(p.billed)}</td>
                        <td className="wq-num cc-num">{rupees(p.approved)}</td>
                        <td className="wq-num cc-num">{rupees(p.settled_net)}</td>
                        <td className="wq-num cc-num">{rupees(p.outstanding)}</td>
                        <td className="wq-num cc-num">{formatPercent(p.approval_rate)}</td>
                        <td className="wq-num cc-num">{formatDuration(pre?.median_minutes)}</td>
                        <td className="wq-num cc-num">{pre ? formatPercent(pre.breach_rate) : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Panel>

          {data?.generated_at && (
            <p className="an-generated ep-muted">
              <Clock size={12} aria-hidden="true" /> Figures as of {formatDate(data.generated_at)}. Money is counted once per payment, however many payment notices it arrived as.
            </p>
          )}
        </>
      )}
    </div>
  );
}
