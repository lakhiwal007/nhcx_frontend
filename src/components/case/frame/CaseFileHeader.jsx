import BackButton from "../../ui/BackButton";
import PayerName from "../../ui/PayerName";
import CopyButton from "../../ui/CopyButton";
import { InfoTip } from "../../ui/Common";
import { formatAge, humanize, formatCaseRef, photoSrc } from "../../../lib/format.js";

function IdCell({ label, value, term }) {
  return (
    <div className="cv-idcell">
      <span className="cv-idcell-key">
        {label}
        {term && <InfoTip term={term} />}
      </span>
      <span className="cv-idcell-val">
        <span className="cv-idcell-text">{value || "—"}</span>
        {value && <CopyButton value={String(value)} label={`Copy ${label}`} iconOnly className="cv-idcell-copy" />}
      </span>
    </div>
  );
}

function Avatar({ patient }) {
  const src = photoSrc(patient.profile_photo);
  if (src) return <img className="cv-rec-av" src={src} alt="" />;
  const initials = String(patient.name || "")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
  return (
    <span className="cv-rec-av" aria-hidden="true">
      {initials || "?"}
    </span>
  );
}

export default function CaseFileHeader({ patient, caseState, effectiveCase, preauthRef, statusPill, onBack, backLabel = "Back" }) {
  const policyNumber = caseState.policy?.policy_number || effectiveCase.policy_number;
  const payerId = effectiveCase.payer_id;
  const payerName = caseState.payer?.name;
  const abha = patient.abha_number || patient.abha;
  const meta = [humanize(patient.gender, null), patient.dob ? formatAge(patient.dob) : null].filter(Boolean);

  return (
    <section className="cv-head cv-rec" aria-label="Patient and ids">
      <div className="cv-rec-id">
        {onBack && (
          <BackButton className="cv-head-back" onClick={onBack}>
            {backLabel}
          </BackButton>
        )}
        <Avatar patient={patient} />
        <div className="cv-rec-who">
          <div className="cv-rec-line">
            <h2 className="cv-head-name">{patient.name}</h2>
            {statusPill}
          </div>
          <div className="cv-head-meta">
            {meta.length > 0 && <span>{meta.join(" · ")}</span>}
            {(payerId || payerName) && (
              <span>
                <PayerName id={payerId} name={payerName} />
              </span>
            )}
          </div>
        </div>
      </div>
      <div className="cv-rec-facts">
        <IdCell label="Case" term="cashless" value={caseState.cashless_case_id && formatCaseRef(caseState.cashless_case_id)} />
        <IdCell label="Claim" term="claim" value={caseState.claim_id} />
        <IdCell label="Patient" value={patient.child_id} />
        <IdCell label="Pre-auth ref" term="preauth" value={preauthRef} />
        <IdCell label="Policy" term="policy_number" value={policyNumber} />
        <IdCell label="ABHA" term="abha" value={abha} />
      </div>
    </section>
  );
}
