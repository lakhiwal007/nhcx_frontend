import { useState } from "react";
import { formatMoney } from "../../lib/format.js";
import { usePlanPackages } from "../../hooks/workflow/usePlanPackages";
import Dropdown from "../ui/Dropdown";

const PAGE = 8;
const yes = (v) => /^(y|yes|true|1)$/i.test(String(v ?? "").trim());
const count = (n) => (n == null ? "—" : Number(n).toLocaleString("en-IN"));

export default function PackagePicker({ correlationId, plan, startQuery = "", chosenCodes, onChoose, onBrowse }) {
  const categories = (plan?.categories || []).filter((c) => c.code);
  const [query, setQuery] = useState(startQuery);
  const [category, setCategory] = useState("");
  const [page, setPage] = useState(0);
  const [kind, setKind] = useState("Procedure");
  const implants = kind === "Implant";
  const term = query.trim().length >= 2 ? query.trim() : "";
  const { loading, rows, total, error } = usePlanPackages(correlationId, { category, q: term, kind, limit: PAGE, offset: page * PAGE });
  const pages = Math.max(1, Math.ceil(total / PAGE));

  return (
    <section className="cv-card" aria-label="Packages in the payer's plan">
      <div className="cv-card-head">
        <h2 className="cv-card-title">Packages in the payer's plan</h2>
        <span className="cv-card-meta">{count(plan?.benefit_count)}</span>
      </div>
      <div className="cv-card-body cv-picker">
        <div className="cv-picker-filters">
          {[["Procedure", "Packages"], ["Implant", "Implants"]].map(([value, label]) => (
            <button key={value} type="button" className="cv-fchip" aria-pressed={kind === value} onClick={() => { setKind(value); setQuery(""); setPage(0); }}>
              {label}
            </button>
          ))}
        </div>
        <div className="cv-picker-filters">
          <input
            className="cv-ctl"
            placeholder={implants ? "Search by implant name or code" : "Search by package name or code"}
            aria-label="Search packages"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setPage(0); }}
          />
          <Dropdown
            compact
            ariaLabel="Speciality"
            value={category}
            options={[{ value: "", label: "All specialities" }, ...categories.map((c) => ({ value: c.code, label: c.display || c.code }))]}
            onChange={(v) => { setCategory(v); setPage(0); }}
          />
        </div>
        {error && <div className="cv-notice is-bad">{error}</div>}
        <div className="cv-tw">
          <table>
            <thead>
              <tr>
                <th>Code</th>
                <th>{implants ? "Implant" : "Package"}</th>
                <th className="is-num">Rate</th>
                <th>Pre-auth</th>
                <th aria-label="Use" />
              </tr>
            </thead>
            <tbody>
              {rows.map((b) => {
                const chosen = chosenCodes?.has(String(b.code));
                const needs = !yes(b.conditions?.ApprovalNotRequired);
                return (
                  <tr key={b.id ?? `${b.category_code}:${b.code}`} className={chosen ? "is-selected" : undefined}>
                    <td className="cv-mono">{b.code}</td>
                    <td>
                      {b.display || b.code}
                      {!category && b.category_display && <div className="cv-card-meta">{b.category_display}</div>}
                    </td>
                    <td className="is-num">{b.rate != null ? formatMoney(b.rate) : "—"}</td>
                    <td><span className={`cv-chip ${needs ? "is-warn" : "is-todo"}`}>{needs ? "Needed" : "Not needed"}</span></td>
                    <td>
                      {chosen ? (
                        <span className="cv-chip is-ok">Chosen</span>
                      ) : (
                        <button type="button" className="cv-btn" onClick={() => onChoose(b)}>Use</button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {loading && (
                <tr><td colSpan={5} className="cv-card-meta">Loading packages…</td></tr>
              )}
              {!loading && !error && rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="cv-card-meta">
                    {term ? `No ${implants ? "implant" : "package"} name or code contains "${term}". Shorten or clear the search, or pick a speciality.` : implants ? "The plan lists no implant here." : "No package in this speciality."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="cv-pager">
          <span>{total ? `Showing ${page * PAGE + 1}–${Math.min(total, (page + 1) * PAGE)} of ${count(total)}` : implants ? "No implants" : "No packages"}</span>
          <button type="button" className="cv-btn" style={{ marginLeft: "auto" }} disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</button>
          <button type="button" className="cv-btn" disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)}>Next</button>
        </div>
        <div className="cv-card-meta">
          Rules, ward tiers and documents for each package are on the{" "}
          <button type="button" className="cv-pick" onClick={onBrowse}>Insurance plan</button> pane.
        </div>
      </div>
    </section>
  );
}
