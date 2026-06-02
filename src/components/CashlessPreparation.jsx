import { useState, useEffect, useCallback } from "react";
import {
  Clock,
  ShieldCheck,
  FileCheck,
  ArrowRight,
  RefreshCw,
  AlertCircle,
} from "lucide-react";
import { api } from "../api";
import { Card, Button, StatusBadge, PageHeader } from "./Common";

const CashlessPreparation = ({
  patient,
  payer,
  policy,
  onReadyForPreauth,
  onBack,
}) => {
  const [caseData, setCaseData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [polling, setPolling] = useState(false);
  const [pollCount, setPollCount] = useState(0);
  const [checkingBenefits, setCheckingBenefits] = useState(false);

  const startPreparation = useCallback(async () => {
    setLoading(true);
    try {
      const claim_id = patient?.latest_claim?.claim_id || 101;
      const response = await api.prepareCashless({
        claim_id,
        child_id: patient?.child_id || 12,
        payer_code: payer?.participant_code || "1518@hcx",
        policy_number: policy?.policy_number || "POL-91711234567890-2026",
        admission_id: patient?.visits?.[0]?.admission_id?.toString() || "622",
        force_refresh: false,
      });
      setCaseData(response);
      if (response.status === "pending" || response.status === "partial") {
        setPolling(true);
        setPollCount(0);
      }
    } catch (error) {
      console.error("Error starting preparation:", error);
    } finally {
      setLoading(false);
    }
  }, [patient, payer, policy]);

  useEffect(() => {
    const timer = setTimeout(() => startPreparation(), 0);
    return () => clearTimeout(timer);
  }, [startPreparation]);

  useEffect(() => {
    let interval;
    if (polling && caseData?.cashless_case_id) {
      interval = setInterval(async () => {
        try {
          const updatedData = await api.getCashlessStatus(
            caseData.cashless_case_id,
          );
          setCaseData(updatedData);
          setPollCount((c) => c + 1);
          if (
            updatedData.status === "complete" ||
            updatedData.status === "failed"
          ) {
            setPolling(false);
          }
        } catch (error) {
          console.error("Polling error:", error);
          setPolling(false);
        }
      }, 2000);
    }
    return () => clearInterval(interval);
  }, [polling, caseData?.cashless_case_id]);

  const handleCheckBenefits = async () => {
    setCheckingBenefits(true);
    try {
      const res = await api.checkBenefits({
        claim_id: caseData.claim_id,
        policy_number: caseData.policy_number,
        procedures: caseData.procedures?.items?.map((p) => p.code) || [],
      });

      const checkStatus = async () => {
        const statusRes = await api.getCoverageEligibilityStatus(
          res.correlation_id,
        );
        if (statusRes.status === "complete" || statusRes.status === "failed") {
          setCaseData((prev) => ({
            ...prev,
            coverage_eligibility: statusRes,
          }));
          setCheckingBenefits(false);
        } else {
          setTimeout(checkStatus, 2000);
        }
      };
      setTimeout(checkStatus, 2000);
    } catch (err) {
      console.error(err);
      setCheckingBenefits(false);
    }
  };

  if (loading)
    return (
      <div className="flex-center py-40 flex-col">
        <div
          className="spinner mb-6"
          style={{ width: "60px", height: "60px", borderWidth: "6px" }}
        />
        <h2 style={{ color: "var(--primary)" }}>
          Initializing Cashless Workflow...
        </h2>
        <p className="text-muted">
          Triggering InsurancePlan and CoverageEligibility on NHCX
        </p>
      </div>
    );

  const isComplete = caseData?.status === "complete";
  const isFailed = caseData?.status === "failed";
  const canPreparePreauth =
    isComplete && caseData?.next_actions?.includes("prepare_preauth");

  return (
    <div className="prep-screen-modern">
      <PageHeader
        title="Cashless Eligibility Preparation"
        subtitle={`Verifying InsurancePlan and CoverageEligibility for ${patient?.name || "Patient"}`}
        backAction={onBack}
      />

      {/* Case context strip */}
      <div className="case-context-strip mb-2">
        <div className="context-field">
          <span className="ctx-label">Patient</span>
          <span className="ctx-value">{patient?.name}</span>
        </div>
        <div className="context-field">
          <span className="ctx-label">Child ID</span>
          <span className="ctx-value">#{patient?.child_id}</span>
        </div>
        <div className="context-field">
          <span className="ctx-label">Payer</span>
          <span className="ctx-value">{payer?.name}</span>
        </div>
        <div className="context-field">
          <span className="ctx-label">Policy</span>
          <span className="ctx-value">{policy?.policy_number}</span>
        </div>
        <div className="context-field">
          <span className="ctx-label">Case</span>
          <span className="ctx-value">#{caseData?.cashless_case_id}</span>
        </div>
        <div className="context-field">
          <span className="ctx-label">Step</span>
          <span className="ctx-value" style={{ color: "var(--primary)" }}>
            {caseData?.current_step?.replace(/_/g, " ")}
          </span>
        </div>
      </div>

      <div className="selection-grid-modern">
        <div className="prep-main-modern">
          {/* Procedures */}
          <Card
            title="Clinical Procedures"
            headerAction={
              <Button
                size="small"
                variant="secondary"
                disabled={
                  checkingBenefits || !caseData?.procedures?.items?.length
                }
                onClick={handleCheckBenefits}
              >
                {checkingBenefits ? "Checking..." : "Check Covered Benefits"}
              </Button>
            }
          >
            <div className="table-responsive-wrapper">
              <table className="table-modern">
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Procedure Name</th>
                    <th>Category</th>
                    <th>Source</th>
                  </tr>
                </thead>
                <tbody>
                  {caseData?.procedures?.items?.map((proc, i) => (
                    <tr key={i}>
                      <td>
                        <code
                          style={{
                            background: "var(--primary-light)",
                            color: "var(--primary)",
                            padding: "4px 8px",
                            borderRadius: "6px",
                            fontWeight: 700,
                          }}
                        >
                          {proc.code}
                        </code>
                      </td>
                      <td>
                        <span style={{ fontWeight: 600 }}>{proc.name}</span>
                      </td>
                      <td>{proc.category}</td>
                      <td>
                        <span
                          className="badge-modern badge-info"
                          style={{ fontSize: "10px" }}
                        >
                          {caseData.procedures.source}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Insurance Plan */}
          {caseData?.insurance_plan?.plan_details && (
            <Card title="Insurance Plan Details" className="mt-2">
              <div className="grid-1-to-2" style={{ gap: "32px" }}>
                <div>
                  <div className="flex-between mb-4">
                    <h4
                      style={{
                        fontSize: "17px",
                        fontWeight: 700,
                        color: "var(--primary)",
                      }}
                    >
                      {caseData.insurance_plan.plan_details.name}
                    </h4>
                    <StatusBadge
                      status={caseData.insurance_plan.plan_details.status}
                    />
                  </div>
                  <div
                    style={{
                      background: "var(--primary-light)",
                      borderRadius: "12px",
                      padding: "16px",
                      marginBottom: "16px",
                    }}
                  >
                    <div
                      style={{
                        fontSize: "11px",
                        color: "var(--text-muted)",
                        fontWeight: 700,
                        textTransform: "uppercase",
                        marginBottom: "4px",
                      }}
                    >
                      Sum Insured
                    </div>
                    <div
                      style={{
                        fontSize: "26px",
                        fontWeight: 800,
                        color: "var(--text-main)",
                      }}
                    >
                      {caseData.insurance_plan.pricing?.currency}{" "}
                      {caseData.insurance_plan.pricing?.sum_insured?.toLocaleString()}
                    </div>
                  </div>
                  {caseData.insurance_plan.document_requirements?.length >
                    0 && (
                    <div>
                      <h5
                        style={{
                          fontSize: "12px",
                          fontWeight: 700,
                          color: "var(--text-muted)",
                          marginBottom: "8px",
                        }}
                      >
                        DOCUMENT REQUIREMENTS
                      </h5>
                      {caseData.insurance_plan.document_requirements.map(
                        (doc, i) => (
                          <div
                            key={i}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "8px",
                              fontSize: "13px",
                              color: "var(--text-main)",
                              marginBottom: "6px",
                            }}
                          >
                            <div
                              style={{
                                width: "6px",
                                height: "6px",
                                borderRadius: "50%",
                                background: "var(--primary)",
                              }}
                            />
                            {doc.name}
                          </div>
                        ),
                      )}
                    </div>
                  )}
                </div>
                <div>
                  <div className="grid-1-to-2" style={{ gap: "16px" }}>
                    <div>
                      <h5
                        style={{
                          fontSize: "11px",
                          fontWeight: 700,
                          color: "var(--success)",
                          marginBottom: "10px",
                        }}
                      >
                        INCLUSIONS
                      </h5>
                      {caseData.insurance_plan.inclusions?.map((inc, i) => (
                        <div key={i} className="inclusion-item">
                          {inc.name}
                        </div>
                      ))}
                    </div>
                    <div>
                      <h5
                        style={{
                          fontSize: "11px",
                          fontWeight: 700,
                          color: "var(--error)",
                          marginBottom: "10px",
                        }}
                      >
                        EXCLUSIONS
                      </h5>
                      {caseData.insurance_plan.exclusions?.map((exc, i) => (
                        <div key={i} className="exclusion-item">
                          {exc.name}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          )}

          {/* Coverage Eligibility */}
          {caseData?.coverage_eligibility?.disposition && (
            <Card title="Coverage Eligibility">
              <div className="eligibility-banner mb-6">
                <div className="banner-icon-success">
                  <ShieldCheck size={24} />
                </div>
                <div style={{ flex: 1 }}>
                  <div
                    style={{
                      fontSize: "12px",
                      color: "var(--success)",
                      fontWeight: 700,
                      textTransform: "uppercase",
                    }}
                  >
                    Gateway Disposition
                  </div>
                  <div style={{ fontSize: "18px", fontWeight: 700 }}>
                    {caseData.coverage_eligibility.disposition}
                  </div>
                </div>
                <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                  <span
                    className={`badge-modern ${caseData.coverage_eligibility.inforce ? "badge-success" : "badge-error"}`}
                  >
                    {caseData.coverage_eligibility.inforce
                      ? "Policy In-Force"
                      : "Policy Expired"}
                  </span>
                  <span
                    className={`badge-modern ${caseData.coverage_eligibility.auth_required ? "badge-warning" : "badge-success"}`}
                  >
                    {caseData.coverage_eligibility.auth_required
                      ? "Preauth Required"
                      : "No Auth Needed"}
                  </span>
                </div>
              </div>

              <div className="table-responsive-wrapper">
                <h5
                  style={{
                    fontSize: "12px",
                    fontWeight: 700,
                    color: "var(--text-muted)",
                    marginBottom: "12px",
                  }}
                >
                  BENEFIT ADJUDICATION
                </h5>
                <table className="table-modern">
                  <thead>
                    <tr>
                      <th>Category</th>
                      <th>Service</th>
                      <th>Excluded</th>
                      <th>Allowed</th>
                      <th>Used</th>
                      <th>Auth Req</th>
                      <th>Required Docs</th>
                    </tr>
                  </thead>
                  <tbody>
                    {caseData.coverage_eligibility.insurance_items?.flatMap(
                      (bundle) =>
                        bundle.items?.map((item, idx) => (
                          <tr key={`${bundle.coverage}-${idx}`}>
                            <td>
                              <span style={{ fontWeight: 600 }}>
                                {item.category?.display}
                              </span>
                            </td>
                            <td>{item.product_or_service?.display}</td>
                            <td>
                              <span
                                className={`badge-modern ${item.excluded ? "badge-error" : "badge-success"}`}
                                style={{ fontSize: "10px" }}
                              >
                                {item.excluded ? "Yes" : "No"}
                              </span>
                            </td>
                            <td>
                              {item.benefit?.[0]?.allowed?.value != null ? (
                                <strong>
                                  {item.benefit[0].allowed.currency}{" "}
                                  {item.benefit[0].allowed.value.toLocaleString()}
                                </strong>
                              ) : (
                                "—"
                              )}
                            </td>
                            <td>{item.benefit?.[0]?.used?.value ?? "0"}</td>
                            <td>
                              {item.authorization_required ? (
                                <span
                                  className="badge-modern badge-warning"
                                  style={{ fontSize: "10px" }}
                                >
                                  Yes
                                </span>
                              ) : (
                                <span
                                  className="badge-modern badge-success"
                                  style={{ fontSize: "10px" }}
                                >
                                  No
                                </span>
                              )}
                            </td>
                            <td>
                              {item.authorization_supporting?.length > 0
                                ? item.authorization_supporting
                                    .map((d) => d.display)
                                    .join(", ")
                                : "—"}
                            </td>
                          </tr>
                        )),
                    )}
                  </tbody>
                </table>
              </div>

              {/* Errors — shown inline as warnings, not hidden */}
              {caseData.coverage_eligibility.errors?.length > 0 && (
                <div className="warning-banner mt-6">
                  <AlertCircle size={18} />
                  <div>
                    <div style={{ fontWeight: 700, marginBottom: "4px" }}>
                      Gateway Warnings
                    </div>
                    {caseData.coverage_eligibility.errors.map((err, i) => (
                      <div
                        key={i}
                        style={{ fontSize: "13px", color: "var(--text-muted)" }}
                      >
                        {err.detail || JSON.stringify(err)}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Card>
          )}
        </div>

        {/* Sidebar: Gateway Status */}
        <div className="prep-sidebar-modern">
          <Card title="Gateway Status">
            <div className="status-flow">
              {[
                {
                  label: "Insurance Plan",
                  status: caseData?.insurance_plan?.status,
                  corr: caseData?.insurance_plan?.correlation_id,
                  icon: ShieldCheck,
                },
                {
                  label: "Coverage Eligibility",
                  status: caseData?.coverage_eligibility?.status,
                  corr: caseData?.coverage_eligibility?.correlation_id,
                  icon: FileCheck,
                },
              ].map(({ label, status, corr, icon: Icon }, idx, arr) => (
                <div
                  key={label}
                  style={{
                    borderLeft:
                      idx < arr.length - 1
                        ? "2px solid var(--border-color)"
                        : "2px solid transparent",
                    paddingLeft: "24px",
                    paddingBottom: idx < arr.length - 1 ? "28px" : "0",
                    position: "relative",
                  }}
                >
                  <div
                    style={{
                      position: "absolute",
                      left: "-11px",
                      top: 0,
                      width: "20px",
                      height: "20px",
                      borderRadius: "50%",
                      background:
                        status === "complete"
                          ? "var(--success)"
                          : status === "failed"
                            ? "var(--error)"
                            : "#e2e8f0",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "white",
                    }}
                  >
                    {status === "complete" ? (
                      <Icon size={12} />
                    ) : (
                      <Clock size={12} />
                    )}
                  </div>
                  <div className="flex-between mb-1">
                    <span style={{ fontSize: "14px", fontWeight: 600 }}>
                      {label}
                    </span>
                    <StatusBadge status={status} />
                  </div>
                  {corr && (
                    <small
                      className="text-muted"
                      style={{
                        fontSize: "10px",
                        display: "block",
                        opacity: 0.6,
                      }}
                    >
                      Ref: {corr}
                    </small>
                  )}
                </div>
              ))}
            </div>

            {polling && (
              <div
                className="text-center mt-6 text-muted"
                style={{ fontSize: "12px" }}
              >
                <RefreshCw
                  size={14}
                  style={{
                    display: "inline",
                    marginRight: "6px",
                    animation: "spin 1.5s linear infinite",
                  }}
                />
                Polling gateway... ({pollCount} checks)
                {pollCount > 24 && (
                  <div
                    style={{
                      marginTop: "8px",
                      color: "var(--warning)",
                      fontSize: "12px",
                    }}
                  >
                    Taking longer than expected. You can leave and come back
                    later.
                  </div>
                )}
              </div>
            )}

            <div className="actions-modern mt-6">
              <Button
                className="w-full"
                disabled={!canPreparePreauth}
                icon={polling ? RefreshCw : ArrowRight}
                onClick={() => onReadyForPreauth(caseData)}
              >
                {polling
                  ? "Waiting for Gateway..."
                  : canPreparePreauth
                    ? "Prepare Preauth"
                    : "Awaiting Completion"}
              </Button>
              {isFailed && (
                <Button
                  variant="outline"
                  className="w-full mt-4"
                  icon={AlertCircle}
                  onClick={startPreparation}
                >
                  Retry Verification
                </Button>
              )}
              {!polling && !isComplete && !isFailed && (
                <Button
                  variant="outline"
                  className="w-full mt-4"
                  icon={RefreshCw}
                  onClick={() => {
                    if (caseData?.cashless_case_id) setPolling(true);
                  }}
                >
                  Manual Refresh
                </Button>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default CashlessPreparation;
