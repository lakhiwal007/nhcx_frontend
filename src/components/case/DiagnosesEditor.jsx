import { Plus, Trash2 } from "lucide-react";
import { CODE_SYSTEMS, effectiveSystem } from "./diagnosisCodes";

export default function DiagnosesEditor({ diagnoses, locked, onChange, onPrimary, onAdd, onRemove, groupName = "primary-diagnosis" }) {
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
              <tr key={diag._uid ?? `d-${i}`}>
                <td>
                  <input className="cv-ctl cv-ctl-fill cv-mono" placeholder="Code" aria-label="Diagnosis code" value={diag.code ?? ""} onChange={(e) => onChange(i, "code", e.target.value)} />
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
