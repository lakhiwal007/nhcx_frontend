import { useState } from "react";
import { formatDateTime, formatMoney } from "../../format.js";
import { useCoverBenefits } from "../../hooks/usePlanForms";
import { planFieldGroups, missingRequired, profileRows, PROFILE_URL } from "./planProfile";
import PlanState from "./PlanState";
import PackageBrowser from "./PackageBrowser";
import TechnicalDetails from "../case/TechnicalDetails";

const TABS = [
  ["overview", "Overview"],
  ["packages", "Packages"],
  ["docs", "Documents & forms"],
  ["rules", "Exclusions"],
  ["cover", "Cover benefits"],
];
const STAGE = { pre: ["Pre-auth", "is-info"], post: ["Claim", "is-todo"] };

function Overview({ plan }) {
  return (
    <div className="cv-card-body cv-cols cv-tab-body">
      {planFieldGroups(plan).map((g) => (
        <div key={g.title}>
          <div className="cv-sub">{g.title}</div>
          {g.fields.map((x) => (
            <div key={`${x.path}${x.label}`} className="cv-field">
              <span className="cv-field-label">{x.label}</span>
              <span className={`cv-field-value${x.value == null ? (x.required ? " is-required-missing" : " is-missing") : ""}`}>{x.value ?? (x.required ? "Not sent (required)" : "Not sent")}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function DocsAndForms({ plan, forms, onOpenForm }) {
  const docs = plan?.policy_documents || [];
  return (
    <div className="cv-card-body cv-cols cv-tab-body">
      <div>
        <div className="cv-sub">Every case on this policy</div>
        <div className="cv-card-meta cv-sub-note">Requirements on the plan itself, and the forms on its coverage.</div>
        {docs.length === 0 && <div className="cv-card-meta">The plan lists no policy-wide documents.</div>}
        {docs.map((d, i) => {
          const [label, tone] = STAGE[d.stage] || STAGE.pre;
          return (
            <div key={i} className="cv-kv">
              <span className="cv-ink">
                {d.form ? (
                  <button type="button" className="cv-pick" onClick={() => onOpenForm(d.form)}>
                    {d.display || "Form"}
                  </button>
                ) : (
                  d.display || d.code
                )}{" "}
                <span className="cv-mono cv-card-meta">{d.form ? "form" : [d.category, d.code].filter(Boolean).join(" · ")}</span>
              </span>
              <span className={`cv-chip ${tone}`}>{label}</span>
            </div>
          );
        })}
        {plan?.plan?.proof_of_presence_required && <div className="cv-card-meta cv-sub-note-top">ADN on the plan means proof of presence: biometrics, or the consent form in its place.</div>}
      </div>
      <div>
        <div className="cv-sub">Questionnaires in the plan ({forms.length})</div>
        <div className="cv-card-meta cv-sub-note">A policy form is asked on every case; a package's form only when that package is quoted.</div>
        {forms.length === 0 && <div className="cv-card-meta">The plan carries no questionnaires.</div>}
        {forms.map((f) => {
          const [label, tone] = STAGE[f.stage] || STAGE.pre;
          return (
            <div key={f.url} className="cv-kv cv-kv-center">
              <span className="cv-ink cv-kv-text">
                <span className="cv-strong-block">{f.title || f.form_id}</span>
                <span className="cv-card-meta">
                  {[f.kind === "stg" || /stg/i.test(f.kind || "") ? "Treatment guideline" : "Form", f.item_count != null ? `${f.item_count} questions` : null].filter(Boolean).join(" · ")}
                </span>
              </span>
              <span className="cv-kv-tools">
                <span className={`cv-chip ${tone}`}>{label}</span>
                <button type="button" className="cv-btn" onClick={() => onOpenForm(f.url)}>
                  Preview
                </button>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Exclusions({ plan }) {
  const exclusions = plan?.exclusions || [];
  if (exclusions.length === 0) return <div className="cv-card-body cv-card-meta">The payer listed no exclusions in the plan.</div>;
  return (
    <div className="cv-tw cv-in-card">
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
  );
}

function Cover({ rows }) {
  if (rows == null) return <div className="cv-card-body cv-card-meta cv-tab-body">Loading…</div>;
  if (rows.length === 0) {
    return (
      <div className="cv-card-body cv-tab-body">
        <div className="cv-strong">This plan sends no cover benefits.</div>
        <div className="cv-card-meta cv-sub-note-top">
          Cover benefits are limits on the policy that are not packages, such as Blood, ICU, Oxygen or Ambulance. They show here with their limit when a payer sends them, and are never offered as a line item.
        </div>
      </div>
    );
  }
  return (
    <div className="cv-tw cv-in-card cv-tab-body">
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
              <td className="cv-strong">{b.display || b.code}</td>
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
      <p className="cv-card-meta">
        Every element of the{" "}
        <a href={PROFILE_URL} target="_blank" rel="noreferrer">
          NRCES InsurancePlan profile
        </a>
        , what this payer sent, and whether it is kept as a field. The whole answer is also kept as received.
      </p>
      <div className="cv-tw">
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
            {profileRows(plan).map((r, i) => (
              <tr key={`${i}-${r.path}`}>
                <td className="cv-mono">{r.path}</td>
                <td>
                  <span className="cv-prof-card">{r.card}</span>
                </td>
                <td>{r.ms ? <span className="cv-prof-ms">MS</span> : null}</td>
                <td>
                  <span className={`cv-chip ${r.sent ? "is-todo" : r.card.startsWith("1") ? "is-warn" : "is-todo"}`}>{r.sent ? "Yes" : r.card.startsWith("1") ? "No (required)" : "No"}</span>
                </td>
                <td>
                  <span className={`cv-chip ${r.kept === "Yes" ? "is-todo" : "is-warn"}`}>{r.kept}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

export default function PlanCard({ plan, state, plannedCodes, forms = [], canFetch, sending, fetchResult, onFetch, onOpenForm }) {
  const [tab, setTab] = useState("overview");
  const ready = state.key === "ready";
  const correlationId = ready ? plan.correlation_id : null;
  const cover = useCoverBenefits(tab === "cover" ? correlationId : null);
  const gaps = ready ? missingRequired(plan) : [];
  const missingForms = plan?.missing_forms || [];
  const counts = {
    packages: plan?.benefit_count,
    docs: (plan?.policy_documents || []).length + forms.length,
    rules: (plan?.exclusions || []).length,
    cover: cover?.length,
  };

  return (
    <section className="cv-card" aria-label="Insurance plan">
      <div className="cv-card-head">
        <h2 className="cv-card-title">Insurance plan</h2>
        {ready && <span className="cv-chip is-todo">Ready</span>}
        {gaps.length > 0 && (
          <span className="cv-chip is-warn">
            {gaps.length} required {gaps.length === 1 ? "field" : "fields"} not sent
          </span>
        )}
        <span className="cv-card-meta">
          {[plan?.plan?.plan_title, plan?.fetched_at && `fetched ${formatDateTime(plan.fetched_at)}`, plan?.reused_from && "reused from an earlier fetch"].filter(Boolean).join(" · ")}
        </span>
        {ready && (
          <span className="cv-card-tools">
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
          {(plan?.subsetted || missingForms.length > 0) && (
            <div className="cv-notice is-warn cv-in-card">
              {plan?.subsetted && <div className="cv-notice-title">The payer sent a shortened plan</div>}
              <div className="cv-notice-body">
                {[
                  plan?.subsetted && "It is marked as a summary, so packages or forms may be missing.",
                  missingForms.length > 0 &&
                    `The plan names ${missingForms.length} ${missingForms.length === 1 ? "form" : "forms"} it did not include: ${missingForms.map((f) => (f.title ? `${f.title} (${f.ref})` : `form ${f.ref}`)).join(", ")}.`,
                  missingForms.some((f) => f.ref === "100024" || f.ref === "100466") &&
                    "Without the consent forms, a PMJAY pre-auth or claim can only go with a biometric scan. Fetch the plan again; if they are still missing, ask the payer.",
                ]
                  .filter(Boolean)
                  .join(" ")}
              </div>
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
          {tab === "overview" && <Overview plan={plan} />}
          {tab === "packages" && <PackageBrowser correlationId={correlationId} plan={plan} plannedCodes={plannedCodes} onOpenForm={onOpenForm} />}
          {tab === "docs" && <DocsAndForms plan={plan} forms={forms} onOpenForm={onOpenForm} />}
          {tab === "rules" && <Exclusions plan={plan} />}
          {tab === "cover" && <Cover rows={cover} />}
          <div className="cv-card-body cv-tab-body">
            <TechnicalDetails summary="Profile check for the IT team" ids={[{ label: "Plan request", value: plan?.correlation_id }, { label: "Reused from", value: plan?.reused_from }]}>
              <ProfileCheck plan={plan} />
            </TechnicalDetails>
          </div>
        </>
      )}
    </section>
  );
}
