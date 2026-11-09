import { useEffect, useRef, useState } from "react";
import { Check, ChevronLeft } from "lucide-react";
import PayerName from "../PayerName";
import { stageAmounts } from "./caseStages";
import { formatMoney, formatAge, humanize, formatCaseRef } from "../../format.js";

function IdCell({ label, value }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  const copy = async () => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(String(value));
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false);
    }
  };
  return (
    <button type="button" className="cv-idcell" onClick={copy} disabled={!value} title={value ? `Copy ${label}` : undefined}>
      <span className="cv-idcell-key">{label}</span>
      <span className="cv-idcell-val">
        <span className="cv-idcell-text">{value || "—"}</span>
        {copied && <Check size={12} aria-hidden="true" />}
        <span className="sr-only" aria-live="polite">{copied ? "Copied" : ""}</span>
      </span>
    </button>
  );
}

function MoneyCell({ label, value, due = false, note }) {
  const known = value != null;
  return (
    <div className="cv-moneycell">
      <span className="cv-idcell-key">{label}</span>
      <span className={`cv-moneycell-val${known && due ? " is-due" : ""}`}>
        {known ? formatMoney(value) : "—"}
        {note && <span className="cv-moneycell-note"> {note}</span>}
      </span>
    </div>
  );
}

export default function CaseFileHeader({ patient, caseState, effectiveCase, preauthRef, moneyLedger, statusPill, onBack }) {
  const policyNumber = caseState.policy?.policy_number || effectiveCase.policy_number;
  const payerId = effectiveCase.payer_id;
  const payerName = caseState.payer?.name;
  const abha = patient.abha_number || patient.abha;
  const meta = [humanize(patient.gender, null), patient.dob ? formatAge(patient.dob) : null].filter(Boolean);

  const amounts = stageAmounts({ moneyLedger, effectiveCase });
  const requested = amounts.review;
  const approved = amounts.claim || amounts.status;
  const payable = moneyLedger?.reconciliation?.to_collect_from_patient ?? moneyLedger?.patient_payable?.value;
  const estimate = payable != null && moneyLedger?.patient_payable?.confidence === "estimated";

  return (
    <section className="cv-head" aria-label="Patient, ids and money">
      <div className="cv-head-panels">
        <div className="cv-panel">
          <div className="cv-head-line">
            {onBack && (
              <button type="button" className="cv-link cv-head-back" onClick={onBack}>
                <ChevronLeft size={14} aria-hidden="true" />
                Back
              </button>
            )}
            <h2 className="cv-head-name">{patient.name}</h2>
            {statusPill}
            <div className="cv-head-meta">
              {meta.length > 0 && <span>{meta.join(" · ")}</span>}
              {(payerId || payerName) && (
                <span>
                  <PayerName id={payerId} name={payerName} />
                </span>
              )}
            </div>
          </div>
          <div className="cv-idgrid">
            <IdCell label="Case" value={caseState.cashless_case_id && formatCaseRef(caseState.cashless_case_id)} />
            <IdCell label="Claim" value={caseState.claim_id} />
            <IdCell label="Patient" value={patient.child_id} />
            <IdCell label="Preauth ref" value={preauthRef} />
            <IdCell label="Policy" value={policyNumber} />
            <IdCell label="ABHA" value={abha} />
          </div>
        </div>
        <div className="cv-panel cv-panel-money">
          <div className="cv-panel-title">Money</div>
          <div className="cv-moneygrid">
            <MoneyCell label={requested?.word === "billed" ? "Billed" : "Requested"} value={requested?.value} />
            <MoneyCell label={approved?.word === "approved" ? "Approved" : "Authorised"} value={approved?.value} />
            <MoneyCell label="Patient pays" value={payable} due={payable > 0} note={estimate ? "(estimate)" : null} />
          </div>
        </div>
      </div>
    </section>
  );
}
