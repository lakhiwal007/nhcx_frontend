import { AlertCircle, AlertTriangle, Ban } from "lucide-react";
import { classifyError } from "../api/payrErrors.js";

// Renders a gateway/adjudication errors[] array. PAYR-coded errors show the
// friendly label + guidance with the raw code tucked into an expandable
// "Details" line for support escalation (per the README PAYR table). Non-PAYR
// errors fall back to their human text. Colors follow severity.
const TONE = {
  warning: { color: "var(--warning)", bg: "rgba(245,158,11,0.06)", Icon: AlertTriangle },
  error: { color: "var(--error)", bg: "rgba(239,68,68,0.05)", Icon: AlertCircle },
  critical: { color: "var(--error)", bg: "rgba(239,68,68,0.1)", Icon: Ban },
};

export default function PayrErrorList({ errors }) {
  if (!errors?.length) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      {errors.map((raw, i) => {
        const e = classifyError(raw);
        const tone = TONE[e.severity] || TONE.error;
        const { Icon } = tone;
        return (
          <div
            key={i}
            style={{
              display: "flex",
              gap: "9px",
              alignItems: "flex-start",
              padding: "10px 12px",
              background: tone.bg,
              border: `1px solid ${tone.color}`,
              borderRadius: "8px",
              fontSize: "13px",
            }}
          >
            <Icon size={15} style={{ color: tone.color, flexShrink: 0, marginTop: "1px" }} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 700, color: tone.color }}>{e.title}</div>
              {e.detail && (
                <div style={{ color: "var(--text-main)", marginTop: "2px" }}>{e.detail}</div>
              )}
              {e.guidance && (
                <div style={{ color: "var(--text-muted)", marginTop: "3px", lineHeight: 1.5 }}>
                  {e.guidance}
                </div>
              )}
              {e.code && (
                <details style={{ marginTop: "5px" }}>
                  <summary
                    style={{
                      cursor: "pointer",
                      fontSize: "11px",
                      color: "var(--text-muted)",
                      userSelect: "none",
                    }}
                  >
                    Details
                  </summary>
                  <code style={{ fontSize: "11px", color: "var(--text-muted)" }}>{e.code}</code>
                </details>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
