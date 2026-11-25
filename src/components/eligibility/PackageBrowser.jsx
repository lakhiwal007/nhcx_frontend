import { useMemo, useState } from "react";
import { usePlanPackages } from "../../hooks/workflow/usePlanPackages";
import { formatMoney } from "../../lib/format.js";
import Dropdown from "../ui/Dropdown";

const FLAGS = [
  ["needs_preauth", "Needs pre-auth"],
  ["day_care", "Day care"],
  ["implants", "Implants"],
  ["tiers", "Ward tiers"],
  ["cyclic", "Cyclic"],
  ["has_form", "Has a form"],
];
const STATS = [
  ["total", "Packages"],
  ["needs_preauth", "Need pre-auth"],
  ["day_care", "Day care"],
  ["implants", "With implants"],
  ["tiers", "With ward tiers"],
  ["has_form", "With a form"],
];
const PAGE_SIZES = [10, 25, 50].map((n) => ({ value: n, label: `${n} a page` }));
const TYPES = [{ value: "", label: "Any type" }, ...["Surgical", "Medical", "Conservative"].map((t) => ({ value: t, label: t }))];
const yes = (v) => /^(y|yes|true|1)$/i.test(String(v ?? "").trim());
const yn = (v) => (v == null || v === "" ? null : /^y(es)?$/i.test(String(v).trim()) ? "Yes" : /^no?$/i.test(String(v).trim()) ? "No" : String(v));
const count = (n) => (n == null ? "—" : Number(n).toLocaleString("en-IN"));

function rules(b) {
  const c = b.conditions || {};
  return [
    c.ProcedureType,
    yes(c.IsDayCare) && "day care",
    yes(c.EnhancementAllowed) && "enhancement",
    (yes(c.StratificationAllowed) || (b.extras || []).some((e) => e.type === "Stratification")) && "ward tiers",
    (yes(c.ImplantApplicable) || (b.extras || []).some((e) => e.type === "Implant")) && "implants",
    yes(c.CyclicProcedure) && `cyclic${c.MaximumCyclesAllowed ? ` ×${c.MaximumCyclesAllowed}` : ""}`,
  ].filter(Boolean).join(" · ");
}

const CONDITIONS = [
  ["ProcedureType", "Procedure type"],
  ["ApprovalNotRequired", "Pre-auth needed", (v) => (v == null ? null : yes(v) ? "No" : "Yes")],
  ["EnhancementAllowed", "Enhancement"],
  ["IsDayCare", "Day care"],
  ["StratificationAllowed", "Ward tiers"],
  ["MaximumStratificationAllowed", "Max tiers"],
  ["ImplantApplicable", "Implants"],
  ["MaximumImplantsAllowed", "Max implants"],
  ["QuantityAllowed", "Quantity allowed"],
  ["CyclicProcedure", "Cyclic"],
  ["MaximumCyclesAllowed", "Max cycles"],
  ["GovtReserved", "Govt reserved"],
  ["ScheduledTATApproval", "Scheduled TAT"],
  ["Standalone", "Standalone"],
];

function PackageDetail({ benefit, onOpenForm, onChoose, chosen }) {
  if (!benefit) return <div className="cv-pane cv-card-meta">Pick a package to see its details.</div>;
  const c = benefit.conditions || {};
  const known = new Set(CONDITIONS.map(([k]) => k));
  const conds = [
    ...CONDITIONS.map(([k, label, fmt]) => ({ label, value: fmt ? fmt(c[k]) : yn(c[k]) })),
    ...Object.entries(c).filter(([k]) => !known.has(k)).map(([k, v]) => ({ label: k, value: yn(v) })),
  ];
  const docs = (benefit.supporting_info || []).filter((d) => d.code || d.form);
  return (
    <>
      <div className="cv-pane">
        <div className="cv-mono cv-card-meta">{[benefit.category_code, benefit.code].filter(Boolean).join(" · ")}</div>
        <div style={{ fontSize: 16, fontWeight: 700, marginTop: 2 }}>{benefit.display || benefit.code}</div>
        <div style={{ marginTop: 8 }}>
          <span style={{ fontSize: 22, fontWeight: 700 }}>{benefit.rate != null ? formatMoney(benefit.rate) : "No rate"}</span>{" "}
          <span className="cv-card-meta">package rate</span>
        </div>
        {onChoose && (
          <div style={{ marginTop: 12 }}>
            {chosen ? (
              <span className="cv-chip is-ok">Chosen for this case</span>
            ) : (
              <button type="button" className="cv-btn is-primary" onClick={() => onChoose(benefit)}>
                Use this package
              </button>
            )}
          </div>
        )}
      </div>
      <div className="cv-pane">
        <div className="cv-sub">Claim conditions</div>
        <div className="cv-cond-list">
          {conds.map((x) => (
            <div key={x.label} className="cv-cond">
              <span className="cv-card-meta">{x.label}</span>
              <strong style={{ fontWeight: x.value == null ? 400 : 600, color: x.value == null ? "var(--text-muted)" : undefined }}>{x.value ?? "Not set"}</strong>
            </div>
          ))}
        </div>
      </div>
      {(benefit.extras || []).length > 0 && (
        <div className="cv-pane">
          <div className="cv-sub">Paid over the rate</div>
          {benefit.extras.map((e, i) => (
            <div key={i} className="cv-kv">
              <span>{e.type}: {e.label || e.code}</span>
              <span>{e.rate != null ? formatMoney(e.rate) : "—"}</span>
            </div>
          ))}
        </div>
      )}
      <div className="cv-pane">
        <div className="cv-sub">Documents and forms</div>
        {docs.length === 0 && <div className="cv-card-meta">None published for this package.</div>}
        {docs.map((d, i) => (
          <div key={i} className="cv-kv">
            <span>
              {d.form ? (
                <button type="button" className="cv-pick" onClick={() => onOpenForm(d.form)}>{d.display || "Form"}</button>
              ) : (
                <>
                  {d.display || d.code} <span className="cv-mono">{[d.category, d.code].filter(Boolean).join(" · ")}</span>
                </>
              )}
            </span>
            <span className={`cv-chip ${d.stage === "post" ? "is-todo" : "is-info"}`}>{d.form ? "Form" : d.stage === "post" ? "Claim" : "Pre-auth"}</span>
          </div>
        ))}
      </div>
    </>
  );
}

export default function PackageBrowser({ correlationId, plan, plannedCodes, onOpenForm, onChoose, chosenCodes, startQuery = "" }) {
  const categories = useMemo(() => (plan?.categories || []).filter((c) => c.code), [plan]);
  const [pickedCategory, setPickedCategory] = useState(() => {
    if (startQuery) return "";
    try { return localStorage.getItem("nhcx_pkg_category"); } catch { return null; }
  });
  const paediatricDefault = useMemo(
    () => categories.find((c) => /^MP\b|paed|pedia|child|neonat/i.test(`${c.code} ${c.display || ""}`))?.code || "",
    [categories],
  );
  const category = pickedCategory === null ? paediatricDefault : pickedCategory;
  const setCategory = (value) => {
    setPickedCategory(value);
    try { localStorage.setItem("nhcx_pkg_category", value); } catch { /* storage may be blocked */ }
  };
  const [catFilter, setCatFilter] = useState("");
  const [query, setQuery] = useState(startQuery);
  const [type, setType] = useState("");
  const [flags, setFlags] = useState([]);
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(10);
  const [selected, setSelected] = useState(null);
  const term = query.trim().length >= 2 ? query.trim() : "";
  const { loading, rows, total, error } = usePlanPackages(correlationId, {
    category,
    q: term,
    procedureType: type,
    flags: flags.join(","),
    limit: size,
    offset: page * size,
  });
  const pages = Math.max(1, Math.ceil(total / size));
  const shown = selected || rows.find((b) => plannedCodes.has(String(b.code))) || null;
  const visibleCats = categories.filter((c) => !catFilter.trim() || `${c.code} ${c.display}`.toLowerCase().includes(catFilter.trim().toLowerCase()));
  const toggleFlag = (f) => {
    setFlags((prev) => (prev.includes(f) ? prev.filter((x) => x !== f) : [...prev, f]));
    setPage(0);
  };
  const stats = plan?.stats || { total: plan?.benefit_count };

  return (
    <div className="cv-card-body" style={{ paddingTop: 18 }}>
      <div className="cv-stats" style={{ marginBottom: 18 }}>
        {STATS.filter(([k]) => stats[k] != null).map(([k, label]) => (
          <div key={k} className="cv-stat">
            <div className="cv-stat-key">{label}</div>
            <div className="cv-stat-val">{count(stats[k])}</div>
          </div>
        ))}
        <div className="cv-stat">
          <div className="cv-stat-key">Specialties</div>
          <div className="cv-stat-val">{count(categories.length)}</div>
        </div>
      </div>
      <div className="cv-browser">
        <nav className="cv-browser-nav" aria-label="Specialties">
          <div className="cv-browser-nav-filter">
            <input className="cv-ctl" style={{ width: "100%" }} placeholder="Filter specialties" aria-label="Filter specialties" value={catFilter} onChange={(e) => setCatFilter(e.target.value)} />
          </div>
          <div className="cv-browser-nav-list">
            <button type="button" className="cv-browser-nav-item" aria-pressed={!category} onClick={() => { setCategory(""); setPage(0); }}>
              <span>All specialties</span>
              <span className="cv-card-meta">{count(plan?.benefit_count)}</span>
            </button>
            {visibleCats.map((c) => (
              <button key={c.code} type="button" className="cv-browser-nav-item" aria-pressed={category === c.code} onClick={() => { setCategory(c.code); setPage(0); }}>
                <span><span className="cv-mono cv-card-meta">{c.code}</span> {c.display || c.code}</span>
                <span className="cv-card-meta">{count(c.count)}</span>
              </button>
            ))}
          </div>
        </nav>

        <div className="cv-browser-main">
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input
              className="cv-ctl"
              style={{ flex: "1 1 240px" }}
              placeholder={`Search ${count(plan?.benefit_count)} packages by code or name`}
              aria-label="Search packages"
              value={query}
              onChange={(e) => { setQuery(e.target.value); setPage(0); }}
            />
            <div className="cv-browser-type">
              <Dropdown compact ariaLabel="Procedure type" value={type} options={TYPES} onChange={(v) => { setType(v); setPage(0); }} />
            </div>
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {FLAGS.map(([f, label]) => (
              <button key={f} type="button" className="cv-fchip" aria-pressed={flags.includes(f)} onClick={() => toggleFlag(f)}>
                {label}
              </button>
            ))}
          </div>
          {error && <div className="cv-notice is-bad">{error}</div>}
          <div className="cv-tw">
            <table>
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Package</th>
                  <th className="is-num">Rate</th>
                  <th>Pre-auth</th>
                  <th>Rules</th>
                  {onChoose && <th aria-label="Use" />}
                </tr>
              </thead>
              <tbody>
                {rows.map((b) => {
                  const planned = plannedCodes.has(String(b.code));
                  const needs = !yes(b.conditions?.ApprovalNotRequired);
                  return (
                    <tr key={b.id ?? `${b.category_code}:${b.code}`} className={shown && shown.id === b.id ? "is-selected" : undefined}>
                      <td className="cv-mono">{b.code}</td>
                      <td>
                        <button type="button" className="cv-pick" onClick={() => setSelected(b)}>{b.display || b.code}</button>
                        {planned && <span className="cv-chip is-info" style={{ marginLeft: 8 }}>This case</span>}
                        {chosenCodes?.has(String(b.code)) && <span className="cv-chip is-ok" style={{ marginLeft: 8 }}>Chosen</span>}
                        {!category && b.category_display && <div className="cv-card-meta">{b.category_display}</div>}
                      </td>
                      <td className="is-num">{b.rate != null ? formatMoney(b.rate) : "—"}</td>
                      <td><span className={`cv-chip ${needs ? "is-warn" : "is-todo"}`}>{needs ? "Needed" : "Not needed"}</span></td>
                      <td className="cv-card-meta">{rules(b) || "—"}</td>
                      {onChoose && (
                        <td>
                          {!chosenCodes?.has(String(b.code)) && (
                            <button type="button" className="cv-btn" onClick={() => onChoose(b)}>
                              Use
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
                {loading && (
                  <tr><td colSpan={onChoose ? 6 : 5} className="cv-card-meta">Loading packages…</td></tr>
                )}
                {!loading && rows.length === 0 && (
                  <tr><td colSpan={onChoose ? 6 : 5} className="cv-card-meta">{term ? `No match for "${term}".` : "No package matches these filters."}</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="cv-pager">
            <span>
              {total ? `Showing ${page * size + 1}–${Math.min(total, (page + 1) * size)} of ${count(total)}` : "No packages"}
            </span>
            <div className="cv-pager-size">
              <Dropdown compact ariaLabel="Rows per page" value={size} options={PAGE_SIZES} onChange={(v) => { setSize(v); setPage(0); }} />
            </div>
            <button type="button" className="cv-btn" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</button>
            <span>Page {page + 1} of {pages}</span>
            <button type="button" className="cv-btn" disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)}>Next</button>
          </div>
        </div>

        <aside className="cv-browser-detail" aria-label="Package detail">
          <PackageDetail benefit={shown} onOpenForm={onOpenForm} onChoose={onChoose} chosen={!!shown && !!chosenCodes?.has(String(shown.code))} />
        </aside>
      </div>
    </div>
  );
}
