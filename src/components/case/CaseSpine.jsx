import { Check } from "lucide-react";

// The Case Spine — a thin vertical lifecycle rail. Renders dots only; each
// stage's label + note live in a flyout shown on hover/focus, which doubles
// as the node's accessible name. Stages are computed by buildStages().
export default function CaseSpine({ stages, onNavigate }) {
  return (
    <nav className="cx-spine" aria-label="Case lifecycle">
      <div className="cx-spine-title">Case lifecycle</div>
      <div className="cx-spine-inner">
        {stages.map((s) => {
          const ariaLabel = s.branch
            ? `${s.label}${s.note ? ` - ${s.note}` : ""}`
            : `Stage ${s.num}: ${s.label}${s.note ? ` - ${s.note}` : ""}`;
          return (
            <button
              key={s.id}
              className={`cx-node is-${s.state}${s.branch ? " is-branch" : ""}`}
              disabled={!s.clickable}
              onClick={() => s.clickable && onNavigate(s.path)}
              aria-current={s.state === "active" ? "step" : undefined}
              aria-label={ariaLabel}
            >
              <span className="cx-marker" aria-hidden="true">
                {s.state === "done" ? <Check size={15} strokeWidth={3} /> : s.branch ? "+" : s.num}
              </span>
              <span className="cx-node-flyout" aria-hidden="true">
                <span className="cx-node-label">
                  {!s.branch && <span className="cx-node-num">{s.num}</span>}
                  {s.label}
                </span>
                {s.note && (
                  <span className={`cx-node-note${s.tone ? ` tone-${s.tone}` : ""}`}>{s.note}</span>
                )}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
