import { useState } from "react";
import { ArrowUpRight, ArrowDownLeft } from "lucide-react";
import { NextStep } from "../ui/Common";
import { formatMoney, formatDateTime, humanize } from "../../lib/format.js";
import { useCaseTrail } from "../../hooks/case/useCaseTrail";
import { useCasePane } from "../case/step/useCasePane";
import CaseStep, { Pane, Verdict } from "../case/step/CaseStep";
import TechnicalDetails from "../case/step/TechnicalDetails";
import { buildTimelineChecklist, firstTimelineItem } from "../case/frame/timelineChecklist";

const BUNDLE_WORKFLOWS = new Set(["preauth", "preauth_cancellation", "preauth_release", "preauth_nullification", "eligibility", "insurance_plan", "claim", "claim_search", "reprocess", "communication", "payment"]);
const BUNDLE_TRANSACTION_TYPE = { eligibility: "coverage_eligibility" };
const ACTORS = [
  { value: "", label: "Everyone" },
  { value: "hospital", label: "Hospital" },
  { value: "payer", label: "Payer" },
  { value: "system", label: "System" },
];
const ACTOR_LABELS = { hospital: "Hospital", payer: "Payer", system: "System" };
const WORKFLOW_LABELS = {
  case: "Case",
  insurance_plan: "Insurance plan",
  eligibility: "Eligibility",
  preauth: "Pre-auth",
  preauth_cancellation: "Pre-auth cancellation",
  preauth_release: "Pre-auth release",
  preauth_nullification: "Pre-auth nullification",
  claim: "Claim",
  claim_search: "Claim search",
  reprocess: "Reprocess",
  payment: "Payment",
  communication: "Message",
  note: "Internal note",
};
const DECISION_WORDS = { APPROVED: "Approved", PARTIALLY_APPROVED: "Partly approved", QUERIED: "Query raised", REJECTED: "Rejected", CANCELLED: "Cancelled", UNKNOWN: "Unclear" };

const money = (v) => (v == null ? null : formatMoney(v));
const isFailed = (e) => e.status === "failed" || !!e.error;
const needsVerify = (e) => !!e.decision?.ambiguous;
const actorOf = (e) => e.actor?.kind || "system";
const failureWord = (e) => (e.direction === "outbound" && e.error?.phase !== "payer" ? "never reached the payer" : e.error?.phase === "payer" ? "refused by the payer" : "failed");

function EventFacts({ event, bundle }) {
  const d = event.decision;
  const figure = event.money?.value != null ? `${money(event.money.value)} ${humanize(event.money.field || "").toLowerCase()}`.trim() : null;
  const snapshot = Object.entries(event.money?.snapshot || {})
    .filter(([k, v]) => k !== event.money?.field && v != null)
    .map(([k, v]) => `${humanize(k).toLowerCase()} ${money(v)}`);
  const reasons = (d?.reasons || []).map((r) => r.label || r.code).filter(Boolean);
  const refs = Object.entries(event.refs || {}).filter(([, v]) => v);
  const extras = [event.detail?.workflow_type && `${humanize(event.detail.workflow_type)} request`, event.detail?.priority && `${humanize(event.detail.priority)} priority`, event.detail?.category && humanize(event.detail.category)].filter(Boolean);
  return (
    <>
      {event.summary && <div className="cv-card-meta">{event.summary}</div>}
      {figure && (
        <div className="tl-line">
          <strong>{figure}</strong>
          {snapshot.length > 0 && <span className="cv-card-meta"> · {snapshot.join(" · ")}</span>}
        </div>
      )}
      {d && (d.derived_decision || d.ambiguous) && (
        <div className="tl-line">
          <strong>{DECISION_WORDS[String(d.derived_decision || "UNKNOWN").toUpperCase()] || humanize(d.derived_decision)}</strong>
          {reasons.length > 0 && <span> · {reasons.join("; ")}</span>}
          {d.ambiguous && <span className="tl-verify"> · Verify with the payer: its raw answer does not match this decision.</span>}
        </div>
      )}
      {event.error && (
        <div className="tl-line is-bad">
          {event.error.message || "No reason given"}
          {event.error.code ? <span className="cv-mono cv-card-meta"> {event.error.code}</span> : null}
        </div>
      )}
      {event.detail?.process_notes?.length > 0 && (
        <ul className="tl-notes">
          {event.detail.process_notes.map((n, i) => (
            <li key={i}>{typeof n === "string" ? n : n?.text}</li>
          ))}
        </ul>
      )}
      {extras.length > 0 && <div className="tl-line cv-card-meta">{extras.join(" · ")}</div>}
      <TechnicalDetails
        summary="Details"
        ids={[
          ...refs.map(([k, v]) => ({ label: humanize(k), value: v })),
          ...Object.entries(event.detail?.counts || {}).map(([k, v]) => ({ label: humanize(k), value: String(v) })),
          { label: "Raw outcome", value: d?.raw_outcome },
          { label: "Reason codes", value: d?.reason_codes?.length ? d.reason_codes.join(", ") : null },
          { label: "Classified by", value: d?.classified_by },
          { label: "Reason code", value: event.detail?.reason_code },
          { label: "Error phase", value: event.error?.phase },
          { label: "Correlation id", value: event.correlation_id },
          { label: "Request id", value: event.request_id },
          { label: "NHCX workflow", value: event.nhcx_workflow_id != null ? String(event.nhcx_workflow_id) : null },
        ]}
        bundle={bundle}
      />
    </>
  );
}

function reconciliationRows(ledger) {
  if (!ledger) return [];
  const payable = ledger.patient_payable;
  return [
    ...(ledger.authorized_ceiling?.components || []).map((c) => [`Authorised · ${c.ref || "auth"}`, c.value]),
    ["Eligible", ledger.eligible?.value],
    ["Co-payment", ledger.copay?.value],
    ["Deductible", ledger.deductible?.value],
    ["Disallowed", ledger.disallowed?.value],
    ["Billed above authorised", ledger.reconciliation?.variance_vs_authorized],
    [`Patient payable${payable?.formula ? ` (${payable.formula})` : ""}${payable?.confidence === "estimated" ? " · estimate" : ""}`, ledger.reconciliation?.to_collect_from_patient ?? payable?.value],
  ].filter(([, value]) => value != null);
}

export default function CaseTimeline({ ctx }) {
  const t = useCaseTrail(ctx);
  const pane = useCasePane("all");
  const [actorFilter, setActorFilter] = useState("");

  const all = [...t.events].sort((a, b) => (b.seq ?? 0) - (a.seq ?? 0));
  const failures = all.filter(isFailed).length;
  const verify = all.filter(needsVerify).length;
  const lanes = [...new Set(all.map((e) => e.workflow))].map((id) => {
    const inLane = all.filter((e) => e.workflow === id);
    return { id, label: WORKFLOW_LABELS[id] || humanize(id), count: inLane.length, failures: inLane.filter(isFailed).length };
  });
  const ledgerRows = reconciliationRows(t.ledger);
  const payable = t.ledger?.reconciliation?.to_collect_from_patient ?? t.ledger?.patient_payable?.value;

  const groups = all.length
    ? buildTimelineChecklist({ total: all.length, failures, verify, lanes, money: ledgerRows.length > 0 ? (payable != null ? `${money(payable)} due` : `${ledgerRows.length} lines`) : null })
    : [];
  const open = firstTimelineItem(groups, pane.picked);
  const inView = (e) => {
    if (open === "failures") return isFailed(e);
    if (open === "verify") return needsVerify(e);
    return !open.startsWith("wf:") || e.workflow === open.slice(3);
  };
  const scoped = all.filter(inView);
  const events = scoped.filter((e) => !actorFilter || actorOf(e) === actorFilter);
  const actorCount = (kind) => (kind ? scoped.filter((e) => actorOf(e) === kind).length : scoped.length);
  const paneTitle = open === "all" ? "All events" : open === "failures" ? "Failures" : open === "verify" ? "To verify" : WORKFLOW_LABELS[open.slice(3)] || humanize(open.slice(3));
  const partial = t.total != null && all.length < t.total;

  const chip = !t.caseId
    ? ["No case yet", "todo"]
    : t.error && !all.length
      ? ["Not loaded", "warn"]
      : failures
        ? [`${failures} failed`, "bad"]
        : verify
          ? [`${verify} to verify`, "warn"]
          : all.length
            ? ["No failures", "ok"]
            : ["No events yet", "todo"];
  const summary = all.length > 0 ? (
    <>
      <strong>{partial ? `${all.length} of ${t.total}` : all.length}</strong> events · last {formatDateTime(all[0].ts)}
    </>
  ) : t.caseId && !t.error ? (
    "Requests and payer answers appear here as the case moves."
  ) : null;
  const notes = [
    t.error && all.length > 0 && { tone: "warn", text: `The audit trail could not be refreshed, so what is shown may be out of date: ${t.error}` },
    partial && t.loadingMore && { tone: "info", text: `Loaded ${all.length} of ${t.total} events, reading the rest…` },
    partial && !t.loadingMore && { tone: "warn", text: `Only ${all.length} of ${t.total} events could be read. Refresh to try again.` },
  ];
  const verdict = <Verdict ctx={ctx} chip={chip[0]} chipTone={chip[1]} summary={summary} notes={notes} />;

  if (!t.caseId) {
    return (
      <CaseStep ctx={ctx} verdict={verdict} checklist={[]} open="none" onOpen={() => {}}>
        <Pane id="none">
          <NextStep tone="info" title="No case yet">
            The audit trail lists every request and payer answer once the case starts. Start on the Policy step.
          </NextStep>
        </Pane>
      </CaseStep>
    );
  }

  if (t.error && !all.length) {
    return <CaseStep ctx={ctx} verdict={verdict} checklist={[]} open="none" onOpen={() => {}} error={`The audit trail could not be read: ${t.error} The case itself is not affected.`} onRetry={t.refresh} />;
  }

  return (
    <CaseStep ctx={ctx} verdict={verdict} checklist={groups} open={open} onOpen={pane.openItem} checklistLabel="Audit trail filters" tabs={false} loading={t.loading} loadingText="Reading the audit trail…" paneRef={pane.paneRef}>
      <Pane id="money">
        <section className="cv-card" aria-label="Reconciliation">
          <div className="cv-card-head">
            <h2 className="cv-card-title">Reconciliation</h2>
            <span className="cv-card-meta">Paid and short amounts are on the Payment step.</span>
          </div>
          <div className="cv-card-body">
            {ledgerRows.map(([label, value]) => (
              <div key={label} className="cv-kv">
                <span>{label}</span>
                <span className="money">{formatMoney(value)}</span>
              </div>
            ))}
          </div>
        </section>
      </Pane>
      <Pane id="all">
        <section className="cv-card" aria-label={paneTitle}>
          <div className="cv-card-head">
            <h2 className="cv-card-title">{paneTitle}</h2>
            <span className="cv-card-tools" role="group" aria-label="Filter by who acted">
              {ACTORS.map((a) => (
                <button key={a.value} type="button" className="cv-fchip" aria-pressed={actorFilter === a.value} onClick={() => setActorFilter(a.value)}>
                  {a.label} · {actorCount(a.value)}
                </button>
              ))}
            </span>
          </div>
          {events.length === 0 ? (
            <p className="cv-card-intro">{all.length ? "No events match this filter." : "Requests and payer answers appear here as the case moves."}</p>
          ) : (
            <div className="cv-tw cv-in-card">
              <table className="tl-table">
                <thead>
                  <tr>
                    <th className="tl-when">When</th>
                    <th>Event</th>
                    <th className="tl-by">By</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((e) => {
                    const failed = isFailed(e);
                    const DirIcon = e.direction === "outbound" ? ArrowUpRight : e.direction === "inbound" ? ArrowDownLeft : null;
                    const bundle = BUNDLE_WORKFLOWS.has(e.workflow) && e.correlation_id && t.caseId ? { cashlessCaseId: t.caseId, transactionType: BUNDLE_TRANSACTION_TYPE[e.workflow] || e.workflow, correlationId: e.correlation_id } : null;
                    return (
                      <tr key={e.id} className={failed ? "is-failed" : undefined}>
                        <td className="tl-when">{formatDateTime(e.ts)}</td>
                        <td className="tl-event">
                          <div className="tl-title">
                            {e.title}
                            {failed && <span className="is-bad"> · {failureWord(e)}</span>}
                          </div>
                          <EventFacts event={e} bundle={bundle} />
                        </td>
                        <td className="tl-by">
                          <span className="tl-actor" title={e.direction ? `${e.direction} message` : undefined}>
                            {DirIcon && <DirIcon size={13} aria-hidden="true" />}
                            {e.actor?.name || ACTOR_LABELS[actorOf(e)]}
                          </span>
                          <div className="cv-card-meta">
                            {WORKFLOW_LABELS[e.workflow] || humanize(e.workflow)}
                            {e.stage ? ` · ${humanize(e.stage).toLowerCase()}` : ""}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </Pane>
    </CaseStep>
  );
}
