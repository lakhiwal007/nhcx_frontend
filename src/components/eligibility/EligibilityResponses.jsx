import { formatDate, formatMoney } from "../../format.js";
import PayrErrorList from "../PayrErrorList";
import { period } from "./checks";

const STAGE = { pre: ["Pre-auth", "is-info"], post: ["Claim", "is-todo"] };
const money = (v) => (v == null ? "—" : formatMoney(Number(v)));

function waiting(check) {
  if (check.state === "pending") return "Waiting for the payer's answer to this check.";
  if (check.state === "unavailable") return "The payer did not answer this check in time. You can still go on to the pre-auth.";
  return null;
}

function ValidationPanel({ check, checks, discovery }) {
  const sub = check.sub || {};
  const cov = checks.coverage || {};
  const cd = cov.coverage_details || {};
  const w = checks.wallet || {};
  const classes = (cd.classes || []).filter((c) => c?.value && !["plan", "subplan"].includes(c.type));
  return (
    <div className="cv-card-body cv-cols">
      <div>
        <div className="cv-kv"><span>Outcome</span><span>{[sub.disposition, sub.outcome].filter(Boolean).join(" · ") || "—"}</span></div>
        <div className="cv-kv"><span>In force</span><span style={{ color: checks.inforce === false ? "var(--error)" : undefined }}>{checks.inforce == null ? "—" : checks.inforce ? "Yes" : "No"}</span></div>
        <div className="cv-kv"><span>Benefit period</span><span>{period(cov.benefit_period?.start, cov.benefit_period?.end) || "—"}</span></div>
        <div className="cv-kv"><span>Plan on the card</span><span>{cd.plan_name || cd.plan || "—"}</span></div>
        <div className="cv-kv"><span>Member checked</span><span className="cv-mono">{cd.member_id || "—"}</span></div>
        <div className="cv-kv"><span>Coverage status</span><span>{cd.status || "—"}</span></div>
        {discovery && <div className="cv-kv"><span>Policy source</span><span>Found by discovery</span></div>}
      </div>
      <div>
        <div className="cv-kv"><span>Sum insured</span><span>{money(w.sum_insured ?? cd.sum_insured)}</span></div>
        <div className="cv-kv"><span>Used so far</span><span>{money(w.used)}</span></div>
        <div className="cv-kv"><span>Balance</span><span style={w.balance == null ? undefined : { color: w.balance <= 0 ? "var(--error)" : "var(--success)" }}>{money(w.balance)}</span></div>
        {classes.map((c) => (
          <div key={c.id || c.type} className="cv-kv"><span>{c.name || c.type}</span><span>{c.value}</span></div>
        ))}
        <div className="cv-kv"><span>Coverage reference</span><span className="cv-mono">{cov.coverage || "—"}</span></div>
        <div className="cv-kv"><span>Request</span><span className="cv-mono">{sub.correlation_id ? sub.correlation_id.slice(0, 8) : "—"}</span></div>
      </div>
    </div>
  );
}

function BenefitsPanel({ check }) {
  if (!check.items.length) return <div className="cv-card-body cv-card-meta">The payer returned no item limits for this policy.</div>;
  return (
    <div className="cv-tw cv-in-card">
      <table>
        <thead>
          <tr>
            <th>Covered item</th>
            <th>Category</th>
            <th className="is-num">Limit</th>
            <th className="is-num">Used</th>
            <th className="is-num">Left</th>
            <th>Pre-auth</th>
            <th>Send with it</th>
          </tr>
        </thead>
        <tbody>
          {check.items.map((it, i) => {
            const b = it.benefit?.[0];
            const allowed = b?.allowed?.value;
            const used = b?.used?.value || 0;
            return (
              <tr key={i}>
                <td>
                  <strong>{it.product_or_service?.display || it.product_or_service?.code || "—"}</strong>{" "}
                  <span className="cv-mono cv-card-meta">{it.product_or_service?.code}</span>
                  {it.excluded && <span className="cv-chip is-bad" style={{ marginLeft: 8 }}>Excluded</span>}
                  {(it.benefit || []).slice(1).map((x, j) => (
                    <div key={j} className="cv-card-meta">{x.type?.display || "Limit"}: {money(x.allowed?.value)} · {money(x.used?.value)} used</div>
                  ))}
                </td>
                <td>{it.category?.display || it.category?.code || "—"}</td>
                <td className="is-num">{money(allowed)}</td>
                <td className="is-num">{money(used)}</td>
                <td className="is-num" style={{ fontWeight: 600 }}>{allowed != null ? money(allowed - used) : "—"}</td>
                <td>
                  {it.authorization_required == null ? "—" : <span className={`cv-chip ${it.authorization_required ? "is-warn" : "is-todo"}`}>{it.authorization_required ? "Needed" : "Not needed"}</span>}
                </td>
                <td>{(it.authorization_supporting || []).map((d) => d.display || d.code).join(", ") || "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function AuthPanel({ check, requirements, formTitle, onOpenForm }) {
  return (
    <>
      <div className="cv-card-intro">
        The payer's own ruling for this case{check.required != null ? (check.required ? ": pre-authorisation is required" : ": no pre-authorisation needed") : ""}. Where it speaks, it replaces the plan's lists.
      </div>
      {requirements.length === 0 ? (
        <div className="cv-card-body cv-card-meta">The payer asked for no documents or forms.</div>
      ) : (
        <div className="cv-tw cv-in-card">
          <table>
            <thead>
              <tr>
                <th>Asked for</th>
                <th>Type</th>
                <th>Code</th>
                <th>For</th>
                <th>When</th>
              </tr>
            </thead>
            <tbody>
              {requirements.map((r, i) => {
                const [label, tone] = r.at_preauth ? STAGE.pre : STAGE[r.stage] || STAGE.pre;
                const name = r.display || formTitle(r.form_url) || r.code || r.text || "—";
                return (
                  <tr key={i}>
                    <td>{r.form_url && onOpenForm ? <button type="button" className="cv-pick" onClick={() => onOpenForm(r.form_url)}>{name}</button> : <strong>{name}</strong>}</td>
                    <td style={{ textTransform: "capitalize" }}>{r.kind || "—"}</td>
                    <td className="cv-mono">{r.code || "—"}</td>
                    <td className="cv-mono">{r.for_code || "Every case"}</td>
                    <td><span className={`cv-chip ${tone}`}>{label}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

const TITLES = { validation: "Validation", benefits: "Benefits", auth: "Auth requirements" };

// One of the payer's three answers, in full. Which one is chosen on the checklist.
export default function PayerAnswer({ id, checks, requirements, discovery, formTitle, onOpenForm }) {
  const check = checks?.[id];
  const note = check ? waiting(check) : null;
  const when = check?.sub?.received_at || check?.sub?.updated_at;
  return (
    <section className="cv-card" aria-label={TITLES[id]}>
      <div className="cv-card-head">
        <h2 className="cv-card-title">{TITLES[id]}</h2>
        {when && <span className="cv-card-meta">Answered {formatDate(when)}</span>}
      </div>
      {!checks ? (
        <div className="cv-card-intro">Eligibility has not been asked yet. It is sent when you continue from the Policy step.</div>
      ) : (
        <>
          {note && <div className="cv-card-intro">{note}</div>}
          {!note && id === "validation" && <ValidationPanel check={check} checks={checks} discovery={discovery} />}
          {!note && id === "benefits" && <BenefitsPanel check={check} />}
          {!note && id === "auth" && <AuthPanel check={check} requirements={requirements} formTitle={formTitle} onOpenForm={onOpenForm} />}
          {check?.sub?.errors?.length > 0 && (
            <div className="cv-card-body">
              <PayrErrorList errors={check.sub.errors} />
            </div>
          )}
        </>
      )}
    </section>
  );
}
