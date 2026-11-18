import { formatDate, formatMoney, humanize } from "../../lib/format.js";
import PackagePicker from "./PackagePicker";
import PackageLines from "./PackageLines";

const yes = (v) => /^(y|yes|true|1)$/i.test(String(v ?? "").trim());

const VISIT_ROWS = [
  ["Diagnosis", (v) => v.diagnosis || v.diagnoses?.join(", ")],
  ["Reason for admission", (v) => v.reason],
  ["Procedures recorded", (v) => v.procedures?.join(", ")],
  ["Doctor", (v) => [v.doctor, v.speciality].filter(Boolean).join(" · ")],
  ["Ward", (v) => [v.ward, v.ward_speciality].filter(Boolean).join(" · ")],
  ["Admission", (v) => [v.admission_no, v.admitted_on && formatDate(v.admitted_on)].filter(Boolean).join(" · ")],
];

function ChoosePackage({ choice, visit, plan, planCorrelationId, startQuery }) {
  const facts = visit ? VISIT_ROWS.map(([label, read]) => [label, read(visit)]).filter(([, value]) => value) : [];
  return (
    <div className="cv-split">
      <section className="cv-card" aria-label="This visit">
        <div className="cv-card-head">
          <h2 className="cv-card-title">This visit</h2>
        </div>
        <div className="cv-card-body">
          <div className="cv-sub">From the hospital system</div>
          {facts.map(([label, value]) => (
            <div key={label} className="cv-kv">
              <span>{label}</span>
              <span>{value}</span>
            </div>
          ))}
          {facts.length === 0 && <div className="cv-card-meta">The hospital system has no diagnosis or procedure recorded for this admission yet.</div>}
        </div>
        <div className="cv-card-body cv-split-part">
          <div className="cv-sub">Chosen packages</div>
          {choice.chosen.map((pkg) => {
            const tier = pkg.tiers?.find((t) => t.code === pkg.modifier_code);
            const unit = pkg.typed ? pkg.amount : (tier?.rate ?? pkg.rate);
            const quantity = Number(pkg.quantity) > 0 ? Number(pkg.quantity) : 1;
            const price = unit != null && unit !== "" ? Number(unit) * quantity : null;
            return (
              <div key={pkg.code} className="cv-chosen">
                <div className="cv-kv">
                  <span>
                    <strong>{pkg.name}</strong> <span className="cv-mono cv-card-meta">{pkg.code}</span>
                    {pkg.kind === "Implant" && <span className="cv-chip is-info" style={{ marginLeft: 6 }}>Implant</span>}
                  </span>
                  <button type="button" className="cv-pick" onClick={() => choice.onRemove(pkg.code)}>
                    Remove
                  </button>
                </div>
                <label className="cv-chosen-qty">
                  <span className="cv-card-meta">Quantity</span>
                  <input className="cv-ctl cv-mono" type="number" min="1" step="1" aria-label={`Quantity for ${pkg.name}`} value={pkg.quantity ?? 1} onChange={(ev) => choice.onEdit(pkg.code, { quantity: ev.target.value })} />
                </label>
                {pkg.tiers?.length > 0 && (
                  <select className="cv-ctl" aria-label={`Ward tier for ${pkg.name}`} value={pkg.modifier_code || ""} onChange={(ev) => choice.onEdit(pkg.code, { modifier_code: ev.target.value })}>
                    <option value="">No ward tier</option>
                    {pkg.tiers.map((t) => (
                      <option key={t.code} value={t.code}>{`${t.label} · ${formatMoney(t.rate)}`}</option>
                    ))}
                  </select>
                )}
                {pkg.unspecified && <input className="cv-ctl" aria-label={`Procedure name for ${pkg.code}`} placeholder="Procedure name" value={pkg.name} onChange={(ev) => choice.onEdit(pkg.code, { name: ev.target.value })} />}
                {pkg.typed && <input className="cv-ctl cv-mono" type="number" min="0" aria-label={`Amount for ${pkg.code}`} placeholder="Amount for one" value={pkg.amount ?? ""} onChange={(ev) => choice.onEdit(pkg.code, { amount: ev.target.value })} />}
                <div className="cv-card-meta">{price != null ? `${formatMoney(price)}${pkg.typed ? "" : " at the plan's rate"}` : pkg.typed ? "Enter the amount; the plan has no price for this." : "The plan lists no rate."}</div>
              </div>
            );
          })}
          {choice.chosen.length === 0 && <div className="cv-card-meta">None yet. Pick the package that covers this admission from the payer's plan; the pre-auth is raised for it.</div>}
        </div>
      </section>
      <PackagePicker
        correlationId={planCorrelationId}
        plan={plan}
        startQuery={startQuery}
        chosenCodes={new Set(choice.chosen.map((p) => String(p.code)))}
        onChoose={choice.onChoose}
        onBrowse={choice.onBrowse}
      />
    </div>
  );
}

export default function PlannedTreatment({ procedures, packages, checks, source, planReady, choice, visit, plan, planCorrelationId, startQuery, treatment, onChange }) {
  if (choice?.active) return <ChoosePackage choice={choice} visit={visit} plan={plan} planCorrelationId={planCorrelationId} startQuery={startQuery} />;

  return (
    <section className="cv-card" aria-label="Planned treatment">
      <div className="cv-card-head">
        <h2 className="cv-card-title">Planned treatment</h2>
        {onChange && (
          <button type="button" className="cv-btn" style={{ marginLeft: "auto" }} onClick={onChange}>
            Change packages
          </button>
        )}
        {procedures.length > 0 ? <span className="cv-chip is-todo">{procedures.length} planned</span> : <span className="cv-chip is-warn">None recorded</span>}
        {source && <span className="cv-card-meta">From the {humanize(source).toLowerCase()}</span>}
      </div>
      {treatment?.length > 0 && <PackageLines lines={treatment} />}
      {treatment?.length > 0 ? null : procedures.length === 0 ? (
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
