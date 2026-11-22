import BackButton from "../ui/BackButton";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, Send } from "lucide-react";
import { DocumentChecklist, NextStep, Tip } from "../ui/Common";
import { formatDateTime, formatMoney } from "../../lib/format.js";
import Dropdown from "../ui/Dropdown";
import { useCaseLock } from "../../hooks/case/useCaseLock";
import { useReprocess, REASON_CODES, reasonName } from "../../hooks/workflow/useReprocess";
import { useCasePane } from "../case/step/useCasePane";
import CaseStep, { Pane, Verdict } from "../case/step/CaseStep";
import AdjudicationTable from "../case/step/AdjudicationTable";
import PayerWords from "../case/step/PayerWords";
import TechnicalDetails from "../case/step/TechnicalDetails";
import ReviewSendModal from "../case/step/ReviewSendModal";
import DropToAttach from "../case/step/DropToAttach";
import { burst } from "../../lib/confetti";
import { buildReprocessChecklist, firstReprocessItem } from "../case/claim/reprocessChecklist";

const SOFT_WARNING_MS = 300_000;
const minutes = (ms) => Math.max(1, Math.round((ms || 0) / 60000));
const money = (v) => (v == null ? "—" : formatMoney(v));

function Card({ title, meta, chip, children }) {
  return (
    <section className="cv-card" aria-label={title}>
      <div className="cv-card-head">
        <h2 className="cv-card-title">{title}</h2>
        {chip}
        {meta && <span className="cv-card-meta">{meta}</span>}
      </div>
      {children}
    </section>
  );
}

function RejectionCard({ rejection }) {
  const has = rejection.notes.length > 0 || rejection.errors.length > 0 || rejection.reasonCodes.length > 0;
  return (
    <Card title="Why the payer rejected the claim" meta="Answer these points in your explanation.">
      <div className="cv-card-body">
        {has ? (
          <>
            <PayerWords notes={rejection.notes} errors={rejection.errors} empty="" />
            {rejection.reasonCodes.length > 0 && (
              <div className="cv-kv">
                <span>Reason codes</span>
                <span className="cv-mono">{rejection.reasonCodes.join(", ")}</span>
              </div>
            )}
          </>
        ) : (
          <div className="cv-card-meta">The rejection came without notes. Read the decision on the Claim step and the audit trail before you write.</div>
        )}
      </div>
    </Card>
  );
}

export default function ReprocessScreen({ ctx }) {
  const navigate = useNavigate();
  const lock = useCaseLock(ctx, "reprocess");
  const locked = lock.viewOnly || lock.settled;
  const r = useReprocess(ctx, { locked, onSent: burst });
  const pane = useCasePane();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const data = r.data;
  const view = r.view;
  const decision = view.decision;
  const isFailed = view.phase === "failed";
  const isNotFound = view.phase === "not_found";
  const isComplete = view.phase === "decided";
  const isAccepted = decision === "APPROVED";
  const isPartial = decision === "PARTIALLY_APPROVED";
  const isQueried = decision === "QUERIED";
  const isRejected = decision === "REJECTED";
  const isUnclear = isComplete && (!decision || decision === "UNKNOWN");
  const sent = !!r.correlationId;
  const toClaim = (openAction) => navigate("../claim", openAction ? { state: { openAction, claim_id: r.claimId, cashless_case_id: r.caseId } } : undefined);

  const groups = buildReprocessChecklist({
    sent,
    locked,
    reasonShort: REASON_CODES.find((c) => c.value === r.reasonCode)?.short,
    explained: !!r.explanation,
    attached: r.attached.length,
    failed: isFailed,
    notFound: isNotFound,
    complete: isComplete,
    decision,
    approved: r.approved,
    lines: r.lines,
    notes: view.notes.length + r.payerErrors.length,
    readNotes: isRejected || isQueried,
  });
  const blockers = groups.flatMap((g) => g.rows).filter((row) => row.blocks);
  const open = firstReprocessItem(groups, pane.picked);
  const canSend = !locked && !r.send.busy && !!r.explanation && !!r.claimId;

  const chip = r.loadError && !sent
    ? ["Not loaded", "warn"]
    : !sent && r.unavailable
      ? ["Not available", "todo"]
      : !sent
        ? locked
          ? ["Not sent", "todo"]
          : blockers.length > 0
            ? [`${blockers.length} needed before you can send`, "warn"]
            : ["Ready to send", "ok"]
        : isFailed
          ? ["Not delivered", "bad"]
          : isNotFound
            ? ["No record", "warn"]
            : !isComplete
              ? ["Waiting for the payer", "info"]
              : isUnclear
                ? ["Unclear answer", "warn"]
                : isAccepted
                  ? ["Appeal accepted", "ok"]
                  : isPartial
                    ? ["Partly accepted", "warn"]
                    : isQueried
                      ? ["Query raised", "warn"]
                      : ["Appeal rejected", "bad"];

  let primary = null;
  if (!sent && !r.unavailable && !r.loadError) {
    primary = {
      label: "Send appeal",
      icon: Send,
      busy: r.send.busy,
      busyLabel: "Sending…",
      disabled: !canSend,
      reason: !r.claimId ? "This case has no claim to appeal." : blockers.length ? `First: ${blockers.map((b) => b.name.toLowerCase()).join(", ")}.` : lock.reason,
      onClick: () => setConfirmOpen(true),
    };
  } else if (isFailed) {
    primary = { label: "Try again", icon: Send, onClick: r.startAnother };
  } else if (isAccepted || isPartial) {
    primary = { label: "Go to payment", icon: ArrowRight, write: false, onClick: () => navigate("../payment") };
  } else if (isQueried) {
    primary = { label: "Answer on the Claim step", icon: ArrowRight, write: false, onClick: () => toClaim("respond_claim_query") };
  } else if (isRejected && !r.unavailable) {
    primary = { label: "File another appeal", icon: Send, onClick: r.startAnother };
  }
  if (primary?.write !== false && locked) primary = null;

  const secondary = [
    { label: "Back to claim", icon: ArrowLeft, write: false, onClick: () => toClaim() },
    isPartial && !locked && { label: "Ask for the balance", write: false, onClick: () => toClaim("request_claim_release") },
  ];

  const notes = [
    r.send.error && { tone: "bad", text: `Not sent: ${r.send.error} Fix what the message names and send again; your draft is kept.` },
    lock.viewOnly && { tone: "info", text: lock.reason },
    r.loadError && { tone: "warn", text: `The case could not be read, so an appeal already sent may not show here: ${r.loadError}`, action: { label: "Retry", onClick: r.reload } },
    isFailed && { tone: "bad", text: `The appeal did not reach the payer. ${view.message || ""}`.trim() },
    isNotFound && { tone: "warn", text: "The payer has no record of this appeal yet. Refresh in a while, or look at the audit trail." },
    isUnclear && { tone: "warn", text: "The payer answered without a clear decision. Read its notes and the audit trail, and call its helpdesk if it stays unclear." },
    isQueried && { tone: "warn", text: "The payer has a question about the appeal. It is answered on the Claim step, and the decision waits until you do." },
    isRejected && { tone: "warn", text: "The payer kept its decision. You can appeal again with new evidence or contact the payer directly; if the decision stands, the patient may have to pay." },
    isPartial && { tone: "warn", text: "The payer accepted part of the appeal. See what it cut under Amounts; the rest can be asked for as a balance on the Claim step." },
    r.status.error && { tone: "warn", text: `The last check failed, and this page keeps trying: ${r.status.error}` },
    sent && !isComplete && !isFailed && !isNotFound && r.status.elapsedMs > SOFT_WARNING_MS && { tone: "info", text: "An appeal can take days. You can leave this page; the answer appears here and in the Work Queue." },
  ];
  const tipText = !sent && !r.unavailable && !locked
    ? "An appeal without new evidence is usually rejected again. Answer each point in the payer's rejection and attach what it asks for."
    : isAccepted
      ? "The payer accepted the appeal. Track the money on the Payment step."
      : null;

  const summary = sent && isComplete && r.approved != null ? (
    <>
      <strong>{money(r.approved)}</strong>
      {r.totals.submitted?.value != null ? ` of ${formatMoney(r.totals.submitted.value)} claimed` : " approved"}
    </>
  ) : sent && !isComplete && !isFailed && !isNotFound ? (
    `Sent ${data?.submitted_at ? formatDateTime(data.submitted_at) : r.send.result ? "just now" : "earlier"} · waiting ${minutes(r.status.elapsedMs)} min · checking automatically`
  ) : !sent && r.claimId ? (
    <>Appeal of claim <span className="cv-mono">{r.claimId}</span></>
  ) : null;

  const verdict = (
    <Verdict ctx={ctx} chip={chip[0]} chipTone={chip[1]} summary={summary} notes={notes} primary={primary} secondary={secondary}>
      {tipText && <Tip className="cv-verdict-note">{tipText}</Tip>}
    </Verdict>
  );

  if (!sent && r.unavailable && !r.loading) {
    return (
      <CaseStep ctx={ctx} verdict={verdict} checklist={[]} open="blocked" onOpen={() => {}}>
        <Pane id="blocked">
          <NextStep
            tone={lock.settled ? "info" : "warn"}
            title="Appeal not available"
            actions={
              r.claimLeg === "partial" && !locked ? (
                <button type="button" className="cv-btn is-primary" onClick={() => toClaim("request_claim_release")}>
                  Ask for the balance
                </button>
              ) : r.claimLeg === "queried" && !locked ? (
                <button type="button" className="cv-btn is-primary" onClick={() => toClaim("respond_claim_query")}>
                  Answer on the Claim step
                </button>
              ) : (
                <BackButton onClick={() => toClaim()}>Back to claim</BackButton>
              )
            }
          >
            {r.unavailable}
          </NextStep>
        </Pane>
      </CaseStep>
    );
  }

  const names = {};
  r.lines.forEach((line, i) => {
    names[line.sequence ?? i + 1] = line.service_name || line.name || `Line ${line.sequence ?? i + 1}`;
  });
  const statement = [
    { label: "Claimed", value: r.totals.submitted?.value },
    r.totals.eligible?.value != null && r.totals.submitted?.value != null && r.totals.submitted.value - r.totals.eligible.value > 0 && { label: "Disallowed", value: -(r.totals.submitted.value - r.totals.eligible.value) },
    r.totals.copay?.value > 0 && { label: "Co-payment", value: -r.totals.copay.value },
    { label: "Approved", value: r.approved, total: true },
  ].filter(Boolean);
  const bundle = r.caseId && r.correlationId ? { cashlessCaseId: r.caseId, transactionType: "reprocess", correlationId: r.correlationId } : null;

  return (
    <>
      <CaseStep
        ctx={ctx}
        verdict={verdict}
        checklist={groups}
        open={open}
        onOpen={pane.openItem}
        checklistLabel="Appeal checklist"
        sendStep
        loading={r.loading}
        loadingText="Reading the case…"
        paneRef={pane.paneRef}
      >
        <Pane id="reason">
          <div className="cv-pane-stack">
            <RejectionCard rejection={r.rejection} />
            <Card title="Reason for the appeal" meta="The payer sees this code with your explanation.">
              <div className="cv-card-body rp-reason">
                {locked ? <div className="cv-kv"><span>Reason</span><span>{reasonName(r.reasonCode)}</span></div> : <Dropdown compact ariaLabel="Appeal reason" value={r.reasonCode} options={REASON_CODES} onChange={r.setReasonCode} />}
              </div>
            </Card>
          </div>
        </Pane>

        <Pane id="explanation">
          <div className="cv-pane-stack">
            <RejectionCard rejection={r.rejection} />
            <Card title="Explanation" meta="Say in plain words why the payer should look again, and point to the evidence you attach.">
              <div className="cv-card-body">
                <textarea
                  className="cv-ctl cv-textarea cv-ctl-fill rp-explain"
                  aria-label="Explanation"
                  placeholder="Explain why the claim should be re-evaluated, answering the payer's notes…"
                  value={r.description}
                  readOnly={locked}
                  onChange={(e) => r.setDescription(e.target.value)}
                />
              </div>
            </Card>
          </div>
        </Pane>

        <Pane id="documents">
          <Card title="Documents" meta="Attach anything the payer's rejection asks for. Attached files stay while you move between steps; reloading the page drops them.">
            <div className="cv-card-body">
              {r.documents.error && (
                <div className="cv-notice is-bad cv-drawer-note" role="alert">
                  <div className="cv-notice-body">{r.documents.error}</div>
                </div>
              )}
              <DocumentChecklist
                documents={r.documents.documents}
                onUpload={(doc, uploaded) => r.documents.attach(r.documents.documents.indexOf(doc), uploaded)}
                onAddDocument={r.documents.addCustom}
                onRenameDocument={r.documents.rename}
                onRemoveDocument={r.documents.remove}
                readOnly={locked}
                hideSummary
              />
            </div>
          </Card>
        </Pane>

        <Pane id="decision">
          {isFailed ? (
            <Card title="Not delivered">
              <div className="cv-card-body">
                <div className="cv-kv"><span>Reason</span><span>{view.message || "The request did not reach the payer."}</span></div>
                {view.errors.length > 0 && (
                  <div className="cv-sub-note-top">
                    <PayerWords notes={[]} errors={view.errors} empty="" />
                  </div>
                )}
                <TechnicalDetails ids={[{ label: "Request id", value: r.correlationId }]} bundle={bundle} />
              </div>
            </Card>
          ) : isNotFound ? (
            <Card title="No answer on record">
              <div className="cv-card-intro">The payer's system has not registered this appeal yet. It usually appears within a few minutes.</div>
              <div className="cv-card-body">
                <TechnicalDetails ids={[{ label: "Request id", value: r.correlationId }]} bundle={bundle} />
              </div>
            </Card>
          ) : !isComplete ? (
            <Card title="Waiting for the payer" chip={<span className="cv-chip is-info">Waiting</span>}>
              <div className="cv-card-body">
                <div className="cv-kv"><span>Sent</span><span>{data?.submitted_at ? formatDateTime(data.submitted_at) : "—"}</span></div>
                <div className="cv-kv"><span>Waiting for</span><span>{r.status.elapsedMs == null ? "—" : `${minutes(r.status.elapsedMs)} min`}</span></div>
                <div className="cv-kv"><span>Last checked</span><span>{r.status.lastCheckedAt ? formatDateTime(new Date(r.status.lastCheckedAt)) : "checking now"}</span></div>
                <TechnicalDetails ids={[{ label: "Request id", value: r.correlationId }]} bundle={bundle} />
              </div>
            </Card>
          ) : (
            <Card title="Payer decision" meta={isUnclear ? "The payer answered without a clear decision." : undefined}>
              <div className="cv-card-body">
                <div className="cv-kv"><span>Decision</span><span>{isUnclear ? "Unclear" : chip[0]}</span></div>
                {r.approved != null && <div className="cv-kv"><span>Approved</span><span>{formatMoney(r.approved)}</span></div>}
                {(view.notes.length > 0 || r.payerErrors.length > 0) && (
                  <div className="cv-sub-note-top">
                    <PayerWords notes={view.notes} errors={r.payerErrors} />
                  </div>
                )}
                <TechnicalDetails
                  ids={[
                    { label: "Raw outcome", value: r.claimResponse?.outcome },
                    { label: "Request id", value: r.correlationId },
                  ]}
                  bundle={bundle}
                />
              </div>
            </Card>
          )}
        </Pane>

        <Pane id="amounts">
          <Card title="Amounts" meta="What was claimed, what the payer cut, and what it now approves.">
            <div className="cv-card-body">
              {statement.map((row) => (
                <div key={row.label} className={`cv-kv${row.total ? " is-total" : ""}`}>
                  <span>{row.label}</span>
                  <span className="money">{row.value == null ? "—" : row.value < 0 ? `− ${formatMoney(-row.value)}` : formatMoney(row.value)}</span>
                </div>
              ))}
            </div>
          </Card>
        </Pane>

        <Pane id="lines">
          <Card title="Line by line" meta="The payer's answer for each line of the claim after the appeal.">
            <div className="cv-in-card cv-sub-note-top">
              <AdjudicationTable items={r.lines} totals={r.totals} names={names} requestedLabel="Claimed" />
            </div>
          </Card>
        </Pane>

        <Pane id="notes">
          <Card title="Payer's notes" meta="The payer's own words. Read these first when an appeal is queried or rejected.">
            <div className="cv-card-body">
              <PayerWords notes={view.notes} errors={r.payerErrors} />
            </div>
          </Card>
        </Pane>

        <Pane id="details">
          <Card title="What was sent">
            <div className="cv-card-body">
              <div className="cv-kv"><span>Reason given</span><span>{r.sentReason ? reasonName(r.sentReason) : "—"}</span></div>
              {r.send.result && <div className="cv-kv"><span>Explanation</span><span>{r.explanation || "—"}</span></div>}
              {r.send.result && <div className="cv-kv"><span>Documents</span><span>{r.attached.length}</span></div>}
              <div className="cv-kv"><span>Sent</span><span>{data?.submitted_at ? formatDateTime(data.submitted_at) : "—"}</span></div>
              <TechnicalDetails ids={[{ label: "Request id", value: r.correlationId }]} bundle={bundle} />
            </div>
          </Card>
        </Pane>
      </CaseStep>

      <ReviewSendModal
        ctx={ctx}
        open={confirmOpen}
        sendLabel="Send appeal"
        facts={[
          ["Reason", reasonName(r.reasonCode)],
          ["Explanation", r.explanation.length > 120 ? `${r.explanation.slice(0, 120)}…` : r.explanation],
        ]}
        rows={groups.flatMap((g) => g.rows)}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => {
          setConfirmOpen(false);
          r.send.run();
        }}
      />

      <DropToAttach enabled={!sent && !locked && !r.loading} target="Documents" documents={r.documents} />
    </>
  );
}
