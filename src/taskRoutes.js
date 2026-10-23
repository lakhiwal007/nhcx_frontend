export const TASK_STEPS = {
  review_insurance_plan_documents: 'prep',
  attach_eligibility_documents: 'prep',
  fix_eligibility_error: 'prep',
  submit_preauth: 'review',
  respond_preauth_query: 'status',
  resubmit_preauth: 'status',
  resubmit_enhancement: 'status',
  submit_discharge_claim: 'claim',
  resubmit_discharge_claim: 'claim',
  submit_final_claim: 'claim',
  respond_claim_query: 'claim',
  resubmit_claim: 'claim',
  submit_reprocess: 'reprocess',
  request_claim_release: 'claim',
  acknowledge_payment: 'payment',
  review_payment_ack_failure: 'payment',
};

export const taskStep = (taskType) => TASK_STEPS[taskType] || null;

export const taskScreen = (taskType, childId) => {
  if (taskType === 'review_communication') return '/communications';
  const step = TASK_STEPS[taskType];
  return step ? `/case/${childId}/${step}` : null;
};

const OPEN_ACTIONS = new Set([
  'resubmit_preauth',
  'resubmit_enhancement',
  'respond_preauth_query',
  'request_claim_release',
  'respond_claim_query',
  'resubmit_discharge_claim',
]);

// Router state that lands a task on its case step with the right drawer or tab open.
export const taskNavState = (task) => ({
  claim_id: task.claim_id,
  cashless_case_id: task.cashless_case_id,
  preauthCorrelationId: task.workflow === 'preauth' ? task.correlation_id : undefined,
  openAction: OPEN_ACTIONS.has(task.task_type) ? task.task_type : undefined,
  tab: task.task_type?.includes('discharge') ? 'discharge' : task.task_type?.includes('final') ? 'final' : undefined,
});
