import { useState } from "react";
import { api } from "../../api";
import { Button } from "../Common";
import { Section } from "./CaseFile";

const PATIENT_CONTEXT_FIELDS = [
  { key: "abha", label: "ABHA Number", placeholder: "91-XXXX-XXXX-XXXX" },
  { key: "member_id", label: "Member / PMJAY ID", placeholder: "PMJAY-MEM-XXXXX" },
  { key: "dob", label: "Date of Birth", placeholder: "YYYY-MM-DD", type: "date" },
  { key: "admission_date", label: "Admission Date", placeholder: "YYYY-MM-DD", type: "date" },
  { key: "discharge_date", label: "Discharge Date", placeholder: "YYYY-MM-DD", type: "date" },
  { key: "policy_number", label: "Policy Number", placeholder: "POL-XXXX" },
];

// Maps backend missing_fields values to form field keys
const MISSING_FIELD_MAP = {
  "patient.identifier": ["abha", "member_id"],
  "patient.abha": ["abha"],
  "patient.member_id": ["member_id"],
  "patient.dob": ["dob"],
  "patient.name": [],
  "patient.gender": [],
  admission_date: ["admission_date"],
  discharge_date: ["discharge_date"],
  policy_number: ["policy_number"],
};

// The details NHCX needs that the hospital records could not supply, on the
// pre-auth or the claim. Only the fields actually missing are asked for.
export default function PatientDetailsForm({ claimId, cashlessCaseId, missingFields, locked, onResolved }) {
  const [values, setValues] = useState({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  const relevantKeys = new Set(missingFields.flatMap((m) => MISSING_FIELD_MAP[m.toLowerCase()] ?? []));
  const allFields = relevantKeys.size > 0 ? PATIENT_CONTEXT_FIELDS.filter((f) => relevantKeys.has(f.key)) : PATIENT_CONTEXT_FIELDS;

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const res = claimId
        ? await api.patchPatientContext(claimId, { patient_context: values })
        : await api.patchCashlessPatientContext(cashlessCaseId, { patient_context: values });
      onResolved(res.missing_fields ?? []);
    } catch (err) {
      setSaveError(err.message || "The details could not be saved.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Section id="pd-missing" title="Missing patient details" meta={<span className="is-bad">Needed before the request can be sent</span>}>
      {saveError && <div className="cv-notice is-bad"><div className="cv-notice-body">{saveError}</div></div>}
      <fieldset className="pd-form cv-plain" disabled={locked}>
        {allFields.map((f) => (
          <label key={f.key} className="pd-form-field">
            <span>{f.label}</span>
            <input
              className="input-modern pd-input"
              type={f.type || "text"}
              placeholder={f.placeholder}
              value={values[f.key] || ""}
              onChange={(e) => setValues((p) => ({ ...p, [f.key]: e.target.value }))}
            />
          </label>
        ))}
      </fieldset>
      <div className="pd-form-actions">
        <Button write variant="primary" size="small" disabled={saving || locked} onClick={handleSave}>
          {saving ? "Saving…" : "Save & refresh draft"}
        </Button>
      </div>
    </Section>
  );
}
