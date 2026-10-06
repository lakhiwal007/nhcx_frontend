import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, CheckCircle2, Clock } from "lucide-react";
import { api } from "../api";
import { SkeletonTable } from "./Common";
import Dropdown from "./Dropdown";
import PayerName from "./PayerName";
import { formatMoney, formatPercent, formatDuration, formatDate, formatCaseRef, humanize } from "../format.js";
import "./analytics.css";

const PERIODS = [
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
  { value: "180", label: "Last 6 months" },
  { value: "365", label: "Last 12 months" },
];

const WORKFLOW_LABELS = { preauth: "Pre-authorisation", claim: "Final claim", reprocess: "Reprocess" };
const SLA_NOTE = { preauth: "IRDAI: 1 hour", claim: "IRDAI: 3 hours" };

const isoDay = (d) => d.toISOString().slice(0, 10);
const rupees = (v) => formatMoney(v == null ? v : Math.round(v));

function Bars({ rows, valueKey = "value", format = rupees, label = "label", tone }) {
  const max = Math.max(...rows.map((r) => Number(r[valueKey]) || 0), 0);
  return (
    <div className="an-bars" role="table">
      {rows.map((r) => {
        const v = Number(r[valueKey]) || 0;
        const pct = max > 0 ? Math.max((v / max) * 100, v > 0 ? 1.5 : 0) : 0;
        return (
          <div key={r[label]} className="an-bar-row" role="row" title={`${r[label]}: ${format(v)}${r.note ? ` · ${r.note}` : ""}`}>
            <span className="an-bar-label" role="cell">{r[label]}</span>
            <span className="an-bar-track" role="cell">
              <span className={`an-bar-fill${tone ? ` is-${tone}` : ""}`} style={{ width: `${pct}%` }} />
            </span>
            <span className="an-bar-value" role="cell">
              {format(v)}
              {r.note && <span className="an-bar-note">{r.note}</span>}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function Panel({ title, hint, children, className = "" }) {
  return (
    <section className={`wq-panel an-panel ${className}`}>
      <header className="an-panel-head">
        <h2 className="an-panel-title">{title}</h2>
        {hint && <p className="an-panel-hint">{hint}</p>}
      </header>
      {children}
    </section>
  );
}

function SlaState({ breached, label }) {
  if (breached == null) return <span className="ep-muted">—</span>;
  return breached ? (
    <span className="an-sla is-bad"><AlertTriangle size={13} aria-hidden="true" />{label || "Breached"}</span>
  ) : (
    <span className="an-sla is-ok"><CheckCircle2 size={13} aria-hidden="true" />{label || "Within SLA"}</span>
  );
}

function TatCard({ row }) {
  const sla = row.sla_minutes;
  const medianBreached = sla != null && row.median_minutes != null && row.median_minutes > sla;
  return (
    <div className="an-tat-card">
      <div className="an-tat-head">
        <span className="an-tat-name">{WORKFLOW_LABELS[row.workflow] || humanize(row.workflow)}</span>
        <span className="an-tat-sla">{SLA_NOTE[row.workflow] || "No regulatory SLA"}</span>
      </div>
      <div className="an-tat-main">
        <span className="an-tat-value">{formatDuration(row.median_minutes)}</span>
        <span className="an-tat-sub">median to payer decision</span>
      </div>
      <dl className="an-tat-facts">
        <div><dt>90th percentile</dt><dd>{formatDuration(row.p90_minutes)}</dd></div>
        <div><dt>Decided</dt><dd>{row.decided}</dd></div>
        <div>
          <dt>Over SLA</dt>
          <dd>{sla != null ? `${row.breached} (${formatPercent(row.breach_rate)})` : "—"}</dd>
        </div>
        <div>
          <dt>Waiting now</dt>
          <dd>{row.pending}{sla != null && row.pending_breached > 0 ? <span className="an-flag"> · {row.pending_breached} overdue</span> : null}</dd>
        </div>
      </dl>
      {sla != null && row.decided > 0 && (
        <SlaState breached={medianBreached} label={medianBreached ? "Median over SLA" : "Median within SLA"} />
      )}
    </div>
  );
}

export default function Analytics() {
  const navigate = useNavigate();
  const [period, setPeriod] = useState("90");
  const [payer, setPayer] = useState("");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    const to = new Date();
    const from = new Date(to.getTime() - Number(period) * 86400000);
    try {
      setData(await api.getDashboardAnalytics({ from: isoDay(from), to: isoDay(to), payer_id: payer || undefined }));
    } catch (err) {
      console.error(err);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [period, payer]);

  useEffect(() => {
    load();
  }, [load]);

  const totals = data?.revenue?.totals || {};
  const payerRows = data?.revenue?.by_payer || [];
  const payerOptions = [
    { value: "", label: "All payers" },
    ...payerRows.map((p) => ({ value: p.payer_id, label: p.payer_name || p.payer_id })),
  ];
  if (payer && !payerOptions.some((o) => o.value === payer)) payerOptions.push({ value: payer, label: payer });

  const kpis = [
    { key: "billed", label: "Billed", value: rupees(totals.billed) },
    { key: "approved", label: "Approved", value: rupees(totals.approved) },
    { key: "settled", label: "Settled (net)", value: rupees(totals.settled_net) },
    { key: "outstanding", label: "Approved, not yet paid", value: rupees(totals.outstanding) },
    { key: "approval", label: "Approval rate", value: formatPercent(totals.approval_rate) },
    { key: "realisation", label: "Realisation on settled", value: formatPercent(totals.realisation_rate) },
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

  const ageing = (data?.revenue?.ageing || []).map((b) => ({
    label: `${b.bucket} days`,
    value: b.amount,
    note: `${b.count} claim${b.count === 1 ? "" : "s"}`,
    raw: b,
  }));

  const tat = data?.turnaround || {};
  const waiting = tat.waiting || [];

  const openCase = (w) => {
    if (w.child_id == null) return;
    navigate(`/case/${w.child_id}/`, { state: { claim_id: w.claim_id ?? null, cashless_case_id: w.cashless_case_id } });
  };

  return (
    <div className="cc-screen an-screen">
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
        <div className="inline-error-banner" style={{ margin: 0 }}>
          Could not load analytics.
          <button type="button" className="cc-retry" onClick={load}>Retry</button>
        </div>
      )}

      <div className="cc-kpis">
        {kpis.map((k) => (
          <div key={k.key} className="cc-kpi">
            <div className="cc-kpi-label">{k.label}</div>
            <div className="cc-kpi-value">{loading ? "–" : k.value}</div>
          </div>
        ))}
      </div>

      {loading && !data ? (
        <SkeletonTable rows={6} cols={4} />
      ) : (
        <>
          <Panel title="Payer turnaround" hint="Time from our submission to the payer's response, measured against the IRDAI cashless limits.">
            <div className="an-tat-grid">
              {(tat.by_workflow || []).map((row) => <TatCard key={row.workflow} row={row} />)}
            </div>
          </Panel>

          <Panel
            title="Waiting on the payer"
            hint={waiting.length ? "Oldest first. Submissions past their SLA are flagged." : undefined}
          >
            {waiting.length === 0 ? (
              <div className="wq-empty"><div className="wq-empty-title">Nothing is waiting on a payer</div></div>
            ) : (
              <div className="wq-table-scroll">
                <table className="wq-table">
                  <thead>
                    <tr>
                      <th>Case</th>
                      <th>Patient</th>
                      <th>Request</th>
                      <th>Payer</th>
                      <th className="cc-num">Waiting</th>
                      <th>SLA</th>
                    </tr>
                  </thead>
                  <tbody>
                    {waiting.map((w) => (
                      <tr
                        key={w.correlation_id}
                        tabIndex={w.child_id != null ? 0 : undefined}
                        onClick={() => openCase(w)}
                        onKeyDown={(e) => e.key === "Enter" && openCase(w)}
                        className={w.child_id != null ? "an-row-link" : undefined}
                      >
                        <td className="wq-mono">{formatCaseRef(w.cashless_case_id)}</td>
                        <td>{w.patient_name || "—"}</td>
                        <td>{WORKFLOW_LABELS[w.workflow] || humanize(w.workflow)}</td>
                        <td><PayerName id={w.payer_id} name={w.payer_name} /></td>
                        <td className="wq-mono cc-num">{formatDuration(w.waiting_minutes)}</td>
                        <td><SlaState breached={w.breached} label={w.breached ? "Overdue" : "On time"} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          <div className="an-two">
            <Panel title="Money funnel" hint="Billed to settled for claims created in this period.">
              <Bars rows={funnel} />
            </Panel>
            <Panel title="Where the money went" hint="Amounts deducted between the bill and the bank credit.">
              <Bars rows={leakage} tone="muted" />
              <div className="an-foot">
                <span>Shortfall on settled claims</span>
                <span className="wq-mono">{rupees(totals.leakage)}</span>
              </div>
            </Panel>
          </div>

          <Panel
            title="Receivables ageing"
            hint="Every open claim today, by days since discharge. Approved claims count their approved amount; claims still awaiting a decision count the billed amount."
          >
            <Bars rows={ageing} />
            <div className="an-ageing-legend ep-muted">
              {ageing.map((b) => (
                <span key={b.label}>
                  {b.label}: {b.raw.awaiting_payment} awaiting payment · {b.raw.awaiting_decision} awaiting decision
                </span>
              ))}
            </div>
          </Panel>

          <Panel title="By payer" hint="Turnaround medians are for this period; the SLA column shows the share of decisions that took longer than the IRDAI limit.">
            {payerRows.length === 0 ? (
              <div className="wq-empty"><div className="wq-empty-title">No claims in this period</div></div>
            ) : (
              <div className="wq-table-scroll">
                <table className="wq-table">
                  <thead>
                    <tr>
                      <th>Payer</th>
                      <th className="cc-num">Claims</th>
                      <th className="cc-num">Billed</th>
                      <th className="cc-num">Approved</th>
                      <th className="cc-num">Settled (net)</th>
                      <th className="cc-num">Outstanding</th>
                      <th className="cc-num">Approval</th>
                      <th className="cc-num">Preauth median</th>
                      <th className="cc-num">Preauth over SLA</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payerRows.map((p) => {
                      const pre = (tat.by_payer || []).find((t) => t.payer_id === p.payer_id && t.workflow === "preauth");
                      return (
                        <tr key={p.payer_id || "unknown"}>
                          <td><PayerName id={p.payer_id} name={p.payer_name} /></td>
                          <td className="wq-mono cc-num">{p.claims}</td>
                          <td className="wq-mono cc-num">{rupees(p.billed)}</td>
                          <td className="wq-mono cc-num">{rupees(p.approved)}</td>
                          <td className="wq-mono cc-num">{rupees(p.settled_net)}</td>
                          <td className="wq-mono cc-num">{rupees(p.outstanding)}</td>
                          <td className="wq-mono cc-num">{formatPercent(p.approval_rate)}</td>
                          <td className="wq-mono cc-num">{formatDuration(pre?.median_minutes)}</td>
                          <td className="wq-mono cc-num">{pre ? formatPercent(pre.breach_rate) : "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
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
