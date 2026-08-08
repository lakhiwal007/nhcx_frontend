// Stage model + live status derivation for the Case Spine.
// Pure data helpers — depends only on data already on caseState / effectiveCase.

const CORE = [
  { id: "payer", label: "Policy", path: "payer", hint: "Select the patient's active policy — its payer comes with it." },
  { id: "prep", label: "Eligibility", path: "prep", hint: "Confirm the plan covers this admission and resolve any missing patient details." },
  { id: "review", label: "Preauth", path: "review", hint: "Review the drafted preauth and submit it to the payer." },
  { id: "status", label: "Decision", path: "status", hint: "Track the payer's decision and respond to any query." },
  { id: "claim", label: "Claim", path: "claim", hint: "Submit the discharge and final claim for the approved care." },
  { id: "payment", label: "Payment", path: "payment", hint: "Reconcile the payment received and close the case." },
];

const fmt = (n) =>
  n != null && !Number.isNaN(Number(n)) ? `₹${Number(n).toLocaleString("en-IN")}` : null;

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
  status: "Preauth Decision",
  claim: "Claim",
  payment: "Payment",
};

const STEP_LANDING_ROUTE = {
  ...STEP_FORWARD_ROUTE,
  preauth_ready: "review",
};

export function landingStage(effectiveCase = {}) {
  const step = effectiveCase.current_step;
  if (STEP_LANDING_ROUTE[step]) return STEP_LANDING_ROUTE[step];
  if (step === "insurance_and_eligibility" && (effectiveCase.payer_id || effectiveCase.policy_number)) {
    return "prep";
  }
  return "payer";
}

// A /cashless/{id} response is nested — preauth, claim and payment each arrive
// as their own object — while the spine and the case header read a flat shape.
// Project it in one place: a screen that refetches the case must merge this
// rather than store the raw response, or every flat key below goes undefined
// and the downstream stages lose their note, tone and clickability at once.
export function projectCaseStatus(full) {
  if (!full) return {};

  return {
    cashless_case_id: full.cashless_case_id,
    claim_id: full.claim?.claim_id ?? full.claim_id ?? null,
    status: full.status,
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
    caseState.policy?.policyNumber || caseState.policy?.policy_number || effectiveCase.policy_number;

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
      if (decision === "QUERIED") return { done: false, note: "Query - action needed", tone: "urgent" };
      if (decision === "APPROVED") return { done: true, note: approvedAmount ? `Approved ${approvedAmount}` : "Approved", tone: "approve" };
      if (decision === "PARTIALLY_APPROVED") return { done: true, note: approvedAmount ? `Partial ${approvedAmount}` : "Partially approved", tone: "approve" };
      if (decision === "REJECTED") return { done: true, note: "Rejected", tone: "urgent" };
      if (decision === "CANCELLED") return { done: true, note: "Cancelled", tone: "urgent" };
      if (preauthStarted) return { done: false, note: "Waiting on payer", tone: "wait", live: true };
      return { done: false, note: "" };
    })(),
    claim: (() => {
      const label = claimDecision ? String(claimDecision).replace(/_/g, " ") : "";
      if (claimDecision && /reject|denied|short/i.test(String(claimDecision))) return { done: true, note: label, tone: "urgent" };
      if (claimDecision && /approv|paid/i.test(String(claimDecision))) return { done: true, note: label, tone: "approve" };
      if (claimDecision) return { done: false, note: label, tone: "wait" };
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
      if (decision === "APPROVED" || decision === "PARTIALLY_APPROVED") {
        visible.push({
          id: "enhancement", label: "Enhancement", path: "enhancement", branch: true,
          hint: "Add procedures or documents to increase the approved amount.",
          done: false, note: "Optional", tone: "live",
        });
      }
      if (decision === "REJECTED" || /reject|denied|short/i.test(String(claimDecision || ""))) {
        visible.push({
          id: "reprocess", label: "Reprocess", path: "reprocess", branch: true,
          hint: "Appeal or resubmit after a rejection or short payment.",
          done: false, note: "Action available", tone: "urgent",
        });
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
