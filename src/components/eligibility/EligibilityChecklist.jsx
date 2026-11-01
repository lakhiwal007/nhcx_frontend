import { AlertTriangle, Check, Clock, Minus, X } from "lucide-react";

const MARKS = { ok: Check, warn: AlertTriangle, bad: X, wait: Clock, idle: Minus };

export default function EligibilityChecklist({ groups, open, onOpen }) {
  return (
    <nav className="cv-check" aria-label="Eligibility checklist">
      {groups.map((group) => (
        <div key={group.id} className="cv-check-group">
          <div className="cv-check-title">{group.title}</div>
          {group.rows.map((row) => {
            const Mark = MARKS[row.tone] || Minus;
            return (
              <button
                key={row.id}
                type="button"
                className={`cv-check-row is-${row.tone}`}
                aria-current={open === row.id ? "true" : undefined}
                onClick={() => onOpen(row.id)}
              >
                <Mark size={14} className="cv-check-mark" aria-hidden="true" />
                <span className="cv-check-name">{row.name}</span>
                <span className="cv-check-fact" title={row.fact}>{row.fact}</span>
              </button>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
