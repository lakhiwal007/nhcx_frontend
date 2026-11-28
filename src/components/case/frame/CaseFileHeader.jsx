import { useEffect, useRef, useState } from "react";
import { NotebookPen } from "lucide-react";
import { Modal } from "../../ui/Overlay";
import BackButton from "../../ui/BackButton";
import PayerName from "../../ui/PayerName";
import CopyButton from "../../ui/CopyButton";
import { InfoTip } from "../../ui/Common";
import { formatAge, formatDateTime, formatMoney, humanize, formatCaseRef, photoSrc } from "../../../lib/format.js";

function CountUp({ value, text }) {
  const [shown, setShown] = useState(() => (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? value : 0));
  const from = useRef(shown);
  useEffect(() => {
    const start = from.current;
    if (start === value) return undefined;
    const t0 = performance.now();
    let raf = 0;
    const step = (t) => {
      const p = Math.min(1, (t - t0) / 600);
      const v = start + (value - start) * (1 - Math.pow(1 - p, 3));
      from.current = v;
      setShown(p < 1 ? v : value);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return shown === value ? text : formatMoney(Math.round(shown));
}

function Fact({ label, term, value, count, note, copy, fit, extra, due, money }) {
  const title = [label, value, note].filter(Boolean).join(" · ");
  return (
    <div className={`cv-fact${fit ? " is-fit" : ""}${extra ? " is-extra" : ""}${due ? " is-due" : ""}${money ? " is-money" : ""}`} title={title}>
      <span className="cv-fact-key">
        {label}
        {term && <InfoTip term={term} />}
      </span>
      <span className="cv-fact-val">
        <span className={`cv-fact-text${copy ? " is-code" : ""}`}>{count != null ? <CountUp value={count} text={value} /> : value}</span>
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

function MoreDetails({ children }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="cv-facts-more">
      <button type="button" className="cv-btn" aria-haspopup="dialog" onClick={() => setOpen(true)}>
        Details
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Case details" width={560}>
        <div className="cv-facts-pop">{children}</div>
        <div className="confirm-actions">
          <button type="button" className="cv-btn" onClick={() => setOpen(false)}>
            Cancel
          </button>
        </div>
      </Modal>
    </div>
  );
}

export default function CaseFileHeader({ patient, caseState, effectiveCase, preauthRef, statusPill, onBack, backLabel = "Back", money = {}, notesCount = 0, onOpenNotes, asks = null }) {
  const policyNumber = caseState.policy?.policy_number || effectiveCase.policy_number;
  const payerId = effectiveCase.payer_id;
  const payerName = caseState.payer?.name;
  const stay = effectiveCase.stay || {};
  const meta = [humanize(patient.gender, null), patient.dob ? formatAge(patient.dob) : null].filter(Boolean);
  const caseRef = caseState.cashless_case_id && formatCaseRef(caseState.cashless_case_id);
  const admittedNote = [stay.admission_no, stay.admission_type && humanize(stay.admission_type)].filter(Boolean).join(" · ");
  const amount = (value) => (value != null ? formatMoney(value) : null);
  const facts = [
    caseRef && { label: "Case", term: "cashless", value: caseRef, copy: true, fit: true },
    (stay.admitted_at || stay.admission_no) && { label: "Admission", value: when(stay.admitted_at) || stay.admission_no, note: stay.admitted_at ? admittedNote : null, extra: true },
    preauthRef && { label: "Pre-auth ref", term: "preauth", value: preauthRef, copy: true, extra: true },
    caseState.claim_id && { label: "Claim", term: "claim", value: caseState.claim_id, copy: true, fit: true, extra: true },
    stay.discharged_at && { label: "Discharge", value: when(stay.discharged_at), note: stay.discharge_how, extra: true },
    policyNumber && { label: "Policy", term: "policy_number", value: policyNumber, copy: true, fit: true },
    money.requested && { label: money.requested.label, value: amount(money.requested.value), count: Number(money.requested.value), extra: true, money: true },
    money.approved && { label: money.approved.label, value: amount(money.approved.value), count: Number(money.approved.value), money: true },
    money.payable != null && { label: "Patient pays", value: amount(money.payable), count: Number(money.payable), note: money.estimate ? "estimate" : null, due: money.payable > 0, money: true },
  ].filter(Boolean);

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
          {facts.map((f) => (
            <Fact key={f.label} {...f} />
          ))}
        </div>
        {facts.some((f) => f.extra) && (
          <MoreDetails>
            {facts.map((f) => (
              <Fact key={f.label} {...f} count={null} extra={false} />
            ))}
          </MoreDetails>
        )}
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
        {asks}
        {onOpenNotes && (
          <button type="button" className="cv-btn cv-rec-notes" onClick={onOpenNotes}>
            <NotebookPen size={14} aria-hidden="true" /> Notes{notesCount ? ` · ${notesCount}` : ""}
          </button>
        )}
      </div>
    </section>
  );
}
