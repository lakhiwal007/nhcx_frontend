// Stage model + live status derivation for the Case Spine.
// Pure data helpers — depends only on data already on caseState / effectiveCase.

const CORE = [
  { id: "payer", label: "Payer & Policy", path: "payer", hint: "Find the payer and select the patient's active policy." },
  { id: "prep", label: "Eligibility", path: "prep", hint: "Confirm the plan covers this admission and resolve any missing patient details." },
  { id: "review", label: "Preauth", path: "review", hint: "Review the drafted preauth and submit it to the payer." },
  { id: "status", label: "Decision", path: "status", hint: "Track the payer's decision and respond to any query." },
  { id: "claim", label: "Claim", path: "claim", hint: "Submit the discharge and final claim for the approved care." },
  { id: "payment", label: "Payment", path: "payment", hint: "Reconcile the payment received and close the case." },
];

const fmt = (n) =>
  n != null && !Number.isNaN(Number(n)) ? `₹${Number(n).toLocaleString("en-IN")}` : null;

// Derive the ordered list of visible stages with live status for each.
export function buildStages({ caseState, effectiveCase, preauthRef, preauthDecision, currentPath }) {
  const decision = preauthDecision ? String(preauthDecision).toUpperCase() : null;
  const preauthStarted = !!(caseState.preauthCorrelationId || preauthRef);
  const approvedAmount = fmt(
    effectiveCase.approved_amount ?? effectiveCase.preauth_approved_amount ?? caseState.approvedAmount,
  );
  const claimDecision = effectiveCase.claim_decision || effectiveCase.claim_status;
  const utr = effectiveCase.utr || effectiveCase.latest_utr;
  // Payment completion must come from payment-specific signals only — the
  // claim's generic `status` can already read "complete" as soon as an earlier
  // step (e.g. preauth) resolves, well before payment happens.
  const paymentDone =
    String(effectiveCase.payment_status || "").toUpperCase() === "PAYMENT_SETTLED" || !!utr;

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
      if (preauthStarted) return { done: false, note: "Waiting on payer", tone: "wait", live: true };
      return { done: false, note: "" };
    })(),
    claim: (() => {
      const label = claimDecision ? String(claimDecision).replace(/_/g, " ") : "";
      if (claimDecision && /reject|denied|short/i.test(String(claimDecision))) return { done: true, note: label, tone: "urgent" };
      if (claimDecision && /approv|paid|complete/i.test(String(claimDecision))) return { done: true, note: label, tone: "approve" };
      return { done: false, note: label || (caseState.claimCorrelationId ? "Submitted" : "") };
    })(),
    payment: {
      done: paymentDone,
      note: utr ? `UTR ${utr}` : paymentDone ? "Acknowledged" : "",
    },
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
    const clickable = s.branch || s.done || isActive || isPassed;
    
    // Branch nodes (Enhancement/Reprocess) have no "the user actually acted on
    // this" signal wired up yet - their own `done` is always false. Falling
    // through to `isPassed` here would checkmark them purely for sitting
    // before the current stage in the list, even when never touched.
    let state = "upcoming";
    if (isActive) state = "active";
    else if (s.branch) state = s.done ? "done" : "available";
    else if (s.done || isPassed) state = "done";

    return { ...s, state, clickable };
  });
}
