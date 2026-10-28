export const TASK_HELP = {
  review_insurance_plan_documents: "The payer sent its plan with documents to prepare. Open the case's Eligibility step and check the list.",
  attach_eligibility_documents: "The payer wants documents before it confirms cover. Open the case and upload them on the Preauth step.",
  fix_eligibility_error: "The eligibility check failed. Open the case's Eligibility step, read the reason and re-run it.",
  submit_preauth: "The case is ready for a preauth. Open the Preauth step, check the draft and submit it.",
  respond_preauth_query: "The payer asked a question about the preauth. Open the Approval step and press Respond to query.",
  resubmit_preauth: "The preauth needs to be sent again. Open the Approval step, read the payer's reason, fix it and resubmit.",
  resubmit_enhancement: "The enhancement request needs to be sent again. Open the case and resend it with what the payer asked for.",
  submit_discharge_claim: "The patient is discharged. Open the Claim step and send the discharge documents.",
  resubmit_discharge_claim: "The payer turned down the discharge documents. Open the Claim step, fix them and resubmit.",
  submit_final_claim: "Discharge is done. Open the Claim step and send the final claim.",
  respond_claim_query: "The payer asked a question about the claim. Open the Claim step and press Respond to query.",
  resubmit_claim: "The claim needs attention. Open the Claim step and follow the payer's notes.",
  submit_reprocess: "The claim was rejected. If you disagree, open the case and ask for a reprocess with your evidence.",
  request_claim_release: "The payer paid less than it approved. Open the Claim step and use Ask for the balance.",
  acknowledge_payment: "Money has arrived. Check the amount and UTR against the bank statement, then confirm it.",
  review_payment_ack_failure: "Our confirmation of a payment didn't reach the payer. Open the payment and press Retry.",
  review_communication: "The payer sent a message. Open it, read it and reply if it asks for something.",
  review_callback_failure: "A payer answer arrived but couldn't be read. Press Retry; if it fails again, tell your IT team.",
  cancel_superseded_preauth: "An older preauth for this case is no longer needed. Withdraw it so the payer doesn't hold two.",
};

export const taskHelp = (type) => TASK_HELP[type] || null;
