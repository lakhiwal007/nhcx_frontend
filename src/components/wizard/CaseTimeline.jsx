import { useState, useEffect, useCallback } from "react";
import { RefreshCw, ArrowUpRight, ArrowDownLeft, FileJson } from "lucide-react";
import { api } from "../../api";
import { Button, LoadingBlock, EmptyState } from "../Common";
import { formatMoney, formatDateTime } from "../../format.js";
import { Section } from "../case/CaseFile";
import PageActions from "../PageActions";
import FhirBundleModal from "../FhirBundleModal";

const BUNDLE_WORKFLOWS = new Set([
  "preauth", "preauth_cancellation", "preauth_release", "preauth_nullification",
  "eligibility", "insurance_plan", "claim", "claim_search", "reprocess",
  "communication", "payment",
]);

const BUNDLE_TRANSACTION_TYPE = { eligibility: "coverage_eligibility" };

const ACTORS = [
  { value: "", label: "All" },
  { value: "hospital", label: "Hospital" },
  { value: "payer", label: "Payer" },
  { value: "system", label: "System" },
];

const ACTOR_LABELS = { hospital: "Hospital", payer: "Payer", system: "System" };

const WORKFLOW_LABELS = {
  case: "Case",
  insurance_plan: "Insurance plan",
  eligibility: "Eligibility",
  preauth: "Preauth",
  preauth_cancellation: "Preauth cancellation",
  preauth_release: "Preauth release",
  preauth_nullification: "Preauth nullification",
  claim: "Claim",
  claim_search: "Claim search",
  reprocess: "Reprocess",
  payment: "Payment",
  communication: "Communication",
  note: "Internal note",
};

const money = (v) => (v == null ? null : formatMoney(v));
const isFailed = (e) => e.status === "failed" || !!e.error;

// Everything the event carries, inline under its title: the payer's raw signal
// next to the classified verdict, the error, process notes and identifiers.
function EventDetail({ event }) {
  const d = event.decision;
  // The headline figure is already in the Amount column.
  const snapshot = Object.entries(event.money?.snapshot || {}).filter(([k]) => k !== event.money?.field);
  return (
    <>
      {event.summary && <div className="ep-muted">{event.summary}</div>}
      {d && (
        <div className={`tl-line${d.ambiguous ? " st-warn" : ""}`}>
          <span className="ep-strong ep-cap">{String(d.derived_decision || "unknown").replace(/_/g, " ").toLowerCase()}</span>
          <span className="ep-mono ep-muted">
            {" "}outcome={d.raw_outcome ?? "—"}
            {d.reason_codes?.length ? ` · reason=${d.reason_codes.join(",")}` : ""}
            {d.classified_by ? ` · classified_by=${d.classified_by}` : ""}
          </span>
          {d.ambiguous && <span> · Verify — the payer signal is ambiguous</span>}
        </div>
      )}
      {event.error && (
        <div className="tl-line is-bad">
          {event.error.phase} error{event.error.code ? ` (${event.error.code})` : ""}
          {event.error.message && `: ${event.error.message}`}
        </div>
      )}
      {snapshot.length > 0 && (
        <div className="tl-line ep-muted">
          {snapshot.map(([k, v], i) => (
            <span key={k}>
              {i > 0 && " · "}
              <span className="ep-cap">{k.replace(/_/g, " ")}</span> <span className="ep-mono">{money(v)}</span>
            </span>
          ))}
        </div>
      )}
      {event.detail?.process_notes?.length > 0 && (
        <ul className="tl-notes">
          {event.detail.process_notes.map((n, i) => (
            <li key={i}>{n}</li>
          ))}
        </ul>
      )}
      {(event.correlation_id || event.nhcx_workflow_id != null) && (
        <div className="tl-line ep-mono ep-muted tl-ids">
          {event.correlation_id}
          {event.nhcx_workflow_id != null && `${event.correlation_id ? " · " : ""}wf ${event.nhcx_workflow_id}`}
        </div>
      )}
    </>
  );
}

// Reconciliation figures the case header's money strip doesn't carry.
function Reconciliation({ ledger }) {
  if (!ledger) return null;
  const components = ledger.authorized_ceiling?.components || [];
  const rows = [
    ...components.map((c) => ({ label: `Authorized · ${c.ref || "auth"}`, value: money(c.value) })),
    ledger.copay?.value != null && { label: "Copay", value: money(ledger.copay.value) },
    ledger.disallowed?.value != null && { label: "Disallowed", value: money(ledger.disallowed.value), bad: true },
    ledger.patient_payable?.formula && {
      label: `Patient payable${ledger.patient_payable.confidence ? ` · ${ledger.patient_payable.confidence}` : ""}`,
      value: ledger.patient_payable.formula,
    },
  ].filter(Boolean);
  const short = ledger.settlement?.short_payment;
  if (!rows.length && !short) return null;

  return (
    <Section id="tl-money" title="Reconciliation">
      {rows.length > 0 && (
        <dl className="ds-statement">
          {rows.map((r) => (
            <div key={r.label}>
              <dt>{r.label}</dt>
              <dd className={`ep-mono${r.bad ? " is-bad" : ""}`}>{r.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {short && <div className="ep-notice is-bad ds-notice-in">Short payment — the settled net is below the approved amount.</div>}
    </Section>
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
  const [bundleEvent, setBundleEvent] = useState(null);

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
      <EmptyState title="Could not load the audit trail" description="The case audit trail is temporarily unavailable.">
        <Button variant="outline" icon={RefreshCw} onClick={load} className="mt-4">Retry</Button>
      </EmptyState>
    );
  }

  const all = data?.events || [];
  const events = all.filter((e) => {
    if (actorFilter && e.actor?.kind !== actorFilter) return false;
    if (workflowFilter && e.workflow !== workflowFilter) return false;
    if (failuresOnly && !isFailed(e)) return false;
    return true;
  });
  const workflows = [...new Set(all.map((e) => e.workflow))];
  const failureCount = all.filter(isFailed).length;
  const actorCount = (kind) => (kind ? all.filter((e) => (e.actor?.kind || "system") === kind).length : all.length);

  return (
    <div className="wizard-step ep-screen">
      <PageActions>
        <Button variant="outline" size="small" icon={RefreshCw} onClick={load}>
          Refresh
        </Button>
      </PageActions>

      <Reconciliation ledger={data?.money_ledger} />

      <Section
        id="tl-events"
        title="Events"
        meta={failureCount > 0 && <span className="is-bad">{failureCount} failed</span>}
      >
        <div className="ep-toolbar">
          <div className="wq-chips">
            {ACTORS.map((a) => (
              <button
                key={a.value}
                type="button"
                className={`wq-chip${actorFilter === a.value ? " is-on" : ""}`}
                onClick={() => setActorFilter(a.value)}
              >
                {a.label} <span className="wq-chip-count">{actorCount(a.value)}</span>
              </button>
            ))}
          </div>
          <select className="input-modern pd-input tl-select" value={workflowFilter} onChange={(e) => setWorkflowFilter(e.target.value)}>
            <option value="">All workflows</option>
            {workflows.map((w) => (
              <option key={w} value={w}>
                {WORKFLOW_LABELS[w] || w}
              </option>
            ))}
          </select>
          <label className="pd-radio tl-failures">
            <input type="checkbox" checked={failuresOnly} onChange={(e) => setFailuresOnly(e.target.checked)} />
            Failures only
          </label>
        </div>

        {events.length === 0 ? (
          <p className="ds-empty tl-empty">No events match these filters.</p>
        ) : (
          <div className="ep-table-wrap">
            <table className="ep-table tl-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Event</th>
                  <th>Workflow</th>
                  <th>By</th>
                  <th className="ep-num">Amount</th>
                  <th aria-label="FHIR bundle" />
                </tr>
              </thead>
              <tbody>
                {events.map((e) => {
                  const failed = isFailed(e);
                  const DirIcon = e.direction === "outbound" ? ArrowUpRight : e.direction === "inbound" ? ArrowDownLeft : null;
                  return (
                    <tr key={e.id} className={failed ? "is-failed" : undefined}>
                      <td className="ep-nowrap ep-muted tl-when">{formatDateTime(e.ts)}</td>
                      <td className="tl-event">
                        <div className="ep-strong">
                          {e.title}
                          {failed && <span className="is-bad"> · {e.direction === "outbound" ? "never sent to payer" : "failed"}</span>}
                        </div>
                        <EventDetail event={e} />
                      </td>
                      <td className="ep-nowrap">{WORKFLOW_LABELS[e.workflow] || e.workflow}</td>
                      <td className="ep-nowrap">
                        <span className="tl-actor" title={e.direction ? `${e.direction} message` : undefined}>
                          {DirIcon && <DirIcon size={13} />}
                          {e.actor?.name || ACTOR_LABELS[e.actor?.kind] || "System"}
                        </span>
                      </td>
                      <td className="ep-num">
                        {e.money?.value != null && (
                          <>
                            <span className="ep-mono">{money(e.money.value)}</span>
                            <span className="ep-field-sub ep-cap">{String(e.money.field || "").replace(/_/g, " ")}</span>
                          </>
                        )}
                      </td>
                      <td className="st-col-actions">
                        {BUNDLE_WORKFLOWS.has(e.workflow) && (
                          <button type="button" className="ep-action" onClick={() => setBundleEvent(e)} title="What was sent to and received from the payer">
                            <FileJson size={13} /> Bundle
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <FhirBundleModal
        open={!!bundleEvent}
        onClose={() => setBundleEvent(null)}
        cashlessCaseId={cashlessCaseId}
        transactionType={bundleEvent ? BUNDLE_TRANSACTION_TYPE[bundleEvent.workflow] || bundleEvent.workflow : null}
        correlationId={bundleEvent?.correlation_id}
      />
    </div>
  );
}
