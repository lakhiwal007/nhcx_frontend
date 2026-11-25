import { useState } from "react";
import { facilityIssues, facilityStatus } from "./facilityHealth";

const FILTERS = [
  { id: "all", label: "All facilities" },
  { id: "ready", label: "Ready for claims", rank: 2, tone: "is-ok" },
  { id: "attention", label: "Needs attention", rank: 1, tone: "is-warn" },
  { id: "setup", label: "Not set up", rank: 0, tone: "is-bad" },
];

export default function AllFacilities({ facilities, onOpen, search, onSearch, readOnly = false }) {
  const [filter, setFilter] = useState("all");
  const rows = facilities
    .map((f) => {
      const issues = facilityIssues(f);
      return { f, issues, status: facilityStatus(issues) };
    })
    .sort((a, b) => a.status.rank - b.status.rank || String(a.f.name || "").localeCompare(String(b.f.name || "")));
  const count = (rank) => rows.filter((r) => r.status.rank === rank).length;
  const q = search.trim().toLowerCase();
  const chosen = FILTERS.find((x) => x.id === filter);
  const shown = rows.filter((r) => (chosen.rank == null || r.status.rank === chosen.rank) && (!q || [r.f.name, r.f.facility_code, r.f.hcx_participant_code].filter(Boolean).some((v) => String(v).toLowerCase().includes(q))));

  return (
    <div className="st-all">
      <div className="st-all-head">
        <h1 className="st-all-title">Facilities</h1>
        <span className="cv-chip is-info">{readOnly ? "Admin · cases are view only" : "Admin"}</span>
        <input className="cv-ctl st-search" placeholder="Search name, code or participant" aria-label="Search facilities" value={search} onChange={(e) => onSearch(e.target.value)} />
      </div>
      <div className="st-all-tiles" role="radiogroup" aria-label="Filter facilities">
        {FILTERS.map((x) => (
          <button key={x.id} type="button" role="radio" aria-checked={filter === x.id} className={`st-all-tile${filter === x.id ? " is-on" : ""} ${x.tone || ""}`} onClick={() => setFilter(x.id)}>
            <span className="st-tile-key">{x.label}</span>
            <span className="st-tile-val">{x.rank == null ? rows.length : count(x.rank)}</span>
          </button>
        ))}
      </div>
      <section className="st-section" aria-label="Facilities">
        {shown.length === 0 ? (
          <p className="st-pad st-quiet">No facility matches.</p>
        ) : (
          <div className="wq-table-scroll">
            <table className="st-table">
              <thead>
                <tr>
                  <th>Facility</th>
                  <th>Status</th>
                  <th>What needs fixing</th>
                  <th>Scheme</th>
                  <th className="st-col-actions">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {shown.map(({ f, issues, status }) => (
                  <tr key={f.facility_code}>
                    <td>
                      <span className="st-strong">{f.name || f.facility_code}</span>
                      <span className="st-sub">
                        {f.facility_code} · {f.hcx_participant_code || "no participant code"}
                      </span>
                    </td>
                    <td>
                      <span className={`cv-chip ${status.tone}`}>{status.label}</span>
                    </td>
                    <td className={issues.length ? undefined : "st-quiet"}>{issues.length ? issues.map((i) => i.text.replace(/\.$/, "")).join(" · ") : "Nothing"}</td>
                    <td>
                      {f.scheme_code || "—"}
                      <span className="st-sub">{f.environment === "production" ? "Production" : "Sandbox"}</span>
                    </td>
                    <td className="st-col-actions">
                      <button type="button" className="cv-btn" onClick={() => onOpen(f.facility_code)}>
                        Open
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
