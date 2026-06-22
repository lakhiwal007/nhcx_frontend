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
  const paymentDone =
    String(effectiveCase.status || "").toLowerCase() === "complete" || !!effectiveCase.utr;

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
      if (decision === "QUERIED") return { done: false, note: "Query — action needed", tone: "urgent" };
      if (decision === "APPROVED") return { done: true, note: approvedAmount ? `Approved ${approvedAmount}` : "Approved", tone: "approve" };
      if (decision === "PARTIALLY_APPROVED") return { done: true, note: approvedAmount ? `Partial ${approvedAmount}` : "Partially approved", tone: "approve" };
      if (decision === "REJECTED") return { done: true, note: "Rejected", tone: "urgent" };
      if (preauthStarted) return { done: false, note: "Waiting on payer", tone: "wait", live: true };
      return { done: false, note: "" };
    })(),
    claim: {
      done: !!claimDecision && /approv|paid|complete/i.test(String(claimDecision)),
      note: claimDecision ? String(claimDecision).replace(/_/g, " ") : caseState.claimCorrelationId ? "Submitted" : "",
    },
    payment: {
      done: paymentDone,
      note: effectiveCase.utr ? `UTR ${effectiveCase.utr}` : paymentDone ? "Acknowledged" : "",
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

  // furthest reached core stage → frontier is clickable, everything beyond is locked
  let maxDone = -1;
  CORE.forEach((s, i) => { if (meta[s.id].done) maxDone = i; });
  const frontier = maxDone + 1;

  return visible.map((s) => {
    const coreIndex = CORE.findIndex((c) => c.id === s.id);
    const isActive = s.path === currentPath;
    const reachable = s.branch || coreIndex <= frontier || s.done;
    let state = "upcoming";
    if (isActive) state = "active";
    else if (s.done) state = "done";
    else if (reachable) state = "available";
    return { ...s, state, clickable: reachable || isActive };
  });
}
