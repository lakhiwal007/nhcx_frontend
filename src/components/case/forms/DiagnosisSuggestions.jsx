import { useEffect, useState } from "react";
import { api, markHandled } from "../../../api";
import { pickFrom } from "./DiagnosisCodeFinder";

export default function DiagnosisSuggestions({ name, onPick, onSearch }) {
  const [rows, setRows] = useState(null);

  useEffect(() => {
    const text = String(name || "").trim();
    if (text.length < 2) return undefined;
    let live = true;
    const timer = setTimeout(() => {
      api
        .searchTerminology({ q: text, system: "icd10", limit: 3 })
        .then((res) => live && setRows(res?.results ?? []))
        .catch((err) => {
          markHandled(err);
          if (live) setRows([]);
        });
    }, 400);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [name]);

  return (
    <div className="cv-code-finder">
      <p className="cv-card-meta">
        <span className="cv-chip is-bad">Needs a code</span> The payer refuses a diagnosis sent as text only.{" "}
        {rows && rows.length > 0 ? "Pick the matching one:" : rows ? "No close match; search for it." : "Looking for a match…"}
      </p>
      {rows && rows.length > 0 && (
        <ul className="cv-code-finder-list">
          {rows.map((row) => (
            <li key={`${row.code_system}|${row.code}`}>
              <button type="button" className="cv-code-finder-row" onClick={() => onPick(pickFrom(row))}>
                <span className="cv-mono">{row.code}</span>
                <span>{row.display}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <button type="button" className="cv-btn" onClick={onSearch}>
        Search all codes
      </button>
    </div>
  );
}
