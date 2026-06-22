import { Check } from "lucide-react";

// The Case Spine — the persistent lifecycle rail. Stages are computed by
// buildStages() in ./caseStages and passed in.
export default function CaseSpine({ stages, onNavigate }) {
  return (
    <nav className="cx-spine" aria-label="Case lifecycle">
      <div className="cx-spine-title">Case lifecycle</div>
      <div className="cx-spine-inner">
        {stages.map((s) => (
          <button
            key={s.id}
            className={`cx-node is-${s.state}${s.branch ? " is-branch" : ""}`}
            disabled={!s.clickable}
            onClick={() => s.clickable && onNavigate(s.path)}
            aria-current={s.state === "active" ? "step" : undefined}
          >
            <span className="cx-marker" aria-hidden="true">
              {s.state === "done" ? <Check size={15} strokeWidth={3} /> : s.branch ? "+" : s.num}
            </span>
            <span className="cx-node-body">
              <span className="cx-node-label">{s.label}</span>
              {s.note && (
                <span className={`cx-node-note${s.tone ? ` tone-${s.tone}` : ""}`}>{s.note}</span>
              )}
              {s.state === "active" && s.live && (
                <svg className="cx-ecg" viewBox="0 0 120 14" preserveAspectRatio="none" aria-hidden="true">
                  <polyline points="0,7 22,7 30,7 36,2 42,12 50,7 70,7 78,7 84,3 90,11 96,7 120,7" />
                </svg>
              )}
            </span>
          </button>
        ))}
      </div>
    </nav>
  );
}
