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
