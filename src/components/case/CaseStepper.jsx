import { Check } from "lucide-react";
import { motion } from "framer-motion";

// The Case Stepper — a horizontal numbered lifecycle track. Each stage is a
// circle (number or checkmark) with its label + note beneath. Branch nodes
// (e.g. Enhancement, Reprocess) render with a "+" and a dashed ring. Stages
// are computed by buildStages().
export default function CaseStepper({ stages, onNavigate }) {
  return (
    <nav className="cx-stepper" aria-label="Case lifecycle">
      <div className="cx-stepper-title">Case lifecycle</div>
      <div className="cx-stepper-track">
        {stages.map((s, i) => {
          const ariaLabel = s.branch
            ? `${s.label}${s.note ? ` - ${s.note}` : ""}`
            : `Stage ${s.num}: ${s.label}${s.note ? ` - ${s.note}` : ""}`;
          return (
            <div key={s.id} className={`cx-step is-${s.state}${s.branch ? " is-branch" : ""}`}>
              {i > 0 && (
                <span
                  className={`cx-step-connector${s.state === "done" || s.state === "active" ? " is-filled" : ""}`}
                  aria-hidden="true"
                />
              )}
              <motion.button
                className="cx-step-btn"
                disabled={!s.clickable}
                onClick={() => s.clickable && onNavigate(s.path)}
                aria-current={s.state === "active" ? "step" : undefined}
                aria-label={ariaLabel}
                whileHover={s.clickable ? { scale: 1.05, y: -2 } : {}}
                whileTap={s.clickable ? { scale: 0.95 } : {}}
              >
                <motion.span 
                  className="cx-step-circle" 
                  aria-hidden="true"
                  animate={{ 
                    boxShadow: s.state === "active" ? "0 0 0 4px color-mix(in srgb, var(--primary) 20%, transparent)" : "none" 
                  }}
                >
                  {s.state === "done" ? <Check size={14} strokeWidth={3} /> : s.branch ? "+" : s.num}
                </motion.span>
                <span className="cx-step-label">{s.label}</span>
                {s.note && s.state !== "active" && (
                  <span className={`cx-step-note${s.tone ? ` tone-${s.tone}` : ""}`}>{s.note}</span>
                )}
              </motion.button>
            </div>
          );
        })}
      </div>
    </nav>
  );
}
