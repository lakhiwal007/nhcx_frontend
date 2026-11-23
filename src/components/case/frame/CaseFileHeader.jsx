import BackButton from "../../ui/BackButton";
import PayerName from "../../ui/PayerName";
import CopyButton from "../../ui/CopyButton";
import { InfoTip } from "../../ui/Common";
import { formatAge, formatDateTime, humanize, formatCaseRef, photoSrc } from "../../../lib/format.js";

function Fact({ label, term, value, note, copy, fit }) {
  const title = [label, value, note].filter(Boolean).join(" · ");
  return (
    <div className={`cv-fact${fit ? " is-fit" : ""}`} title={title}>
      <span className="cv-fact-key">
        {label}
        {term && <InfoTip term={term} />}
      </span>
      <span className="cv-fact-val">
        <span className={`cv-fact-text${copy ? " is-code" : ""}`}>{value}</span>
        {copy && <CopyButton value={String(value)} label={`Copy ${label}`} iconOnly className="cv-idcell-copy" />}
      </span>
      {note && <span className="cv-fact-note">{note}</span>}
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

const when = (value) => (value ? formatDateTime(value) : null);

export default function CaseFileHeader({ patient, caseState, effectiveCase, preauthRef, statusPill, onBack, backLabel = "Back" }) {
  const policyNumber = caseState.policy?.policy_number || effectiveCase.policy_number;
  const payerId = effectiveCase.payer_id;
  const payerName = caseState.payer?.name;
  const stay = effectiveCase.stay || {};
  const meta = [humanize(patient.gender, null), patient.dob ? formatAge(patient.dob) : null].filter(Boolean);
  const caseRef = caseState.cashless_case_id && formatCaseRef(caseState.cashless_case_id);
  const admittedNote = [stay.admission_no, stay.admission_type && humanize(stay.admission_type)].filter(Boolean).join(" · ");

  return (
    <section className="cv-head cv-rec" aria-label="Patient and ids">
      <div className="cv-rec-row">
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
            {meta.length > 0 && <div className="cv-head-meta">{meta.join(" · ")}</div>}
          </div>
        </div>
        <div className="cv-facts">
          {caseRef && <Fact label="Case" term="cashless" value={caseRef} copy fit />}
          {(stay.admitted_at || stay.admission_no) && <Fact label="Admission" value={when(stay.admitted_at) || stay.admission_no} note={stay.admitted_at ? admittedNote : null} />}
          {preauthRef && <Fact label="Pre-auth ref" term="preauth" value={preauthRef} copy />}
          {caseState.claim_id && <Fact label="Claim" term="claim" value={caseState.claim_id} copy fit />}
          {stay.discharged_at && <Fact label="Discharge" value={when(stay.discharged_at)} note={stay.discharge_how} />}
          {policyNumber && <Fact label="Policy" term="policy_number" value={policyNumber} copy fit />}
        </div>
        {(payerId || payerName) && (
          <div className="cv-rec-payer">
            <span className="cv-rec-payer-mark" aria-hidden="true">
              <svg viewBox="0 0 24 24">
                <path d="M12 2.5l8 3v6c0 5-3.4 8.6-8 10-4.6-1.4-8-5-8-10v-6l8-3z" />
                <path d="M8 12.2l2.6 2.6L16 9.4" className="tick" />
              </svg>
            </span>
            <span className="cv-rec-payer-name">
              <PayerName id={payerId} name={payerName} />
            </span>
          </div>
        )}
      </div>
    </section>
  );
}
