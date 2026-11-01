import { useState } from "react";
import { Check } from "lucide-react";
import PayerName from "../PayerName";
import { formatMoney, formatAge, humanize, formatCaseRef } from "../../format.js";

function IdChip({ label, value }) {
  const [copied, setCopied] = useState(false);
  if (!value) return null;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(String(value));
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false);
    }
  };
  return (
    <button type="button" className="cv-id-chip" onClick={copy} title={`Copy ${label}`}>
      <span className="cv-id-chip-key">{label}</span>
      <span className="cv-mono">{value}</span>
      {copied && <Check size={12} />}
    </button>
  );
}

function PatientPays({ ledger }) {
  const value = ledger?.reconciliation?.to_collect_from_patient ?? ledger?.patient_payable?.value;
  const known = value != null;
  const due = known && value > 0;
  const estimate = known && ledger?.patient_payable?.confidence === "estimated";
  return (
    <section className={`cv-pays${due ? " is-due" : ""}`} aria-label="Patient pays">
      <span className="cv-pays-key">{estimate ? "Patient pays (estimate)" : "Patient pays"}</span>
      <span className="cv-pays-value">{known ? formatMoney(value) : "—"}</span>
    </section>
  );
}

export default function CaseFileHeader({ patient, caseState, effectiveCase, preauthRef, moneyLedger, statusPill }) {
  const policyNumber = caseState.policy?.policy_number || effectiveCase.policy_number;
  const payerId = effectiveCase.payer_id;
  const payerName = caseState.payer?.name;
  const abha = patient.abha_number || patient.abha;
  const meta = [humanize(patient.gender, null), patient.dob ? formatAge(patient.dob) : null].filter(Boolean);

  return (
    <div className="cv-head">
      <section className="cv-head-person" aria-label="Patient and ids">
        <div className="cv-head-line">
          <h2 className="cv-head-name">{patient.name}</h2>
          {statusPill}
          <div className="cv-head-meta">
            {meta.length > 0 && <span>{meta.join(" · ")}</span>}
            {(payerId || payerName) && <span><PayerName id={payerId} name={payerName} /></span>}
          </div>
        </div>
        <div className="cv-id-row">
          <IdChip label="Case" value={caseState.cashless_case_id && formatCaseRef(caseState.cashless_case_id)} />
          <IdChip label="Claim" value={caseState.claim_id} />
          <IdChip label="Patient" value={patient.child_id} />
          <IdChip label="Preauth ref" value={preauthRef} />
          <IdChip label="Policy" value={policyNumber} />
          <IdChip label="ABHA" value={abha} />
        </div>
      </section>
      <PatientPays ledger={moneyLedger} />
    </div>
  );
}
