import { resolveCaseStatus, STAGES, caseStep, stageIndex, isSettled, needsAttention } from "../caseStatus.js";

export function CaseStatusChip({ claim }) {
  const cfg = resolveCaseStatus({ ...claim, current_step: caseStep(claim) });
  return (
    <span className={`badge-modern cc-status-chip ${cfg.badgeClass}`} title={cfg.label}>
      {cfg.label}
    </span>
  );
}

// Four-segment journey tracker: done stages filled, the current one tinted by
// how the case stands, later ones empty. Always has something to show.
export function StageTrack({ claim }) {
  const idx = stageIndex(claim);
  const settled = isSettled(claim);
  const rejected = /REJECTED/i.test(`${claim.claim_decision || ""} ${claim.preauth_status || ""}`);
  const tone = settled ? "is-done" : rejected ? "is-error" : needsAttention(claim) ? "is-warn" : "is-current";
  return (
    <div className="cc-stage" title={`${STAGES[idx].label} · stage ${idx + 1} of ${STAGES.length}`}>
      <div className="cc-stage-track" aria-hidden="true">
        {STAGES.map((st, i) => (
          <span
            key={st.key}
            className={`cc-stage-seg${settled || i < idx ? " is-done" : i === idx ? ` ${tone}` : ""}`}
          />
        ))}
      </div>
      <div className="cc-stage-label">
        {settled ? "Settled" : STAGES[idx].label}
        <span className="cc-stage-count">{idx + 1}/{STAGES.length}</span>
      </div>
    </div>
  );
}
