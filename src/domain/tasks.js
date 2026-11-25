export const TASKS = {
  review_insurance_plan_documents: {
    short: "Insurance plan",
    label: "Review the insurance plan",
    help: "Plan arrived with a document list. Check it on Eligibility.",
    step: "prep",
  },
  attach_eligibility_documents: {
    short: "Eligibility docs",
    label: "Attach eligibility documents",
    help: "Attach the documents on Pre-auth.",
    step: "prep",
  },
  fix_eligibility_error: {
    short: "Eligibility",
    label: "Fix the eligibility check",
    help: "Eligibility failed. Read the reason and resend.",
    step: "prep",
  },
  choose_plan_package: {
    short: "Package",
    label: "Choose the plan package",
    help: "Choose a package on Eligibility and send.",
    step: "prep",
  },
  submit_preauth: {
    short: "Pre-auth",
    label: "Send the pre-auth",
    help: "Ready for pre-auth. Check and send.",
    step: "review",
  },
  respond_preauth_query: {
    short: "Pre-auth query",
    label: "Answer the pre-auth query",
    help: "Answer the pre-auth query on Approval.",
    step: "status",
    openAction: true,
  },
  resubmit_preauth: {
    short: "Pre-auth",
    label: "Resend the pre-auth",
    help: "Fix the pre-auth and resend.",
    step: "status",
    openAction: true,
  },
  request_enhancement: {
    short: "Enhancement",
    label: "Ask for an enhancement",
    help: "Bill is over approval. Ask for an enhancement.",
    step: "enhancement",
  },
  resubmit_enhancement: {
    short: "Enhancement",
    label: "Resend the enhancement",
    help: "Resend the enhancement.",
    step: "status",
    openAction: true,
  },
  submit_discharge_claim: {
    short: "Discharge claim",
    label: "Send the discharge claim",
    help: "Discharged. Send the discharge documents.",
    step: "claim",
  },
  resubmit_discharge_claim: {
    short: "Discharge claim",
    label: "Resend the discharge claim",
    help: "Discharge claim needs a fix or an answer.",
    step: "claim",
    openAction: true,
  },
  submit_final_claim: {
    short: "Final claim",
    label: "Send the final claim",
    help: "Send the final claim.",
    step: "claim",
  },
  respond_claim_query: {
    short: "Claim query",
    label: "Answer the claim query",
    help: "Answer the claim query.",
    step: "claim",
    openAction: true,
  },
  resubmit_claim: {
    short: "Resend claim",
    label: "Resend the claim",
    help: "Claim sent back. Fix and resend.",
    step: "claim",
  },
  submit_reprocess: {
    short: "Reprocess",
    label: "Ask for a reprocess",
    help: "Claim rejected. Disagree? Ask for a reprocess.",
    step: "reprocess",
  },
  request_claim_release: {
    short: "Balance",
    label: "Ask for the balance",
    help: "Paid short. Ask for the balance.",
    step: "claim",
    openAction: true,
  },
  acknowledge_payment: {
    short: "Payment",
    label: "Confirm the payment",
    help: "Money arrived. Match the UTR and confirm.",
    step: "payment",
  },
  review_payment_ack_failure: {
    short: "Payment",
    label: "Resend the payment confirmation",
    help: "Confirmation failed. Send it again.",
    step: "payment",
  },
  review_communication: {
    short: "Message",
    label: "Read the payer's message",
    help: "New payer message.",
    screen: "/communications",
  },
  review_callback_failure: {
    short: "Payer answer",
    label: "Read the payer's answer again",
    help: "Couldn't read the answer. Try again or tell IT.",
  },
  cancel_superseded_preauth: {
    short: "Withdraw",
    label: "Withdraw the older pre-auth",
    help: "Withdraw the old pre-auth.",
  },
  chase_payer_answer: {
    short: "No answer",
    label: "No answer from the payer",
    help: "No answer for hours. Call the payer.",
    byWorkflow: true,
  },
  review_payer_decision: {
    short: "Unclear answer",
    label: "Unclear payer answer",
    help: "No clear decision. Call or message the payer.",
    byWorkflow: true,
  },
  review_closed_case_answer: {
    short: "Closed case",
    label: "Answer on a closed case",
    help: "Answer on a closed case. Reopen if needed.",
    step: "timeline",
  },
  link_payment_to_claim: {
    short: "Unlinked payment",
    label: "Link an unlinked payment",
    help: "Unlinked payment. Link it on Payments.",
    screen: "/payments?view=unlinked",
  },
};

const entry = (type) => TASKS[type] || null;

export const taskShort = (type) => entry(type)?.short || (type ? type.replace(/_/g, " ") : "Task");

export const taskLabel = (type) => entry(type)?.label || taskShort(type);

export const taskHelp = (type) => entry(type)?.help || null;

export const TASK_HELP = Object.fromEntries(Object.entries(TASKS).map(([type, t]) => [type, t.help]));

export const TASK_STEPS = Object.fromEntries(Object.entries(TASKS).filter(([, t]) => t.step).map(([type, t]) => [type, t.step]));

export const taskStep = (type) => entry(type)?.step || null;

export const taskScreen = (type, childId, workflow) => {
  const t = entry(type);
  if (t?.screen) return t.screen;
  const step = t?.byWorkflow ? (workflow === "claim" ? "claim" : "status") : t?.step;
  return step ? `/case/${childId}/${step}` : null;
};

export const taskOwnScreen = (type) => entry(type)?.screen || null;

export const taskNavState =(task) => ({
  claim_id: task.claim_id,
  cashless_case_id: task.cashless_case_id,
  preauthCorrelationId: task.workflow === "preauth" ? task.correlation_id : undefined,
  openAction: entry(task.task_type)?.openAction ? task.task_type : undefined,
  tab: task.task_type?.includes("discharge") ? "discharge" : task.task_type?.includes("final") ? "final" : undefined,
  from: "/work-queue",
});

export const TASK_FILTER_OPTIONS = [
  { value: "", label: "All task types" },
  ...Object.entries(TASKS).map(([value, t]) => ({ value, label: t.label })),
];
