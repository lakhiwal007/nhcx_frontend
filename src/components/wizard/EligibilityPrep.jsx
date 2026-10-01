import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, AlertCircle, RefreshCw } from "lucide-react";
import { api } from "../../api";
import { usePoll } from "../../hooks/usePoll";
import { Card, Button, LoadingBlock, TablePagination } from "../Common";
import Dropdown from "../Dropdown";
import { Section, Fields } from "../case/CaseFile";
import { formatDate, formatMoney } from "../../format.js";
import { STEP_FORWARD_ROUTE, STEP_FORWARD_LABEL, projectCaseStatus } from "../case/caseStages";
import PayrErrorList from "../PayrErrorList";

const POLL_INTERVAL_MS = 7000;
const TERMINAL_STATUSES = ["complete", "failed"];

// Stop polling at a terminal status, OR when the backend signals `resubmit`
// - that state won't resolve on its own, so the user must re-run the
// eligibility check rather than wait. `resubmit` now appears both when
// `status` is `partial` (a sub-check failed) and when `status` is `pending`
// past the server timeout with no payer callback ("stale pending" - the
// request was likely lost).
const shouldStopPolling = (res) =>
  TERMINAL_STATUSES.includes(res?.status) ||
  (["partial", "pending"].includes(res?.status) && res?.next_actions?.includes("resubmit"));

// Doc requirements arrive either as a flat {name}/{type:{display}} shape, or as
// a raw FHIR extension: {url, values: [{url: "category", display}, {url: "code", display}]}.
function describeDocRequirement(d) {
  if (d.name) return { label: d.name };
  if (!d.values && (d.display || d.text)) return { label: d.display || d.text, code: d.code };
  if (d.type?.display) return { label: d.type.display, code: d.type.code };
  const values = d.values || [];
  const category = values.find((v) => v.url === "category");
  const code = values.find((v) => v.url === "code");
  if (category || code) {
    return {
      label: [category?.display, code?.display].filter(Boolean).join(" — "),
      code: category?.code,
    };
  }
  return { label: "Document requirement" };
}

// ─── Normalisers for the parsed InsurancePlan ─────────────────────────────
// Plan entries arrive flat ({code, name}) or FHIR-shaped from the backend's
// InsurancePlanParser ({type: {code, display}, limits, claim_conditions,
// document_requirements}).
function planEntry(e) {
  if (!e || typeof e !== "object") return { label: String(e ?? ""), code: null };
  const rawCode = e.type?.code ?? e.code;
  const code = typeof rawCode === "string" ? rawCode : rawCode?.code ?? null;
  const label =
    e.type?.display || e.name || e.display || e.description || e.code?.display || e.text || code || "Unnamed";
  return { label, code: code && code !== label ? code : null };
}

// Claim-Condition extensions → { ProcedureType: "Surgical", ApprovalNotRequired: "N", … }
function conditionsOf(entry) {
  const out = {};
  for (const c of entry?.claim_conditions || []) {
    for (const v of c.values || [c]) {
      const key = String(v.url || "").split("/").pop();
      const value = v.value ?? v.display ?? v.code;
      if (key && value != null) out[key] = String(value).trim();
    }
  }
  return out;
}

// Per-package documents: the document name alone (the category is implied).
const docsOf = (entry) =>
  (entry?.document_requirements || []).map((d) => {
    const doc = describeDocRequirement(d);
    return { ...doc, label: doc.label.split(" — ").pop() };
  });

const rateOf = (entry) => {
  const v = entry?.limits?.[0]?.value;
  const n = Number(v?.value ?? v);
  return Number.isFinite(n) && n > 0 ? n : null;
};

const yn = (v) => (v == null ? null : /^y/i.test(v) ? "Yes" : /^n/i.test(v) ? "No" : v);

// ApprovalNotRequired is phrased negatively: "N" means preauth IS required.
const preauthFromRules = (rules) =>
  rules.ApprovalNotRequired == null ? null : /^y/i.test(rules.ApprovalNotRequired) ? "Not required" : "Required";

const ruleNotes = (r) =>
  [
    /^y/i.test(r.IsDayCare || "") && "Day care",
    /^y/i.test(r.ImplantApplicable || "") && "Implant",
    /^y/i.test(r.StratificationAllowed || "") && "Stratified",
    /^y/i.test(r.CyclicProcedure || "") && `Cyclic${r.MaximumCyclesAllowed ? ` ×${r.MaximumCyclesAllowed}` : ""}`,
    r.QuantityAllowed && `Qty ≤ ${r.QuantityAllowed}`,
  ].filter(Boolean);

// The package list: from coverage_benefits (grouped by specialty) when the
// plan has it, else from inclusions.
function packageCatalogue(plan) {
  const fromBenefits = (plan?.coverage_benefits || []).flatMap((cov) =>
    (cov.benefits || [])
      .filter((b) => !b.excluded)
      .map((b) => ({ entry: b, specialty: cov.type?.display || cov.type?.code || null })),
  );
  const rows = fromBenefits.length
    ? fromBenefits
    : (plan?.inclusions || []).map((entry) => ({ entry, specialty: null }));
  return rows.map(({ entry, specialty }, i) => {
    const { label, code } = planEntry(entry);
    const rules = conditionsOf(entry);
    return {
      key: `${specialty || ""}:${code || label}:${i}`,
      code: code || entry.id || null,
      name: label,
      specialty,
      rate: rateOf(entry),
      rules,
      docs: docsOf(entry),
    };
  });
}

const identifierOf = (details, typeCode) =>
  (details?.identifiers || []).find((i) => i?.type?.code === typeCode)?.value || null;

const familySumInsured = (plan) => {
  const cost = plan?.raw_payload?.plan?.[0]?.generalCost?.[0]?.cost;
  if (cost?.value != null) return Number(cost.value);
  const pricing = Array.isArray(plan?.pricing) ? plan.pricing : plan?.pricing ? [plan.pricing] : [];
  const flat = pricing.find((p) => p?.sum_insured != null)?.sum_insured;
  return flat != null ? Number(flat) : null;
};

const period = (start, end) => (start || end ? `${formatDate(start)} – ${formatDate(end)}` : null);

// ─── Coverage eligibility ─────────────────────────────────────────────────
// Real backend returns nested validation/benefits/auth_requirements; flat is
// legacy mock.
function deriveChecks(ce, benefitsTimedOut) {
  if (!ce) return null;
  const pick = (sub) => sub || (ce.validation || ce.benefits || ce.auth_requirements ? null : ce);
  const stateOf = (sub) => {
    if (!sub) return "pending";
    if (sub.status === "complete") return sub.errors?.length ? "error" : "done";
    if (sub.status === "failed") return "error";
    return "pending";
  };
  const itemsOf = (sub) =>
    (sub?.insurance_items || []).flatMap((ins) => (ins.items || []).map((it) => ({ ...it, _coverage: ins.coverage })));
  const validation = pick(ce.validation);
  const benefits = pick(ce.benefits);
  const auth = pick(ce.auth_requirements);
  const coverage =
    validation?.insurance_items?.find((ins) => ins.coverage_details) ||
    benefits?.insurance_items?.find((ins) => ins.coverage_details) ||
    validation?.insurance_items?.[0] ||
    null;
  return {
    coverage,
    inforce: validation?.inforce ?? coverage?.inforce ?? null,
    validation: { sub: validation, state: stateOf(validation), items: itemsOf(validation) },
    benefits: { sub: benefits, state: benefitsTimedOut ? "unavailable" : stateOf(benefits), items: itemsOf(benefits) },
    auth: {
      sub: auth,
      state: stateOf(auth),
      items: itemsOf(auth).length ? itemsOf(auth) : itemsOf(benefits),
      required: auth?.auth_required ?? ce.auth_required ?? null,
    },
  };
}

// ─── Presentational pieces ────────────────────────────────────────────────
function SubList({ title, items, empty }) {
  return (
    <div className="ep-sublist">
      <div className="ep-sublist-title">
        {title} {items.length > 0 && <span className="ep-count">{items.length}</span>}
      </div>
      {items.length ? (
        <ul>
          {items.map((it, i) => (
            <li key={i}>
              <span>{it.label}</span>
              {it.code && <span className="ep-code">{it.code}</span>}
            </li>
          ))}
        </ul>
      ) : (
        <div className="ep-muted">{empty}</div>
      )}
    </div>
  );
}

// Section jump-bar; highlights the section currently at the top of the pane.
const SECTIONS = [
  { id: "ep-policy", label: "Policy & member" },
  { id: "ep-plan", label: "Insurance plan" },
  { id: "ep-eligibility", label: "Eligibility checks" },
  { id: "ep-treatment", label: "Planned treatment" },
  { id: "ep-packages", label: "Package catalogue" },
];

function JumpBar() {
  const [active, setActive] = useState(SECTIONS[0].id);
  useEffect(() => {
    const scroller = document.querySelector(".content");
    if (!scroller) return;
    const onScroll = () => {
      const top = scroller.getBoundingClientRect().top + 140;
      let current = SECTIONS[0].id;
      for (const s of SECTIONS) {
        const el = document.getElementById(s.id);
        if (el && el.getBoundingClientRect().top <= top) current = s.id;
      }
      setActive(current);
    };
    scroller.addEventListener("scroll", onScroll, { passive: true });
    return () => scroller.removeEventListener("scroll", onScroll);
  }, []);
  return (
    <nav className="ep-jump" aria-label="Sections">
      {SECTIONS.map((s) => (
        <button
          key={s.id}
          type="button"
          className={active === s.id ? "is-on" : ""}
          onClick={() => document.getElementById(s.id)?.scrollIntoView({ behavior: "smooth", block: "start" })}
        >
          {s.label}
        </button>
      ))}
    </nav>
  );
}

const CHECKS = [
  { id: "validation", label: "Validation", question: "Is the policy in force?" },
  { id: "benefits", label: "Benefits", question: "What cover and limits apply?" },
  { id: "auth", label: "Auth requirements", question: "Does the treatment need preauth?" },
];

function checkSummary(id, c, inforce) {
  if (c.state === "pending") return "Awaiting insurer";
  if (c.state === "error") return "Failed";
  if (c.state === "unavailable") return "No response in time";
  if (id === "validation") return inforce == null ? "Answered" : inforce ? "In force" : "Not in force";
  if (id === "benefits") return c.items.length ? `${c.items.length} benefit line${c.items.length === 1 ? "" : "s"}` : "No item limits";
  return c.required == null ? "Answered" : c.required ? "Preauth required" : "Not required";
}

function ItemsTable({ items, mode }) {
  if (!items.length) return <div className="ep-muted ep-pad-y">The insurer returned no item lines for this check.</div>;
  return (
    <div className="ep-table-wrap">
      <table className="ep-table">
        <thead>
          <tr>
            <th>Service</th>
            {mode === "auth" ? (
              <>
                <th>Preauth</th>
                <th>Documents for preauth</th>
              </>
            ) : (
              <>
                <th>Covered</th>
                <th className="ep-num">Allowed</th>
                <th className="ep-num">Used</th>
                <th className="ep-num">Available</th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {items.map((it, i) => {
            const b = it.benefit?.[0];
            const allowed = b?.allowed?.value;
            const used = b?.used?.value;
            return (
              <tr key={i}>
                <td>
                  <div className="ep-strong">{it.product_or_service?.display || it.product_or_service?.code || "—"}</div>
                  <div className="ep-muted">
                    {[it.product_or_service?.code, it.category?.display || it.category?.code].filter(Boolean).join(" · ")}
                  </div>
                  {mode !== "auth" &&
                    (it.benefit || []).slice(1).map((x, j) => (
                      <div key={j} className="ep-muted">
                        {x.type?.display || "Benefit"}: {formatMoney(x.allowed?.value)} allowed · {formatMoney(x.used?.value)} used
                      </div>
                    ))}
                </td>
                {mode === "auth" ? (
                  <>
                    <td className="ep-nowrap">{it.authorization_required == null ? "—" : it.authorization_required ? "Required" : "Not required"}</td>
                    <td>
                      {(it.authorization_supporting || []).length
                        ? it.authorization_supporting.map((d) => d.display || d.code).join(", ")
                        : "—"}
                    </td>
                  </>
                ) : (
                  <>
                    <td className={it.excluded ? "is-bad ep-nowrap" : "ep-nowrap"}>{it.excluded ? "Excluded" : "Covered"}</td>
                    <td className="ep-num ep-mono">{formatMoney(allowed)}</td>
                    <td className="ep-num ep-mono">{formatMoney(used)}</td>
                    <td className="ep-num ep-mono ep-strong">{allowed != null ? formatMoney(allowed - (used || 0)) : "—"}</td>
                  </>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function CheckDetail({ id, check, inforce, coverage }) {
  const sub = check.sub || {};
  const cd = coverage?.coverage_details || {};
  return (
    <div className="ep-check-detail">
      <Fields
        cols={2}
        rows={[
          { label: "Status", value: <span className="ep-cap">{sub.status || "pending"}</span> },
          { label: "Outcome", value: sub.outcome },
          { label: "Disposition", value: sub.disposition },
          id === "validation" && { label: "In force", value: inforce == null ? null : inforce ? "Yes" : "No", tone: inforce === false ? "bad" : undefined },
          id === "auth" && { label: "Preauth required", value: check.required == null ? null : check.required ? "Yes" : "No" },
          { label: "Request ID", value: sub.correlation_id, mono: true },
        ]}
      />
      {id === "validation" && (
        <>
          <div className="ep-detail-title">Coverage resolved by the insurer</div>
          <Fields
            cols={2}
            rows={[
              { label: "Coverage plan", value: cd.plan_name || cd.plan },
              { label: "Member ID", value: cd.member_id, mono: true },
              { label: "Sum insured", value: cd.sum_insured ? formatMoney(Number(cd.sum_insured)) : null, mono: true },
              { label: "Coverage status", value: cd.status && <span className="ep-cap">{cd.status}</span> },
              { label: "Benefit period", value: period(coverage?.benefit_period?.start, coverage?.benefit_period?.end) },
              { label: "Coverage reference", value: coverage?.coverage, mono: true },
              // plan / subplan classes are the plan and sum insured above
              ...(cd.classes || [])
                .filter((c) => c?.value && !["plan", "subplan"].includes(c.type))
                .map((c) => ({ label: c.name || c.type, value: c.value })),
            ]}
          />
          {check.items.length > 0 && <ItemsTable items={check.items} mode="benefits" />}
          {!cd.plan && !cd.plan_name && !cd.member_id && check.state === "done" && (
            <div className="ep-muted ep-pad-y">The insurer confirmed eligibility without coverage details.</div>
          )}
        </>
      )}
      {id === "benefits" && check.state !== "pending" && <ItemsTable items={check.items} mode="benefits" />}
      {id === "auth" && check.state !== "pending" && <ItemsTable items={check.items} mode="auth" />}
      {check.state === "pending" && <div className="ep-muted ep-pad-y">Waiting for the insurer's answer to this check.</div>}
      {check.state === "unavailable" && (
        <div className="ep-notice is-warn">The insurer didn't answer this check in time. Coverage details may be incomplete; you can still proceed to preauth.</div>
      )}
      {sub.errors?.length > 0 && <PayrErrorList errors={sub.errors} />}
    </div>
  );
}

const CATALOGUE_PAGE = 12;

function PackageCatalogue({ rows, plannedCodes }) {
  const [query, setQuery] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [page, setPage] = useState(0);
  const specialties = [...new Set(rows.map((r) => r.specialty).filter(Boolean))].sort();
  const q = query.trim().toLowerCase();
  const filtered = rows.filter(
    (r) =>
      (!specialty || r.specialty === specialty) &&
      (!q || r.name.toLowerCase().includes(q) || String(r.code || "").toLowerCase().includes(q)),
  );
  const pageRows = filtered.slice(page * CATALOGUE_PAGE, (page + 1) * CATALOGUE_PAGE);

  if (!rows.length) return <div className="ep-muted ep-pad">The insurer's plan lists no packages.</div>;

  return (
    <>
      <div className="ep-toolbar">
        <input
          className="input-modern ep-search"
          placeholder="Search package name or code…"
          aria-label="Search packages"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(0);
          }}
        />
        {specialties.length > 1 && (
          <div style={{ width: "240px" }}>
            <Dropdown
              compact
              ariaLabel="Specialty"
              value={specialty}
              options={[{ value: "", label: "All specialties" }, ...specialties.map((s) => ({ value: s, label: s }))]}
              onChange={(v) => {
                setSpecialty(v);
                setPage(0);
              }}
            />
          </div>
        )}
        <span className="ep-muted ep-toolbar-count">
          {filtered.length} of {rows.length} packages
        </span>
      </div>
      <div className="ep-table-wrap">
        <table className="ep-table">
          <thead>
            <tr>
              <th>Code</th>
              <th className="ep-col-name">Package</th>
              <th>Specialty</th>
              <th>Type</th>
              <th className="ep-num">Rate</th>
              <th>Preauth</th>
              <th>Enhancement</th>
              <th>Documents</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((r) => {
              const notes = ruleNotes(r.rules);
              return (
                <tr key={r.key} className={plannedCodes.has(String(r.code)) ? "is-planned" : undefined}>
                  <td className="ep-mono ep-nowrap">{r.code || "—"}</td>
                  <td className="ep-col-name">
                    <div className="ep-pkg-name">
                      {r.name}
                      {plannedCodes.has(String(r.code)) && <span className="ep-label">Planned</span>}
                    </div>
                    {notes.length > 0 && <div className="ep-muted">{notes.join(" · ")}</div>}
                  </td>
                  <td className="ep-muted">{r.specialty || "—"}</td>
                  <td>{r.rules.ProcedureType || "—"}</td>
                  <td className="ep-num ep-mono">{r.rate != null ? formatMoney(r.rate) : "—"}</td>
                  <td>{preauthFromRules(r.rules) || "—"}</td>
                  <td>{yn(r.rules.EnhancementAllowed) || "—"}</td>
                  <td className="ep-muted" title={r.docs.map((d) => d.label).join("\n") || undefined}>
                    {r.docs.length ? `${r.docs.length} required` : "—"}
                  </td>
                </tr>
              );
            })}
            {!pageRows.length && (
              <tr>
                <td colSpan={8} className="ep-muted">
                  No packages match this search.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="ep-pager">
        <TablePagination page={page} pageSize={CATALOGUE_PAGE} total={filtered.length} onPageChange={setPage} label="packages" />
      </div>
    </>
  );
}

export default function EligibilityPrep({ ctx }) {
  const navigate = useNavigate();
  const { patient, caseState, setCashlessCase, updateCaseState } = ctx;
  const { payer, policy, admission_id, cashless_case_id: existingCaseId } = caseState;

  const [loading, setLoading] = useState(true);
  const [caseData, setCaseData] = useState(null);
  const [polling, setPolling] = useState(false);
  const [forceRefreshing, setForceRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [sumInsuredError, setSumInsuredError] = useState(null); // { estimated, limit }
  const [movedOn, setMovedOn] = useState(null);
  const [activeCheck, setActiveCheck] = useState("validation");

  const hasInitialized = useRef(false);

  useEffect(() => {
    // Must have patient. If no existing case, also need payer + policy to prepare one.
    if (!patient) return;
    if (!existingCaseId && (!payer || !policy)) {
      navigate("../payer", { replace: true });
      return;
    }

    if (hasInitialized.current) return;
    hasInitialized.current = true;

    const init = async () => {
      setLoading(true);
      setError(null);
      try {
        let res;
        if (existingCaseId) {
          // Resume: fetch the existing case status directly (no gateway round-trip)
          res = await api.getCashlessStatus(existingCaseId);
        } else {
          res = await api.prepareCashless({
            child_id: patient.child_id,
            payer_id: payer.code,
            policy_number: policy.policyNumber || policy.policy_number,
            ...(admission_id && { admission_id }),
          });
        }
        setCaseData(res);
        setCashlessCase((prev) => ({ ...prev, ...projectCaseStatus(res) }));
        updateCaseState({
          cashless_case_id: res.cashless_case_id,
          claim_id: res.claim_id,
          eligibility_correlation_id:
            res.coverage_eligibility?.validation?.correlation_id ??
            res.coverage_eligibility?.correlation_id,
        });

        const ahead = STEP_FORWARD_ROUTE[res.current_step] || null;
        setMovedOn(ahead);

        if (!ahead && !shouldStopPolling(res)) {
          setPolling(true);
        }
      } catch (err) {
        // Detect sum-insured-exceeded so we can show a targeted recovery UI
        const msg = err.message || "";
        const isSumInsured =
          msg.includes("sum_insured_exceeded") ||
          msg.toLowerCase().includes("exceeds policy sum insured") ||
          msg.toLowerCase().includes("sum insured");
        if (isSumInsured) {
          // Try to extract amounts from the message (e.g. "₹75000 exceeds policy sum insured ₹50000")
          const nums = msg.match(/[\d,]+/g)?.map((n) => Number(n.replace(/,/g, "")));
          setSumInsuredError({
            estimated: nums?.[0] ?? null,
            limit: nums?.[1] ?? null,
            raw: msg,
          });
        } else {
          setError(msg);
        }
      } finally {
        setLoading(false);
      }
    };
    init();
  }, []);

  const pollStatus = async (signal) => {
    try {
      const res = await api.getCashlessStatus(caseData.cashless_case_id, signal);
      const ahead = STEP_FORWARD_ROUTE[res.current_step] || null;
      if (ahead) {
        setPolling(false);
        setMovedOn(ahead);
      }
      setCaseData(res);
      updateCaseState({
        eligibility_correlation_id:
          res.coverage_eligibility?.validation?.correlation_id ??
          res.coverage_eligibility?.correlation_id,
      });
      if (shouldStopPolling(res)) setPolling(false);
    } catch (_) {}
  };

  usePoll(pollStatus, {
    active: polling && caseData?.cashless_case_id ? caseData.cashless_case_id : null,
    intervalMs: POLL_INTERVAL_MS,
    immediate: false, // init() already fetched fresh status; wait one interval
  });

  const manualRefresh = () => {
    if (!polling && caseData?.cashless_case_id) setPolling(true);
  };

  // Preferred path: GET /cashless/{id}?force_refresh=true - the backend reads
  // the stored case (child, payer, policy, procedures) and re-fires all four
  // gateway calls, so it needs only the cashless_case_id we already have.
  // Falls back to POST /cashless/prepare with force_refresh only if we
  // somehow don't have a case id yet (requires payer + policy in that case).
  const handleForceRefresh = async () => {
    const caseId = caseData?.cashless_case_id;
    if (!caseId && (!patient || !payer || !policy)) return;
    setForceRefreshing(true);
    try {
      const res = caseId
        ? await api.getCashlessStatus(caseId, undefined, true)
        : await api.prepareCashless({
            child_id: patient.child_id,
            payer_id: payer.code,
            policy_number: policy.policyNumber || policy.policy_number,
            ...(admission_id && { admission_id }),
            force_refresh: true,
          });
      setCaseData(res);
      setCashlessCase((prev) => ({ ...prev, ...projectCaseStatus(res) }));
      updateCaseState({
        cashless_case_id: res.cashless_case_id,
        claim_id: res.claim_id,
        eligibility_correlation_id:
          res.coverage_eligibility?.validation?.correlation_id ??
          res.coverage_eligibility?.correlation_id,
      });
      const ahead = STEP_FORWARD_ROUTE[res.current_step] || null;
      setMovedOn(ahead);
      if (!ahead && !shouldStopPolling(res)) {
        setPolling(true);
      }
    } catch (_) {
    } finally {
      setForceRefreshing(false);
    }
  };

  if (loading) {
    return <LoadingBlock text="Initiating eligibility preparation…" />;
  }

  if (sumInsuredError) {
    return (
      <Card>
        <div style={{ display: "flex", gap: "var(--space-3)", alignItems: "flex-start", marginBottom: "var(--space-5)" }}>
          <AlertCircle color="var(--error)" size={24} style={{ flexShrink: 0, marginTop: "2px" }} />
          <div>
            <div style={{ fontWeight: 700, color: "var(--error)", fontSize: "16px", marginBottom: "var(--space-2)" }}>
              Estimated bill exceeds policy sum insured
            </div>
            {sumInsuredError.estimated && sumInsuredError.limit ? (
              <div style={{ fontSize: "14px", marginBottom: "var(--space-3)" }}>
                Estimated bill{" "}
                <strong style={{ color: "var(--error)" }}>{formatMoney(sumInsuredError.estimated)}</strong>
                {" "}exceeds this policy's sum insured of{" "}
                <strong>{formatMoney(sumInsuredError.limit)}</strong>.
              </div>
            ) : (
              <div style={{ fontSize: "13px", color: "var(--text-muted)", marginBottom: "var(--space-3)" }}>
                {sumInsuredError.raw}
              </div>
            )}
            <div style={{ fontSize: "13px", color: "var(--text-muted)" }}>
              Select a different policy with a higher sum insured, or proceed with the current one if supplemental coverage applies.
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: "var(--space-3)" }}>
          <Button variant="primary" onClick={() => navigate("../payer")}>
            Select Different Policy
          </Button>
          <Button variant="outline" onClick={() => { setSumInsuredError(null); setError(null); hasInitialized.current = false; }}>
            Proceed Anyway
          </Button>
        </div>
      </Card>
    );
  }

  if (error) {
    const notAdmitted = error.toLowerCase().includes("inpatient-only");
    return (
      <Card>
        <div
          style={{
            display: "flex",
            gap: "var(--space-3)",
            alignItems: "center",
            marginBottom: "var(--space-4)",
          }}
        >
          <AlertCircle color="var(--error)" size={24} />
          <div>
            <div style={{ fontWeight: 700, color: "var(--error)" }}>
              {notAdmitted ? "Patient is not admitted" : "Preparation failed"}
            </div>
            <div style={{ fontSize: "13px", color: "var(--text-muted)" }}>
              {error}
            </div>
          </div>
        </div>
        {notAdmitted ? (
          <Button variant="outline" onClick={() => navigate("/registry")}>
            ← Back to Registry
          </Button>
        ) : (
          <Button variant="outline" onClick={() => navigate("../payer")}>
            ← Back to Payer
          </Button>
        )}
      </Card>
    );
  }

  const isComplete = caseData?.status === "complete";
  const isPartial = caseData?.status === "partial";
  const isPending = caseData?.status === "pending";
  const isFailed = caseData?.status === "failed";
  const benefitsTimedOut = isPartial && caseData?.next_actions?.includes("prepare_preauth");
  // next_actions "resubmit" = either a partial sub-check failed, or a pending
  // case went stale past the server timeout with no payer callback (the
  // request was likely lost). Neither will resolve on its own - the user
  // must re-run the eligibility check.
  const needsResubmit = (isPartial || isPending) && caseData?.next_actions?.includes("resubmit");
  const isStalePending = isPending && needsResubmit;
  // Prepare never hard-fails — a `failed` status with "retry" in next_actions
  // means the InsurancePlan/CE submission itself errored (bad cert, gateway
  // down, etc.) and the case is waiting for a re-POST, not a dead end.
  const needsRetry = isFailed && caseData?.next_actions?.includes("retry");
  const canProceed = caseData?.next_actions?.includes("prepare_preauth") && (isComplete || isPartial);
  const movedOnLabel = movedOn ? STEP_FORWARD_LABEL[movedOn] : null;

  const plan = caseData?.insurance_plan;
  const checks = deriveChecks(caseData?.coverage_eligibility, benefitsTimedOut);
  const canRerun = !(forceRefreshing || (!caseData?.cashless_case_id && (!payer || !policy)));
  const rerunTitle = !caseData?.cashless_case_id && (!payer || !policy) ? "Select payer & policy to re-run" : undefined;

  const inforce = checks?.inforce;
  const verdict = needsRetry
    ? { tone: "bad", label: "Check failed", text: caseData?.prepare_error?.message || "The eligibility submission couldn't be completed." }
    : isStalePending
      ? { tone: "warn", label: "No insurer response", text: "The request may have been lost. Re-run the check to retry." }
      : inforce === false
        ? { tone: "bad", label: "Not eligible", text: "The insurer reports the policy as not in force." }
        : polling || isPending
          ? { tone: "pending", label: "Awaiting insurer", text: "Results fill in as each check returns." }
          : inforce || isComplete
            ? { tone: "ok", label: "Eligible", text: "The policy is in force for this admission." }
            : { tone: "pending", label: "Not confirmed", text: "Refresh to fetch the latest answer." };

  const cd = checks?.coverage?.coverage_details || {};
  const bp = checks?.coverage?.benefit_period;
  const details = plan?.plan_details || {};
  const catalogue = packageCatalogue(plan);
  const specialtyCount = new Set(catalogue.map((r) => r.specialty).filter(Boolean)).size;
  const planDocs = (plan?.document_requirements || []).map(describeDocRequirement);
  const exclusions = (plan?.exclusions || []).map(planEntry);
  const planConditions = (plan?.claim_conditions || []).flatMap((c) =>
    (c.values || [c]).map((v) => ({ label: `${String(v.url || "").split("/").pop() || "Condition"}: ${v.value ?? v.display ?? ""}` })),
  );
  const planError = plan?.error_message || plan?.errors?.map((e) => e.message || e.code).join(" · ");
  const planCategory = plan?.raw_payload?.plan?.[0]?.type?.coding?.[0]?.display;
  const familySI = familySumInsured(plan);

  // Planned procedures, each matched to its package and to the payer's lines.
  const procedures = caseData?.procedures?.items || [];
  const plannedCodes = new Set(procedures.map((p) => String(p.code)));
  const treatment = procedures.map((proc) => {
    const pkg = catalogue.find((r) => String(r.code) === String(proc.code)) || null;
    const benefitLine = checks?.benefits.items.find((it) => String(it.product_or_service?.code) === String(proc.code));
    const authLine = checks?.auth.items.find((it) => String(it.product_or_service?.code) === String(proc.code));
    const preauth =
      authLine?.authorization_required != null
        ? authLine.authorization_required
          ? "Required"
          : "Not required"
        : preauthFromRules(pkg?.rules || {});
    const docs = [
      ...(authLine?.authorization_supporting || []).map((d) => d.display || d.code),
      ...(pkg?.docs || []).map((d) => d.label),
    ].filter((d, i, a) => d && a.indexOf(d) === i);
    return { proc, pkg, benefitLine, preauth, docs };
  });

  const activeDef = CHECKS.find((c) => c.id === activeCheck) || CHECKS[0];

  return (
    <div className="wizard-step ep-screen">
      {/* One-line verdict + re-run; everything else lives in the sections */}
      <div className={`ep-verdict is-${verdict.tone}`}>
        <span className="ep-dot" aria-hidden="true" />
        <span className="ep-verdict-label">{verdict.label}</span>
        <span className="ep-verdict-text">{verdict.text}</span>
        <span className="ep-verdict-actions">
          {!polling && (isComplete || isFailed || needsResubmit) ? (
            <button type="button" className="ep-action" disabled={!canRerun} title={rerunTitle} onClick={handleForceRefresh}>
              <RefreshCw size={13} />
              {forceRefreshing ? "Re-running…" : needsRetry ? "Retry preparation" : "Re-run eligibility"}
            </button>
          ) : !polling && !isComplete && !isFailed ? (
            <button type="button" className="ep-action" onClick={manualRefresh}>
              <RefreshCw size={13} />
              Refresh
            </button>
          ) : null}
        </span>
      </div>
      {needsResubmit && !isStalePending && (
        <div className="ep-notice is-warn">
          One or more eligibility checks didn't complete and won't resolve on their own. Re-run the eligibility check.
        </div>
      )}
      {movedOn && (
        <div className="ep-notice">This case has moved on to {movedOnLabel}. The details below are as last checked.</div>
      )}

      <JumpBar />

      <Section id="ep-policy" title="Policy & member" meta="As resolved by the insurer's eligibility response">
        <Fields
          cols={3}
          rows={[
            { label: "Policy number", value: caseData?.policy_number || policy?.policy_number || policy?.policyNumber, mono: true },
            { label: "Payer", value: caseState.payer?.name || caseData?.payer_id, sub: caseState.payer?.name && caseData?.payer_id ? caseData.payer_id : null },
            { label: "Member ID", value: cd.member_id || policy?.member_id, mono: true },
            { label: "Coverage plan", value: cd.plan_name || cd.plan },
            { label: "Sum insured", value: cd.sum_insured ? formatMoney(Number(cd.sum_insured)) : null, mono: true },
            { label: "Benefit period", value: period(bp?.start, bp?.end) },
            { label: "Coverage status", value: cd.status && <span className="ep-cap">{cd.status}</span>, tone: cd.status && !/active/i.test(cd.status) ? "bad" : undefined },
            { label: "In force", value: inforce == null ? (checks?.validation.state === "pending" ? "Awaiting insurer" : null) : inforce ? "Yes" : "No", tone: inforce === false ? "bad" : undefined },
            { label: "Coverage reference", value: checks?.coverage?.coverage, mono: true },
          ]}
        />
      </Section>

      <Section
        id="ep-plan"
        title="Insurance plan"
        meta={
          plan
            ? [
                plan.status && <span key="s" className="ep-cap">{plan.status}</span>,
                plan.stored_record?.updated_at && <span key="u">Updated {formatDate(plan.stored_record.updated_at)}</span>,
                plan.correlation_id && (
                  <span key="r" className="ep-mono" title={plan.correlation_id}>
                    {plan.correlation_id.slice(0, 8)}
                  </span>
                ),
              ].filter(Boolean)
            : null
        }
      >
        {planError && <div className="ep-notice is-bad">{plan?.error_code ? `${plan.error_code}: ` : ""}{planError}</div>}
        {!plan || plan.status === "pending" ? (
          <div className="ep-muted ep-pad">Waiting for the insurer to return the plan.</div>
        ) : (
          <>
            <Fields
              cols={3}
              rows={[
                { label: "Plan", value: details.name },
                { label: "Plan type", value: details.type?.display || details.type?.code },
                { label: "Plan category", value: planCategory },
                { label: "Plan ID", value: identifierOf(details, "XV") || details.id, mono: true },
                { label: "Policy number on plan", value: identifierOf(details, "NH"), mono: true },
                { label: "Family sum insured", value: familySI != null ? formatMoney(familySI) : null, mono: true },
                { label: "Plan period", value: period(details.period?.start, details.period?.end) },
                { label: "Plan status", value: details.status && <span className="ep-cap">{details.status}</span>, tone: details.status && !/active/i.test(details.status) ? "bad" : undefined },
                { label: "Network", value: (details.networks || []).map((n) => n.display || n.reference).filter(Boolean).join(", ") },
                {
                  label: "Coverage",
                  value: catalogue.length
                    ? `${catalogue.length} package${catalogue.length === 1 ? "" : "s"}${specialtyCount ? ` across ${specialtyCount} specialt${specialtyCount === 1 ? "y" : "ies"}` : ""}`
                    : null,
                },
              ]}
            />
            <div className="ep-sublists">
              <SubList title="Required for every case" items={planDocs} empty="No plan-level documents listed." />
              <SubList title="Exclusions" items={exclusions} empty="No exclusions listed." />
              {planConditions.length > 0 && <SubList title="Plan conditions" items={planConditions} empty="" />}
            </div>
          </>
        )}
      </Section>

      <Section id="ep-eligibility" title="Eligibility checks" meta="Three questions sent to the insurer for this admission">
        {checks ? (
          <div className="ep-checks">
            <div className="ep-check-list" role="tablist" aria-label="Eligibility checks">
              {CHECKS.map((c) => {
                const check = checks[c.id];
                return (
                  <button
                    key={c.id}
                    type="button"
                    role="tab"
                    aria-selected={activeCheck === c.id}
                    className={`ep-check is-${check.state}${activeCheck === c.id ? " is-on" : ""}`}
                    onClick={() => setActiveCheck(c.id)}
                  >
                    <span className="ep-check-name">
                      <span className="ep-dot" aria-hidden="true" />
                      {c.label}
                    </span>
                    <span className="ep-check-q">{c.question}</span>
                    <span className="ep-check-a">{checkSummary(c.id, check, inforce)}</span>
                  </button>
                );
              })}
            </div>
            <div className="ep-check-pane" role="tabpanel" aria-label={activeDef.label}>
              <CheckDetail id={activeDef.id} check={checks[activeDef.id]} inforce={inforce} coverage={checks.coverage} />
            </div>
          </div>
        ) : (
          <div className="ep-muted ep-pad">Eligibility has not been requested yet.</div>
        )}
      </Section>

      <Section
        id="ep-treatment"
        title="Planned treatment"
        meta={caseData?.procedures?.source ? `From ${caseData.procedures.source.replace(/_/g, " ")}` : null}
      >
        {treatment.length ? (
          <div className="ep-table-wrap">
            <table className="ep-table">
              <thead>
                <tr>
                  <th className="ep-col-name">Package</th>
                  <th>Type</th>
                  <th className="ep-num">Package rate</th>
                  <th className="ep-num">Payer allows</th>
                  <th>Preauth</th>
                  <th>Enhancement</th>
                  <th>Documents needed</th>
                </tr>
              </thead>
              <tbody>
                {treatment.map(({ proc, pkg, benefitLine, preauth, docs }, i) => (
                  <tr key={i}>
                    <td className="ep-col-name">
                      <div className="ep-strong">{proc.name}</div>
                      <div className="ep-muted">
                        {[proc.code, pkg?.specialty || proc.category].filter(Boolean).join(" · ")}
                        {!pkg && catalogue.length > 0 && " · not in the plan's package list"}
                      </div>
                      {pkg && ruleNotes(pkg.rules).length > 0 && <div className="ep-muted">{ruleNotes(pkg.rules).join(" · ")}</div>}
                    </td>
                    <td>{pkg?.rules.ProcedureType || "—"}</td>
                    <td className="ep-num ep-mono">{pkg?.rate != null ? formatMoney(pkg.rate) : "—"}</td>
                    <td className="ep-num ep-mono">
                      {benefitLine?.excluded ? (
                        <span className="is-bad">Excluded</span>
                      ) : benefitLine?.benefit?.[0]?.allowed?.value != null ? (
                        formatMoney(benefitLine.benefit[0].allowed.value)
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="ep-nowrap">{preauth || "—"}</td>
                    <td>{yn(pkg?.rules.EnhancementAllowed) || "—"}</td>
                    <td>{docs.length ? docs.join(", ") : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="ep-muted ep-pad">No procedures found in clinical records for this visit.</div>
        )}
      </Section>

      <Section id="ep-packages" title="Package catalogue" meta="Every package the plan allows at this hospital">
        <PackageCatalogue rows={catalogue} plannedCodes={plannedCodes} />
      </Section>

      <div className="ep-footer">
        <Button variant="text" onClick={() => navigate("../payer")}>
          ← Back to policy
        </Button>
        <div className="ep-footer-right">
          {!movedOn && !canProceed && (
            <span className="ep-muted">
              {polling ? "Waiting for the insurer to answer…" : "Eligibility must complete before preauth."}
            </span>
          )}
          <Button
            variant="primary"
            size="small"
            disabled={!movedOn && !canProceed}
            onClick={() => navigate(movedOn ? `../${movedOn}` : "../review")}
          >
            {movedOn
              ? `Continue to ${movedOnLabel}`
              : polling
                ? "Awaiting eligibility…"
                : canProceed
                  ? "Proceed to preauth draft"
                  : isComplete
                    ? "Preparing…"
                    : "Eligibility pending"}
            <ArrowRight size={14} />
          </Button>
        </div>
      </div>
    </div>
  );
}
