import { useState } from "react";
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

function tiles(checks, requirements, discovery) {
  const v = checks?.validation;
  const b = checks?.benefits;
  const a = checks?.auth;
  const inforce = checks?.inforce;
  const balance = checks?.wallet?.balance;
  const pre = requirements.filter((r) => r.at_preauth || r.stage === "pre").length;
  const post = requirements.length - pre;
  const tone = (c) => (c?.state === "error" ? "is-bad" : c?.state === "pending" ? "is-todo" : c?.state === "unavailable" ? "is-warn" : "is-ok");
  return [
    {
      id: "validation",
      name: "Validation",
      tone: inforce === false ? "is-bad" : tone(v),
      badge: v?.state === "pending" ? "Waiting" : v?.state === "error" ? "Failed" : inforce === false ? "Not in force" : "Eligible",
      line: v?.state === "done" ? [inforce ? "In force" : null, balance != null ? `${formatMoney(balance)} left` : null].filter(Boolean).join(" · ") || "Answered" : "—",
      when: v?.sub?.received_at || v?.sub?.updated_at,
    },
    {
      id: "benefits",
      name: "Benefits",
      tone: tone(b),
      badge: b?.state === "pending" ? "Waiting" : b?.state === "error" ? "Failed" : b?.state === "unavailable" ? "No answer" : `${b?.items.length || 0} items`,
      line: b?.items.length ? `${b.items.filter((i) => i.authorization_required).length} need pre-auth` : "No item limits",
      when: b?.sub?.received_at || b?.sub?.updated_at,
    },
    {
      id: "auth",
      name: "Auth requirements",
      tone: a?.state === "done" && requirements.length ? "is-warn" : tone(a),
      badge: a?.state === "pending" ? "Waiting" : a?.state === "error" ? "Failed" : a?.required === false ? "No pre-auth" : `${requirements.length} asks`,
      line: requirements.length ? `${pre} at pre-auth · ${post} at claim` : a?.required ? "Pre-auth required" : "Nothing asked",
      when: a?.sub?.received_at || a?.sub?.updated_at,
    },
    {
      id: "discovery",
      name: "Discovery",
      tone: discovery ? "is-info" : "is-todo",
      badge: discovery ? "Adopted" : "Not used",
      line: discovery ? "This case's policy was found by discovery" : "The policy came from the hospital's records",
      when: null,
    },
  ];
}

function ValidationPanel({ check, checks }) {
  const sub = check.sub || {};
  const cov = checks.coverage || {};
  const cd = cov.coverage_details || {};
  const w = checks.wallet || {};
  const classes = (cd.classes || []).filter((c) => c?.value && !["plan", "subplan"].includes(c.type));
  return (
    <div className="cv-card-body cv-cols" style={{ paddingTop: 16 }}>
      <div>
        <div className="cv-kv"><span>Outcome</span><span>{[sub.disposition, sub.outcome].filter(Boolean).join(" · ") || "—"}</span></div>
        <div className="cv-kv"><span>In force</span><span style={{ color: checks.inforce === false ? "var(--error)" : undefined }}>{checks.inforce == null ? "—" : checks.inforce ? "Yes" : "No"}</span></div>
        <div className="cv-kv"><span>Benefit period</span><span>{period(cov.benefit_period?.start, cov.benefit_period?.end) || "—"}</span></div>
        <div className="cv-kv"><span>Plan on the card</span><span>{cd.plan_name || cd.plan || "—"}</span></div>
        <div className="cv-kv"><span>Member checked</span><span className="cv-mono">{cd.member_id || "—"}</span></div>
        <div className="cv-kv"><span>Coverage status</span><span>{cd.status || "—"}</span></div>
      </div>
      <div>
        <div className="cv-kv"><span>Sum insured</span><span>{money(w.sum_insured ?? cd.sum_insured)}</span></div>
        <div className="cv-kv"><span>Used so far</span><span>{money(w.used)}</span></div>
        <div className="cv-kv"><span>Balance</span><span style={{ color: w.balance <= 0 ? "var(--error)" : "var(--success)" }}>{money(w.balance)}</span></div>
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
  if (!check.items.length) return <div className="cv-card-body cv-card-meta" style={{ paddingTop: 16 }}>The payer returned no item limits for this policy.</div>;
  return (
    <div className="cv-tw cv-in-card" style={{ marginTop: 16 }}>
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
      <div className="cv-card-intro" style={{ paddingTop: 16 }}>
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

function DiscoveryPanel({ discovery, onDiscover }) {
  if (!discovery) {
    return (
      <div className="cv-card-body" style={{ paddingTop: 16 }}>
        <div>Discovery was not used for this case: the policy came from the hospital's records or was entered by the desk.</div>
        <div className="cv-card-meta" style={{ marginTop: 6 }}>Discovery asks the payer which covers this patient holds, by ABHA or member id. Use it when the patient has no card with them.</div>
        {onDiscover && (
          <div style={{ marginTop: 12 }}>
            <button type="button" className="cv-btn" onClick={onDiscover}>Search for other covers</button>
          </div>
        )}
      </div>
    );
  }
  return (
    <div className="cv-card-body cv-cols" style={{ paddingTop: 16 }}>
      <div>
        <div className="cv-kv"><span>Cover</span><span>{discovery.product_name || discovery.plan_name || "—"}</span></div>
        <div className="cv-kv"><span>Policy</span><span className="cv-mono">{discovery.policy_number || "—"}</span></div>
        <div className="cv-kv"><span>Member</span><span className="cv-mono">{discovery.member_id || "—"}</span></div>
      </div>
      <div>
        <div className="cv-kv"><span>Sum insured</span><span>{money(discovery.sum_insured)}</span></div>
        <div className="cv-kv"><span>Valid to</span><span>{discovery.effective_to ? formatDate(discovery.effective_to) : "—"}</span></div>
        <div className="cv-kv"><span>Status</span><span>{discovery.status || "—"}</span></div>
      </div>
    </div>
  );
}

export default function EligibilityResponses({ checks, requirements, discovery, formTitle, onOpenForm, onDiscover, onRerun, rerunLabel, rerunDisabled }) {
  const [tab, setTab] = useState("validation");
  const list = tiles(checks, requirements, discovery);
  const check = checks?.[tab];
  const note = check ? waiting(check) : null;
  return (
    <section aria-label="Coverage eligibility" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
        <h2 className="cv-section-title">2. Coverage eligibility</h2>
        <span className="cv-card-meta">The payer's answers. Pick one to read it in full.</span>
        {onRerun && (
          <button type="button" className="cv-btn" style={{ marginLeft: "auto" }} disabled={rerunDisabled} onClick={onRerun}>
            {rerunLabel}
          </button>
        )}
      </div>
      {!checks ? (
        <div className="cv-notice is-info">
          <div className="cv-notice-body">Eligibility has not been asked yet. It is sent when you continue from the Policy step.</div>
        </div>
      ) : (
        <>
          <div className="cv-tiles" role="tablist" aria-label="Eligibility answers">
            {list.map((t) => (
              <button key={t.id} type="button" role="tab" className="cv-tile" aria-selected={tab === t.id} onClick={() => setTab(t.id)}>
                <span className="cv-tile-head">
                  <span className="cv-tile-name">{t.name}</span>
                  <span className={`cv-chip ${t.tone}`} style={{ marginLeft: "auto" }}>{t.badge}</span>
                </span>
                <span className="cv-tile-line">{t.line}</span>
                {t.when && <span className="cv-tile-when">{formatDate(t.when)}</span>}
              </button>
            ))}
          </div>
          <div className="cv-card" role="tabpanel">
            {note && <div className="cv-card-intro" style={{ paddingTop: 16 }}>{note}</div>}
            {!note && tab === "validation" && <ValidationPanel check={check} checks={checks} />}
            {!note && tab === "benefits" && <BenefitsPanel check={check} />}
            {!note && tab === "auth" && <AuthPanel check={check} requirements={requirements} formTitle={formTitle} onOpenForm={onOpenForm} />}
            {tab === "discovery" && <DiscoveryPanel discovery={discovery} onDiscover={onDiscover} />}
            {check?.sub?.errors?.length > 0 && (
              <div className="cv-card-body">
                <PayrErrorList errors={check.sub.errors} />
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}
