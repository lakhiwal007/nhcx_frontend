import { Fragment, useState } from "react";
import { Plus, Search, Trash2 } from "lucide-react";
import DiagnosisCodeFinder from "./DiagnosisCodeFinder";
import { CODE_SYSTEMS, effectiveSystem } from "./diagnosisCodes";

export default function DiagnosesEditor({ diagnoses, locked, onChange, onPrimary, onAdd, onRemove, onPick, groupName = "primary-diagnosis" }) {
  const [finding, setFinding] = useState(null);
  return (
    <fieldset className="cv-plain" disabled={locked}>
      <div className="cv-tw cv-in-card">
        <table>
          <thead>
            <tr>
              <th className="cv-col-code">Code</th>
              <th className="cv-col-system">System</th>
              <th>Description</th>
              <th className="cv-col-principal">Principal</th>
              <th className="cv-col-remove" aria-label="Remove" />
            </tr>
          </thead>
          <tbody>
            {diagnoses.map((diag, i) => (
              <Fragment key={diag._uid ?? `d-${i}`}>
              <tr>
                <td>
                  <div className="cv-code-cell">
                    <input className="cv-ctl cv-ctl-fill cv-mono" placeholder={diag.name ? "No code" : "Code"} aria-label="Diagnosis code" value={diag.code ?? ""} onChange={(e) => onChange(i, "code", e.target.value)} />
                    {onPick && (
                      <button type="button" className={`cv-btn${finding === i ? " is-picked" : ""}`} onClick={() => setFinding(finding === i ? null : i)} aria-label="Find a code" title="Find a code" aria-expanded={finding === i}>
                        <Search size={14} aria-hidden="true" />
                      </button>
                    )}
                  </div>
                </td>
                <td>
                  <select className="cv-ctl cv-ctl-fill" disabled={!diag.code} value={effectiveSystem(diag)} onChange={(e) => onChange(i, "code_system", e.target.value)} aria-label="Code system">
                    {!diag.code && <option value="">—</option>}
                    {CODE_SYSTEMS.map((sys) => (
                      <option key={sys.value} value={sys.value}>
                        {sys.label}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <input className="cv-ctl cv-ctl-fill" placeholder="Diagnosis description" aria-label="Diagnosis description" value={diag.name ?? ""} onChange={(e) => onChange(i, "name", e.target.value)} />
                </td>
                <td>
                  <label className="cv-radio-label">
                    <input type="radio" name={groupName} checked={!!diag.primary} onChange={() => onPrimary(i)} />
                    {diag.primary ? "Principal" : ""}
                  </label>
                </td>
                <td>
                  <button type="button" className="cv-btn" onClick={() => onRemove(i)} aria-label="Remove diagnosis">
                    <Trash2 size={14} aria-hidden="true" />
                  </button>
                </td>
              </tr>
              {finding === i && !locked && (
                <tr>
                  <td colSpan={5}>
                    <DiagnosisCodeFinder
                      name={diag.name}
                      onClose={() => setFinding(null)}
                      onPick={(patch) => {
                        onPick(i, patch);
                        setFinding(null);
                      }}
                    />
                  </td>
                </tr>
              )}
              </Fragment>
            ))}
            {!diagnoses.length && (
              <tr>
                <td colSpan={5} className="cv-card-meta">
                  No diagnosis on record.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {!locked && (
        <div className="cv-card-body cv-pane-action">
          <button type="button" className="cv-btn" onClick={onAdd}>
            <Plus size={14} aria-hidden="true" /> Add diagnosis
          </button>
        </div>
      )}
    </fieldset>
  );
}
