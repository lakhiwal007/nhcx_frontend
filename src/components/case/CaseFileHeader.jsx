import { useState } from "react";
import { Check } from "lucide-react";
import PayerName from "../PayerName";
import { formatMoney, formatAge, humanize, formatCaseRef } from "../../format.js";

const money = (v) => (v == null ? null : formatMoney(v));

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

function figures(ledger, approvedAmount) {
  const rows = [
    { label: "Billed", value: ledger?.billed?.value },
    { label: "Authorised", value: ledger?.authorized_ceiling?.value },
    { label: "Approved", value: ledger?.approved?.value ?? approvedAmount },
    { label: "Settled", value: ledger?.settlement?.net },
  ].filter((r) => r.value != null);
  const collect = ledger?.reconciliation?.to_collect_from_patient;
  if (collect != null) rows.push({ label: "Patient pays", value: collect, warn: collect > 0 });
  return rows;
}

export default function CaseFileHeader({ patient, caseState, effectiveCase, preauthRef, approvedAmount, moneyLedger, statusPill }) {
  const policyNumber = caseState.policy?.policy_number || effectiveCase.policy_number;
  const payerId = effectiveCase.payer_id;
  const payerName = caseState.payer?.name;
  const abha = patient.abha_number || patient.abha;
  const meta = [humanize(patient.gender, null), patient.dob ? formatAge(patient.dob) : null].filter(Boolean);
  const cells = figures(moneyLedger, approvedAmount);

  return (
    <div className="cv-head">
      <div className="cv-head-person">
        <h2 className="cv-head-name">{patient.name}</h2>
        {statusPill}
        <div className="cv-head-meta">
          {meta.length > 0 && <span>{meta.join(" · ")}</span>}
          {(payerId || payerName) && <span><PayerName id={payerId} name={payerName} /></span>}
        </div>
        <div className="cv-id-row">
          <IdChip label="Case" value={caseState.cashless_case_id && formatCaseRef(caseState.cashless_case_id)} />
          <IdChip label="Claim" value={caseState.claim_id} />
          <IdChip label="Patient" value={patient.child_id} />
          <IdChip label="Preauth ref" value={preauthRef} />
          <IdChip label="Policy" value={policyNumber} />
          <IdChip label="ABHA" value={abha} />
        </div>
      </div>
      {cells.length > 0 && (
        <dl className="cv-figures">
          {cells.map((c) => (
            <div key={c.label} className={`cv-figure${c.warn ? " is-warn" : ""}`}>
              <dt>{c.label}</dt>
              <dd>{money(c.value)}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
