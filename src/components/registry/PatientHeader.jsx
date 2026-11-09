import { useState } from "react";
import { ArrowRight, Plus } from "lucide-react";
import { Button, InfoTip } from "../Common";
import PayerName from "../PayerName";
import { CaseStatusChip } from "../caseJourney";
import { formatDate, formatPhone, formatCaseRef, formatAge, formatMoney, humanize, photoSrc } from "../../format.js";
import { STAGES, stageIndex, isSettled } from "../../caseStatus.js";

export function Avatar({ patient, large = false }) {
  const [broken, setBroken] = useState(false);
  const cls = `pt-avatar${large ? " is-lg" : ""}`;
  const src = photoSrc(patient.profile_photo);
  if (src && !broken) return <img className={cls} src={src} alt="" onError={() => setBroken(true)} />;
  return (
    <span className={cls} aria-hidden="true">
      {patient.name?.trim()?.[0]?.toUpperCase() || "?"}
    </span>
  );
}

function Fact({ label, value, mono = false, warn = false, tip }) {
  return (
    <div className="pt-fact">
      <div className="pt-fact-label">
        {label}
        {tip && <InfoTip term={tip} />}
      </div>
      <div className={`pt-fact-value${mono ? " mono" : ""}${warn ? " is-warn" : ""}`}>{value}</div>
    </div>
  );
}

export default function PatientHeader({ patient, current, focusCase, openTasks = 0, onResume, onStart, readOnly = false }) {
  const stay = current ? (current.ended_at ? `Discharged ${formatDate(current.ended_at)}` : `In hospital · ${current.admission_no || "admitted"}`) : "No admission";
  const stage = focusCase ? (isSettled(focusCase) ? "Settled" : STAGES[stageIndex(focusCase)].label) : null;
  const approved = focusCase?.approved_amount ?? focusCase?.claim_approved ?? null;
  const canAct = !readOnly;

  return (
    <section className="pt-card pt-head" aria-label="Patient">
      <div className="pt-head-top">
        <Avatar patient={patient} large />
        <div className="pt-head-id">
          <h1 className="pt-head-name">{patient.name}</h1>
          <div className="pt-head-meta">
            Patient <span className="mono">#{patient.child_id}</span>
            {patient.created_at && ` · registered ${formatDate(patient.created_at)}`}
          </div>
        </div>
        <div className="pt-head-actions">
          {focusCase ? (
            <Button variant="primary" write icon={ArrowRight} onClick={() => onResume(focusCase)}>
              Resume {formatCaseRef(focusCase.cashless_case_id)}
            </Button>
          ) : canAct ? (
            <Button variant="primary" write icon={Plus} onClick={() => onStart(current)}>
              {current ? `Start case for ${current.admission_no || "this admission"}` : "Start cashless case"}
            </Button>
          ) : null}
        </div>
      </div>
      <div className="pt-facts">
        <Fact label="Gender · age" value={[humanize(patient.gender, null), patient.dob ? formatAge(patient.dob) : null].filter(Boolean).join(" · ") || "—"} />
        <Fact label="Date of birth" value={formatDate(patient.dob)} />
        <Fact label="Mobile" value={formatPhone(patient.mobile)} mono />
        <Fact label="ABHA" value={patient.abha_number || "Not linked"} mono={!!patient.abha_number} warn={!patient.abha_number} tip="abha" />
        <Fact label="Now" value={stay} />
      </div>
      {focusCase && (
        <div className="pt-glance" aria-label="Current case">
          <Fact label="Case" value={<span className="mono">{formatCaseRef(focusCase.cashless_case_id)}</span>} />
          <Fact label="Payer" value={<PayerName id={focusCase.payer_id} name={focusCase.payer_name} fallback="Not chosen yet" />} />
          <Fact label="Policy" value={focusCase.policy_number || "—"} mono={!!focusCase.policy_number} />
          <Fact
            label="Stage"
            value={
              <>
                {stage}
                <span className="pt-glance-chip">
                  <CaseStatusChip claim={focusCase} />
                </span>
              </>
            }
          />
          <Fact label="Approved" value={approved != null ? formatMoney(approved) : "Not yet"} />
          <Fact label="Open tasks" value={openTasks ? `${openTasks} waiting` : "None"} warn={openTasks > 0} />
        </div>
      )}
    </section>
  );
}
