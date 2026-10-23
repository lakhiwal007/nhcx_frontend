export const STEP_LABELS = {
  insurance_and_eligibility: "Eligibility Check",
  preauth_ready: "Ready for Preauth",
  preauth_submitted: "Preauth Submitted",
  preauth_decided: "Preauth Decided",
  claim_submitted: "Claim Submitted",
  claim_decided: "Claim Decided",
  payment_pending: "Payment Pending",
  settled: "Settled",
};

const PAYMENT_CONFIG = {
  INITIATED: { label: "Payment Initiated", badgeClass: "badge-warning" },
  PROCESSED: { label: "Payment Processed", badgeClass: "badge-info" },
  SETTLED: { label: "Payment Settled", badgeClass: "badge-success" },
};

const MONEY_STEPS = {
  payment_pending: { label: "Payment Pending", badgeClass: "badge-warning" },
  settled: { label: "Settled", badgeClass: "badge-success" },
};

const CLAIM_DECISION_CONFIG = {
  APPROVED: { label: "Claim Approved", badgeClass: "badge-success" },
  PARTIALLY_APPROVED: { label: "Claim Partially Approved", badgeClass: "badge-warning" },
  QUERIED: { label: "Claim Query", badgeClass: "badge-error" },
  REJECTED: { label: "Claim Rejected", badgeClass: "badge-error" },
};

const DECISION_CONFIG = {
  APPROVED: { label: "Preauth Approved", badgeClass: "badge-success" },
  PARTIALLY_APPROVED: { label: "Partially Approved", badgeClass: "badge-warning" },
  QUERIED: { label: "Payer Query", badgeClass: "badge-error" },
  REJECTED: { label: "Preauth Rejected", badgeClass: "badge-error" },
  CANCELLED: { label: "Preauth Cancelled", badgeClass: "badge-info" },
};

const CASHLESS_STATUS_CONFIG = {
  complete: { badgeClass: "badge-success" },
  pending: { badgeClass: "badge-warning" },
  partial: { badgeClass: "badge-info" },
  failed: { badgeClass: "badge-error" },
};

const CLAIM_STATUS_CONFIG = {
  draft: { label: "Claim Draft", badgeClass: "badge-info" },
  submitted: { label: "Claim Submitted", badgeClass: "badge-warning" },
  in_process: { label: "Claim In Process", badgeClass: "badge-warning" },
  settled: { label: "Claim Settled", badgeClass: "badge-success" },
  complete: { label: "Claim Complete", badgeClass: "badge-success" },
};

export const resolveCaseStatus = (claim) => {
  if (!claim) return { label: "Unknown", badgeClass: "badge-info" };

  const paid = claim.payment_status?.replace("PAYMENT_", "").toUpperCase();
  if (paid && PAYMENT_CONFIG[paid]) return PAYMENT_CONFIG[paid];

  if (MONEY_STEPS[claim.current_step]) return MONEY_STEPS[claim.current_step];

  const claimDecision = claim.claim_decision?.toUpperCase();
  if (claimDecision && CLAIM_DECISION_CONFIG[claimDecision]) return CLAIM_DECISION_CONFIG[claimDecision];

  const preauthDecision = claim.preauth_status?.toUpperCase();
  if (preauthDecision && DECISION_CONFIG[preauthDecision]) return DECISION_CONFIG[preauthDecision];

  if (STEP_LABELS[claim.current_step]) {
    const cashlessStatus = claim.cashless_status ?? claim.status;
    const tone = CASHLESS_STATUS_CONFIG[cashlessStatus] ?? CASHLESS_STATUS_CONFIG.pending;
    return { label: STEP_LABELS[claim.current_step], badgeClass: tone.badgeClass };
  }

  return CLAIM_STATUS_CONFIG[claim.status] ?? CLAIM_STATUS_CONFIG.draft;
};

const ceAnswers = (ce) => [ce?.validation, ce?.benefits, ce?.auth_requirements].filter(Boolean);

// Every member on the card, across the three checks, once per member id.
export const eligibilityBeneficiaries = (ce) => {
  const seen = new Map();
  ceAnswers(ce)
    .flatMap((sub) => sub.beneficiaries || [])
    .forEach((b) => {
      const key = b.member_id || `${b.name}|${b.dob}`;
      const prev = seen.get(key);
      seen.set(key, prev ? { ...prev, ...b, checked: prev.checked || b.checked } : b);
    });
  return [...seen.values()];
};

// The documents and forms the payer asks for, across the three checks.
export const eligibilityRequirements = (ce) => {
  const seen = new Map();
  ceAnswers(ce)
    .flatMap((sub) => sub.requirements || [])
    .forEach((r) => {
      const key = [r.kind, r.code, r.form_url, r.for_code].join("|");
      if (!seen.has(key)) seen.set(key, r);
    });
  return [...seen.values()];
};

// The four stages of the journey, and which `current_step` values belong to
// each. `current_step` is the authoritative journey position; a row's
// `status` only rolls up eligibility prep (its "complete" does not mean the
// preauth or claim is done), so nothing here reads `status`.
export const STAGES = [
  { key: "eligibility", label: "Eligibility", steps: ["insurance_and_eligibility"] },
  { key: "preauth",     label: "Pre-auth",    steps: ["preauth_ready", "preauth_submitted", "preauth_decided"] },
  { key: "claim",       label: "Claim",       steps: ["claim_submitted", "claim_decided"] },
  { key: "payment",     label: "Payment",     steps: ["payment_pending", "settled"] },
];

// `current_step` is nullable on the row; infer the closest step from the
// decision/payment fields rather than leave the case unplaced.
export function caseStep(claim) {
  if (claim.current_step) return claim.current_step;
  if (/SETTLED/i.test(claim.payment_status || "")) return "settled";
  if (claim.payment_status) return "payment_pending";
  if (claim.claim_decision) return claim.use_type === "claim" ? "claim_decided" : "preauth_decided";
  if (claim.preauth_status) return "preauth_decided";
  return "insurance_and_eligibility";
}

export function stageIndex(claim) {
  const step = caseStep(claim);
  const i = STAGES.findIndex((st) => st.steps.includes(step));
  return i < 0 ? 0 : i;
}

export const isSettled = (c) => caseStep(c) === "settled";

export function needsAttention(claim) {
  if (claim.pending_tasks?.length) return true;
  const terminalQuery = /QUERIED|REJECTED/i;
  return (
    terminalQuery.test(String(claim.claim_decision || "")) ||
    terminalQuery.test(String(claim.preauth_status || ""))
  );
}
