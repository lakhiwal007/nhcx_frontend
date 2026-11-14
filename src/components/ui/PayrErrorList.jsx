import { AlertCircle, AlertTriangle, Ban } from "lucide-react";
import { classifyError } from "../../api/payrErrors.js";
import { usePayerGuide } from "../../help/usePayerGuide.js";

const ICONS = { warning: AlertTriangle, error: AlertCircle, critical: Ban };

export default function PayrErrorList({ errors }) {
  usePayerGuide();
  if (!errors?.length) return null;
  return (
    <div className="pe-list">
      {errors.map((raw, i) => {
        const e = classifyError(raw);
        const severity = ICONS[e.severity] ? e.severity : "error";
        const Icon = ICONS[severity];
        return (
          <div key={i} className={`pe-row is-${severity}`}>
            <Icon size={15} className="pe-icon" aria-hidden="true" />
            <div className="pe-body">
              <div className="pe-title">{e.title}</div>
              {e.meaning && <div className="pe-meaning">{e.meaning}</div>}
              {e.detail && (
                <div className="pe-detail">
                  {e.meaning ? <span className="pe-detail-label">Payer said: </span> : null}
                  {e.detail}
                </div>
              )}
              {e.guidance && <div className="pe-guidance">{e.guidance}</div>}
              {e.code && (
                <details className="pe-more">
                  <summary>Details for the IT team</summary>
                  <code className="pe-code">{e.code}</code>
                  {e.fix?.length > 0 && (
                    <ol className="pe-fix">
                      {e.fix.map((step, n) => (
                        <li key={n}>{step}</li>
                      ))}
                    </ol>
                  )}
                </details>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
