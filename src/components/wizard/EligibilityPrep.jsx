import { useState, useEffect, useRef } from "react";
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
import { api } from "../../api";
import { Card, Button, StatusBadge } from "../Common";

const POLL_INTERVAL_MS = 7000;
const TERMINAL_STATUSES = ["complete", "failed"];

function InsurancePlanPanel({ plan }) {
  if (!plan) return null;
  const [expanded, setExpanded] = useState(null);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 5;

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
          gap: "8px",
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
            borderRadius: "8px",
            marginBottom: "12px",
          }}
        >
          <div
            style={{ fontWeight: 700, fontSize: "14px", marginBottom: "4px" }}
          >
            {details.name}
          </div>
          <div
            style={{
              display: "flex",
              gap: "16px",
              fontSize: "12px",
              color: "var(--text-muted)",
              flexWrap: "wrap",
            }}
          >
            {details.type?.display && <span>{details.type.display}</span>}
            {details.period?.start && details.period?.end && (
              <span>
                {new Date(details.period.start).toLocaleDateString()} →{" "}
                {new Date(details.period.end).toLocaleDateString()}
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
            gap: "8px",
            color: "var(--text-muted)",
            fontSize: "13px",
            padding: "8px 0",
          }}
        >
          <Clock size={14} /> Awaiting insurer response…
        </div>
      )}

      {inclusions.length > 0 && (
        <div style={{ marginBottom: "12px" }}>
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
                    borderRadius: "6px",
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
                    borderRadius: "6px",
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
          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
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
                    borderRadius: "8px",
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
                      gap: "8px",
                      background: isOpen
                        ? "var(--primary-light)"
                        : "transparent",
                    }}
                  >
                    <span
                      className="badge-modern badge-success"
                      style={{ fontSize: "10px", flexShrink: 0 }}
                    >
                      {code}
                    </span>
                    <span
                      style={{ fontSize: "12px", flex: 1, fontWeight: 500 }}
                    >
                      {name}
                    </span>
                    {limits.length > 0 &&
                      (isOpen ? (
                        <ChevronDown size={13} color="var(--text-muted)" />
                      ) : (
                        <ChevronRight size={13} color="var(--text-muted)" />
                      ))}
                  </div>
                  {isOpen && limits.length > 0 && (
                    <div
                      style={{
                        padding: "6px 10px 8px",
                        background: "var(--bg-main)",
                        display: "flex",
                        flexDirection: "column",
                        gap: "4px",
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
                  )}
                </div>
              );
            })}
          </div>
          {totalPages > 1 && (
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                gap: "4px",
                marginTop: "8px",
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
        <div style={{ marginBottom: "12px" }}>
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
                gap: "8px",
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

      {/* {docReqs.length > 0 && (
        <div>
          <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", marginBottom: "6px" }}>Required Documents</div>
          {docReqs.map((d, i) => (
            <div key={i} style={{ fontSize: "12px", display: "flex", gap: "6px", alignItems: "center", padding: "3px 0" }}>
              <FileText size={12} color="var(--text-muted)" /> {d.name || d.type?.display || JSON.stringify(d)}
            </div>
          ))}
        </div>
      )}*/}

      {plan.errors?.length > 0 && (
        <div style={{ marginTop: "8px" }}>
          {plan.errors.map((err, i) => (
            <div
              key={i}
              style={{
                fontSize: "12px",
                color: "var(--error)",
                background: "rgba(239,68,68,0.05)",
                borderRadius: "6px",
                padding: "6px 8px",
                marginBottom: "4px",
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

function CoverageEligibilityPanel({ ce }) {
  if (!ce) return null;
  // Real backend returns nested validation/benefits/auth_requirements; flat is legacy mock
  const inforce = ce.validation?.inforce ?? ce.inforce;
  const auth_required = ce.auth_requirements?.auth_required ?? ce.auth_required;
  const outcome = ce.validation?.outcome ?? ce.outcome;
  const disposition = ce.validation?.disposition ?? ce.disposition;
  const allErrors = [
    ...(ce.validation?.errors || ce.errors || []),
    ...(ce.benefits?.errors || []),
    ...(ce.auth_requirements?.errors || []),
  ];
  const allItems = (ce.benefits?.insurance_items ?? ce.insurance_items ?? [])
    .flatMap((ins) => ins.items || []);
  return (
    <Card title="Coverage Eligibility">
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          marginBottom: "12px",
          flexWrap: "wrap",
        }}
      >
        <StatusBadge status={ce.status} />
        {inforce !== null && inforce !== undefined && (
          <span
            className={`badge-modern badge-${inforce ? "success" : "error"}`}
            style={{ fontSize: "10px" }}
          >
            {inforce ? "IN-FORCE" : "NOT IN-FORCE"}
          </span>
        )}
        {auth_required !== null && auth_required !== undefined && (
          <span
            className={`badge-modern badge-${auth_required ? "warning" : "success"}`}
            style={{ fontSize: "10px" }}
          >
            {auth_required ? "PREAUTH REQUIRED" : "NO PREAUTH NEEDED"}
          </span>
        )}
      </div>

      {ce.status === "pending" && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            color: "var(--text-muted)",
            fontSize: "13px",
            padding: "8px 0",
          }}
        >
          <Clock size={14} /> Awaiting payer eligibility response…
        </div>
      )}

      {outcome && (
        <div
          style={{
            fontSize: "13px",
            padding: "6px 10px",
            background: "var(--bg-main)",
            borderRadius: "6px",
            marginBottom: "10px",
          }}
        >
          Outcome: <strong>{outcome}</strong>
        </div>
      )}

      {disposition && (
        <div
          style={{
            fontSize: "13px",
            marginBottom: "12px",
            color: "var(--text-main)",
          }}
        >
          {disposition}
        </div>
      )}

      {allItems.length > 0 && (
        <div className="table-responsive-wrapper">
          <table className="table-modern" style={{ fontSize: "12px" }}>
            <thead>
              <tr>
                <th>Service</th>
                <th>Auth Req.</th>
                <th style={{ textAlign: "right" }}>Allowed</th>
                <th style={{ textAlign: "right" }}>Used</th>
              </tr>
            </thead>
            <tbody>
              {allItems.map((item, i) => (
                <tr key={i}>
                  <td>
                    <div style={{ fontWeight: 600 }}>
                      {item.product_or_service?.display ||
                        item.product_or_service?.code}
                    </div>
                    <div
                      style={{ fontSize: "11px", color: "var(--text-muted)" }}
                    >
                      {item.category?.display}
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
                  <td style={{ textAlign: "right" }}>
                    {item.benefit?.[0]?.allowed?.value != null
                      ? `₹${item.benefit[0].allowed.value.toLocaleString()}`
                      : "—"}
                  </td>
                  <td style={{ textAlign: "right" }}>
                    {item.benefit?.[0]?.used?.value != null
                      ? `₹${item.benefit[0].used.value.toLocaleString()}`
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {allErrors.length > 0 && (
        <div style={{ marginTop: "10px" }}>
          {allErrors.map((err, i) => (
            <div
              key={i}
              style={{
                fontSize: "12px",
                color: "var(--warning)",
                background: "rgba(245,158,11,0.08)",
                borderRadius: "6px",
                padding: "6px 8px",
                marginBottom: "4px",
              }}
            >
              {err.detail || err.code?.display || err.message}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

export default function EligibilityPrep({ ctx }) {
  const navigate = useNavigate();
  const { patient, caseState, setCashlessCase, updateCaseState } = ctx;
  const { payer, policy, admission_id } = caseState;

  const [loading, setLoading] = useState(true);
  const [caseData, setCaseData] = useState(null);
  const [polling, setPolling] = useState(false);
  const [forceRefreshing, setForceRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [sumInsuredError, setSumInsuredError] = useState(null); // { estimated, limit }
  const pollRef = useRef(null);

  const hasInitialized = useRef(false);

  useEffect(() => {
    if (!patient || !payer || !policy) {
      navigate("../payer", { replace: true });
      return;
    }

    if (hasInitialized.current) return;
    hasInitialized.current = true;

    const init = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await api.prepareCashless({
          child_id: patient.child_id,
          payer_id: payer.code,
          policy_number: policy.policyNumber || policy.policy_number,
          ...(admission_id && { admission_id }),
        });
        setCaseData(res);
        setCashlessCase(res);
        updateCaseState({
          cashless_case_id: res.cashless_case_id,
          claim_id: res.claim_id,
          eligibility_correlation_id:
            res.coverage_eligibility?.validation?.correlation_id ??
            res.coverage_eligibility?.correlation_id,
        });
        if (!TERMINAL_STATUSES.includes(res.status)) {
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

  useEffect(() => {
    if (!polling || !caseData?.cashless_case_id) return;
    const doPoll = async () => {
      try {
        const res = await api.getCashlessStatus(caseData.cashless_case_id);
        setCaseData(res);
        updateCaseState({
          eligibility_correlation_id:
            res.coverage_eligibility?.validation?.correlation_id ??
            res.coverage_eligibility?.correlation_id,
        });
        if (TERMINAL_STATUSES.includes(res.status)) {
          setPolling(false);
        }
      } catch (_) {}
    };
    pollRef.current = setInterval(doPoll, POLL_INTERVAL_MS);
    return () => clearInterval(pollRef.current);
  }, [polling, caseData?.cashless_case_id]);

  const manualRefresh = () => {
    if (!polling && caseData?.cashless_case_id) setPolling(true);
  };

  const handleForceRefresh = async () => {
    if (!caseData?.cashless_case_id) return;
    setForceRefreshing(true);
    try {
      const res = await api.getCashlessStatus(caseData.cashless_case_id, { force_refresh: true });
      setCaseData(res);
      setCashlessCase(res);
      updateCaseState({
        eligibility_correlation_id:
          res.coverage_eligibility?.validation?.correlation_id ??
          res.coverage_eligibility?.correlation_id,
      });
      if (!TERMINAL_STATUSES.includes(res.status)) {
        setPolling(true);
      }
    } catch (_) {
    } finally {
      setForceRefreshing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex-center py-20 flex-col">
        <div className="spinner mb-4" />
        <p className="text-muted">Initiating eligibility preparation…</p>
      </div>
    );
  }

  if (sumInsuredError) {
    return (
      <Card>
        <div style={{ display: "flex", gap: "12px", alignItems: "flex-start", marginBottom: "20px" }}>
          <AlertCircle color="var(--error)" size={24} style={{ flexShrink: 0, marginTop: "2px" }} />
          <div>
            <div style={{ fontWeight: 700, color: "var(--error)", fontSize: "16px", marginBottom: "8px" }}>
              Estimated bill exceeds policy sum insured
            </div>
            {sumInsuredError.estimated && sumInsuredError.limit ? (
              <div style={{ fontSize: "14px", marginBottom: "12px" }}>
                Estimated bill{" "}
                <strong style={{ color: "var(--error)" }}>₹{sumInsuredError.estimated.toLocaleString()}</strong>
                {" "}exceeds this policy's sum insured of{" "}
                <strong>₹{sumInsuredError.limit.toLocaleString()}</strong>.
              </div>
            ) : (
              <div style={{ fontSize: "13px", color: "var(--text-muted)", marginBottom: "12px" }}>
                {sumInsuredError.raw}
              </div>
            )}
            <div style={{ fontSize: "13px", color: "var(--text-muted)" }}>
              Select a different policy with a higher sum insured, or proceed with the current one if supplemental coverage applies.
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: "12px" }}>
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
    return (
      <Card>
        <div
          style={{
            display: "flex",
            gap: "12px",
            alignItems: "center",
            marginBottom: "16px",
          }}
        >
          <AlertCircle color="var(--error)" size={24} />
          <div>
            <div style={{ fontWeight: 700, color: "var(--error)" }}>
              Preparation failed
            </div>
            <div style={{ fontSize: "13px", color: "var(--text-muted)" }}>
              {error}
            </div>
          </div>
        </div>
        <Button variant="outline" onClick={() => navigate("../payer")}>
          ← Back to Payer
        </Button>
      </Card>
    );
  }

  const isComplete = caseData?.status === "complete";
  const isFailed = caseData?.status === "failed";
  const canProceed =
    isComplete && caseData?.next_actions?.includes("prepare_preauth");

  return (
    <div className="wizard-step">
      <Card className="mb-6">
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
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
                {caseData?.current_step?.replace(/_/g, " ")}
                {polling ? " — polling for updates…" : ""}
              </div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
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
            {!polling && (isComplete || isFailed) && (
              <Button
                variant="outline"
                size="small"
                icon={RefreshCw}
                disabled={forceRefreshing}
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
        style={{ gap: "24px", marginBottom: "24px" }}
      >
        <InsurancePlanPanel plan={caseData?.insurance_plan} />
        <CoverageEligibilityPanel ce={caseData?.coverage_eligibility} />
      </div>

      <Card title="Procedures" className="mb-6">
        {caseData?.procedures?.source && (
          <div
            style={{
              fontSize: "11px",
              color: "var(--text-muted)",
              marginBottom: "8px",
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
                gap: "8px",
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

      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <Button variant="text" onClick={() => navigate("../payer")}>
          ← Back
        </Button>
        <Button
          variant="primary"
          disabled={!canProceed}
          onClick={() => navigate("../review")}
        >
          {polling
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
