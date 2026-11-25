import { useState } from "react";
import { api } from "../../../api";
import { useSend } from "../../../hooks/util/useSend";
import { formatMoney } from "../../../lib/format.js";

const DISCHARGE_TYPES = [
  { value: "DTH", label: "Home (normal discharge)" },
  { value: "DTM", label: "Death" },
  { value: "LAMA", label: "Left against medical advice (LAMA)" },
  { value: "DAMA", label: "Discharged against medical advice (DAMA)" },
];
const DISCHARGE_STAGES = ["Before Surgery", "During Surgery", "After Surgery"];
const LM100_STAGES = ["Before Surgery", "During Surgery"];

const toLocalInput = (iso) => (iso ? String(iso).slice(0, 16) : "");
const fromLocalInput = (value) => (value ? `${value}:00+05:30` : null);

export default function DischargeDetailsPane({ claimId, discharge, rules, locked, onSaved }) {
  const initial = {
    type: discharge?.type || "",
    stage: discharge?.stage || "",
    surgery_at: toLocalInput(discharge?.surgery_at),
    death_at: toLocalInput(discharge?.death_at),
    discharged_at: toLocalInput(discharge?.discharged_at),
    stratification: discharge?.stratification || "",
  };
  const [values, setValues] = useState(initial);
  const set = (key) => (e) => setValues((p) => ({ ...p, [key]: e.target.value }));
  const lm100 = ["LAMA", "DAMA"].includes(values.type) && (rules?.lm100_stages || LM100_STAGES).includes(values.stage);
  const rates = rules?.lm100_rates || [];
  const changed = Object.keys(initial).some((k) => (values[k] || "") !== (initial[k] || ""));

  const save = useSend(
    async () => {
      const body = {
        type: values.type || null,
        stage: values.stage || null,
        surgery_at: fromLocalInput(values.surgery_at),
        death_at: values.type === "DTM" ? fromLocalInput(values.death_at) : null,
        discharged_at: fromLocalInput(values.discharged_at),
        stratification: lm100 ? values.stratification || null : null,
      };
      const clean = Object.fromEntries(Object.entries(body).filter(([, v]) => v));
      const res = await api.patchPatientContext(claimId, { patient_context: { discharge: clean } });
      return res?.missing_fields ?? [];
    },
    { success: "Discharge details saved", onDone: (remaining) => onSaved(remaining) },
  );

  return (
    <section className="cv-card" aria-label="How the patient left">
      <div className="cv-card-head">
        <h2 className="cv-card-title">How the patient left</h2>
        <span className="cv-card-meta">The payer needs this with the discharge papers.</span>
        {!locked && changed && (
          <span className="cv-card-tools">
            <button type="button" className="cv-link" onClick={() => setValues(initial)}>
              Reset to hospital record
            </button>
          </span>
        )}
      </div>
      {save.error && (
        <div className="cv-card-body">
          <div className="cv-notice is-bad" role="alert">
            <div className="cv-notice-body">{save.error}</div>
          </div>
        </div>
      )}
      <fieldset className="cv-plain cv-card-body cv-form-grid" disabled={locked}>
        <label className="cv-field-stack">
          <span className="cv-field-key">How the patient left</span>
          <select className="cv-ctl" value={values.type} onChange={set("type")}>
            <option value="">Choose…</option>
            {DISCHARGE_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <label className="cv-field-stack">
          <span className="cv-field-key">Stage</span>
          <select className="cv-ctl" value={values.stage} onChange={set("stage")}>
            <option value="">Choose…</option>
            {DISCHARGE_STAGES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="cv-field-stack">
          <span className="cv-field-key">Discharge date and time</span>
          <input className="cv-ctl" type="datetime-local" value={values.discharged_at} onChange={set("discharged_at")} />
        </label>
        <label className="cv-field-stack">
          <span className="cv-field-key">Surgery date and time (if any)</span>
          <input className="cv-ctl" type="datetime-local" value={values.surgery_at} onChange={set("surgery_at")} />
        </label>
        {values.type === "DTM" && (
          <label className="cv-field-stack">
            <span className="cv-field-key">Date and time of death</span>
            <input className="cv-ctl" type="datetime-local" value={values.death_at} onChange={set("death_at")} />
          </label>
        )}
        {lm100 && (
          <label className="cv-field-stack">
            <span className="cv-field-key">Ward for the LM100 claim</span>
            <select className="cv-ctl" value={values.stratification} onChange={set("stratification")}>
              <option value="">Choose…</option>
              {rates.map((r) => (
                <option key={r.code} value={r.code}>{`${r.label || r.code} · ${formatMoney(r.rate)} a day`}</option>
              ))}
            </select>
          </label>
        )}
      </fieldset>
      {lm100 && (
        <div className="cv-card-body">
          <div className="cv-notice is-warn">
            <div className="cv-notice-body">
              {rates.length
                ? "Claimed as LM100 at the ward rate. Other items drop out."
                : "No LM100 rates in the plan. Fetch it again."}
            </div>
          </div>
        </div>
      )}
      {!locked && (
        <div className="cv-card-body cv-pane-action">
          <button type="button" className="cv-btn" disabled={save.busy} onClick={save.run}>
            {save.busy ? "Saving…" : "Save discharge details"}
          </button>
        </div>
      )}
    </section>
  );
}
