import { Check } from "lucide-react";
import { motion } from "framer-motion";

// The Case Stepper — a sticky vertical lifecycle rail. Each stage is a
// circle (number or checkmark) with its label + note beside it. Branch nodes
// (e.g. Enhancement, Reprocess) render with a "+" and a dashed ring. Stages
// are computed by buildStages().
export default function CaseStepper({ stages, onNavigate }) {
  return (
    <nav className="cx-rail" aria-label="Case lifecycle">
      <div className="cx-rail-title">Case lifecycle</div>
      <div className="cx-rail-track">
        {stages.map((s, i) => {
          const ariaLabel = s.branch
            ? `${s.label}${s.note ? ` - ${s.note}` : ""}`
            : `Stage ${s.num}: ${s.label}${s.note ? ` - ${s.note}` : ""}`;
          // The connector drawn inside step i spans downward to step i+1's
          // circle, so its fill reflects whether progress has reached i+1.
          const next = stages[i + 1];
          return (
            <div key={s.id} className={`cx-vstep is-${s.state}${s.branch ? " is-branch" : ""}`}>
              {next && (
                <span
                  className={`cx-vstep-connector${next.state === "done" || next.state === "active" ? " is-filled" : ""}`}
                  aria-hidden="true"
                />
              )}
              <motion.button
                className="cx-vstep-btn"
                disabled={!s.clickable}
                onClick={() => s.clickable && onNavigate(s.path)}
                aria-current={s.state === "active" ? "step" : undefined}
                aria-label={ariaLabel}
                whileHover={s.clickable ? { scale: 1.02 } : {}}
                whileTap={s.clickable ? { scale: 0.97 } : {}}
              >
                <span className="cx-vstep-circle" aria-hidden="true">
                  {s.state === "done" ? <Check size={14} strokeWidth={3} /> : s.branch ? "+" : s.num}
                </span>
                <span className="cx-vstep-body">
                  <span className="cx-vstep-label">{s.label}</span>
                  {s.note && s.state !== "active" && (
                    <span className={`cx-vstep-note${s.tone ? ` tone-${s.tone}` : ""}`}>{s.note}</span>
                  )}
                </span>
              </motion.button>
            </div>
          );
        })}
      </div>
    </nav>
  );
}
