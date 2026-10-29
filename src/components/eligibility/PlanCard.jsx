import { useState } from "react";
import { formatDateTime, formatMoney } from "../../format.js";
import { usePlanForms, useCoverBenefits } from "../../hooks/usePlanForms";
import { planFieldGroups, missingRequired, profileRows, PROFILE_URL } from "./planProfile";
import PlanState from "./PlanState";
import PackageBrowser from "./PackageBrowser";
import FormDrawer from "./FormDrawer";

const TABS = [
  ["overview", "Overview"],
  ["packages", "Packages"],
  ["docs", "Documents & forms"],
  ["rules", "Exclusions & rules"],
  ["cover", "Cover benefits"],
  ["profile", "Profile check"],
];
const STAGE = { pre: ["Pre-auth", "is-info"], post: ["Claim", "is-todo"] };

function Prof({ show, path, card, ms }) {
  if (!show) return null;
  return (
    <span className="cv-prof">
      <span className="cv-prof-path">{path}</span>
      <span className="cv-prof-card">{card}</span>
      {ms && <span className="cv-prof-ms">MS</span>}
    </span>
  );
}

function Overview({ plan, showProfile }) {
  return (
    <div className="cv-card-body cv-cols" style={{ paddingTop: 18 }}>
      {planFieldGroups(plan).map((g) => (
        <div key={g.title}>
          <div className="cv-sub">
            {g.title} {showProfile && <span className="cv-prof-path">{g.path}</span>}
          </div>
          {g.fields.map((x) => (
            <div key={`${x.path}${x.label}`} className="cv-field">
              <span className="cv-field-label">{x.label}</span>
              <span className={`cv-field-value${x.value == null ? (x.required ? " is-required-missing" : " is-missing") : ""}`}>
                {x.value ?? (x.required ? "Not sent (required)" : "Not sent")}
              </span>
              <Prof show={showProfile} path={x.path} card={x.card} ms={x.ms} />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function DocsAndForms({ plan, forms, showProfile, onOpenForm }) {
  const docs = plan?.policy_documents || [];
  return (
    <div className="cv-card-body cv-cols" style={{ paddingTop: 18 }}>
      <div>
        <div className="cv-sub">Every case on this policy</div>
        <div className="cv-card-meta" style={{ marginBottom: 8 }}>Requirements on the plan itself, and the forms on its coverage.</div>
        {showProfile && <Prof show path="InsurancePlan.extension:claim-supportingInfoRequirement" card="0..*" />}
        {docs.length === 0 && <div className="cv-card-meta">The plan lists no policy-wide documents.</div>}
        {docs.map((d, i) => {
          const [label, tone] = STAGE[d.stage] || STAGE.pre;
          return (
            <div key={i} className="cv-kv">
              <span style={{ color: "var(--text-main)" }}>
                {d.form ? (
                  <button type="button" className="cv-pick" onClick={() => onOpenForm(d.form)}>{d.display || "Form"}</button>
                ) : (
                  d.display || d.code
                )}{" "}
                <span className="cv-mono cv-card-meta">{d.form ? "form" : [d.category, d.code].filter(Boolean).join(" · ")}</span>
              </span>
              <span className={`cv-chip ${tone}`}>{label}</span>
            </div>
          );
        })}
        {plan?.plan?.proof_of_presence_required && (
          <div className="cv-card-meta" style={{ marginTop: 10 }}>ADN on the plan means proof of presence: biometrics, or the consent form in its place.</div>
        )}
      </div>
      <div>
        <div className="cv-sub">Questionnaires in the plan ({forms.length})</div>
        <div className="cv-card-meta" style={{ marginBottom: 8 }}>A policy form is asked on every case; a package's form only when that package is quoted.</div>
        {showProfile && <Prof show path="Bundle.entry:Questionnaire" card="0..*" />}
        {forms.length === 0 && <div className="cv-card-meta">The plan carries no questionnaires.</div>}
        {forms.map((f) => {
          const [label, tone] = STAGE[f.stage] || STAGE.pre;
          return (
            <div key={f.url} className="cv-kv" style={{ alignItems: "center" }}>
              <span style={{ color: "var(--text-main)", minWidth: 0 }}>
                <span style={{ display: "block", fontWeight: 600 }}>{f.title || f.form_id}</span>
                <span className="cv-card-meta">
                  {[f.kind === "stg" || /stg/i.test(f.kind || "") ? "Treatment guideline" : "Form", f.item_count != null ? `${f.item_count} questions` : null].filter(Boolean).join(" · ")}
                </span>
              </span>
              <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span className={`cv-chip ${tone}`}>{label}</span>
                <button type="button" className="cv-btn" onClick={() => onOpenForm(f.url)}>Preview</button>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Rules({ plan, showProfile }) {
  const exclusions = plan?.exclusions || [];
  return (
    <div className="cv-card-body" style={{ paddingTop: 18 }}>
      <div className="cv-sub">Exclusions</div>
      {showProfile && <Prof show path="extension:claim-exclusion (category 0..1 · statement 0..* · item 0..*)" card="0..*" />}
      {exclusions.length === 0 ? (
        <div className="cv-card-meta">The payer listed no exclusions in the plan.</div>
      ) : (
        <div className="cv-tw" style={{ marginTop: 8 }}>
          <table>
            <thead>
              <tr>
                <th>Category</th>
                <th>Statement</th>
                <th>Excluded items</th>
              </tr>
            </thead>
            <tbody>
              {exclusions.map((x, i) => (
                <tr key={i}>
                  <td>{x.category || "—"}</td>
                  <td>{(x.statements || []).join(" ") || "—"}</td>
                  <td>{(x.items || []).join(", ") || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="cv-sub" style={{ marginTop: 20 }}>Rules on the whole plan</div>
      <div className="cv-kv"><span>Package rules</span><span>Per package, on the Packages tab</span></div>
      <div className="cv-kv"><span>A second request while one is open</span><span>Refused by government payers (PAYR-1406); wait 15–60 min</span></div>
      <div className="cv-kv"><span>Refresh</span><span>Fetch again when the payer renews or amends the policy</span></div>
    </div>
  );
}

function Cover({ rows }) {
  if (rows == null) return <div className="cv-card-body cv-card-meta" style={{ paddingTop: 18 }}>Loading…</div>;
  if (rows.length === 0) {
    return (
      <div className="cv-card-body" style={{ paddingTop: 18 }}>
        <div style={{ fontWeight: 600 }}>This plan sends no cover benefits.</div>
        <div className="cv-card-meta" style={{ marginTop: 6 }}>
          Cover benefits are limits on the policy that are not packages, such as Blood, ICU, Oxygen or Ambulance. They show here with their limit when a payer sends them, and are never offered as a line item.
        </div>
      </div>
    );
  }
  return (
    <div className="cv-tw cv-in-card" style={{ marginTop: 18 }}>
      <table>
        <thead>
          <tr>
            <th>Benefit</th>
            <th>Code</th>
            <th>Category</th>
            <th className="is-num">Limit</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((b) => (
            <tr key={b.id}>
              <td style={{ fontWeight: 600 }}>{b.display || b.code}</td>
              <td className="cv-mono">{b.code}</td>
              <td>{b.category_display || b.category_code || "—"}</td>
              <td className="is-num">{b.rate != null ? formatMoney(b.rate) : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ProfileCheck({ plan }) {
  return (
    <>
      <div className="cv-card-intro" style={{ paddingTop: 16 }}>
        Every element of the{" "}
        <a href={PROFILE_URL} target="_blank" rel="noreferrer">NRCES InsurancePlan profile</a>
        , what this payer sent, and whether it is kept as a field. The whole answer is also kept as received.
      </div>
      <div className="cv-tw cv-in-card">
        <table>
          <thead>
            <tr>
              <th>Element</th>
              <th>Card.</th>
              <th>MS</th>
              <th>Sent by this payer</th>
              <th>Kept as a field</th>
            </tr>
          </thead>
          <tbody>
            {profileRows(plan).map((r) => (
              <tr key={`${r.path}${r.card}`}>
                <td className="cv-mono">{r.path}</td>
                <td><span className="cv-prof-card">{r.card}</span></td>
                <td>{r.ms ? <span className="cv-prof-ms">MS</span> : null}</td>
                <td>
                  <span className={`cv-chip ${r.sent ? "is-ok" : r.card.startsWith("1") ? "is-bad" : "is-todo"}`}>
                    {r.sent ? "Yes" : r.card.startsWith("1") ? "No (required)" : "No"}
                  </span>
                </td>
                <td><span className={`cv-chip ${r.kept === "Yes" ? "is-ok" : "is-warn"}`}>{r.kept}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

export default function PlanCard({ plan, state, plannedCodes, canFetch, sending, fetchResult, onFetch }) {
  const [tab, setTab] = useState("overview");
  const [showProfile, setShowProfile] = useState(false);
  const [openForm, setOpenForm] = useState(null);
  const ready = state.key === "ready";
  const correlationId = ready ? plan.correlation_id : null;
  const forms = usePlanForms(correlationId, plan?.form_count);
  const cover = useCoverBenefits(tab === "cover" ? correlationId : null);
  const gaps = ready ? missingRequired(plan) : [];
  const counts = {
    packages: plan?.benefit_count,
    docs: (plan?.policy_documents || []).length + forms.length,
    rules: (plan?.exclusions || []).length,
    cover: cover?.length,
  };

  return (
    <section className="cv-card" aria-label="Insurance plan">
      <div className="cv-card-head">
        <h2 className="cv-card-title">1. Insurance plan</h2>
        {ready && <span className="cv-chip is-ok">Ready</span>}
        {gaps.length > 0 && (
          <button type="button" className="cv-chip is-warn" style={{ border: 0, cursor: "pointer" }} onClick={() => setTab("profile")}>
            {gaps.length} required {gaps.length === 1 ? "field" : "fields"} not sent
          </button>
        )}
        <span className="cv-card-meta">
          {[plan?.plan?.plan_title, plan?.fetched_at && `fetched ${formatDateTime(plan.fetched_at)}`, plan?.reused_from && "reused from an earlier fetch"].filter(Boolean).join(" · ")}
        </span>
        {ready && (
          <span className="cv-card-tools">
            <button type="button" className="cv-btn" aria-pressed={showProfile} onClick={() => setShowProfile((v) => !v)}>
              {showProfile ? "Hide FHIR profile" : "Show FHIR profile"}
            </button>
            <button type="button" className="cv-btn" disabled={!canFetch || sending} onClick={onFetch}>
              {sending ? "Asking the payer…" : "Fetch again"}
            </button>
          </span>
        )}
      </div>

      {!ready ? (
        <div className="cv-card-body">
          <PlanState plan={plan} state={state} canFetch={canFetch} sending={sending} onFetch={onFetch} result={fetchResult} />
        </div>
      ) : (
        <>
          {fetchResult && (
            <div className="cv-card-intro">
              <span className={`cv-chip ${fetchResult.tone}`}>{fetchResult.text}</span>
            </div>
          )}
          <div className="cv-tabs" role="tablist" aria-label="Insurance plan">
            {TABS.map(([id, label]) => (
              <button key={id} type="button" role="tab" className="cv-tab" aria-selected={tab === id} onClick={() => setTab(id)}>
                {label}
                {counts[id] != null ? ` (${Number(counts[id]).toLocaleString("en-IN")})` : ""}
              </button>
            ))}
          </div>
          {tab === "overview" && <Overview plan={plan} showProfile={showProfile} />}
          {tab === "packages" && <PackageBrowser correlationId={correlationId} plan={plan} plannedCodes={plannedCodes} onOpenForm={setOpenForm} />}
          {tab === "docs" && <DocsAndForms plan={plan} forms={forms} showProfile={showProfile} onOpenForm={setOpenForm} />}
          {tab === "rules" && <Rules plan={plan} showProfile={showProfile} />}
          {tab === "cover" && <Cover rows={cover} />}
          {tab === "profile" && <ProfileCheck plan={plan} />}
        </>
      )}
      <FormDrawer correlationId={correlationId} url={openForm} onClose={() => setOpenForm(null)} />
    </section>
  );
}
