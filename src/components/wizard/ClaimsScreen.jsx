import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { ArrowRight, RefreshCw, Send, Wifi, MessageSquare, Wallet } from "lucide-react";
import { DocumentChecklist, NextStep, Tip } from "../Common";
import { formatCaseRef, formatDate, formatDateTime, formatMoney, humanize } from "../../format.js";
import { useCaseLock } from "../../hooks/useCaseLock";
import { useClaimWorkflow } from "../../hooks/useClaimWorkflow";
import { useSendGate } from "../../hooks/useSendGate";
import { useCasePane } from "../case/useCasePane";
import CaseStep, { Pane, Verdict } from "../case/CaseStep";
import AdjudicationTable from "../case/AdjudicationTable";
import PayerWords from "../case/PayerWords";
import TechnicalDetails from "../case/TechnicalDetails";
import AnswerPayerQuery from "../case/AnswerPayerQuery";
import PayerAsks from "../case/PayerAsks";
import BiometricCard from "../case/BiometricCard";
import PatientDetailsForm from "../case/PatientDetailsForm";
import DischargeDetailsPane from "../case/DischargeDetailsPane";
import DischargeResubmitDrawer from "../case/DischargeResubmitDrawer";
import ReleaseDrawer from "../case/ReleaseDrawer";
import SendGateModal from "../case/SendGateModal";
import ConfirmModal from "../ConfirmModal";
import SendMessageDrawer, { OUTBOUND_COMMUNICATIONS_ENABLED } from "../SendMessageDrawer";
import { fieldList } from "../case/fieldLabels";
import { firstClaimItem } from "../case/claimChecklist";

const SOFT_WARNING_MS = 180_000;
const GATEWAY_RECOVERY_MS = 600_000;

const minutes = (ms) => Math.max(1, Math.round((ms || 0) / 60000));
const money = (v) => (v == null ? "—" : formatMoney(v));

function Card({ title, meta, chip, tools, children }) {
  return (
    <section className="cv-card" aria-label={title}>
      <div className="cv-card-head">
        <h2 className="cv-card-title">{title}</h2>
        {chip}
        {meta && <span className="cv-card-meta">{meta}</span>}
        {tools && <span className="cv-card-tools">{tools}</span>}
      </div>
      {children}
    </section>
  );
}

function WaitingCard({ title, data, status, correlationId, bundle, onEnquire, enquiring, canEnquire }) {
  const long = status.elapsedMs > SOFT_WARNING_MS;
  return (
    <Card title={title} chip={<span className="cv-chip is-info">Waiting</span>}>
      <div className="cv-card-body">
        <div className="cv-kv"><span>Sent</span><span>{data?.submitted_at ? formatDateTime(data.submitted_at) : "—"}</span></div>
        <div className="cv-kv"><span>Waiting for</span><span>{status.elapsedMs == null ? "—" : `${minutes(status.elapsedMs)} min`}</span></div>
        <div className="cv-kv"><span>Last checked</span><span>{status.lastCheckedAt ? formatDateTime(new Date(status.lastCheckedAt)) : "checking now"}</span></div>
        {long && (
          <div className="cv-notice is-info cv-sub-note-top">
            <div className="cv-notice-body">Payer decisions can take minutes to hours. You can leave this page; the answer appears in the Work Queue when it arrives.</div>
          </div>
        )}
        {canEnquire && (
          <div className="cv-pane-action">
            <button type="button" className="cv-btn" disabled={enquiring} onClick={onEnquire}>
              <Wifi size={14} aria-hidden="true" />
              {enquiring ? "Asking…" : "Ask NHCX where it stands"}
            </button>
          </div>
        )}
        <TechnicalDetails ids={[{ label: "Request id", value: correlationId }]} bundle={bundle} />
      </div>
    </Card>
  );
}

function BillTable({ items, total, authorised, cumulative, excess }) {
  return (
    <div className="cv-tw cv-in-card">
      <table>
        <thead>
          <tr>
            <th>Service</th>
            <th className="is-num">Qty</th>
            <th className="is-num">Unit price</th>
            <th className="is-num">Amount</th>
          </tr>
        </thead>
        <tbody>
          {(items || []).map((item, i) => (
            <tr key={`${item.service_code || item.service_name || "line"}-${i}`}>
              <td>
                <strong>{item.service_name}</strong>
                <div className="cv-card-meta">{[item.service_code, item.category].filter(Boolean).join(" · ")}</div>
              </td>
              <td className="is-num">{item.quantity}</td>
              <td className="is-num">{money(item.unit_price)}</td>
              <td className="is-num is-strong">{money(item.net_amount)}</td>
            </tr>
          ))}
          {!items?.length && (
            <tr>
              <td colSpan={4} className="cv-card-meta">No billable items on the final bill.</td>
            </tr>
          )}
          <tr className="is-total">
            <td colSpan={3}>Final bill</td>
            <td className="is-num">{money(total)}</td>
          </tr>
          {authorised != null && (
            <tr className="is-total">
              <td colSpan={3}>Authorised{cumulative ? " (pre-auth and enhancements)" : ""}</td>
              <td className="is-num">{money(authorised)}</td>
            </tr>
          )}
          {excess > 0 && (
            <tr className="is-total is-over">
              <td colSpan={3}>Above the authorised amount</td>
              <td className="is-num">+{formatMoney(excess)}</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export default function ClaimsScreen({ ctx }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { caseState, cashlessCase, communications, moneyLedger } = ctx;
  const lock = useCaseLock(ctx, "claim");
  const locked = lock.viewOnly || lock.settled;
  const [biometric, setBiometric] = useState(null);
  const pane = useCasePane();
  const c = useClaimWorkflow(ctx, {
    navState: location.state || {},
    biometric,
    locked,
    onDischargeSent: () => pane.setPicked("discharge"),
    onFinalSent: () => pane.setPicked("decision"),
  });
  const finalGate = useSendGate({ caseId: c.caseId, waived: c.warnAsks, label: "Final claim", onSend: c.sendFinal.run });
  const dischargeGate = useSendGate({ caseId: c.caseId, waived: c.warnAsks, label: "Discharge claim", onSend: c.sendDischarge.run });
  const [confirm, setConfirm] = useState(null);
  const [queryOpen, setQueryOpen] = useState(false);
  const [releaseOpen, setReleaseOpen] = useState(false);
  const [dischargeOpen, setDischargeOpen] = useState(false);
  const [messageOpen, setMessageOpen] = useState(false);
  const [autoDismissed, setAutoDismissed] = useState(false);

  const draft = c.draft;
  const data = c.final.data;
  const view = c.claimView;
  const autoAction = location.state?.openAction;
  const autoQuery = !autoDismissed && autoAction === "respond_claim_query" && c.isQueried && !locked;
  const autoRelease = !autoDismissed && autoAction === "request_claim_release" && (c.isApproved || c.isPartial) && !lock.viewOnly;
  const autoDischarge = !autoDismissed && autoAction === "resubmit_discharge_claim" && (c.dischargeRejected || c.dischargeQueried) && !locked;
  const dismissAuto = () => setAutoDismissed(true);

  const activeBlockers = c.dischargeNext ? c.dischargeBlockers : c.blockers;
  const sending = c.sendDischarge.busy || c.sendFinal.busy;
  const canEnquire = !!c.finalId && cashlessCase?.answers_status_enquiry !== false;
  const open = pane.picked && c.groups.some((g) => g.rows.some((r) => r.id === pane.picked)) ? pane.picked : firstClaimItem(c.groups, { finalSent: c.finalSent, locked, blockers: activeBlockers });
  const bundleFor = (type, id) => (c.caseId && id ? { cashlessCaseId: c.caseId, transactionType: type, correlationId: id } : null);

  const pendingTasks = data?.pending_tasks ?? cashlessCase?.pending_tasks ?? [];
  const queryTask = pendingTasks.find((t) => t.task_type === "respond_claim_query") || null;
  const relatedComms = (communications || []).filter((m) => !m.provider_read || m.pending_tasks?.length);

  const chip = c.error
    ? ["Draft not built", "warn"]
    : c.claimDecided
      ? [c.ambiguous ? `${view.word}, verify` : view.word, c.ambiguous ? "warn" : view.tone]
      : c.claimUnclear
        ? ["Unclear answer", "warn"]
        : view.phase === "not_found"
          ? ["No record", "warn"]
          : c.finalFailed
            ? ["Not delivered", "bad"]
            : c.finalSent
              ? ["Awaiting payer", "info"]
              : c.dischargeFailed
                ? ["Not delivered", "bad"]
                : c.dischargeRejected
                  ? ["Discharge rejected", "bad"]
                  : c.dischargeQueried
                    ? ["Discharge queried", "warn"]
                    : c.dischargeWaiting
                      ? ["Discharge with payer", "info"]
                      : locked
                        ? ["Not sent", "todo"]
                        : activeBlockers.length > 0
                          ? [`${activeBlockers.length} must be done`, "warn"]
                          : sending
                            ? ["Sending", "info"]
                            : ["Ready to send", "ok"];

  const blockReason = (rows) =>
    rows.length
      ? `First: ${rows.map((r) => r.name.toLowerCase()).join(", ")}.`
      : c.hisBlockers.length
        ? `The hospital records are missing ${fieldList(c.hisBlockers)}.`
        : !c.hasPreauthRef
          ? "The payer must approve the pre-auth first."
          : "Finish the marked items first.";

  let primary = null;
  if (c.error) {
    primary = { label: "Send final claim", icon: Send, disabled: true, reason: "The draft could not be built." };
  } else if (c.finalSent) {
    if (c.isApproved || c.isPartial) primary = { label: "View payment", icon: ArrowRight, write: false, onClick: () => navigate("../payment") };
    else if (c.isQueried) primary = { label: "Answer the query", icon: Send, onClick: () => setQueryOpen(true) };
    else if (c.isRejected) primary = { label: "Ask for a reprocess", icon: ArrowRight, write: false, onClick: () => navigate("../reprocess") };
    else if (c.claimUnclear || view.phase === "not_found") primary = { label: "Check again", icon: RefreshCw, write: false, busy: c.final.checking, busyLabel: "Checking…", onClick: c.final.refresh };
  } else if (c.dischargeQueried) {
    primary = { label: "Answer the discharge query", icon: Send, onClick: () => setDischargeOpen(true) };
  } else if (c.dischargeRejected) {
    primary = { label: "Resend the discharge claim", icon: Send, onClick: () => setDischargeOpen(true) };
  } else if (c.dischargeNext) {
    primary = {
      label: c.dischargeFailed ? "Send the discharge claim again" : "Send discharge claim",
      icon: Send,
      busy: c.sendDischarge.busy,
      busyLabel: "Sending…",
      disabled: c.dischargeBlockers.length > 0 || !c.canSend,
      reason: blockReason(c.dischargeBlockers),
      onClick: () => setConfirm("discharge"),
    };
  } else {
    primary = {
      label: c.finalFailed ? "Send the final claim again" : "Send final claim",
      icon: Send,
      busy: c.sendFinal.busy,
      busyLabel: "Sending…",
      disabled: c.blockers.length > 0 || !c.canSend || !c.finalAllowed,
      reason: !c.finalAllowed ? "Wait for the payer's answer on the discharge claim." : blockReason(c.blockers),
      onClick: () => setConfirm("final"),
    };
  }
  if (primary?.write !== false && locked) primary = null;

  const secondary = [
    c.finalWaiting && { label: "Check again", icon: RefreshCw, write: false, busy: c.final.checking, busyLabel: "Checking…", onClick: c.final.refresh },
    !c.finalId && c.dischargeWaiting && { label: "Check again", icon: RefreshCw, write: false, busy: c.discharge.checking, busyLabel: "Checking…", onClick: c.discharge.refresh },
    !c.finalId && c.dischargeView.phase === "not_found" && { label: "Check again", icon: RefreshCw, write: false, busy: c.discharge.checking, busyLabel: "Checking…", onClick: c.discharge.refresh },
    c.claimDecided && (c.isApproved || c.isPartial) && c.releaseOwed > 0 && !c.releaseId && !lock.viewOnly && { label: "Ask for the balance", icon: Wallet, onClick: () => setReleaseOpen(true) },
  ];
  const more = [
    canEnquire && (view.phase === "not_found" || c.claimUnclear || (c.finalWaiting && c.final.elapsedMs > GATEWAY_RECOVERY_MS)) && { label: "Ask NHCX where it stands", icon: Wifi, busy: c.askGateway.busy, busyLabel: "Asking…", onClick: c.askGateway.run },
    c.claimDecided && (c.isQueried || c.isRejected || c.isPartial) && OUTBOUND_COMMUNICATIONS_ENABLED && { label: "Message the payer", icon: MessageSquare, onClick: () => setMessageOpen(true) },
    c.claimDecided && (c.isApproved || c.isPartial) && c.releaseOwed > 0 && c.releaseId && !lock.viewOnly && { label: "Ask for the balance again", icon: Wallet, onClick: () => setReleaseOpen(true) },
  ];

  const releaseData = c.release.data;
  const notes = [
    c.sendDischarge.error && { tone: "bad", text: `Not sent: ${c.sendDischarge.error} Fix what the message names and send again.` },
    c.sendFinal.error && { tone: "bad", text: `Not sent: ${c.sendFinal.error} Fix what the message names and send again.` },
    finalGate.error && { tone: "bad", text: finalGate.error },
    dischargeGate.error && { tone: "bad", text: dischargeGate.error },
    c.askGateway.error && { tone: "warn", text: c.askGateway.error },
    lock.viewOnly && { tone: "info", text: lock.reason },
    !c.error && !c.hasPreauthRef && !c.docsLocked && draft && { tone: "warn", text: "The payer must approve the pre-auth before you can claim.", action: { label: "Open Approval", onClick: () => navigate("../status") } },
    c.hisBlockers.length > 0 && { tone: "warn", text: `The hospital records are missing ${fieldList(c.hisBlockers)}. Ask the doctor or billing desk to add it, then reload this page.` },
    ...(draft?.reminders || []).map((r) => ({ tone: "info", text: r.message })),
    c.dischargeRejected && { tone: "bad", text: "The payer rejected the discharge claim. No final claim exists yet, so there is nothing to appeal: correct it and send it again." },
    c.dischargeQueried && { tone: "warn", text: "The payer has a question about the discharge claim. The final claim cannot go until it is answered." },
    c.dischargeFailed && { tone: "bad", text: `The discharge claim did not reach the payer. ${c.dischargeView.message || ""}`.trim() },
    c.finalFailed && { tone: "bad", text: `The final claim did not reach the payer. ${view.message || ""}`.trim() },
    view.phase === "not_found" && { tone: "warn", text: "The payer's system has no record of this claim yet. Check again in a while, and call its helpdesk if it stays like this." },
    c.claimUnclear && { tone: "warn", text: "The payer answered without a clear decision. Read its response under Decision, and call its helpdesk if it is not clear." },
    c.ambiguous && { tone: "warn", text: "Verify this answer with the payer: its raw response does not corroborate the decision shown." },
    c.isPartial && {
      tone: "warn",
      text: c.dischargeIntimation
        ? "Approved for less than the bill. See what was cut under Decision. If the cut is wrong, ask for the balance with your reason; otherwise bill the patient the difference."
        : "Approved for less than the bill. See what was cut under Decision. If the cut is wrong, ask for the balance with your reason. A PMJAY beneficiary is never billed the difference.",
    },
    c.isQueried && { tone: "warn", text: "The payer has a question. The payment waits until you answer." },
    c.isRejected && { tone: "warn", text: "Read the payer's reason under Decision. If you disagree, ask for a reprocess with your evidence." },
    c.asksError && { tone: "warn", text: `The payer's asks could not be reloaded, so the list may be out of date: ${c.asksError}` },
    c.final.error && { tone: "warn", text: `The last check failed, and this page keeps trying: ${c.final.error}` },
    !c.finalId && c.discharge.error && { tone: "warn", text: `The last check failed, and this page keeps trying: ${c.discharge.error}` },
    c.releaseId && c.release.phase === "waiting" && { tone: "info", text: "The balance request is with the payer. Its answer appears under Decision and in the audit trail." },
    releaseData?.status === "complete" && { tone: releaseData.answer === "refused" ? "warn" : "info", text: `The payer answered the balance request: ${humanize(releaseData.answer || releaseData.decision || "see the audit trail")}${releaseData.detail ? `. ${releaseData.detail}` : ""}.` },
    releaseData?.status === "failed" && { tone: "warn", text: `The balance request was refused: ${releaseData.error_message || releaseData.message || "see the audit trail"}.` },
  ];

  const tipText = c.claimDecided && c.isApproved
    ? "Approved in full. The payer's payment notice lands on the Payment step; confirm it against the bank statement when it arrives."
    : !c.finalId && !c.error && draft && !locked && activeBlockers.length === 0 && !c.dischargeWaiting
      ? c.dischargeNext
        ? "Most payers need the discharge claim, with the discharge papers, before the final claim."
        : "Private insurers must decide a final claim within 3 hours (IRDAI)."
      : null;

  const summary = c.claimDecided && (c.isApproved || c.isPartial) ? (
    <>
      <strong>{money(c.claimApproved)}</strong>
      {c.claimRequested != null ? ` of ${formatMoney(c.claimRequested)} claimed` : " approved"}
    </>
  ) : c.claimDecided ? (
    <>
      <strong>{money(c.claimRequested)}</strong> claimed
    </>
  ) : c.finalWaiting ? (
    `Sent ${data?.submitted_at ? formatDateTime(data.submitted_at) : "just now"} · waiting ${minutes(c.final.elapsedMs)} min · checking automatically`
  ) : draft ? (
    <>
      <strong>{money(draft.total_amount)}</strong> final bill
      {c.authorizedCeiling != null ? ` · ${formatMoney(c.authorizedCeiling)} authorised` : ""}
    </>
  ) : null;

  const adjItems = data?.items || [];
  const named = data?.claim_items || [];
  const names = {};
  adjItems.forEach((item, i) => {
    const line = named.find((l) => l.sequence === item.sequence) || named[i] || draft?.items?.[(item.sequence ?? i + 1) - 1] || null;
    if (line) names[item.sequence ?? i + 1] = line.service_name || line.product_or_service?.display || line.name || line.service_code;
  });
  const deductibleTotal = adjItems.reduce((sum, it) => sum + (Number(it.adjudication?.deductible?.value) || 0), 0);
  const notEligible = c.claimRequested != null && c.claimTotals.eligible?.value != null ? c.claimRequested - c.claimTotals.eligible.value : null;
  const statement = [
    { label: "Claimed", value: c.claimRequested },
    notEligible > 0 && { label: "Disallowed", value: -notEligible, note: adjItems.map((it) => it.adjudication?.eligible?.reason).filter(Boolean).join(", ") },
    c.claimTotals.copay?.value > 0 && { label: "Co-payment", value: -c.claimTotals.copay.value, note: c.claimTotals.copay.reason },
    deductibleTotal > 0 && { label: "Deductible", value: -deductibleTotal },
    { label: "Approved", value: c.claimApproved, total: true },
  ].filter(Boolean);

  const dischargeData = c.discharge.data;
  const dischargeWord = c.dischargeRejected
    ? "Rejected"
    : c.dischargeFailed
      ? "Not delivered"
      : c.dischargeView.phase === "not_found"
        ? "No answer on record"
        : c.dischargeView.decision
          ? humanize(c.dischargeView.decision)
          : c.dischargeId
            ? "Sent"
            : "Not sent";

  const verdict = (
    <Verdict ctx={ctx} chip={chip[0]} chipTone={chip[1]} summary={summary} notes={notes} primary={primary} secondary={secondary} more={more}>
      {tipText && <Tip className="cv-verdict-note">{tipText}</Tip>}
    </Verdict>
  );

  if (!c.caseId && !c.claimId) {
    return (
      <CaseStep ctx={ctx} verdict={<Verdict ctx={ctx} chip="Not started" chipTone="todo" />} checklist={[]} open="none" onOpen={() => {}}>
        <Pane id="none">
          <NextStep
            tone="info"
            title="No claim for this case yet"
            actions={
              <button type="button" className="cv-btn is-primary" onClick={() => navigate("../status")}>
                Open Approval
              </button>
            }
          >
            A claim is built once the payer has approved the pre-auth. Check the Approval step first.
          </NextStep>
        </Pane>
      </CaseStep>
    );
  }

  return (
    <>
      <CaseStep
        ctx={ctx}
        verdict={verdict}
        checklist={c.groups}
        open={open}
        onOpen={pane.openItem}
        checklistLabel="Claim checklist"
        loading={c.loading && !draft}
        loadingText="Building the claim draft…"
        error={c.error}
        onRetry={c.reload}
        paneRef={pane.paneRef}
      >
        <Pane id="verify">
          <BiometricCard
            caseId={c.caseId}
            stage="Discharge"
            readOnly={c.docsLocked}
            onCard={setBiometric}
            onVerified={() => {
              pane.setPicked("verify");
              c.refreshAsks();
            }}
          />
        </Pane>

        {c.patientContextMissing.length > 0 && (
          <Pane id="details">
            <PatientDetailsForm
              claimId={draft?.claim_id || c.claimId}
              cashlessCaseId={c.caseId}
              missingFields={c.patientContextMissing}
              known={{ dob: draft?.patient?.dob, admission_date: draft?.admission_date, discharge_date: draft?.discharge_date, policy_number: draft?.policy_number }}
              locked={c.docsLocked}
              onResolved={(remaining) => {
                c.setMissingFields(remaining);
                if (remaining.length === 0) c.reload();
              }}
            />
          </Pane>
        )}

        {c.dischargeRules?.required && (
          <Pane id="left">
            <DischargeDetailsPane
              key={JSON.stringify(draft?.discharge || {})}
              claimId={draft?.claim_id || c.claimId}
              discharge={draft?.discharge}
              rules={c.dischargeRules}
              locked={c.docsLocked}
              onSaved={(remaining) => {
                pane.setPicked("left");
                c.setMissingFields(remaining);
                c.reload();
              }}
            />
          </Pane>
        )}

        <Pane id="stay">
          <Card title="Stay & pre-auth" meta="From the hospital records; fix any mistake there first.">
            <div className="cv-card-body cv-cols">
              <div>
                <div className="cv-kv"><span>Admitted</span><span>{draft?.admission_date ? formatDate(draft.admission_date) : "—"}</span></div>
                <div className="cv-kv"><span>Discharged</span><span>{draft?.discharge_date ? formatDate(draft.discharge_date) : "Not yet"}</span></div>
                {draft?.discharge_summary && (
                  <>
                    <div className="cv-kv"><span>Condition</span><span>{draft.discharge_summary.condition || "—"}</span></div>
                    <div className="cv-kv"><span>Advice</span><span>{draft.discharge_summary.advice || "—"}</span></div>
                    <div className="cv-kv"><span>Follow-up</span><span>{draft.discharge_summary.followup_on ? formatDate(draft.discharge_summary.followup_on) : "—"}</span></div>
                  </>
                )}
              </div>
              <div>
                <div className="cv-kv"><span>Pre-auth</span><span>{draft?.preauth_ref ? <span className="cv-mono">{draft.preauth_ref}</span> : "None approved"}</span></div>
                <div className="cv-kv"><span>Authorised</span><span>{money(c.authorizedCeiling)}</span></div>
                <div className="cv-kv"><span>Policy</span><span>{draft?.policy_number ? <span className="cv-mono">{draft.policy_number}</span> : "—"}</span></div>
              </div>
            </div>
          </Card>
        </Pane>

        <Pane id="justification">
          <Card title="Clinical justification" meta="Coded on the clinical note. The payer reads this to judge the bill.">
            <div className="cv-card-body">
              {c.justification.length ? (
                c.justification.map(([label, codes]) => (
                  <div key={label} className="cv-kv">
                    <span>{label}</span>
                    <span>{codes.map((code) => code.name || code.code).join(", ")}</span>
                  </div>
                ))
              ) : (
                <div className="cv-card-meta">No complaints, findings or tests are coded on the clinical note. Ask the doctor to complete it in the hospital system.</div>
              )}
            </div>
          </Card>
        </Pane>

        <Pane id="bill">
          <Card
            title="Final bill against the authorised amount"
            chip={c.overCeiling ? <span className="cv-chip is-warn">{formatMoney(c.ceilingExcess)} over</span> : c.authorizedCeiling != null ? <span className="cv-chip is-ok">Within</span> : null}
          >
            <BillTable items={draft?.items} total={draft?.total_amount} authorised={c.authorizedCeiling} cumulative={moneyLedger?.authorized_ceiling?.cumulative} excess={c.ceilingExcess} />
          </Card>
          {c.overCeiling && !c.docsLocked && (
            <div className="cv-notice is-warn cv-pane-note">
              <div className="cv-notice-body">The payer will not cover the {formatMoney(c.ceilingExcess)} above the authorised amount. Collect it from the patient, or file an enhancement first.</div>
              <label className="cv-ack">
                <input type="checkbox" checked={c.ackOverCeiling} onChange={(e) => c.setAckOverCeiling(e.target.checked)} />
                <span>I will collect the {formatMoney(c.ceilingExcess)} from the patient.</span>
              </label>
              <div className="cv-notice-actions">
                <button type="button" className="cv-btn" onClick={() => navigate("../enhancement")}>
                  File an enhancement
                </button>
              </div>
            </div>
          )}
        </Pane>

        <Pane id="asks">
          <PayerAsks
            caseId={c.caseId}
            stage="claim"
            title="What the payer asks for at claim"
            asks={draft?.payer_asks}
            documents={c.docs}
            readOnly={c.docsLocked}
            onAttach={c.documents.attachAsk}
            onFormsChange={c.setAskForms}
            reloadKey={c.asksReload}
          />
        </Pane>

        <Pane id="files">
          <Card title="Other files" meta="Sent with the claim. Attached files stay while you move between steps; reloading the page drops them.">
            <div className="cv-card-body">
              {c.documents.error && (
                <div className="cv-notice is-bad cv-drawer-note" role="alert">
                  <div className="cv-notice-body">{c.documents.error}</div>
                </div>
              )}
              <DocumentChecklist
                documents={c.otherDocs}
                onUpload={(doc, uploaded) => c.documents.attach(c.docs.indexOf(doc), uploaded)}
                onAddDocument={c.documents.addCustom}
                onRenameDocument={(i, name) => c.documents.rename(c.docs.indexOf(c.otherDocs[i]), name)}
                onRemoveDocument={(i) => c.documents.remove(c.docs.indexOf(c.otherDocs[i]))}
                onFetchRecord={(i) => c.documents.attachRecord(c.docs.indexOf(c.otherDocs[i]))}
                onDetachRecord={(i) => c.documents.detachRecord(c.docs.indexOf(c.otherDocs[i]))}
                readOnly={c.docsLocked}
                hideSummary
              />
            </div>
          </Card>
        </Pane>

        {c.dischargeIntimation && (
          <Pane id="discharge">
            {c.dischargeWaiting ? (
              <WaitingCard title="Discharge claim" data={dischargeData} status={c.discharge} correlationId={c.dischargeId} bundle={bundleFor("claim", c.dischargeId)} canEnquire={false} />
            ) : (
              <Card
                title="Discharge claim"
                meta="Most payers need this, with the discharge papers, before the final claim."
                chip={c.dischargeId ? <span className={`cv-chip is-${c.dischargeRejected || c.dischargeFailed ? "bad" : c.dischargeQueried ? "warn" : c.dischargeView.decision ? "ok" : "info"}`}>{dischargeWord}</span> : null}
                tools={
                  c.dischargeId && (
                    <button type="button" className="cv-link" disabled={c.discharge.checking} onClick={c.discharge.refresh}>
                      {c.discharge.checking ? "Checking…" : "Check again"}
                    </button>
                  )
                }
              >
                <div className="cv-card-body">
                  {!c.dischargeId && <div className="cv-card-meta">Not sent yet. It goes out with the files attached on this step.</div>}
                  {dischargeData?.submitted_at && <div className="cv-kv"><span>Sent</span><span>{formatDateTime(dischargeData.submitted_at)}</span></div>}
                  {c.dischargeView.decision && <div className="cv-kv"><span>Payer's answer</span><span>{humanize(c.dischargeView.decision)}</span></div>}
                  {c.dischargeFailed && <div className="cv-kv"><span>Reason</span><span>{c.dischargeView.message || "No reason given"}</span></div>}
                  {(c.dischargeView.notes.length > 0 || c.dischargeView.errors.length > 0) && (
                    <div className="cv-sub-note-top">
                      <PayerWords notes={c.dischargeView.notes} errors={c.dischargeView.errors} />
                    </div>
                  )}
                  {c.dischargeId && (
                    <TechnicalDetails
                      ids={[
                        { label: "Request id", value: c.dischargeId },
                        { label: "Payer reference", value: dischargeData?.claim_response_ref },
                        { label: "Raw outcome", value: dischargeData?.outcome },
                        { label: "Error code", value: dischargeData?.error_code },
                      ]}
                      bundle={bundleFor("claim", c.dischargeId)}
                    />
                  )}
                </div>
              </Card>
            )}
          </Pane>
        )}

        <Pane id="final">
          <Card title="Final claim" meta="Asks the payer to pay the final bill. Private insurers must decide within 3 hours (IRDAI).">
            <div className="cv-card-body">
              <div className="cv-kv"><span>Status</span><span>{c.finalFailed ? "Not delivered" : c.finalSent ? "Sent" : "Not sent"}</span></div>
              <div className="cv-kv"><span>Final bill</span><span>{money(draft?.total_amount)}</span></div>
              <div className="cv-kv"><span>Files going with it</span><span>{c.attached.length}</span></div>
              {c.finalFailed && <div className="cv-kv"><span>Reason</span><span>{view.message || "No reason given"}</span></div>}
              {c.finalId && <TechnicalDetails ids={[{ label: "Request id", value: c.finalId }]} bundle={bundleFor("claim", c.finalId)} />}
            </div>
          </Card>
        </Pane>

        <Pane id="decision">
          {!c.finalId ? (
            <Card title="No final claim yet">
              <div className="cv-card-intro">Send the final claim to receive the payer's decision here.</div>
            </Card>
          ) : c.finalWaiting ? (
            <WaitingCard title="Final claim" data={data} status={c.final} correlationId={c.finalId} bundle={bundleFor("claim", c.finalId)} canEnquire={canEnquire && c.final.elapsedMs > GATEWAY_RECOVERY_MS} enquiring={c.askGateway.busy} onEnquire={c.askGateway.run} />
          ) : view.phase === "not_found" ? (
            <Card title="No answer on record">
              <div className="cv-card-intro">The payer's system has not registered this claim yet. It usually appears within a few minutes.</div>
              <div className="cv-card-body">
                <TechnicalDetails ids={[{ label: "Request id", value: c.finalId }]} bundle={bundleFor("claim", c.finalId)} />
              </div>
            </Card>
          ) : c.finalFailed ? (
            <Card title="Not delivered">
              <div className="cv-card-body">
                <div className="cv-kv"><span>Reason</span><span>{view.message || "The request did not reach the payer."}</span></div>
                {view.errors.length > 0 && (
                  <div className="cv-sub-note-top">
                    <PayerWords notes={[]} errors={view.errors} empty="" />
                  </div>
                )}
                <TechnicalDetails ids={[{ label: "Request id", value: c.finalId }]} bundle={bundleFor("claim", c.finalId)} />
              </div>
            </Card>
          ) : (
            <div className="cv-pane-stack">
              <Card title="Payer decision" meta="What you claimed, what the payer cut and why, and what it approved.">
                <div className="cv-card-body">
                  <div className="cv-kv"><span>Decision</span><span>{c.claimDecided ? view.word : "Unclear"}</span></div>
                  {statement.map((r) => (
                    <div key={r.label} className={`cv-kv${r.total ? " is-total" : ""}`}>
                      <span>
                        {r.label}
                        {r.note && <span className="cv-card-meta"> · {r.note}</span>}
                      </span>
                      <span className="money">{r.value == null ? "—" : r.value < 0 ? `− ${formatMoney(-r.value)}` : formatMoney(r.value)}</span>
                    </div>
                  ))}
                  {data?.payment_status && <div className="cv-kv"><span>Payment</span><span>{humanize(String(data.payment_status).replace(/^PAYMENT_/, ""))}</span></div>}
                </div>
              </Card>
              {adjItems.length > 0 && (
                <Card title="Line by line" meta="The payer's answer for each line of the claim.">
                  <div className="cv-in-card cv-sub-note-top">
                    <AdjudicationTable items={adjItems} totals={c.claimTotals} names={names} requestedLabel="Claimed" />
                  </div>
                </Card>
              )}
              {(view.notes.length > 0 || view.errors.length > 0) && (
                <Card title="Payer notes" meta="The payer's own words. Read these first when a claim is queried, cut or rejected.">
                  <div className="cv-card-body">
                    <PayerWords notes={view.notes} errors={view.errors} />
                  </div>
                </Card>
              )}
              {c.releaseId && (
                <Card title="Balance request" chip={<span className={`cv-chip is-${c.release.phase === "waiting" ? "info" : releaseData?.status === "failed" || releaseData?.answer === "refused" ? "warn" : "ok"}`}>{c.release.phase === "waiting" ? "Waiting" : releaseData?.status === "failed" ? "Refused" : humanize(releaseData?.answer || "Answered")}</span>}>
                  <div className="cv-card-body">
                    <div className="cv-kv"><span>Asked</span><span>{caseState.releaseRequestedAt ? formatDateTime(caseState.releaseRequestedAt) : "—"}</span></div>
                    <div className="cv-kv"><span>Payer's answer</span><span>{releaseData?.answer ? humanize(releaseData.answer) : releaseData?.status === "failed" ? releaseData.error_message || releaseData.message || "Refused" : "Waiting for the payer"}</span></div>
                    <div className="cv-kv"><span>Detail</span><span>{releaseData?.detail || "—"}</span></div>
                    <div className="cv-kv"><span>Answered</span><span>{releaseData?.answered_at ? formatDateTime(releaseData.answered_at) : "—"}</span></div>
                    {c.release.error && (
                      <div className="cv-notice is-warn cv-sub-note-top">
                        <div className="cv-notice-body">The payer's answer could not be checked, and this page keeps trying: {c.release.error}</div>
                      </div>
                    )}
                    <TechnicalDetails ids={[{ label: "Request id", value: c.releaseId }]} />
                  </div>
                </Card>
              )}
              <TechnicalDetails
                summary="Payer response, as received over NHCX"
                ids={[
                  { label: "Raw outcome", value: c.provenance?.raw_outcome ?? data?.outcome },
                  { label: "Reason codes", value: c.provenance?.reason_codes?.join(", ") },
                  { label: "Classified by", value: c.provenance?.classified_by },
                  { label: "NHCX workflow", value: c.provenance?.nhcx_workflow_id != null ? String(c.provenance.nhcx_workflow_id) : null },
                  { label: "Payer reference", value: data?.claim_response_ref },
                  { label: "Sent", value: data?.submitted_at ? formatDateTime(data.submitted_at) : null },
                  { label: "Request id", value: c.finalId },
                ]}
                bundle={bundleFor("claim", c.finalId)}
              />
            </div>
          )}
        </Pane>
      </CaseStep>

      <SendGateModal gate={finalGate} busy={c.sendFinal.busy} title="Send the final claim without these?" sendLabel="Send anyway" />
      <SendGateModal gate={dischargeGate} busy={c.sendDischarge.busy} title="Send the discharge claim without these?" sendLabel="Send anyway" />

      <ConfirmModal
        open={confirm === "discharge"}
        title="Send the discharge claim?"
        subtitle="The payer receives the discharge papers and the bill so far. The final claim follows once it answers."
        confirmLabel="Send discharge claim"
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          setConfirm(null);
          dischargeGate.request();
        }}
      >
        <div className="cv-kv"><span>Bill so far</span><span>{money(draft?.total_amount)}</span></div>
        <div className="cv-kv"><span>Files going with it</span><span>{c.attached.length}</span></div>
        {draft?.discharge?.type && <div className="cv-kv"><span>How the patient left</span><span>{humanize(draft.discharge.type)}</span></div>}
      </ConfirmModal>

      <ConfirmModal
        open={confirm === "final"}
        title="Send the final claim?"
        subtitle="The payer decides what it pays on this bill. A sent claim cannot be edited; a cut is contested through a balance request or a reprocess."
        confirmLabel={`Send ${money(draft?.total_amount)} claim`}
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          setConfirm(null);
          finalGate.request();
        }}
      >
        <div className="cv-kv"><span>Final bill</span><span>{money(draft?.total_amount)}</span></div>
        <div className="cv-kv"><span>Authorised</span><span>{money(c.authorizedCeiling)}</span></div>
        <div className="cv-kv"><span>Files going with it</span><span>{c.attached.length}</span></div>
        {c.overCeiling && <p className="cv-card-meta cv-sub-note-top">{formatMoney(c.ceilingExcess)} above the authorised amount is collected from the patient.</p>}
      </ConfirmModal>

      <AnswerPayerQuery
        open={queryOpen || autoQuery}
        onClose={() => {
          setQueryOpen(false);
          dismissAuto();
        }}
        title="Answer the payer's query on the claim"
        question={{ notes: view.notes, description: queryTask?.description, requestedDocuments: queryTask?.required_documents, communications: relatedComms }}
        send={c.answerQuery}
        onSent={() => pane.setPicked("decision")}
        successMessage="Answer sent to the payer"
      />

      {(dischargeOpen || autoDischarge) && (
        <DischargeResubmitDrawer
          open
          onClose={() => {
            setDischargeOpen(false);
            dismissAuto();
          }}
          queried={c.dischargeQueried}
          notes={c.dischargeView.notes}
          items={draft?.items}
          send={c.resubmitDischarge}
        />
      )}

      {(releaseOpen || autoRelease) && (
        <ReleaseDrawer
          open
          onClose={() => {
            setReleaseOpen(false);
            dismissAuto();
          }}
          owed={c.releaseOwed}
          initialAmount={location.state?.releaseAmount}
          release={c.requestRelease}
          onSent={() => pane.setPicked("decision")}
        />
      )}

      <SendMessageDrawer
        open={messageOpen}
        onClose={() => setMessageOpen(false)}
        defaultPayerId={caseState.payer?.code || cashlessCase?.payer_id || ""}
        defaultClaimReference={data?.claim_response_ref || draft?.preauth_ref || ""}
        references={[data?.claim_response_ref && { value: data.claim_response_ref, label: "Claim" }, draft?.preauth_ref && { value: draft.preauth_ref, label: "Pre-auth" }, c.caseId && { value: formatCaseRef(c.caseId), label: "Case" }].filter(Boolean)}
        claimId={c.claimId}
        cashlessCaseId={c.caseId}
      />
    </>
  );
}
