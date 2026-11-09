import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { ArrowRight, RefreshCw, PlusCircle, X, Wifi, Send, MessageSquare } from "lucide-react";
import { NextStep, Tip } from "../Common";
import { formatDate, formatDateTime, formatMoney, humanize } from "../../format.js";
import { useCaseLock } from "../../hooks/useCaseLock";
import { usePreauthDecision } from "../../hooks/usePreauthDecision";
import { useCasePane } from "../case/useCasePane";
import CaseStep, { Pane, Verdict } from "../case/CaseStep";
import AdjudicationTable from "../case/AdjudicationTable";
import PayerWords from "../case/PayerWords";
import TechnicalDetails from "../case/TechnicalDetails";
import AnswerPayerQuery from "../case/AnswerPayerQuery";
import ResubmitPreauthDrawer from "../case/ResubmitPreauthDrawer";
import CancelPreauthModal from "../case/CancelPreauthModal";
import PayrErrorList from "../PayrErrorList";
import SendCommunicationModal, { OUTBOUND_COMMUNICATIONS_ENABLED } from "../SendCommunicationModal";
import { buildApprovalChecklist, firstApprovalItem } from "../case/approvalChecklist";

const SOFT_WARNING_MS = 120_000;
const GATEWAY_RECOVERY_MS = 300_000;
const READ_ONLY_NOTICE = "The claim has gone to the payer, so the pre-auth is read only: no enhancement or change can be made. It can only be cancelled while the payer is deciding the claim.";

const minutes = (ms) => Math.max(1, Math.round((ms || 0) / 60000));

const netAmountOf = (claimItem, adj) => {
  if (claimItem?.net_amount != null) return claimItem.net_amount;
  const unit = claimItem?.unit_price ?? claimItem?.amount;
  if (unit != null) return (claimItem?.quantity ?? 1) * unit;
  return adj?.submitted?.value ?? null;
};

export default function PreauthStatus({ ctx }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { caseState, cashlessCase, communications, caseClosed } = ctx;
  const { claim_id, cashless_case_id, draftData } = caseState;
  const lock = useCaseLock(ctx, "status");
  const p = usePreauthDecision(ctx);
  const pane = useCasePane();
  const [queryOpen, setQueryOpen] = useState(false);
  const [resubmitOpen, setResubmitOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [messageOpen, setMessageOpen] = useState(false);
  const [autoActionDismissed, setAutoActionDismissed] = useState(false);

  const data = p.data;
  const view = p.view;
  const decision = view.decision;
  const isFailed = view.phase === "failed";
  const isNotFound = view.phase === "not_found";
  const isComplete = view.phase === "decided";
  const isApproved = decision === "APPROVED";
  const isPartial = decision === "PARTIALLY_APPROVED";
  const isQueried = decision === "QUERIED";
  const isRejected = decision === "REJECTED";
  const isCancelled = decision === "CANCELLED";
  const isUnknown = isComplete && (!decision || decision === "UNKNOWN");
  const ambiguous = isComplete && !isUnknown && p.ambiguous;
  const purposeCancel = data?.purpose === "cancel";

  const autoAction = location.state?.openAction;
  useEffect(() => {
    if (autoAction === "resubmit_enhancement" && (isApproved || isPartial)) navigate("../enhancement", { replace: true });
  }, [autoAction, isApproved, isPartial, navigate]);
  const autoQuery = !autoActionDismissed && autoAction === "respond_preauth_query" && isQueried && p.canAnswer;
  const autoResubmit = !autoActionDismissed && autoAction === "resubmit_preauth" && (isRejected || isQueried || isPartial) && p.canAnswer;

  const totals = data?.totals || {};
  const approvedValue = totals.benefit?.value ?? totals.eligible?.value ?? null;
  const requestedValue = totals.submitted?.value ?? null;
  const adjItems = data?.items || [];
  const deductibleTotal = adjItems.reduce((sum, it) => sum + (Number(it.adjudication?.deductible?.value) || 0), 0);
  const notEligible = requestedValue != null && totals.eligible?.value != null ? requestedValue - totals.eligible.value : null;
  const statement = [
    { label: "Requested", value: requestedValue },
    notEligible > 0 && { label: "Disallowed", value: -notEligible, note: adjItems.map((it) => it.adjudication?.eligible?.reason).filter(Boolean).join(", ") },
    totals.copay?.value > 0 && { label: "Co-payment", value: -totals.copay.value, note: totals.copay.reason },
    deductibleTotal > 0 && { label: "Deductible", value: -deductibleTotal },
    { label: "Approved", value: approvedValue, total: true },
  ].filter(Boolean);

  const named = data?.claim_items || [];
  const names = {};
  adjItems.forEach((item, i) => {
    const claimItem = named.find((c) => c.sequence === item.sequence) || named[i] || draftData?.editedItems?.[i] || draftData?.items?.[i] || null;
    if (claimItem) names[item.sequence ?? i + 1] = claimItem.service_name || claimItem.name || claimItem.description;
  });
  const lines = adjItems.map((item, i) => {
    const claimItem = named.find((c) => c.sequence === item.sequence) || named[i] || null;
    const adj = item.adjudication || {};
    return {
      ...item,
      service_name: names[item.sequence ?? i + 1],
      service_code: claimItem?.service_code || claimItem?.code || null,
      adjudication: { ...adj, submitted: adj.submitted ?? (netAmountOf(claimItem, adj) != null ? { value: netAmountOf(claimItem, adj) } : undefined) },
    };
  });

  const pendingTasks = data?.pending_tasks ?? [];
  const queryTask = pendingTasks.find((t) => t.task_type === "respond_preauth_query") || null;
  const relatedComms = (communications || []).filter((c) => !c.provider_read || c.pending_tasks?.length);
  const showSoftWarning = p.waiting && p.elapsedMs > SOFT_WARNING_MS;
  const showGatewayRecovery = p.waiting && p.elapsedMs > GATEWAY_RECOVERY_MS;

  const guide = isFailed
    ? { tone: "bad", title: "The payer never received this pre-auth", steps: ["Read the reason in the Delivery pane.", "Go back to the pre-auth draft, fix what it names, and send again."] }
    : isNotFound
      ? { tone: "warn", title: "The payer's system has no record of this request yet", text: "Check again in a while. If it stays like this, ask NHCX where it stands or call the payer's helpdesk." }
      : !isComplete
        ? { tone: "info", title: purposeCancel ? "The payer is processing the cancellation" : "The payer is deciding", text: "Private insurers must answer a pre-auth within 1 hour (IRDAI). You can leave this page; the decision appears here and in the Work Queue." }
        : isUnknown
          ? { tone: "warn", title: "The payer's answer isn't clear", steps: ["Press Check again.", "If it stays unclear, ask NHCX where it stands or call the payer's helpdesk."] }
          : isApproved
            ? { tone: "ok", title: "Approved: go ahead with treatment", steps: ["Treat within the approved amount.", "If treatment will cost more, ask for an enhancement before discharge.", "When the patient is discharged, continue to Claim."] }
            : isPartial
              ? { tone: "warn", title: "Approved for less than you asked", steps: ["See Amounts for what the payer cut and why.", "Tell the patient they may have to pay the difference.", "If you can justify more, ask for an enhancement and attach the reason."] }
              : isQueried
                ? { tone: "warn", title: "The payer has a question", steps: ["Read the payer's note to see what it needs.", "Press Answer the query and attach the documents or details it asks for.", "The decision waits until you answer, so reply quickly."] }
                : isRejected
                  ? { tone: "bad", title: "Rejected", steps: ["Read the payer's reason under Payer notes.", "If you can fix it, such as a missing document or a wrong code, press Resubmit.", "If not, tell the patient. They can continue as a cash patient."] }
                  : isCancelled
                    ? { tone: "info", title: "Cancelled", text: "This pre-auth was withdrawn. If the patient is admitted again, start a new case." }
                    : { tone: "warn", title: "Cancellation refused", text: "The payer refused the cancellation, so this pre-auth still stands." };

  const chipTone = isFailed ? "bad" : isNotFound ? "warn" : !isComplete ? "info" : isUnknown || ambiguous ? "warn" : view.tone === "wait" ? "info" : view.tone;
  const chipLabel = isFailed ? "Not delivered" : isNotFound ? "No record" : !isComplete ? (purposeCancel ? "Awaiting cancellation" : "Awaiting payer") : isUnknown ? "Unclear answer" : ambiguous ? `${view.word}, verify` : view.word;

  const primary = isFailed
    ? { label: "Back to pre-auth draft", write: false, onClick: () => navigate("../review") }
    : !isComplete
      ? null
      : isApproved || isPartial
        ? { label: "Continue to claim", icon: ArrowRight, write: false, onClick: () => navigate("../claim", { state: { claim_id: data?.claim_id || caseState.claim_id } }) }
        : isQueried && p.canAnswer
          ? { label: "Answer the query", icon: Send, onClick: () => setQueryOpen(true) }
          : isRejected && p.canAnswer
            ? { label: "Resubmit the pre-auth", icon: Send, onClick: () => setResubmitOpen(true) }
            : isUnknown
              ? { label: p.checking ? "Checking…" : "Check again", icon: RefreshCw, write: false, busy: p.checking, onClick: p.refresh }
              : null;

  const secondary = [
    !isComplete && !isFailed && { label: p.checking ? "Checking…" : "Check again", icon: RefreshCw, write: false, busy: p.checking, onClick: p.refresh },
    (isNotFound || showGatewayRecovery || isUnknown) && p.canEnquire && !p.enquiryId && { label: p.askGateway.busy ? "Asking…" : "Ask NHCX where it stands", icon: Wifi, busy: p.askGateway.busy, onClick: p.askGateway.run },
    isComplete && (isApproved || isPartial) && !caseClosed && !p.claimWithPayer && { label: "Ask for more", icon: PlusCircle, write: false, onClick: () => navigate("../enhancement") },
  ];
  const more = [
    isComplete && (isQueried || isPartial) && p.canAnswer && !isRejected && { label: "Resubmit the pre-auth", onClick: () => setResubmitOpen(true) },
    isComplete && (isQueried || isRejected || isPartial) && OUTBOUND_COMMUNICATIONS_ENABLED && { label: "Message the payer", icon: MessageSquare, onClick: () => setMessageOpen(true) },
    p.resolvedCaseId && (isComplete || isFailed) && !caseClosed && { label: p.recheck.busy ? "Re-checking eligibility…" : "Re-check eligibility", icon: RefreshCw, busy: p.recheck.busy, onClick: p.recheck.run },
    p.canCancel && { label: "Cancel the pre-auth", icon: X, danger: true, onClick: () => setCancelOpen(true) },
  ];

  const notes = [
    isFailed && { tone: "bad", text: `The pre-auth could not be delivered to the payer. ${view.message || ""}` },
    p.cancelRefused && { tone: "warn", text: "The payer refused the cancellation, so this pre-auth still stands." },
    p.claimWithPayer && { tone: "info", text: READ_ONLY_NOTICE },
    lock.viewOnly && { tone: "info", text: lock.reason },
    ambiguous && { tone: "warn", text: "Verify this answer with the payer: its raw response does not corroborate the decision shown." },
    p.askGateway.error && { tone: "warn", text: p.askGateway.error },
    p.recheck.error && { tone: "warn", text: p.recheck.error },
    p.cancel.error && !cancelOpen && { tone: "bad", text: p.cancel.error },
    p.pollError && { tone: "warn", text: `The last check failed, and this page keeps trying: ${p.pollError}` },
    ...(location.state?.preauthWarnings || caseState.draftWarnings || []).map((w) => ({ tone: "warn", text: w })),
    !isFailed && (p.canAnswer || !(isQueried || isRejected)) && (guide.tone === "warn" || guide.tone === "bad") && { tone: guide.tone === "bad" ? "warn" : guide.tone, text: guide.steps?.join(" ") || [guide.title, guide.text].filter(Boolean).join(". ") },
  ];
  const tipText = guide.tone === "ok" || guide.tone === "info" ? guide.steps?.join(" ") || guide.text : null;

  const clinicalCount = (data?.diagnoses?.length || 0) + (data?.procedures?.length || 0);
  const groups = buildApprovalChecklist({
    failed: isFailed,
    notFound: isNotFound,
    complete: isComplete,
    approved: approvedValue,
    lines: adjItems,
    notes: data?.process_notes?.length || 0,
    readNotes: isQueried || isRejected,
    clinical: clinicalCount,
    enquiry: p.enquiryId ? (p.enquiry?.status === "failed" ? "failed" : p.enquiry?.status === "complete" ? "answered" : "waiting") : null,
    errors: data?.errors?.length || 0,
  });
  const open = pane.picked && groups.some((g) => g.rows.some((r) => r.id === pane.picked)) ? pane.picked : firstApprovalItem(groups, isQueried || isRejected);

  const summary = isComplete && (isApproved || isPartial) && approvedValue != null ? (
    <>
      <strong>{formatMoney(approvedValue)}</strong>
      {requestedValue != null ? ` of ${formatMoney(requestedValue)} requested` : " approved"}
    </>
  ) : p.waiting ? (
    `Sent ${data?.submitted_at ? formatDateTime(data.submitted_at) : "just now"} · waiting ${minutes(p.elapsedMs)} min · checking automatically`
  ) : null;

  if (!p.correlationId) {
    return (
      <CaseStep ctx={ctx} verdict={<Verdict ctx={ctx} chip="Not sent" chipTone="todo" summary="No pre-auth has been sent for this case." />} checklist={[]} open="none" onOpen={() => {}}>
        <Pane id="none">
          <NextStep
            tone="info"
            title="No pre-auth found for this case"
            actions={
              <>
                <button type="button" className="cv-btn is-primary" onClick={() => navigate("../review")}>
                  Open the pre-auth draft
                </button>
                {cashless_case_id && (
                  <button type="button" className="cv-btn" onClick={p.recover}>
                    Check again
                  </button>
                )}
              </>
            }
          >
            If a pre-auth was sent earlier, its answer appears here and in the Work Queue once the payer responds. Otherwise, send one from the pre-auth draft.
          </NextStep>
        </Pane>
      </CaseStep>
    );
  }

  return (
    <>
      <CaseStep
        ctx={ctx}
        verdict={
          <Verdict ctx={ctx} chip={chipLabel} chipTone={chipTone} summary={summary} notes={notes} primary={primary} secondary={secondary} more={more}>
            {tipText && <Tip className="cv-verdict-note">{tipText}</Tip>}
          </Verdict>
        }
        checklist={groups}
        open={open}
        onOpen={pane.openItem}
        checklistLabel="Approval checklist"
        paneRef={pane.paneRef}
      >
        <Pane id="record">
          <section className="cv-card">
            <div className="cv-card-head">
              <h2 className="cv-card-title">No answer on record</h2>
            </div>
            <div className="cv-card-intro">The payer's system has not registered this request yet. It usually appears within a few minutes.</div>
            <div className="cv-card-body">
              <TechnicalDetails ids={[{ label: "Request id", value: p.correlationId }]} />
            </div>
          </section>
        </Pane>
        <Pane id="delivery">
          <section className="cv-card">
            <div className="cv-card-head">
              <h2 className="cv-card-title">Not delivered</h2>
            </div>
            <div className="cv-card-body">
              <div className="cv-kv"><span>Reason</span><span>{view.message || "No reason given"}</span></div>
              {data?.errors?.length > 0 && <div className="cv-sub-note-top"><PayrErrorList errors={data.errors} /></div>}
              <TechnicalDetails ids={[{ label: "Request id", value: p.correlationId }]} bundle={p.resolvedCaseId ? { cashlessCaseId: p.resolvedCaseId, transactionType: "preauth", correlationId: p.correlationId } : null} />
            </div>
          </section>
        </Pane>
        <Pane id="waiting">
          <section className="cv-card">
            <div className="cv-card-head">
              <h2 className="cv-card-title">{p.cachedDecision ? "Loading the payer's answer" : "Waiting for the payer"}</h2>
            </div>
            <div className="cv-card-body">
              <div className="cv-kv"><span>Sent</span><span>{data?.submitted_at ? formatDateTime(data.submitted_at) : "—"}</span></div>
              <div className="cv-kv"><span>Waiting for</span><span>{minutes(p.elapsedMs)} min</span></div>
              <div className="cv-kv"><span>Last checked</span><span>{p.lastCheckedAt ? formatDateTime(new Date(p.lastCheckedAt)) : "—"}</span></div>
              {showSoftWarning && (
                <div className="cv-notice is-info cv-sub-note-top">
                  <div className="cv-notice-body">Payer decisions can take minutes to hours. You can leave this page; the answer appears in the Work Queue when it arrives.</div>
                </div>
              )}
              <TechnicalDetails ids={[{ label: "Request id", value: p.correlationId }]} bundle={p.resolvedCaseId ? { cashlessCaseId: p.resolvedCaseId, transactionType: "preauth", correlationId: p.correlationId } : null} />
            </div>
          </section>
        </Pane>
        <Pane id="amounts">
          <section className="cv-card">
            <div className="cv-card-head">
              <h2 className="cv-card-title">Amounts</h2>
              <span className="cv-card-meta">What you asked for, what the payer cut and why, and what it approved.</span>
            </div>
            <div className="cv-card-body">
              {statement.map((r) => (
                <div key={r.label} className={`cv-kv${r.total ? " is-total" : ""}`}>
                  <span>
                    {r.label}
                    {r.note && <span className="cv-card-meta"> · {r.note}</span>}
                  </span>
                  <span className="money">{r.value == null ? "—" : r.value < 0 ? `− ${formatMoney(-r.value)}` : formatMoney(r.value)}</span>
                </div>
              ))}
            </div>
          </section>
        </Pane>
        <Pane id="lines">
          <section className="cv-card">
            <div className="cv-card-head">
              <h2 className="cv-card-title">Line by line</h2>
              <span className="cv-card-meta">The payer's answer for each line of the request.</span>
            </div>
            <div className="cv-in-card cv-sub-note-top">
              <AdjudicationTable items={lines} totals={totals} names={names} />
            </div>
          </section>
        </Pane>
        <Pane id="notes">
          <section className="cv-card">
            <div className="cv-card-head">
              <h2 className="cv-card-title">Payer notes</h2>
              <span className="cv-card-meta">The payer's own words. Read these first when a pre-auth is queried, cut or rejected.</span>
            </div>
            <div className="cv-card-body">
              <PayerWords notes={data?.process_notes} />
            </div>
          </section>
        </Pane>
        <Pane id="clinical">
          <section className="cv-card">
            <div className="cv-card-head">
              <h2 className="cv-card-title">Clinical basis</h2>
            </div>
            <div className="cv-card-body">
              {(data?.diagnoses || []).map((d, i) => (
                <div key={`d-${i}`} className="cv-kv">
                  <span>{i === 0 ? "Diagnoses" : ""}</span>
                  <span>
                    {d.name}
                    {d.primary ? " (principal)" : ""} <span className="cv-mono cv-card-meta">{d.code}</span>
                  </span>
                </div>
              ))}
              {(data?.procedures || []).map((pr, i) => (
                <div key={`p-${i}`} className="cv-kv">
                  <span>{i === 0 ? "Procedures" : ""}</span>
                  <span>
                    {pr.name}
                    {pr.date ? ` · ${formatDate(pr.date)}` : ""} <span className="cv-mono cv-card-meta">{pr.code}</span>
                  </span>
                </div>
              ))}
            </div>
          </section>
        </Pane>
        <Pane id="enquiry">
          <section className="cv-card">
            <div className="cv-card-head">
              <h2 className="cv-card-title">Status enquiry</h2>
            </div>
            <div className="cv-card-body">
              {p.enquiry?.status === "failed" && (
                <div className="cv-notice is-bad cv-drawer-note">
                  <div className="cv-notice-body">The payer refused the enquiry. {p.enquiry.error_message || p.enquiry.errors?.[0]?.message || ""}</div>
                </div>
              )}
              {p.enquiryError && (
                <div className="cv-notice is-warn cv-drawer-note">
                  <div className="cv-notice-body">The payer's answer to the enquiry could not be checked, and this page keeps trying: {p.enquiryError}</div>
                </div>
              )}
              <div className="cv-kv"><span>Asked</span><span>{caseState.statusEnquiry?.asked_at ? formatDateTime(caseState.statusEnquiry.asked_at) : "—"}</span></div>
              <div className="cv-kv"><span>Payer's answer</span><span>{p.enquiry?.answer ? humanize(p.enquiry.answer) : ENQUIRY_WAIT(p.enquiry)}</span></div>
              <div className="cv-kv"><span>Detail</span><span>{p.enquiry?.detail || "—"}</span></div>
              <div className="cv-kv"><span>Answered</span><span>{p.enquiry?.answered_at ? formatDateTime(p.enquiry.answered_at) : "—"}</span></div>
              <TechnicalDetails ids={[{ label: "Enquiry id", value: p.enquiryId }]} />
            </div>
          </section>
        </Pane>
        <Pane id="errors">
          <section className="cv-card">
            <div className="cv-card-head">
              <h2 className="cv-card-title">Payer errors</h2>
            </div>
            <div className="cv-card-body">
              <PayrErrorList errors={data?.errors || []} />
            </div>
          </section>
        </Pane>
        <Pane id="response">
          <section className="cv-card">
            <div className="cv-card-head">
              <h2 className="cv-card-title">Payer response</h2>
              <span className="cv-card-meta">As received over NHCX. Useful for the IT team; you don't need it to act.</span>
            </div>
            <div className="cv-card-body">
              <div className="cv-kv"><span>Decision</span><span>{decision ? humanize(decision) : "—"}</span></div>
              <div className="cv-kv"><span>Pre-auth reference</span><span className="cv-mono">{data?.preauth_ref || "—"}</span></div>
              <TechnicalDetails
                summary="Raw payer signal"
                ids={[
                  { label: "Raw outcome", value: p.provenance?.raw_outcome ?? data?.outcome },
                  { label: "Reason codes", value: p.provenance?.reason_codes?.join(", ") },
                  { label: "Classified by", value: p.provenance?.classified_by },
                  { label: "NHCX workflow", value: p.provenance?.nhcx_workflow_id != null ? String(p.provenance.nhcx_workflow_id) : null },
                  { label: "Request id", value: p.correlationId },
                ]}
                bundle={p.resolvedCaseId ? { cashlessCaseId: p.resolvedCaseId, transactionType: "preauth", correlationId: p.correlationId } : null}
              />
            </div>
          </section>
        </Pane>
      </CaseStep>

      <AnswerPayerQuery
        open={queryOpen || autoQuery}
        onClose={() => {
          setQueryOpen(false);
          setAutoActionDismissed(true);
        }}
        title="Answer the payer's query"
        question={{ notes: data?.process_notes, description: queryTask?.description, requestedDocuments: queryTask?.required_documents, communications: relatedComms }}
        send={p.answerQuery}
        successMessage="Answer sent to the payer"
      />

      <ResubmitPreauthDrawer
        open={resubmitOpen || autoResubmit}
        onClose={() => {
          setResubmitOpen(false);
          setAutoActionDismissed(true);
        }}
        ctx={ctx}
        preauthRef={data?.preauth_ref}
        notes={data?.process_notes}
        onSent={(res) => p.restart(res.correlation_id)}
      />

      <CancelPreauthModal open={cancelOpen} onClose={() => setCancelOpen(false)} preauthRef={data?.preauth_ref} approvedAmount={approvedValue} cancel={p.cancel} />

      <SendCommunicationModal open={messageOpen} onClose={() => setMessageOpen(false)} defaultPayerId={caseState.payer?.code || cashlessCase?.payer_id || ""} defaultClaimReference={data?.preauth_ref || ""} claimId={claim_id} cashlessCaseId={cashless_case_id} />
    </>
  );
}

const ENQUIRY_WAIT = (enquiry) => (enquiry && ["complete", "failed", "not_found"].includes(enquiry.status) ? "—" : "Waiting for the payer");
