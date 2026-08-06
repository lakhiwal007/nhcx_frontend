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
  acknowledge_payment: 'payment',
  review_payment_ack_failure: 'payment',
};

export const taskStep = (taskType) => TASK_STEPS[taskType] || null;

export const taskScreen = (taskType, childId) => {
  if (taskType === 'review_communication') return '/communications';
  const step = TASK_STEPS[taskType];
  return step ? `/case/${childId}/${step}` : null;
};
