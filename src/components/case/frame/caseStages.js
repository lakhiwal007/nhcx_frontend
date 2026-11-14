import { formatMoney } from "../../../lib/format.js";
import { taskStep } from "../../../domain/tasks";
import { isDischargeDecision } from "../../../domain/caseStatus.js";

const CORE = [
  { id: "payer", label: "Policy", path: "payer", hint: "Select the patient's active policy — its payer comes with it." },
  { id: "prep", label: "Eligibility", path: "prep", hint: "Confirm the plan covers this admission and resolve any missing patient details." },
  { id: "review", label: "Preauth", path: "review", hint: "Review the drafted preauth and submit it to the payer." },
  { id: "status", label: "Approval", path: "status", hint: "Track the payer's preauth decision and respond to any query." },
  { id: "claim", label: "Claim", path: "claim", hint: "Submit the discharge and final claim for the approved care." },
  { id: "payment", label: "Payment", path: "payment", hint: "Reconcile the payment received and close the case." },
];

// Views off the core spine. Enhancement and Reprocess appear on the spine
// only when the decision calls for them, but can be opened from a task or a
// link at any time, so their heading can't depend on the spine.
const BRANCHES = {
  enhancement: { id: "enhancement", label: "Enhancement", path: "enhancement", hint: "Add procedures or documents to increase the approved amount." },
  reprocess: { id: "reprocess", label: "Reprocess", path: "reprocess", hint: "Ask the payer to look again at a claim it rejected." },
};

const VIEWS = {
  discover: { label: "Discover a policy", hint: "Ask a payer directly for the patient's cover when the policy lookup does not find it." },
  timeline: { label: "Audit trail", hint: "Every request, payer response and status change on this case, newest first." },
};

// Title and hint for any case path, on the spine or not.
// Everything that belongs to the case on the old policy. Choosing a policy with
// these cleared makes the Eligibility step prepare a fresh case, and keeps the
// old case's pre-auth and claim from bleeding into the new one.
export const POLICY_CHANGE_RESET = {
  cashless_case_id: null,
  claim_id: null,
  eligibility_correlation_id: null,
  preauthCorrelationId: null,
  preauthRef: null,
  preauthDecision: null,
  approvedAmount: null,
  claimCorrelationId: null,
  dischargeCorrelationId: null,
  draftData: null,
  statusEnquiry: null,
  beneficiaryMemberId: null,
};

// Claim leg states in which the backend refuses any further pre-auth send.
export const CLAIM_WITH_PAYER = ["submitting", "queried", "unclear", "approved", "partial", "rejected"];

export function stageInfo(path) {
  const core = CORE.find((s) => s.path === path);
  if (core) return { ...core, num: CORE.indexOf(core) + 1 };
  if (BRANCHES[path]) return { ...BRANCHES[path], branch: true };
  return VIEWS[path] || null;
}

const fmt = (n) => (n != null && !Number.isNaN(Number(n)) ? formatMoney(n) : null);

// A payment stage reaches us in several spellings: the claim column
// ("settled"), the notice stage ("PAYMENT_SETTLED"), or the FHIR paymentStatus
// code ("cleared"). Normalise before comparing.
const paymentState = (value) =>
  String(value || "").trim().toUpperCase().replace(/^PAYMENT[_-]/, "");

const SETTLED_PAYMENT_STATES = new Set(["SETTLED", "CLEARED", "PAID_IN_FULL"]);

// Where a case has already moved on to, keyed by the backend's current_step.
// Screens earlier in the journey use this to offer "Continue to X" instead of
// redirecting there, so an earlier stage stays reachable from the spine.
export const STEP_FORWARD_ROUTE = {
  preauth_submitted: "status",
  preauth_decided: "status",
  claim_submitted: "claim",
  claim_decided: "claim",
  payment_pending: "payment",
  settled: "payment",
};

export const STEP_FORWARD_LABEL = {
  status: "Approval",
  claim: "Claim",
  payment: "Payment",
};

const up = (v) => (v ? String(v).toUpperCase() : null);

const PAYMENT_STEPS = new Set(["payment_pending", "settled"]);
const PAID_STATES = new Set(["PAYMENT_SETTLED", "PAYMENT_INITIATED", "PAYMENT_PROCESSED"]);

export function landingStage(record = {}, { full = null, tasks } = {}) {
  const r = record || {};
  const preauth = full?.preauth || null;
  const claim = full?.claim || null;
  const step = r.current_step || full?.current_step;
  const pDecision = up(preauth?.decision || r.preauth_status);
  const cDecision = up(claim?.decision || r.claim_decision);
  const cancellationPending = preauth?.purpose === "cancel" && preauth?.status === "pending";
  const nextActions = full?.next_actions || [];

  let dest;
  if (cancellationPending) dest = "status";
  else if (PAID_STATES.has(up(claim?.payment_status || r.payment_status)) || PAYMENT_STEPS.has(step)) dest = "payment";
  else if (cDecision === "APPROVED" || cDecision === "PARTIALLY_APPROVED") dest = "payment";
  else if (cDecision || claim?.correlation_id || r.claim_id || step === "claim_submitted" || step === "claim_decided") dest = "claim";
  else if (pDecision === "APPROVED" || pDecision === "PARTIALLY_APPROVED") dest = "claim";
  else if (pDecision === "QUERIED" || pDecision === "REJECTED" || pDecision === "CANCELLED") dest = "status";
  else if (preauth?.correlation_id || step === "preauth_submitted" || step === "preauth_decided") dest = "status";
  else if (step === "preauth_ready" || nextActions.includes("prepare_preauth") || nextActions.includes("submit_preauth")) dest = "review";
  else if (r.policy_number || r.payer_id || full?.policy_number || full?.payer_id) dest = "prep";
  else dest = "payer";

  const pending = tasks ?? full?.pending_tasks ?? [];
  const actionable = cancellationPending ? null : pending.find((t) => taskStep(t.task_type));
  const taskRoute = actionable ? taskStep(actionable.task_type) : null;
  return taskRoute && routeAtOrAfter(taskRoute, dest) ? taskRoute : dest;
}

// A /cashless/{id} response is nested — preauth, claim and payment each arrive
// as their own object — while the spine and the case header read a flat shape.
// Project it in one place: a screen that refetches the case must merge this
// rather than store the raw response, or every flat key below goes undefined
// and the downstream stages lose their note, tone and clickability at once.
export const caseRules = (full) => ({
  legs: full?.legs ?? null,
  reprocess: full?.reprocess ?? null,
  discharge_intimation: full?.discharge_intimation,
  answers_status_enquiry: full?.answers_status_enquiry,
  coverage_eligibility: full?.coverage_eligibility ?? null,
  held_tasks: full?.held_tasks ?? [],
});

export function projectCaseStatus(full) {
  if (!full) return {};

  return {
    ...caseRules(full),
    cashless_case_id: full.cashless_case_id,
    claim_id: full.claim?.claim_id ?? full.claim_id ?? null,
    status: full.status,
    closure: full.closure ?? null,
    close_blocker: full.close_blocker ?? null,
    current_step: full.current_step,
    payer_id: full.payer_id,
    policy_number: full.policy_number,
    preauth_status: full.preauth?.decision ?? null,
    preauth_ref: full.preauth?.preauth_ref ?? null,
    claim_decision: full.claim?.decision ?? null,
    claim_status: full.claim?.status ?? null,
    payment_status: full.claim?.payment_status ?? null,
    approved_amount: full.claim?.approved_amount ?? full.preauth?.approved_amount ?? null,
    payment: full.payment ?? null,
    latest_utr: full.payment?.utr ?? null,
  };
}

const DECIDED_CLAIM_LEGS = ["approved", "partial", "rejected"];

export function stageAmounts({ moneyLedger, effectiveCase }) {
  const claimLeg = effectiveCase.legs?.claim;
  const settlement = moneyLedger?.settlement;
  const claimDecided = DECIDED_CLAIM_LEGS.includes(claimLeg) || !!effectiveCase.claim_decision || !!settlement?.settled;
  const claimSent = claimDecided || (!!claimLeg && claimLeg !== "draft");
  const billed = moneyLedger?.billed?.value;
  const authorised = moneyLedger?.authorized_ceiling?.value;
  const approved = moneyLedger?.approved?.value;
  return {
    review: billed != null ? { value: billed, word: claimSent ? "billed" : "requested" } : null,
    status: authorised != null ? { value: authorised, word: "authorised" } : null,
    claim: claimDecided && approved != null ? { value: approved, word: "approved" } : null,
    payment: settlement?.settled && settlement.net != null ? { value: settlement.net, word: "settled" } : null,
  };
}

// Derive the ordered list of visible stages with live status for each.
export function buildStages({ caseState, effectiveCase, preauthRef, preauthDecision, currentPath, moneyLedger, paymentSummary }) {
  const decision = preauthDecision ? String(preauthDecision).toUpperCase() : null;
  const preauthStarted = !!(caseState.preauthCorrelationId || preauthRef);
  const approvedAmount = fmt(
    effectiveCase.approved_amount ?? effectiveCase.preauth_approved_amount ?? caseState.approvedAmount,
  );
  // Only the payer's decision may tone this stage. `claim_status` is the
  // transaction's own workflow status and reads "complete" the moment a
  // submission round-trips, so treating it as a decision marks an undecided
  // claim approved.
  const claimDecision = effectiveCase.claim_decision;
  const claimSubmitted = !!(caseState.claimCorrelationId || effectiveCase.claim_status || effectiveCase.claim_id);
  const settlement = moneyLedger?.settlement || null;
  const utr = paymentSummary?.utr || settlement?.utr || effectiveCase.utr || effectiveCase.latest_utr;
  // Payment completion must come from payment-specific signals only — the
  // claim's generic `status` can already read "complete" as soon as an earlier
  // step (e.g. preauth) resolves, well before payment happens.
  //
  // A UTR alone is NOT settlement: the payer's first notice routinely carries
  // one while the payment is still only initiated, so it marks the stage as
  // started (below) rather than done.
  //
  // When the case carries a payment summary it is the authority and answers
  // both ways — an explicit `settled: false` must not be overridden by a
  // stale ledger settlement. Everything else is a fallback for a case loaded
  // from a dashboard row, which has no payment block at all.
  const paymentDone = paymentSummary
    ? paymentSummary.settled === true ||
      SETTLED_PAYMENT_STATES.has(paymentState(paymentSummary.latest_stage))
    : settlement?.settled === true ||
      SETTLED_PAYMENT_STATES.has(paymentState(effectiveCase.payment_status));
  const paymentStarted = (paymentSummary?.total_events ?? 0) > 0 || !!utr;

  const policyNumber =
    caseState.policy?.policy_number || effectiveCase.policy_number;

  // per-stage { done, note, tone }
  const meta = {
    payer: {
      done: !!(caseState.payer || caseState.policy || effectiveCase.payer_id),
      note: policyNumber ? `Policy ${policyNumber}` : caseState.payer?.name || effectiveCase.payer_id || "",
    },
    prep: {
      done: !!caseState.eligibility_correlation_id || preauthStarted,
      note: !!caseState.eligibility_correlation_id || preauthStarted ? "Eligibility checked" : "",
    },
    review: {
      done: preauthStarted,
      note: preauthStarted ? "Preauth submitted" : "",
    },
    status: (() => {
      if (decision === "QUERIED") return { done: false, note: "Query - answer needed", tone: "wait", live: true };
      if (decision === "APPROVED") return { done: true, note: approvedAmount ? `Approved ${approvedAmount}` : "Approved", tone: "approve" };
      if (decision === "PARTIALLY_APPROVED") return { done: true, note: approvedAmount ? `Partial ${approvedAmount}` : "Partially approved", tone: "approve" };
      if (decision === "REJECTED") return { done: true, note: "Rejected", tone: "urgent" };
      if (decision === "CANCELLED") return { done: true, note: "Cancelled", tone: "urgent" };
      if (preauthStarted) return { done: false, note: "Waiting on payer", tone: "wait", live: true };
      return { done: false, note: "" };
    })(),
    claim: (() => {
      const label = claimDecision ? String(claimDecision).replace(/_/g, " ") : "";
      if (isDischargeDecision(effectiveCase)) {
        return { done: false, note: `Discharge ${label.toLowerCase()}`, tone: /reject|denied|quer/i.test(label) ? "urgent" : "wait", live: true };
      }
      if (claimDecision && /reject|denied|short/i.test(String(claimDecision))) return { done: true, note: label, tone: "urgent" };
      if (claimDecision && /approv|paid/i.test(String(claimDecision))) return { done: true, note: label, tone: "approve" };
      if (claimDecision) return { done: false, note: label, tone: "wait" };
      // Money already settled means the payer decided the claim, even when the
      // decision itself isn't on this case record.
      if (paymentDone) return { done: true, note: "Decided · paid", tone: "approve" };
      return { done: false, note: claimSubmitted ? "Awaiting decision" : "", tone: claimSubmitted ? "wait" : undefined };
    })(),
    payment: (() => {
      if (paymentDone) {
        return { done: true, note: utr ? `Settled · UTR ${utr}` : "Settled", tone: "approve" };
      }
      // The payer has paid something but not settled. The stage is not done,
      // but it must still be reachable — this is exactly the state a case sits
      // in while waiting on the settlement notice.
      if (paymentStarted) {
        const stage = paymentState(paymentSummary?.latest_stage) === "PROCESSED" ? "Processing" : "Initiated";
        return {
          done: false,
          inProgress: true,
          note: utr ? `${stage} · UTR ${utr}` : stage,
          tone: "wait",
        };
      }
      return { done: false, note: "" };
    })(),
  };

  // assemble visible list, splicing conditional branches in after Decision
  const visible = [];
  CORE.forEach((stage, i) => {
    visible.push({ ...stage, ...meta[stage.id], num: i + 1, branch: false });
    if (stage.id === "status") {
      // A settled case can no longer raise its approved amount.
      if ((decision === "APPROVED" || decision === "PARTIALLY_APPROVED") && !paymentDone) {
        visible.push({ ...BRANCHES.enhancement, branch: true, done: false, note: "Optional", tone: "live" });
      }
      // Only a rejected final claim can be appealed. An appeal clears the claim's
      // decision while the payer reads it, so the appeal itself keeps the step.
      const claimLeg = effectiveCase.legs?.claim;
      const claimRejected = claimLeg ? claimLeg === "rejected" : /reject|denied/i.test(String(claimDecision || ""));
      if (claimRejected) {
        visible.push({ ...BRANCHES.reprocess, branch: true, done: false, note: "Action available", tone: "wait", live: true });
      } else if (effectiveCase.reprocess) {
        const decided = !!effectiveCase.reprocess.decision;
        visible.push({ ...BRANCHES.reprocess, branch: true, done: decided, note: decided ? "Appeal decided" : "Appeal sent", tone: decided ? undefined : "wait", live: !decided });
      }
    }
  });

  const activeIndex = visible.findIndex((s) => s.path === currentPath);

  // The spine records progress; it doesn't drive the workflow forward. Only
  // completed stages, the current stage, and branch action nodes are clickable
  // — the next not-yet-done step stays locked so clicking can't skip ahead.
  return visible.map((s, i) => {
    const isActive = i === activeIndex;
    const isPassed = activeIndex !== -1 && i < activeIndex;
    const clickable = s.branch || s.done || s.inProgress || isActive || isPassed;

    // Branch nodes (Enhancement/Reprocess) have no "the user actually acted on
    // this" signal wired up yet - their own `done` is always false. Falling
    // through to `isPassed` here would checkmark them purely for sitting
    // before the current stage in the list, even when never touched.
    let state = "upcoming";
    if (isActive) state = "active";
    else if (s.branch) state = s.done ? "done" : "available";
    else if (s.done || isPassed) state = "done";
    else if (s.inProgress) state = "progress";

    return { ...s, state, clickable };
  });
}

const ROUTE_ORDER = ["payer", "prep", "review", "status", "claim", "reprocess", "payment"];

export const routeAtOrAfter = (route, reference) => {
  const a = ROUTE_ORDER.indexOf(route);
  const b = ROUTE_ORDER.indexOf(reference);
  if (a === -1 || b === -1) return true;
  return a >= b;
};

const PREAUTH_STAGES = new Set(["review", "status", "enhancement"]);

export function lockFor(record, stage, { readOnly = false, closed = false } = {}) {
  const r = record || {};
  const viewOnly = !!readOnly;
  const shut = r.status === "closed";
  const settled = !!closed || shut;
  const forward = STEP_FORWARD_ROUTE[r.current_step] || null;
  const movedOnTo = forward && stage && !routeAtOrAfter(stage, forward) ? forward : null;
  const claimWithPayer = PREAUTH_STAGES.has(stage) && CLAIM_WITH_PAYER.includes(r.legs?.claim);
  const movedOnLabel = movedOnTo ? STEP_FORWARD_LABEL[movedOnTo] || movedOnTo : null;
  const reason = viewOnly
    ? "This account can view only."
    : settled
      ? shut
        ? "The case is closed."
        : "The case is settled."
      : movedOnTo
        ? `The case has moved on to ${movedOnLabel}.`
        : claimWithPayer
          ? "The claim is with the payer, so the pre-auth can no longer change."
          : null;
  return { locked: !!reason, reason, movedOnTo, movedOnLabel, viewOnly, settled, claimWithPayer };
}
