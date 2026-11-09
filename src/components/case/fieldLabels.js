const LABELS = {
  diagnoses: "a diagnosis",
  items: "billable items",
  preauth_ref: "the pre-auth reference",
  admission_date: "the admission date",
  discharge_date: "the discharge date",
  policy_number: "the policy number",
  "patient.identifier": "an ABHA or member ID",
  "patient.abha": "the ABHA number",
  "patient.member_id": "the member ID",
  "patient.dob": "the date of birth",
  "patient.name": "the patient's name",
  "patient.gender": "the patient's gender",
  "discharge.type": "the discharge type",
  "discharge.date": "the discharge date",
  "discharge.summary": "the discharge summary",
  "newborn.name": "the baby's name",
  "newborn.gender": "the baby's gender",
  "newborn.dob": "the baby's date of birth",
  "newborn.proof_of_birth": "the proof of birth",
};

export const fieldLabel = (key) => {
  const k = String(key || "").toLowerCase();
  return LABELS[k] || k.replace(/^[a-z]+\./, "").replace(/[_.]/g, " ");
};

export const fieldList = (keys) => {
  const words = (keys || []).map(fieldLabel);
  if (words.length <= 1) return words.join("");
  return `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
};

export const NEWBORN_MISSING = {
  "newborn.name": "the baby's name is missing in the hospital records",
  "newborn.gender": "the baby's gender is missing in the hospital records",
  "newborn.dob": "the baby's date of birth is missing in the hospital records",
  "newborn.proof_of_birth": "attach the proof of birth under Documents",
};
