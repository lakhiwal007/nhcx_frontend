import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { api, markHandled } from "../../api";
import { ICD_10, SNOMED_CT } from "./diagnosisCodes";

const SYSTEMS = [
  { key: "icd10", label: "ICD-10" },
  { key: "snomed", label: "SNOMED CT" },
];

const pickFrom = (row) =>
  row.code_system === SNOMED_CT && row.icd10_code
    ? { code: row.icd10_code, code_system: ICD_10, snomed_code: row.code }
    : { code: row.code, code_system: row.code_system, snomed_code: undefined };

export default function DiagnosisCodeFinder({ name, onPick, onClose }) {
  const [query, setQuery] = useState(name ?? "");
  const [system, setSystem] = useState("icd10");
  const [state, setState] = useState({ status: "idle", rows: [] });

  useEffect(() => {
    const text = query.trim();
    if (text.length < 2) return undefined;
    let live = true;
    const timer = setTimeout(() => {
      setState((prev) => ({ ...prev, status: "loading" }));
      api
        .searchTerminology({ q: text, system, limit: 12 })
        .then((res) => live && setState({ status: "done", rows: res?.results ?? [] }))
        .catch((err) => {
          markHandled(err);
          if (live) setState({ status: "error", rows: [] });
        });
    }, 300);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [query, system]);

  const short = query.trim().length < 2;
  const rows = short ? [] : state.rows;

  return (
    <div className="cv-code-finder">
      <div className="cv-code-finder-bar">
        <input
          className="cv-ctl cv-ctl-fill"
          autoFocus
          aria-label="Search for a diagnosis code"
          placeholder="Type a diagnosis name or a code"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {SYSTEMS.map((sys) => (
          <button key={sys.key} type="button" className={`cv-btn${system === sys.key ? " is-picked" : ""}`} aria-pressed={system === sys.key} onClick={() => setSystem(sys.key)}>
            {sys.label}
          </button>
        ))}
        <button type="button" className="cv-btn" onClick={onClose} aria-label="Close code search">
          <X size={14} aria-hidden="true" />
        </button>
      </div>
      {short && <p className="cv-card-meta">Type at least two letters.</p>}
      {!short && state.status === "loading" && !rows.length && <p className="cv-card-meta">Searching…</p>}
      {!short && state.status === "error" && <p className="cv-card-meta">The code search did not answer. Try again, or type the code yourself.</p>}
      {!short && state.status === "done" && !rows.length && <p className="cv-card-meta">No match. Try fewer or different words.</p>}
      {rows.length > 0 && (
        <ul className="cv-code-finder-list">
          {rows.map((row) => (
            <li key={`${row.code_system}|${row.code}`}>
              <button type="button" className="cv-code-finder-row" onClick={() => onPick(pickFrom(row))}>
                <span className="cv-mono">{row.code}</span>
                <span>{row.display}</span>
                {row.icd10_code && <span className="cv-card-meta">ICD-10 {row.icd10_code}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
