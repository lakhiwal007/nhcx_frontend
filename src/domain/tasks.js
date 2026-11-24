export const TASKS = {
  review_insurance_plan_documents: {
    short: "Insurance plan",
    label: "Review the insurance plan",
    help: "The payer sent its plan, with a list of documents to prepare. Open the case's Eligibility step and check the list.",
    step: "prep",
  },
  attach_eligibility_documents: {
    short: "Eligibility docs",
    label: "Attach eligibility documents",
    help: "The payer wants documents before it confirms cover. Open the case and attach them on the Pre-auth step.",
    step: "prep",
  },
  fix_eligibility_error: {
    short: "Eligibility",
    label: "Fix the eligibility check",
    help: "The eligibility check failed. Open the case's Eligibility step and read the reason. If the payer refused an item code, choose a package from its plan and send the checks again.",
    step: "prep",
  },
  choose_plan_package: {
    short: "Package",
    label: "Choose the plan package",
    help: "The payer's plan has arrived, but none of its packages matches the planned procedure. Open the Eligibility step, choose the package for this admission and send the checks.",
    step: "prep",
  },
  submit_preauth: {
    short: "Pre-auth",
    label: "Send the pre-auth",
    help: "The case is ready for a pre-auth. Open the Pre-auth step, check the draft and send it.",
    step: "review",
  },
  respond_preauth_query: {
    short: "Pre-auth query",
    label: "Answer the pre-auth query",
    help: "The payer asked a question about the pre-auth. Open the Approval step and answer it.",
    step: "status",
    openAction: true,
  },
  resubmit_preauth: {
    short: "Pre-auth",
    label: "Resend the pre-auth",
    help: "The pre-auth needs to be sent again. Open the Approval step, read the payer's reason, fix it and resend.",
    step: "status",
    openAction: true,
  },
  request_enhancement: {
    short: "Enhancement",
    label: "Ask for an enhancement",
    help: "The hospital bill is over the amount the payer approved. Open the Enhancement step and ask the payer for more while the patient is still admitted.",
    step: "enhancement",
  },
  resubmit_enhancement: {
    short: "Enhancement",
    label: "Resend the enhancement",
    help: "The enhancement request needs to be sent again. Open the case and resend it with what the payer asked for.",
    step: "status",
    openAction: true,
  },
  submit_discharge_claim: {
    short: "Discharge claim",
    label: "Send the discharge claim",
    help: "The patient is discharged. Open the Claim step and send the discharge documents.",
    step: "claim",
  },
  resubmit_discharge_claim: {
    short: "Discharge claim",
    label: "Resend the discharge claim",
    help: "The payer turned down or queried the discharge claim. Open the Claim step, fix it or answer the question, and send it again.",
    step: "claim",
    openAction: true,
  },
  submit_final_claim: {
    short: "Final claim",
    label: "Send the final claim",
    help: "Discharge is done. Open the Claim step and send the final claim.",
    step: "claim",
  },
  respond_claim_query: {
    short: "Claim query",
    label: "Answer the claim query",
    help: "The payer asked a question about the claim. Open the Claim step and answer it.",
    step: "claim",
    openAction: true,
  },
  resubmit_claim: {
    short: "Resend claim",
    label: "Resend the claim",
    help: "The payer sent the claim back. Open the Claim step, read the payer's notes, fix what it asks for and send the claim again.",
    step: "claim",
  },
  submit_reprocess: {
    short: "Reprocess",
    label: "Ask for a reprocess",
    help: "The claim was rejected. If you disagree, open the case and ask the payer to look at it again (a reprocess). Attach the documents that support your case.",
    step: "reprocess",
  },
  request_claim_release: {
    short: "Balance",
    label: "Ask for the balance",
    help: "The payer paid less than it approved. Open the Claim step and ask for the balance.",
    step: "claim",
    openAction: true,
  },
  acknowledge_payment: {
    short: "Payment",
    label: "Confirm the payment",
    help: "Money has arrived. Check the amount and UTR against the bank statement, then confirm it.",
    step: "payment",
  },
  review_payment_ack_failure: {
    short: "Payment",
    label: "Resend the payment confirmation",
    help: "Our confirmation of a payment didn't reach the payer. Press “Send it again”.",
    step: "payment",
  },
  review_communication: {
    short: "Message",
    label: "Read the payer's message",
    help: "The payer sent a message. Open it, read it and reply if it asks for something.",
    screen: "/communications",
  },
  review_callback_failure: {
    short: "Payer answer",
    label: "Read the payer's answer again",
    help: "A payer answer arrived but couldn't be read. Open the task and press Read the payer's answer again. If it fails again, tell your IT team.",
  },
  cancel_superseded_preauth: {
    short: "Withdraw",
    label: "Withdraw the older pre-auth",
    help: "An older pre-auth for this case is no longer needed. Withdraw it so the payer does not have two for the same case.",
  },
  chase_payer_answer: {
    short: "No answer",
    label: "No answer from the payer",
    help: "The payer has not answered for several hours. Call the payer's desk, or check the status from the case if that payer answers status checks. If no answer is expected for a pre-auth, you can give up on the request from the case.",
    byWorkflow: true,
  },
  review_payer_decision: {
    short: "Unclear answer",
    label: "Unclear payer answer",
    help: "The payer answered but did not say what it decided. Nothing more can be sent until it does. Call the payer's desk or send it a message.",
    byWorkflow: true,
  },
  review_closed_case_answer: {
    short: "Closed case",
    label: "Answer on a closed case",
    help: "The payer answered on a case that was closed here. Open the case and read the audit trail. Reopen the case if the answer needs action; otherwise mark this task done.",
    step: "timeline",
  },
  link_payment_to_claim: {
    short: "Unlinked payment",
    label: "Link an unlinked payment",
    help: "Money arrived that matches no case here. Open Payments, find it under Unlinked and link it to the right case so the payer can be told it arrived.",
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
