import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import {
  RefreshCw, ChevronDown, ChevronRight, AlertTriangle, ArrowUpRight, ArrowDownLeft,
  Cpu, Building2, Landmark, ShieldAlert,
} from "lucide-react";
import { api } from "../../api";
import { Card, Button, LoadingBlock, EmptyState } from "../Common";

// Fixed actor palette — who drove the event. Hospital (blue), payer (violet),
// system/auto (grey). Kept distinct so a payer callback never reads as a
// hospital action at a glance.
const ACTOR_CONFIG = {
  hospital: { label: "Hospital", color: "#2563eb", bg: "rgba(37,99,235,0.12)", icon: Building2 },
  payer: { label: "Payer", color: "#7c3aed", bg: "rgba(124,58,237,0.12)", icon: Landmark },
  system: { label: "System", color: "#64748b", bg: "rgba(100,116,139,0.12)", icon: Cpu },
};

const SEVERITY_COLOR = {
  success: "var(--success)",
  info: "var(--primary)",
  warning: "var(--warning)",
  error: "var(--error)",
};

const WORKFLOW_LABELS = {
  case: "Case",
  insurance_plan: "Insurance Plan",
  eligibility: "Eligibility",
  preauth: "Preauth",
  claim: "Claim",
  reprocess: "Reprocess",
  payment: "Payment",
  communication: "Communication",
};

const money = (v) => (v == null ? null : `₹${Number(v).toLocaleString()}`);

function ActorBadge({ actor }) {
  const cfg = ACTOR_CONFIG[actor?.kind] || ACTOR_CONFIG.system;
  const Icon = cfg.icon;
  return (
    <span
      title={actor?.name || cfg.label}
      style={{
        display: "inline-flex", alignItems: "center", gap: "4px", padding: "2px 8px",
        borderRadius: "var(--radius-pill)", fontSize: "11px", fontWeight: 700,
        color: cfg.color, background: cfg.bg, whiteSpace: "nowrap",
      }}
    >
      <Icon size={11} /> {actor?.name || cfg.label}
    </span>
  );
}

// The raw-vs-classified decision block. Shows the payer's own signal next to
// the wrapper's derived verdict so a mis-classification can't hide behind a
// confident label; flags ambiguous derivations for staff to verify.
function DecisionDetail({ decision }) {
  if (!decision) return null;
  const ambiguous = decision.ambiguous;
  return (
    <div
      style={{
        marginTop: "8px", padding: "8px 10px", borderRadius: "8px", fontSize: "12px",
        background: ambiguous ? "rgba(245,158,11,0.08)" : "var(--bg-main)",
        border: `1px solid ${ambiguous ? "var(--warning)" : "var(--border-color)"}`,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
        <strong style={{ fontSize: "12px" }}>{decision.derived_decision || "UNKNOWN"}</strong>
        {ambiguous && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: "3px", color: "var(--warning)", fontWeight: 700 }}>
            <ShieldAlert size={12} /> Verify — payer signal is ambiguous
          </span>
        )}
      </div>
      <div style={{ marginTop: "4px", fontFamily: "monospace", fontSize: "11px", color: "var(--text-muted)" }}>
        outcome={decision.raw_outcome ?? "—"}
        {decision.reason_codes?.length ? ` · reason=${decision.reason_codes.join(",")}` : ""}
        {` · classified_by=${decision.classified_by}`}
      </div>
    </div>
  );
}

function EventRow({ event }) {
  const [open, setOpen] = useState(false);
  const isFailure = event.status === "failed" || !!event.error;
  const tint = SEVERITY_COLOR[event.severity] || "var(--border-color)";
  const DirIcon = event.direction === "outbound" ? ArrowUpRight : event.direction === "inbound" ? ArrowDownLeft : null;
  const expandable = !!(event.detail || event.error || event.decision || event.correlation_id);

  return (
    <div
      style={{
        borderLeft: `3px solid ${isFailure ? "var(--error)" : tint}`,
        background: "var(--bg-card)", borderRadius: "var(--radius-md)",
        border: "1px solid var(--border-color)", borderLeftWidth: "3px", marginBottom: "8px",
      }}
    >
      <button
        onClick={() => expandable && setOpen((o) => !o)}
        style={{
          width: "100%", textAlign: "left", background: "none", border: "none",
          cursor: expandable ? "pointer" : "default", padding: "10px 14px",
          display: "flex", gap: "12px", alignItems: "flex-start",
        }}
      >
        <div style={{ flexShrink: 0, marginTop: "2px", color: "var(--text-muted)" }}>
          {expandable ? (open ? <ChevronDown size={16} /> : <ChevronRight size={16} />) : <span style={{ width: 16, display: "inline-block" }} />}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ fontWeight: 700, fontSize: "13px" }}>{event.title}</span>
            {isFailure && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: "3px", fontSize: "11px", color: "var(--error)", fontWeight: 700 }}>
                <AlertTriangle size={11} /> {event.direction === "outbound" ? "never sent to payer" : "failed"}
              </span>
            )}
            <span className="badge-modern badge-info" style={{ fontSize: "10px" }}>{WORKFLOW_LABELS[event.workflow] || event.workflow}</span>
          </div>
          {event.summary && <div style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "2px" }}>{event.summary}</div>}
          <div style={{ display: "flex", gap: "10px", alignItems: "center", marginTop: "6px", flexWrap: "wrap" }}>
            <ActorBadge actor={event.actor} />
            {DirIcon && <DirIcon size={13} style={{ color: "var(--text-muted)" }} />}
            <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>{new Date(event.ts).toLocaleString()}</span>
            {event.nhcx_workflow_id != null && (
              <span style={{ fontSize: "10px", color: "var(--text-muted)", fontFamily: "monospace" }}>wf {event.nhcx_workflow_id}</span>
            )}
          </div>
        </div>
        {event.money?.value != null && (
          <div style={{ flexShrink: 0, textAlign: "right" }}>
            <div style={{ fontSize: "10px", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 700 }}>{event.money.field}</div>
            <div style={{ fontSize: "15px", fontWeight: 800 }}>{money(event.money.value)}</div>
          </div>
        )}
      </button>

      {open && (
        <div style={{ padding: "0 14px 12px 42px" }}>
          <DecisionDetail decision={event.decision} />
          {event.error && (
            <div style={{ marginTop: "8px", padding: "8px 10px", borderRadius: "8px", background: "rgba(239,68,68,0.06)", border: "1px solid var(--error)", fontSize: "12px" }}>
              <strong style={{ color: "var(--error)" }}>{event.error.phase} error{event.error.code ? ` (${event.error.code})` : ""}</strong>
              {event.error.message && <div style={{ color: "var(--text-muted)", marginTop: "2px" }}>{event.error.message}</div>}
            </div>
          )}
          {event.money?.snapshot && (
            <div style={{ marginTop: "8px", display: "flex", gap: "12px", flexWrap: "wrap" }}>
              {Object.entries(event.money.snapshot).map(([k, v]) => (
                <span key={k} style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                  <span style={{ textTransform: "uppercase", fontWeight: 700 }}>{k}</span> {money(v)}
                </span>
              ))}
            </div>
          )}
          {event.detail?.process_notes?.length > 0 && (
            <ul style={{ margin: "8px 0 0", paddingLeft: "18px", fontSize: "12px", color: "var(--text-muted)" }}>
              {event.detail.process_notes.map((n, i) => <li key={i}>{n}</li>)}
            </ul>
          )}
          {event.correlation_id && (
            <div style={{ marginTop: "8px", fontSize: "11px", color: "var(--text-muted)", fontFamily: "monospace" }}>
              correlation {event.correlation_id}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// The persistent money ledger — billed → authorized → approved → patient payable
// → settled, plus the one number the discharge desk needs: collect-from-patient.
function MoneyLedger({ ledger }) {
  if (!ledger) return null;
  const cells = [
    { label: "Billed", value: ledger.billed?.value },
    { label: "Authorized", value: ledger.authorized_ceiling?.value, hint: ledger.authorized_ceiling?.cumulative ? "cumulative" : null },
    { label: "Approved", value: ledger.approved?.value, color: "var(--success)" },
    { label: "Copay", value: ledger.copay?.value },
    { label: "Disallowed", value: ledger.disallowed?.value, color: "var(--error)" },
    { label: "Settled (net)", value: ledger.settlement?.net, color: "var(--success)" },
  ].filter((c) => c.value != null);

  const collect = ledger.reconciliation?.to_collect_from_patient;
  const overCeiling = ledger.reconciliation?.variance_vs_authorized;

  return (
    <Card title="Money Ledger" className="mb-6">
      <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
        {cells.map((c) => (
          <div key={c.label} style={{ flex: "1 1 110px", padding: "10px 14px", background: "var(--bg-main)", borderRadius: "var(--radius-md)", textAlign: "center" }}>
            <div style={{ fontSize: "10px", color: "var(--text-muted)", fontWeight: 700, textTransform: "uppercase" }}>{c.label}</div>
            <div style={{ fontSize: "18px", fontWeight: 800, color: c.color || "var(--text-main)" }}>{money(c.value)}</div>
            {c.hint && <div style={{ fontSize: "9px", color: "var(--text-muted)" }}>{c.hint}</div>}
          </div>
        ))}
      </div>

      {(collect != null || (overCeiling != null && overCeiling > 0)) && (
        <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginTop: "12px" }}>
          {collect != null && (
            <div style={{ flex: "1 1 200px", padding: "12px 16px", background: "rgba(37,99,235,0.06)", border: "1px solid var(--primary)", borderRadius: "var(--radius-md)" }}>
              <div style={{ fontSize: "11px", color: "var(--text-muted)", fontWeight: 700, textTransform: "uppercase" }}>
                Collect from patient{ledger.patient_payable?.confidence ? ` (${ledger.patient_payable.confidence})` : ""}
              </div>
              <div style={{ fontSize: "22px", fontWeight: 800, color: "var(--primary)" }}>{money(collect)}</div>
              {ledger.patient_payable?.formula && <div style={{ fontSize: "10px", color: "var(--text-muted)" }}>{ledger.patient_payable.formula}</div>}
            </div>
          )}
          {overCeiling != null && overCeiling > 0 && (
            <div style={{ flex: "1 1 200px", padding: "12px 16px", background: "rgba(245,158,11,0.08)", border: "1px solid var(--warning)", borderRadius: "var(--radius-md)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "11px", color: "var(--warning)", fontWeight: 700, textTransform: "uppercase" }}>
                <AlertTriangle size={12} /> Over authorized ceiling
              </div>
              <div style={{ fontSize: "22px", fontWeight: 800, color: "var(--warning)" }}>{money(overCeiling)}</div>
              <div style={{ fontSize: "10px", color: "var(--text-muted)" }}>billed above the sanctioned amount</div>
            </div>
          )}
        </div>
      )}
      {ledger.settlement?.short_payment && (
        <div style={{ marginTop: "10px", padding: "8px 12px", background: "rgba(239,68,68,0.06)", border: "1px solid var(--error)", borderRadius: "8px", fontSize: "12px", color: "var(--error)", fontWeight: 600 }}>
          Short payment — settled net is below the approved amount.
        </div>
      )}
    </Card>
  );
}

export default function CaseTimeline({ ctx }) {
  const cashlessCaseId =
    ctx?.caseState?.cashless_case_id || ctx?.cashlessCase?.cashless_case_id || ctx?.caseState?.claim_id;

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [actorFilter, setActorFilter] = useState("");
  const [workflowFilter, setWorkflowFilter] = useState("");
  const [failuresOnly, setFailuresOnly] = useState(false);

  const load = useCallback(async () => {
    if (!cashlessCaseId) { setLoading(false); return; }
    setLoading(true);
    setError(false);
    try {
      const res = await api.getCaseTimeline(cashlessCaseId, {});
      setData(res);
    } catch (_) {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [cashlessCaseId]);

  useEffect(() => { load(); }, [load]);

  if (!cashlessCaseId) {
    return <EmptyState title="No case yet" description="The audit trail appears once a cashless case has been created." />;
  }
  if (loading) return <LoadingBlock text="Loading audit trail…" />;
  if (error) {
    return (
      <EmptyState title="Could not load timeline" description="The case audit trail is temporarily unavailable.">
        <Button variant="outline" icon={RefreshCw} onClick={load} className="mt-4">Retry</Button>
      </EmptyState>
    );
  }

  const events = (data?.events || []).filter((e) => {
    if (actorFilter && e.actor?.kind !== actorFilter) return false;
    if (workflowFilter && e.workflow !== workflowFilter) return false;
    if (failuresOnly && e.status !== "failed" && !e.error) return false;
    return true;
  });

  const workflows = [...new Set((data?.events || []).map((e) => e.workflow))];

  return (
    <div className="wizard-step">
      <MoneyLedger ledger={data?.money_ledger} />

      <div style={{ display: "flex", gap: "var(--space-3)", marginBottom: "var(--space-4)", flexWrap: "wrap", alignItems: "center" }}>
        <select className="input-modern" style={{ width: "auto", minWidth: "150px" }} value={actorFilter} onChange={(e) => setActorFilter(e.target.value)}>
          <option value="">All actors</option>
          <option value="hospital">Hospital</option>
          <option value="payer">Payer</option>
          <option value="system">System</option>
        </select>
        <select className="input-modern" style={{ width: "auto", minWidth: "150px" }} value={workflowFilter} onChange={(e) => setWorkflowFilter(e.target.value)}>
          <option value="">All workflows</option>
          {workflows.map((w) => <option key={w} value={w}>{WORKFLOW_LABELS[w] || w}</option>)}
        </select>
        <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", cursor: "pointer" }}>
          <input type="checkbox" checked={failuresOnly} onChange={(e) => setFailuresOnly(e.target.checked)} />
          Failures only
        </label>
        <Button variant="outline" size="small" icon={RefreshCw} onClick={load} style={{ marginLeft: "auto" }}>Refresh</Button>
      </div>

      {events.length === 0 ? (
        <EmptyState title="No events" description="No timeline events match the current filters." />
      ) : (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          {events.map((e) => <EventRow key={e.id} event={e} />)}
        </motion.div>
      )}
    </div>
  );
}
