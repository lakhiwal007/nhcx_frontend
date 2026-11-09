import { useState } from "react";
import { api } from "../../api";
import { useSend } from "../../hooks/useSend";
import { fieldList } from "./fieldLabels";

const FIELDS = [
  { key: "abha", label: "ABHA number", placeholder: "91-XXXX-XXXX-XXXX" },
  { key: "member_id", label: "Member or PMJAY ID", placeholder: "PMJAY-MEM-XXXXX" },
  { key: "dob", label: "Date of birth", type: "date" },
  { key: "admission_date", label: "Admission date", type: "date" },
  { key: "discharge_date", label: "Discharge date", type: "date" },
  { key: "policy_number", label: "Policy number", placeholder: "POL-XXXX" },
];

const MISSING_FIELD_MAP = {
  "patient.identifier": ["abha", "member_id"],
  "patient.abha": ["abha"],
  "patient.member_id": ["member_id"],
  "patient.dob": ["dob"],
  "patient.name": [],
  "patient.gender": [],
  admission_date: ["admission_date"],
  discharge_date: ["discharge_date"],
  "discharge.date": ["discharge_date"],
  policy_number: ["policy_number"],
};

const clean = (values) => Object.fromEntries(Object.entries(values).filter(([, v]) => v != null && String(v).trim() !== ""));

export default function PatientDetailsForm({ claimId, cashlessCaseId, missingFields, known = {}, locked, onResolved }) {
  const [values, setValues] = useState(() => clean(known));
  const relevantKeys = new Set(missingFields.flatMap((m) => MISSING_FIELD_MAP[m.toLowerCase()] ?? []));
  const fields = relevantKeys.size > 0 ? FIELDS.filter((f) => relevantKeys.has(f.key)) : FIELDS;
  const unmapped = missingFields.filter((m) => !(MISSING_FIELD_MAP[m.toLowerCase()] || []).length);
  const changed = fields.some((f) => (values[f.key] || "") !== (known[f.key] || ""));

  const save = useSend(
    async () => {
      const patient_context = clean(values);
      const res = claimId
        ? await api.patchPatientContext(claimId, { patient_context })
        : await api.patchCashlessPatientContext(cashlessCaseId, { patient_context });
      return res?.missing_fields ?? [];
    },
    { success: "Patient details saved", onDone: (remaining) => onResolved(remaining) },
  );

  return (
    <section className="cv-card" aria-label="Patient details">
      <div className="cv-card-head">
        <h2 className="cv-card-title">Patient details</h2>
        <span className="cv-chip is-warn">Needed before the send</span>
        <span className="cv-card-meta">The hospital records are missing {fieldList(missingFields)}.</span>
        {!locked && changed && (
          <span className="cv-card-tools">
            <button type="button" className="cv-link" onClick={() => setValues(clean(known))}>
              Reset to hospital record
            </button>
          </span>
        )}
      </div>
      {unmapped.length > 0 && (
        <div className="cv-card-intro">
          {fieldList(unmapped)} can only be corrected in the hospital system. Ask the front desk to fix the record, then reload this page.
        </div>
      )}
      {save.error && (
        <div className="cv-card-body">
          <div className="cv-notice is-bad" role="alert">
            <div className="cv-notice-body">{save.error}</div>
          </div>
        </div>
      )}
      <fieldset className="cv-plain cv-card-body cv-form-grid" disabled={locked}>
        {fields.map((f) => (
          <label key={f.key} className="cv-field-stack">
            <span className="cv-field-key">{f.label}</span>
            <input
              className="cv-ctl"
              type={f.type || "text"}
              placeholder={f.placeholder}
              value={values[f.key] || ""}
              onChange={(e) => setValues((p) => ({ ...p, [f.key]: e.target.value }))}
            />
          </label>
        ))}
      </fieldset>
      {!locked && (
        <div className="cv-card-body cv-pane-action">
          <button type="button" className="cv-btn" disabled={save.busy} onClick={save.run}>
            {save.busy ? "Saving…" : "Save details"}
          </button>
        </div>
      )}
    </section>
  );
}
