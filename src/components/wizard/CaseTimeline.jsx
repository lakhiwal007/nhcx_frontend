import { useState, useEffect, useCallback } from "react";
import StageBar from "../case/StageBar";
import { RefreshCw, ArrowUpRight, ArrowDownLeft, FileJson } from "lucide-react";
import { api } from "../../api";
import { Button, LoadingBlock, EmptyState, NextStep } from "../Common";
import { formatMoney, formatDateTime } from "../../format.js";
import PageActions from "../PageActions";
import FhirBundleModal from "../FhirBundleModal";
import CaseChecklist from "../case/CaseChecklist";
import { useCasePane } from "../case/useCasePane";
import { buildTimelineChecklist, firstTimelineItem } from "../case/timelineChecklist";

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

const MAX_PAGES = 20;

const money = (v) => (v == null ? null : formatMoney(v));
const words = (v) => String(v).replace(/_/g, " ");
const isFailed = (e) => e.status === "failed" || !!e.error;
const needsVerify = (e) => !!e.decision?.ambiguous;
const actorOf = (e) => e.actor?.kind || "system";

// Only a failure before the gateway handed it over means the payer never saw it.
function failureLabel(event) {
  if (event.direction === "outbound" && event.error?.phase !== "payer") return "never sent to payer";
  return event.error?.phase === "payer" ? "refused by payer" : "failed";
}

// The backend caps a page and sorts oldest first, so a long case would lose its
// newest events if only the first page were read.
async function readTrail(caseId) {
  const first = await api.getCaseTimeline(caseId, {});
  let events = first?.events || [];
  const total = first?.total_count ?? events.length;
  for (let page = 1; page < MAX_PAGES && events.length < total; page += 1) {
    const next = await api.getCaseTimeline(caseId, { offset: events.length });
    if (!next?.events?.length) break;
    events = [...events, ...next.events];
  }
  return { ...first, events };
}

function EventFacts({ event }) {
  const d = event.decision;
  const figure = event.money?.value != null && `${money(event.money.value)} ${words(event.money.field || "")}`.trim();
  const snapshot = Object.entries(event.money?.snapshot || {})
    .filter(([k, v]) => k !== event.money?.field && v != null)
    .map(([k, v]) => `${words(k)} ${money(v)}`);
  const refs = Object.entries(event.refs || {}).filter(([, v]) => v).map(([k, v]) => `${words(k)} ${v}`);
  const counts = Object.entries(event.detail?.counts || {}).map(([k, v]) => `${v} ${words(k)}`);
  const extras = [event.detail?.workflow_type, event.detail?.reason_code, event.detail?.priority, event.detail?.category, ...counts].filter(Boolean);
  const ids = [event.correlation_id, event.request_id && `request ${event.request_id}`, event.nhcx_workflow_id != null && `wf ${event.nhcx_workflow_id}`].filter(Boolean);
  return (
    <>
      {event.summary && <div className="ep-muted">{event.summary}</div>}
      {figure && (
        <div className="tl-line">
          <span className="ep-strong">{figure}</span>
          {snapshot.length > 0 && <span className="ep-muted"> · {snapshot.join(" · ")}</span>}
        </div>
      )}
      {d && (
        <div className={`tl-line${d.ambiguous ? " st-warn" : ""}`}>
          <span className="ep-strong ep-cap">{words(d.derived_decision || "unknown").toLowerCase()}</span>
          <span className="ep-mono ep-muted">
            {" "}outcome={d.raw_outcome ?? "—"}
            {d.reason_codes?.length ? ` · reason=${d.reason_codes.join(",")}` : ""}
            {d.classified_by ? ` · classified_by=${d.classified_by}` : ""}
          </span>
          {d.ambiguous && <span> · Verify: the payer signal is ambiguous</span>}
        </div>
      )}
      {d?.reasons?.length > 0 && (
        <ul className="tl-notes">
          {d.reasons.map((r) => <li key={r.code}>{r.label} <span className="ep-mono">{r.code}</span></li>)}
        </ul>
      )}
      {event.error && (
        <div className="tl-line is-bad">
          {words(event.error.phase || "")} error{event.error.code ? ` (${event.error.code})` : ""}
          {event.error.message && `: ${event.error.message}`}
        </div>
      )}
      {event.detail?.process_notes?.length > 0 && (
        <ul className="tl-notes">
          {event.detail.process_notes.map((n, i) => <li key={i}>{n}</li>)}
        </ul>
      )}
      {(refs.length > 0 || extras.length > 0) && <div className="tl-line ep-muted">{[...refs, ...extras.map(words)].join(" · ")}</div>}
      {ids.length > 0 && <div className="tl-line ep-mono ep-muted tl-ids">{ids.join(" · ")}</div>}
    </>
  );
}

// Reconciliation figures the case header's money strip doesn't carry. Paid and
// short amounts belong to the Payment step, which reads every payment.
function reconciliationRows(ledger) {
  if (!ledger) return [];
  const payable = ledger.patient_payable;
  return [
    ...(ledger.authorized_ceiling?.components || []).map((c) => [`Authorised · ${c.ref || "auth"}`, money(c.value)]),
    ["Eligible", money(ledger.eligible?.value)],
    ["Copay", money(ledger.copay?.value)],
    ["Deductible", money(ledger.deductible?.value)],
    ["Disallowed", money(ledger.disallowed?.value)],
    ["Billed above authorised", money(ledger.reconciliation?.variance_vs_authorized)],
    [`Patient payable${payable?.formula ? ` (${payable.formula})` : ""}${payable?.confidence ? ` · ${payable.confidence}` : ""}`, money(ledger.reconciliation?.to_collect_from_patient ?? payable?.value)],
  ].filter(([, value]) => value);
}

export default function CaseTimeline({ ctx }) {
  const cashlessCaseId = ctx?.caseState?.cashless_case_id || ctx?.cashlessCase?.cashless_case_id;
  const { picked, paneRef, openItem } = useCasePane("all");

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [actorFilter, setActorFilter] = useState("");
  const [bundleEvent, setBundleEvent] = useState(null);

  const load = useCallback(async () => {
    if (!cashlessCaseId) { setLoading(false); return; }
    setRefreshing(true);
    try {
      setData(await readTrail(cashlessCaseId));
      setError(null);
    } catch (err) {
      setError(err.message || "The audit trail could not be read.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [cashlessCaseId]);

  useEffect(() => {
    const timer = setTimeout(load, 0);
    return () => clearTimeout(timer);
  }, [load]);

  if (!cashlessCaseId) {
    return <EmptyState
        title="No case yet"
        description="The audit trail lists every request and payer answer once the case starts. Start on the Policy step."
      />;
  }
  if (loading) return <LoadingBlock text="Loading audit trail…" />;
  if (error && !data) {
    return (
      <NextStep
        tone="bad"
        title="The audit trail could not be read"
        actions={<button type="button" className="cv-btn" disabled={refreshing} onClick={load}>Retry</button>}
      >
        {error} The case itself is not affected.
      </NextStep>
    );
  }

  // Newest first; seq is the only order the backend guarantees.
  const all = [...(data?.events || [])].sort((a, b) => (b.seq ?? 0) - (a.seq ?? 0));
  const failures = all.filter(isFailed).length;
  const verify = all.filter(needsVerify).length;
  const lanes = [...new Set(all.map((e) => e.workflow))].map((id) => {
    const inLane = all.filter((e) => e.workflow === id);
    return { id, label: WORKFLOW_LABELS[id] || id, count: inLane.length, failures: inLane.filter(isFailed).length };
  });
  const ledgerRows = reconciliationRows(data?.money_ledger);
  const payable = data?.money_ledger?.reconciliation?.to_collect_from_patient ?? data?.money_ledger?.patient_payable?.value;

  const groups = buildTimelineChecklist({
    total: all.length,
    failures,
    verify,
    lanes,
    money: ledgerRows.length > 0 ? (payable != null ? `${money(payable)} patient` : `${ledgerRows.length} lines`) : null,
  });
  const open = firstTimelineItem(groups, picked);
  const inView = (e) => {
    if (open === "failures") return isFailed(e);
    if (open === "verify") return needsVerify(e);
    return !open.startsWith("wf:") || e.workflow === open.slice(3);
  };
  const scoped = all.filter(inView);
  const events = scoped.filter((e) => !actorFilter || actorOf(e) === actorFilter);
  const actorCount = (kind) => (kind ? scoped.filter((e) => actorOf(e) === kind).length : scoped.length);
  const tone = failures ? "bad" : verify ? "warn" : "info";
  const paneTitle = open === "all" ? "All events" : open === "failures" ? "Failures" : open === "verify" ? "To verify" : WORKFLOW_LABELS[open.slice(3)] || open.slice(3);

  return (
    <div className="cv-elig">
      <PageActions>
        <Button variant="outline" size="small" icon={RefreshCw} disabled={refreshing} onClick={load}>
          {refreshing ? "Refreshing…" : "Refresh"}
        </Button>
      </PageActions>

      <div className={`cv-notice cv-verdict is-${tone}`}>
        <div className="cv-verdict-row">
          <StageBar ctx={ctx} />
          <span className={`cv-chip is-${tone}`}>{failures ? `${failures} failed` : verify ? `${verify} to verify` : all.length ? "No failures" : "No events yet"}</span>
          <span className="cv-notice-body">
            {all.length > 0 ? <><strong>{all.length}</strong> events · last {formatDateTime(all[0].ts)}</> : "Requests and payer answers appear here as the case moves."}
          </span>
        </div>
        {error && <div className="cv-notice-hint cv-verdict-note is-bad"><strong>Not updated:</strong> {error}</div>}
      </div>

      {all.length > 0 && (
        <div className="cv-work">
          <CaseChecklist groups={groups} open={open} onOpen={openItem} label="Audit trail filters" />

          <div className="cv-work-pane" ref={paneRef}>
            {open === "money" ? (
              <section className="cv-card" aria-label="Reconciliation">
                <div className="cv-card-head"><h2 className="cv-card-title">Reconciliation</h2></div>
                <div className="cv-card-body">
                  {ledgerRows.map(([label, value]) => (
                    <div key={label} className="cv-kv"><span>{label}</span><span>{value}</span></div>
                  ))}
                </div>
              </section>
            ) : (
              <section className="cv-card" aria-label={paneTitle}>
                <div className="cv-card-head">
                  <h2 className="cv-card-title">{paneTitle}</h2>
                  <div className="wq-chips">
                    {ACTORS.map((a) => (
                      <button key={a.value} type="button" className={`wq-chip${actorFilter === a.value ? " is-on" : ""}`} onClick={() => setActorFilter(a.value)}>
                        {a.label} <span className="wq-chip-count">{actorCount(a.value)}</span>
                      </button>
                    ))}
                  </div>
                </div>
                {events.length === 0 ? (
                  <p className="cv-card-intro">No events match this filter.</p>
                ) : (
                  <div className="cv-tw cv-in-card">
                    <table className="tl-table">
                      <thead>
                        <tr>
                          <th style={{ width: 200 }}>When</th>
                          <th>Event</th>
                          <th style={{ width: 170 }}>By</th>
                          <th style={{ width: 96 }} aria-label="FHIR bundle" />
                        </tr>
                      </thead>
                      <tbody>
                        {events.map((e) => {
                          const failed = isFailed(e);
                          const DirIcon = e.direction === "outbound" ? ArrowUpRight : e.direction === "inbound" ? ArrowDownLeft : null;
                          return (
                            <tr key={e.id} className={failed ? "is-failed" : undefined}>
                              <td className="tl-when">{formatDateTime(e.ts)}</td>
                              <td className="tl-event">
                                <div className="ep-strong">
                                  {e.title}
                                  {failed && <span className="is-bad"> · {failureLabel(e)}</span>}
                                </div>
                                <EventFacts event={e} />
                              </td>
                              <td>
                                <span className="tl-actor" title={e.direction ? `${e.direction} message` : undefined}>
                                  {DirIcon && <DirIcon size={13} />}
                                  {e.actor?.name || ACTOR_LABELS[actorOf(e)]}
                                </span>
                                <div className="cv-card-meta">{WORKFLOW_LABELS[e.workflow] || e.workflow}{e.stage ? ` · ${words(e.stage)}` : ""}</div>
                              </td>
                              <td>
                                {BUNDLE_WORKFLOWS.has(e.workflow) && e.correlation_id && (
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
              </section>
            )}
          </div>
        </div>
      )}

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
