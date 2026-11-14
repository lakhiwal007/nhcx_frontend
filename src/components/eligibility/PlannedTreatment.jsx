import { formatMoney, humanize } from "../../lib/format.js";

const yes = (v) => /^(y|yes|true|1)$/i.test(String(v ?? "").trim());

export default function PlannedTreatment({ procedures, packages, checks, source, planReady }) {
  return (
    <section className="cv-card" aria-label="Planned treatment">
      <div className="cv-card-head">
        <h2 className="cv-card-title">Planned treatment</h2>
        {procedures.length > 0 ? <span className="cv-chip is-todo">{procedures.length} planned</span> : <span className="cv-chip is-warn">None recorded</span>}
        {source && <span className="cv-card-meta">From the {humanize(source).toLowerCase()}</span>}
      </div>
      {procedures.length === 0 ? (
        <div className="cv-card-body">
          No planned procedure is recorded for this visit. Ask the doctor to add it in the hospital system, then send the checks again so the payer can rule on it.
        </div>
      ) : (
        <div className="cv-tw cv-in-card">
          <table>
            <thead>
              <tr>
                <th>Procedure</th>
                <th>In the plan</th>
                <th className="is-num">Plan rate</th>
                <th className="is-num">Payer allows</th>
                <th>Pre-auth</th>
                <th>Asked with it</th>
              </tr>
            </thead>
            <tbody>
              {procedures.map((proc, i) => {
                const pkg = packages[String(proc.code)];
                const benefit = checks?.benefits.items.find((it) => String(it.product_or_service?.code) === String(proc.code));
                const auth = checks?.auth.items.find((it) => String(it.product_or_service?.code) === String(proc.code));
                const needs = auth?.authorization_required ?? (pkg ? !yes(pkg.conditions?.ApprovalNotRequired) : null);
                const docs = [
                  ...(auth?.authorization_supporting || []).map((d) => d.display || d.code),
                  ...(pkg?.supporting_info || []).map((d) => d.display || d.code),
                ].filter((d, j, a) => d && a.indexOf(d) === j);
                return (
                  <tr key={i}>
                    <td>
                      <strong>{proc.name}</strong> <span className="cv-mono cv-card-meta">{proc.code}</span>
                    </td>
                    <td>{!planReady ? "—" : pkg ? <span className="cv-chip is-todo">Yes</span> : String(proc.code) in packages ? <span className="cv-chip is-warn">Not in plan</span> : "…"}</td>
                    <td className="is-num">{pkg?.rate != null ? formatMoney(pkg.rate) : "—"}</td>
                    <td className="is-num">
                      {benefit?.excluded ? <span className="cv-chip is-bad">Excluded</span> : benefit?.benefit?.[0]?.allowed?.value != null ? formatMoney(benefit.benefit[0].allowed.value) : "—"}
                    </td>
                    <td>{needs == null ? "—" : <span className={`cv-chip ${needs ? "is-warn" : "is-todo"}`}>{needs ? "Needed" : "Not needed"}</span>}</td>
                    <td>{docs.length ? docs.join(", ") : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
