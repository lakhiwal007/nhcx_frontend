import { useState, useEffect, useRef, Fragment } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight,
  CheckCircle2,
  FileText,
  AlertCircle,
  RefreshCw,
  Clock,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { api } from "../../api";
import { usePoll } from "../../hooks/usePoll";
import { Card, Button, StatusBadge, LoadingBlock } from "../Common";
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

function InsurancePlanPanel({ plan }) {
  const [expanded, setExpanded] = useState(null);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 5;

  if (!plan) return null;
  const details = plan.plan_details;
  const inclusions = plan.inclusions || [];
  const exclusions = plan.exclusions || [];
  const docReqs = plan.document_requirements || [];
  const totalPages = Math.ceil(inclusions.length / PAGE_SIZE);
  const pageInclusions = inclusions.slice(
    page * PAGE_SIZE,
    (page + 1) * PAGE_SIZE,
  );

  return (
    <Card title="Insurance Plan">
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--space-2)",
          marginBottom: "10px",
          flexWrap: "wrap",
        }}
      >
        <StatusBadge status={plan.status} />
        {plan.correlation_id && (
          <code style={{ fontSize: "10px", color: "var(--text-muted)" }}>
            {plan.correlation_id.slice(0, 20)}…
          </code>
        )}
      </div>

      {details?.name && (
        <div
          style={{
            padding: "10px 12px",
            background: "var(--bg-main)",
            borderRadius: "var(--radius-sm)",
            marginBottom: "var(--space-3)",
          }}
        >
          <div
            style={{ fontWeight: 700, fontSize: "14px", marginBottom: "var(--space-1)", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}
          >
            <span>{details.name}</span>
            {plan.pricing?.sum_insured != null && (
              <span className="num-cell" style={{ color: "var(--success)", fontSize: "13px" }}>
                {formatMoney(plan.pricing.sum_insured)}
              </span>
            )}
          </div>
          <div
            style={{
              display: "flex",
              gap: "var(--space-4)",
              fontSize: "12px",
              color: "var(--text-muted)",
              flexWrap: "wrap",
            }}
          >
            {details.type?.display && <span>{details.type.display}</span>}
            {details.period?.start && details.period?.end && (
              <span>
                {formatDate(details.period.start)} →{" "}
                {formatDate(details.period.end)}
              </span>
            )}
            {details.status && (
              <span
                className={`badge-modern badge-${details.status === "active" ? "success" : "warning"}`}
                style={{ fontSize: "10px" }}
              >
                {details.status.toUpperCase()}
              </span>
            )}
          </div>
        </div>
      )}

      {plan.status === "pending" && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--space-2)",
            color: "var(--text-muted)",
            fontSize: "13px",
            padding: "8px 0",
          }}
        >
          <Clock size={14} /> Awaiting insurer response…
        </div>
      )}

      {inclusions.length > 0 && (
        <div style={{ marginBottom: "var(--space-3)" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: "6px",
            }}
          >
            <div
              style={{
                fontSize: "11px",
                fontWeight: 700,
                color: "var(--text-muted)",
                textTransform: "uppercase",
              }}
            >
              Inclusions ({inclusions.length})
            </div>
            {totalPages > 1 && (
              <div
                style={{ display: "flex", alignItems: "center", gap: "6px" }}
              >
                <button
                  onClick={() => {
                    setPage((p) => Math.max(0, p - 1));
                    setExpanded(null);
                  }}
                  disabled={page === 0}
                  style={{
                    background: "var(--bg-main)",
                    border: "1px solid var(--border-color)",
                    borderRadius: "var(--radius-xs)",
                    padding: "2px 8px",
                    cursor: page === 0 ? "not-allowed" : "pointer",
                    opacity: page === 0 ? 0.4 : 1,
                    fontSize: "13px",
                  }}
                >
                  ‹
                </button>
                <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                  {page + 1} / {totalPages}
                </span>
                <button
                  onClick={() => {
                    setPage((p) => Math.min(totalPages - 1, p + 1));
                    setExpanded(null);
                  }}
                  disabled={page === totalPages - 1}
                  style={{
                    background: "var(--bg-main)",
                    border: "1px solid var(--border-color)",
                    borderRadius: "var(--radius-xs)",
                    padding: "2px 8px",
                    cursor: page === totalPages - 1 ? "not-allowed" : "pointer",
                    opacity: page === totalPages - 1 ? 0.4 : 1,
                    fontSize: "13px",
                  }}
                >
                  ›
                </button>
              </div>
            )}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)" }}>
            {pageInclusions.map((inc, i) => {
              const globalIdx = page * PAGE_SIZE + i;
              const code = inc.type?.code;
              const name = inc.type?.display;
              const limits = inc.limits || [];
              const isOpen = expanded === globalIdx;
              return (
                <div
                  key={globalIdx}
                  style={{
                    border: "1px solid var(--border-color)",
                    borderRadius: "var(--radius-sm)",
                    overflow: "hidden",
                  }}
                >
                  <div
                    onClick={() => setExpanded(isOpen ? null : globalIdx)}
                    style={{
                      padding: "7px 10px",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "var(--space-2)",
                      background: isOpen
                        ? "var(--primary-light)"
                        : "transparent",
                      transition: "background 0.2s ease"
                    }}
                    onMouseEnter={(e) => { if (!isOpen) e.currentTarget.style.background = "var(--bg-main)"; }}
                    onMouseLeave={(e) => { if (!isOpen) e.currentTarget.style.background = "transparent"; }}
                  >
                    <span
                      className="badge-modern badge-success"
                      style={{ fontSize: "10px", flexShrink: 0 }}
                    >
                      {code || "INC"}
                    </span>
                    <span
                      style={{
                        fontSize: "13px",
                        fontWeight: isOpen ? 700 : 600,
                        flex: 1,
                        color: isOpen ? "var(--primary)" : "var(--text-main)",
                        transition: "color 0.2s ease"
                      }}
                    >
                      {name || "Unnamed Inclusion"}
                    </span>
                    {limits.length > 0 && (
                      <motion.div animate={{ rotate: isOpen ? 180 : 0 }}>
                        <ChevronDown size={13} color="var(--text-muted)" />
                      </motion.div>
                    )}
                  </div>
                  <AnimatePresence>
                    {isOpen && limits.length > 0 && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        style={{ overflow: "hidden" }}
                      >
                    <div
                      style={{
                        padding: "6px 10px 8px",
                        background: "var(--bg-main)",
                        display: "flex",
                        flexDirection: "column",
                        gap: "var(--space-1)",
                      }}
                    >
                      {limits.map((lim, li) => (
                        <div
                          key={li}
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            fontSize: "12px",
                            padding: "3px 0",
                            borderBottom: "1px solid var(--border-color)",
                          }}
                        >
                          <span style={{ color: "var(--text-muted)" }}>
                            {lim.code?.display}
                          </span>
                          <strong style={{ color: "var(--primary)" }}>
                            {lim.value?.unit}{" "}
                            {lim.value?.value?.toLocaleString()}
                          </strong>
                        </div>
                      ))}
                    </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
          {totalPages > 1 && (
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                gap: "var(--space-1)",
                marginTop: "var(--space-2)",
              }}
            >
              {Array.from({ length: totalPages }, (_, i) => (
                <button
                  key={i}
                  onClick={() => {
                    setPage(i);
                    setExpanded(null);
                  }}
                  style={{
                    width: "8px",
                    height: "8px",
                    borderRadius: "50%",
                    border: "none",
                    padding: 0,
                    background:
                      i === page ? "var(--primary)" : "var(--border-color)",
                    cursor: "pointer",
                    transition: "background 0.2s",
                  }}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {exclusions.length > 0 && (
        <div style={{ marginBottom: "var(--space-3)" }}>
          <div
            style={{
              fontSize: "11px",
              fontWeight: 700,
              color: "var(--text-muted)",
              textTransform: "uppercase",
              marginBottom: "6px",
            }}
          >
            Exclusions ({exclusions.length})
          </div>
          {exclusions.map((exc, i) => (
            <div
              key={i}
              style={{
                fontSize: "12px",
                padding: "4px 0",
                display: "flex",
                gap: "var(--space-2)",
                alignItems: "center",
                borderBottom: "1px solid var(--border-color)",
              }}
            >
              <span
                className="badge-modern badge-error"
                style={{ fontSize: "10px" }}
              >
                {exc.type?.code || exc.code}
              </span>
              {exc.type?.display || exc.name}
            </div>
          ))}
        </div>
      )}

      {docReqs.length > 0 && (
        <div>
          <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", marginBottom: "6px" }}>Required Documents</div>
          {docReqs.map((d, i) => {
            const { label, code } = describeDocRequirement(d);
            return (
              <div key={i} style={{ fontSize: "12px", display: "flex", gap: "6px", alignItems: "center", padding: "3px 0" }}>
                <FileText size={12} color="var(--text-muted)" />
                {code && (
                  <span className="badge-modern badge-info" style={{ fontSize: "10px" }}>{code}</span>
                )}
                {label}
              </div>
            );
          })}
        </div>
      )}

      {plan.errors?.length > 0 && (
        <div style={{ marginTop: "var(--space-2)" }}>
          {plan.errors.map((err, i) => (
            <div
              key={i}
              style={{
                fontSize: "12px",
                color: "var(--error)",
                background: "rgba(239,68,68,0.05)",
                borderRadius: "var(--radius-xs)",
                padding: "6px 8px",
                marginBottom: "var(--space-1)",
              }}
            >
              {err.message || err.code}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// One eligibility sub-check rendered as a vital sign. A live (pending) check
// shows the ECG trace; a resolved one shows its value with a status tone.
function CeVital({ label, state, value, tone, note }) {
  const live = state === "live";
  return (
    <div className={`cx-vital is-${state}`}>
      <span className="cx-vital-dot" aria-hidden="true" />
      <span className="cx-vital-label">{label}</span>
      {live ? (
        <svg
          className="cx-ecg"
          viewBox="0 0 120 14"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <polyline points="0,7 22,7 30,7 36,2 42,12 50,7 70,7 78,7 84,3 90,11 96,7 120,7" />
        </svg>
      ) : (
        <span className={`cx-vital-value${tone ? ` tone-${tone}` : ""}`}>{value}</span>
      )}
      {note && <span className={`cx-vital-note${tone ? ` tone-${tone}` : ""}`}>{note}</span>}
    </div>
  );
}

function CoverageEligibilityPanel({ ce, benefitsTimedOut }) {
  const [expandedItem, setExpandedItem] = useState(null);
  if (!ce) return null;
  // Real backend returns nested validation/benefits/auth_requirements; flat is legacy mock
  const validation = ce.validation || {};
  const benefits = ce.benefits || {};
  const authReq = ce.auth_requirements || {};
  const inforce = validation.inforce ?? ce.inforce;
  const auth_required = authReq.auth_required ?? ce.auth_required;
  const disposition = validation.disposition ?? ce.disposition;
  const allErrors = [
    ...(validation.errors || ce.errors || []),
    ...(benefits.errors || []),
    ...(authReq.errors || []),
  ];
  // The validation purpose is the one that resolves the FHIR Coverage
  // resource (member id, plan name, sum insured) — prefer it for the
  // coverage-details block; fall back to whichever sub-check has it.
  const insuranceGroups =
    (validation.insurance_items?.some((ins) => ins.coverage_details) && validation.insurance_items) ||
    (benefits.insurance_items ?? ce.insurance_items ?? []);
  const allItems = (benefits.insurance_items ?? ce.insurance_items ?? [])
    .flatMap((ins) => (ins.items || []).map((it) => ({ ...it, _coverage: ins.coverage })));

  // Resolve each sub-check to a vital state. Falls back to the aggregate
  // ce.status for the legacy flat shape that has no sub-objects.
  const stateOf = (sub) => {
    const s = sub?.status ?? ce.status;
    if (s === "complete") return sub?.errors?.length ? "error" : "done";
    if (s === "failed") return "error";
    return "live";
  };

  const validationState = stateOf(validation);
  const authState = stateOf(authReq);
  // Benefits that timed out won't resolve on their own — mark as `wait`, not live.
  const benefitsState = benefitsTimedOut ? "wait" : stateOf(benefits);

  return (
    <Card title="Coverage Eligibility">
      <div className="cx-vitals">
        <CeVital
          label="validation"
          state={validationState}
          value={inforce == null ? "-" : inforce ? "In-force" : "Not in-force"}
          tone={inforce == null ? undefined : inforce ? "approve" : "urgent"}
          note={validationState === "done" && disposition ? disposition : undefined}
        />
        <CeVital
          label="benefits"
          state={benefitsState}
          value={
            benefitsTimedOut
              ? "Insurer unavailable"
              : allItems.length > 0
                ? `${allItems.length} service${allItems.length > 1 ? "s" : ""}`
                : benefitsState === "done"
                  ? "No limits returned"
                  : "-"
          }
          tone={benefitsTimedOut ? "wait" : undefined}
          note={
            benefitsTimedOut
              ? "Coverage details may be incomplete - you can still proceed."
              : undefined
          }
        />
        <CeVital
          label="auth-requirements"
          state={authState}
          value={
            auth_required == null
              ? "-"
              : auth_required
                ? "Preauth required"
                : "No preauth needed"
          }
          tone={auth_required == null ? undefined : auth_required ? "wait" : "approve"}
        />
      </div>

      {insuranceGroups.some((ins) => ins.coverage_details) && (
        <div style={{ marginBottom: "var(--space-3)" }}>
          <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", marginBottom: "6px" }}>Coverage Detail</div>
          {insuranceGroups.filter((ins) => ins.coverage_details).map((ins, i) => {
            const cd = ins.coverage_details;
            const bp = ins.benefit_period;
            return (
              <div key={i} style={{ padding: "10px 12px", background: "var(--bg-main)", borderRadius: "var(--radius-sm)", marginBottom: "var(--space-2)", fontSize: "12.5px" }}>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 16px" }}>
                  {cd.plan_name && (
                    <div><span style={{ color: "var(--text-muted)" }}>Plan: </span><strong>{cd.plan_name}</strong></div>
                  )}
                  {cd.member_id && (
                    <div><span style={{ color: "var(--text-muted)" }}>Member ID: </span><span className="mono-cell">{cd.member_id}</span></div>
                  )}
                  {cd.sum_insured && (
                    <div><span style={{ color: "var(--text-muted)" }}>Sum Insured: </span><strong style={{ color: "var(--success)" }}>{formatMoney(Number(cd.sum_insured))}</strong></div>
                  )}
                  {cd.status && (
                    <span className={`badge-modern badge-${cd.status === "active" ? "success" : "warning"}`} style={{ fontSize: "10px" }}>{cd.status.toUpperCase()}</span>
                  )}
                </div>
                {bp?.start && bp?.end && (
                  <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "4px" }}>
                    Benefit period: {formatDate(bp.start)} → {formatDate(bp.end)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {allItems.length > 0 && (
        <div className="table-responsive-wrapper">
          <table className="table-modern" style={{ fontSize: "12px" }}>
            <thead>
              <tr>
                <th>Service</th>
                <th>Auth Req.</th>
                <th>Excluded</th>
                <th style={{ textAlign: "right" }}>Allowed</th>
                <th style={{ textAlign: "right" }}>Used</th>
              </tr>
            </thead>
            <tbody>
              {allItems.map((item, i) => {
                const isOpen = expandedItem === i;
                const extraBenefits = (item.benefit || []).slice(1);
                const docs = item.authorization_supporting || [];
                const hasDetail = extraBenefits.length > 0 || docs.length > 0;
                return (
                  <Fragment key={i}>
                    <tr
                      onClick={hasDetail ? () => setExpandedItem(isOpen ? null : i) : undefined}
                      style={hasDetail ? { cursor: "pointer" } : undefined}
                    >
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          {hasDetail && (
                            <ChevronDown size={12} color="var(--text-muted)" style={{ transform: isOpen ? "rotate(180deg)" : "none", transition: "transform 0.15s ease", flexShrink: 0 }} />
                          )}
                          <div>
                            <div style={{ fontWeight: 600 }}>
                              {item.product_or_service?.display ||
                                item.product_or_service?.code}
                            </div>
                            <div
                              style={{ fontSize: "11px", color: "var(--text-muted)" }}
                            >
                              {item.category?.display}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span
                          className={`badge-modern badge-${item.authorization_required ? "warning" : "success"}`}
                          style={{ fontSize: "10px" }}
                        >
                          {item.authorization_required ? "Yes" : "No"}
                        </span>
                      </td>
                      <td>
                        {item.excluded ? (
                          <span className="badge-modern badge-error" style={{ fontSize: "10px" }}>Excluded</span>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                      <td className="num-cell">{formatMoney(item.benefit?.[0]?.allowed?.value)}</td>
                      <td className="num-cell">{formatMoney(item.benefit?.[0]?.used?.value)}</td>
                    </tr>
                    {isOpen && hasDetail && (
                      <tr>
                        <td colSpan={5} style={{ background: "var(--bg-main)", padding: "8px 10px 10px 30px" }}>
                          {extraBenefits.length > 0 && (
                            <div style={{ display: "flex", flexDirection: "column", gap: "3px", marginBottom: docs.length > 0 ? "8px" : 0 }}>
                              {extraBenefits.map((b, bi) => (
                                <div key={bi} style={{ display: "flex", justifyContent: "space-between", fontSize: "11.5px" }}>
                                  <span style={{ color: "var(--text-muted)" }}>{b.type?.display || "Benefit"}</span>
                                  <span>
                                    Allowed {formatMoney(b.allowed?.value)} · Used {formatMoney(b.used?.value)}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                          {docs.length > 0 && (
                            <div>
                              <div style={{ fontSize: "10.5px", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", marginBottom: "4px" }}>Required for preauth</div>
                              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                                {docs.map((d, di) => (
                                  <span key={di} className="badge-modern badge-info" style={{ fontSize: "10px" }}>{d.display || d.code}</span>
                                ))}
                              </div>
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {allErrors.length > 0 && (
        <div style={{ marginTop: "10px" }}>
          <PayrErrorList errors={allErrors} />
        </div>
      )}
    </Card>
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

  return (
    <div className="wizard-step">
      {movedOn && (
        <div className="ep-moved-banner">
          <CheckCircle2 size={18} color="var(--success)" style={{ flexShrink: 0, marginTop: "1px" }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: "13.5px" }}>
              Eligibility is complete for this case
            </div>
            <div style={{ fontSize: "12.5px", color: "var(--text-muted)", marginTop: "2px" }}>
              The case has already moved on to {movedOnLabel}. Everything below is the eligibility
              and plan detail as last checked — re-run it if you need a fresh answer from the payer.
            </div>
          </div>
          <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
            <Button
              variant="outline"
              size="small"
              icon={RefreshCw}
              disabled={forceRefreshing}
              onClick={handleForceRefresh}
            >
              {forceRefreshing ? "Re-running…" : "Re-run Eligibility"}
            </Button>
            <Button variant="primary" size="small" onClick={() => navigate(`../${movedOn}`)}>
              Continue to {movedOnLabel}
              <ArrowRight size={15} style={{ marginLeft: "6px" }} />
            </Button>
          </div>
        </div>
      )}
      <Card className="mb-6">
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
            {polling ? (
              <div
                className="spinner"
                style={{
                  width: "24px",
                  height: "24px",
                  borderTopColor: "var(--warning)",
                }}
              />
            ) : (
              <CheckCircle2
                size={24}
                color={isComplete ? "var(--success)" : "var(--text-muted)"}
              />
            )}
            <div>
              <div style={{ fontWeight: 700 }}>
                Cashless Case{" "}
                {caseData?.cashless_case_id
                  ? `#${caseData.cashless_case_id}`
                  : ""}
              </div>
              <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                {isStalePending
                  ? "No response from the payer yet - the request may have been lost"
                  : caseData?.current_step?.replace(/_/g, " ")}
                {polling ? " - polling for updates…" : ""}
              </div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
            <StatusBadge status={caseData?.status} />
            {!polling && !isComplete && !isFailed && (
              <Button
                variant="outline"
                size="small"
                icon={RefreshCw}
                onClick={manualRefresh}
              >
                Refresh
              </Button>
            )}
            {!polling && (isComplete || isFailed || needsResubmit) && (
              <Button
                variant="outline"
                size="small"
                icon={RefreshCw}
                disabled={forceRefreshing || (!caseData?.cashless_case_id && (!payer || !policy))}
                title={!caseData?.cashless_case_id && (!payer || !policy) ? "Select payer & policy to re-run" : undefined}
                onClick={handleForceRefresh}
              >
                {forceRefreshing ? "Re-running…" : "Re-run Eligibility"}
              </Button>
            )}
          </div>
        </div>
      </Card>

      <div
        className="grid-1-to-2"
        style={{ gap: "var(--space-6)", marginBottom: "var(--space-6)" }}
      >
        <InsurancePlanPanel plan={caseData?.insurance_plan} />
        <CoverageEligibilityPanel
          ce={caseData?.coverage_eligibility}
          benefitsTimedOut={benefitsTimedOut}
        />
      </div>

      <Card title="Procedures" className="mb-6">
        {caseData?.procedures?.source && (
          <div
            style={{
              fontSize: "11px",
              color: "var(--text-muted)",
              marginBottom: "var(--space-2)",
            }}
          >
            Source: <strong>{caseData.procedures.source}</strong>
          </div>
        )}
        {caseData?.procedures?.items?.length > 0 ? (
          caseData.procedures.items.map((proc, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "var(--space-2)",
                padding: "8px 0",
                borderBottom: "1px solid var(--border-color)",
                fontSize: "13px",
              }}
            >
              <FileText size={14} color="var(--primary)" />
              <span style={{ fontWeight: 600 }}>{proc.name}</span>
              <code style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                ({proc.code})
              </code>
              {proc.category && (
                <span
                  className="badge-modern badge-info"
                  style={{ fontSize: "10px", marginLeft: "auto" }}
                >
                  {proc.category}
                </span>
              )}
            </div>
          ))
        ) : (
          <div className="text-muted" style={{ fontSize: "13px" }}>
            No procedures found in clinical records for this visit.
          </div>
        )}
      </Card>

      {needsResubmit && (
        <div className="inline-error-banner" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: "10px", alignItems: "flex-start" }}>
            <AlertCircle size={16} style={{ flexShrink: 0, marginTop: "1px" }} />
            <span>
              <strong>{isStalePending ? "No response from the payer yet." : "One or more eligibility checks didn't complete."}</strong>{" "}
              {isStalePending
                ? "The request may have been lost - re-run the eligibility check to retry."
                : "This won't resolve on its own - re-run the eligibility check to retry."}
            </span>
          </div>
          <Button
            variant="primary"
            size="small"
            icon={RefreshCw}
            disabled={forceRefreshing || (!caseData?.cashless_case_id && (!payer || !policy))}
            title={!caseData?.cashless_case_id && (!payer || !policy) ? "Select payer & policy to re-run" : undefined}
            onClick={handleForceRefresh}
          >
            {forceRefreshing ? "Re-running…" : "Re-run Eligibility Check"}
          </Button>
        </div>
      )}

      {needsRetry && (
        <div className="inline-error-banner" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: "10px", alignItems: "flex-start" }}>
            <AlertCircle size={16} style={{ flexShrink: 0, marginTop: "1px" }} />
            <span>
              <strong>Preparation failed.</strong>{" "}
              {caseData?.prepare_error?.message ||
                "The eligibility submission couldn't be completed."}
            </span>
          </div>
          <Button
            variant="primary"
            size="small"
            icon={RefreshCw}
            disabled={forceRefreshing || (!caseData?.cashless_case_id && (!payer || !policy))}
            title={!caseData?.cashless_case_id && (!payer || !policy) ? "Select payer & policy to retry" : undefined}
            onClick={handleForceRefresh}
          >
            {forceRefreshing ? "Retrying…" : "Retry Preparation"}
          </Button>
        </div>
      )}

      {benefitsTimedOut && (
        <div style={{ display: "flex", gap: "10px", alignItems: "flex-start", padding: "12px 16px", background: "color-mix(in srgb, var(--warning) 10%, var(--bg-card))", border: "1px solid var(--warning)", borderRadius: "var(--radius-md)", marginBottom: "var(--space-4)", fontSize: "13px", color: "var(--text-main)" }}>
          <AlertCircle size={16} color="var(--warning)" style={{ flexShrink: 0, marginTop: "1px" }} />
          <span><strong>Benefits data from insurer is unavailable.</strong> Coverage details may be incomplete. You can still proceed to preauth - eligibility will remain pending in the background.</span>
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <Button variant="text" onClick={() => navigate("../payer")}>
          ← Back
        </Button>
        <Button
          variant="primary"
          disabled={!movedOn && !canProceed}
          onClick={() => navigate(movedOn ? `../${movedOn}` : "../review")}
        >
          {movedOn
            ? `Continue to ${movedOnLabel}`
            : polling
              ? "Awaiting Eligibility…"
              : canProceed
                ? "Proceed to Preauth Draft"
                : isComplete
                  ? "Preparing…"
                  : "Eligibility Pending"}
          <ArrowRight size={18} style={{ marginLeft: "8px" }} />
        </Button>
      </div>
    </div>
  );
}
