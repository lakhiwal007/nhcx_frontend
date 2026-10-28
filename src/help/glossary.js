export const GLOSSARY = {
  cashless: {
    term: "Cashless case",
    short: "The insurer pays the hospital directly, so the patient doesn't pay the covered amount at discharge.",
    more: "Each admission paid by insurance is one cashless case. It moves through policy, eligibility, preauth, approval, claim and payment.",
  },
  policy: {
    term: "Policy",
    short: "The patient's health insurance plan. It names the insurer (payer) who pays the bill.",
    more: "The policy number is printed on the insurance card or e-card.",
  },
  payer: {
    term: "Payer",
    short: "The insurance company, TPA or government scheme (like PMJAY) that pays the claim.",
  },
  tpa: {
    term: "TPA",
    short: "A Third Party Administrator handles claims for an insurer. Its name is usually on the patient's insurance card.",
  },
  member_id: {
    term: "Member ID",
    short: "The patient's own number on the policy. It is printed on the insurance card, often as 'Member ID', 'UHID' or 'Card number'.",
    more: "On a family card each person has their own member ID.",
  },
  policy_number: {
    term: "Policy number",
    short: "The number of the insurance policy itself. Family members on one card share it.",
  },
  abha: {
    term: "ABHA number",
    short: "The 14-digit Ayushman Bharat Health Account number (looks like 91-1234-5678-9012).",
    more: "It is different from an ABHA address like name@abdm, and different from the PMJAY (Ayushman) card. Insurers can link a policy to the ABHA number, which is how the policy lookup finds it.",
  },
  mobile: {
    term: "Mobile number",
    short: "The patient's 10-digit mobile number, as registered with the insurer.",
  },
  aadhaar: {
    term: "Aadhaar number",
    short: "The 12-digit Aadhaar. It is sent only to the payer to help it find the patient, and we keep only the last four digits.",
  },
  sum_insured: {
    term: "Sum insured",
    short: "The most the policy pays in the policy year.",
  },
  balance: {
    term: "Balance",
    short: "What is left of the sum insured after earlier claims this year. A family card shares one balance.",
  },
  discovery: {
    term: "Discover with a payer",
    short: "Ask one insurer directly whether it covers this patient, when the normal lookup finds nothing.",
    more: "Use it when the patient has an insurance card but the policy isn't linked to their ABHA or mobile. You need the policy number or the member ID from the card.",
  },
  eligibility: {
    term: "Eligibility check",
    short: "Asks the payer whether the policy is active today and what it covers.",
    more: "Three questions go together: is the policy in force, what are its limits, and which procedures need approval first.",
  },
  insurance_plan: {
    term: "Insurance plan (package list)",
    short: "The payer's list of packages, rates and forms for this policy. Preauth lines are priced from it.",
  },
  family_card: {
    term: "Family card",
    short: "One policy that covers several people. Pick the person who is actually admitted, or the bill goes to the wrong member.",
  },
  preauth: {
    term: "Preauth (pre-authorisation)",
    short: "Asking the payer to approve the treatment and amount before or soon after admission.",
    more: "The approved amount is what the payer agrees to pay. Treat within it, or ask for more with an enhancement.",
  },
  query: {
    term: "Query",
    short: "The payer needs more information or documents before deciding. Answer it from the case's messages; the decision waits until you do.",
  },
  enhancement: {
    term: "Enhancement",
    short: "Asking the payer to raise the approved amount when treatment costs more than first approved.",
  },
  cancel_preauth: {
    term: "Cancel preauth",
    short: "Withdraws the request, for example if the patient was not admitted or moved to cash.",
  },
  discharge: {
    term: "Discharge",
    short: "Tells the payer the patient has left and sends the discharge papers, before the final claim.",
  },
  claim: {
    term: "Claim",
    short: "The final bill sent to the payer after discharge, asking it to pay what it approved.",
  },
  reprocess: {
    term: "Reprocess",
    short: "Asking the payer to look again at a rejected claim, with a reason and any missing documents.",
  },
  balance_release: {
    term: "Ask for the balance",
    short: "When the payer paid only part of the approved amount, asks it to release the rest.",
  },
  payment_notice: {
    term: "Payment notice",
    short: "The payer's message that it has paid, with the amount and the bank reference (UTR).",
  },
  utr: {
    term: "UTR",
    short: "The bank's Unique Transaction Reference for the payment. Use it to match the money in the hospital's bank statement.",
  },
  payer_forms: {
    term: "Payer forms",
    short: "Questions the payer wants answered with the request, such as consent or clinical details. Unanswered required forms can get the request refused.",
  },
  proof_of_presence: {
    term: "Patient verification",
    short: "PMJAY asks for proof that the patient was really at the hospital: a face, fingerprint or iris scan, or a signed consent form when a scan isn't possible.",
  },
  waiting: {
    term: "Waiting for the payer",
    short: "The request reached the payer and it is deciding. Answers usually arrive within minutes to a few hours; you can leave this page.",
  },
  tasks: {
    term: "Work queue",
    short: "Everything waiting on the hospital: payer queries to answer, decisions to review, payments to confirm.",
  },
  facility: {
    term: "Facility",
    short: "The hospital or clinic you act for. Requests go to payers in its name.",
  },
};

export const glossary = (key) => GLOSSARY[key] || null;
