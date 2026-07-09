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
          return (
            <div key={s.id} className={`cx-vstep is-${s.state}${s.branch ? " is-branch" : ""}`}>
              {i > 0 && (
                <span
                  className={`cx-vstep-connector${s.state === "done" || s.state === "active" ? " is-filled" : ""}`}
                  aria-hidden="true"
                />
              )}
              <motion.button
                className="cx-vstep-btn"
                disabled={!s.clickable}
                onClick={() => s.clickable && onNavigate(s.path)}
                aria-current={s.state === "active" ? "step" : undefined}
                aria-label={ariaLabel}
                whileHover={s.clickable ? { scale: 1.05 } : {}}
                whileTap={s.clickable ? { scale: 0.95 } : {}}
              >
                <motion.span
                  className="cx-vstep-circle"
                  aria-hidden="true"
                  animate={{
                    boxShadow: s.state === "active" ? "0 0 0 4px color-mix(in srgb, var(--primary) 20%, transparent)" : "none"
                  }}
                >
                  {s.state === "done" ? <Check size={14} strokeWidth={3} /> : s.branch ? "+" : s.num}
                </motion.span>
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
