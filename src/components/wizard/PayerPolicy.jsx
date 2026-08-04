import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Building2, FileText, ArrowRight, AlertTriangle } from "lucide-react";
import { api } from "../../api";
import { Card, Button, Input, StatusBadge } from "../Common";
import { formatMoney, formatDate } from "../../format.js";

const IDENTIFIER_TYPE_LABELS = {
  AbhaNumber: "ABHA Number",
  MemberId: "Member ID",
  MobileNo: "Mobile Number",
};

const field = (policy, snake, camel) => policy?.[snake] ?? policy?.[camel];
const policyNumberOf = (policy) => field(policy, "policy_number", "policyNumber");
const sumInsuredOf = (policy) => field(policy, "sum_insured", "sumInsured");

const payerFromPolicy = (policy) => {
  const code = field(policy, "payer_id", "payerId");
  if (!code) return null;
  return { code, name: field(policy, "payer_name", "payerName") || code };
};

export default function PayerPolicy({ ctx }) {
  const navigate = useNavigate();
  const { patient, caseState, updateCaseState } = ctx;

  const [payers, setPayers] = useState([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [loadingPayers, setLoadingPayers] = useState(false);
  const [payerSearch, setPayerSearch] = useState("");
  const [showPayerLookup, setShowPayerLookup] = useState(false);
  const [payerFilter, setPayerFilter] = useState(caseState.payer?.code || null);

  const [policies, setPolicies] = useState([]);
  const [loadingPolicies, setLoadingPolicies] = useState(false);
  const [policyError, setPolicyError] = useState(null);
  const [selectedPolicy, setSelectedPolicy] = useState(
    caseState.policy || null,
  );
  const [identifierType, setIdentifierType] = useState("");
  const [memberId, setMemberId] = useState("");
  const [memberIdOnFile, setMemberIdOnFile] = useState("");

  const handlePayerSearchClick = async () => {
    setHasSearched(true);
    setLoadingPayers(true);
    try {
      const params = payerSearch.trim() ? { name: payerSearch } : {};
      const res = await api.searchPayers(params);
      setPayers(res || []);
    } catch (err) {
      console.error(err);
      setPayers([]);
    } finally {
      setLoadingPayers(false);
    }
  };

  const fetchPolicies = async (idType, typedMemberId = "", payerCode = null) => {
    if (!patient?.child_id) return;
    setLoadingPolicies(true);
    setPolicyError(null);
    setPolicies([]);
    try {
      const body = { child_id: patient.child_id, force_refresh: false };
      if (payerCode) body.payer_id = payerCode;
      if (caseState.admission_id) body.admission_id = caseState.admission_id;
      const trimmedMemberId = typedMemberId.trim();
      if (trimmedMemberId) body.member_id = trimmedMemberId;
      else if (idType) body.identifier_type = idType;
      const res = await api.fetchPolicies(body);
      setPolicies(res?.data?.policies || []);
      const used = res?.data?.identifier_used;
      if (used?.type === "MemberId" && used.value) setMemberIdOnFile(used.value);
    } catch (err) {
      setPolicyError(err.message);
    } finally {
      setLoadingPolicies(false);
    }
  };

  useEffect(() => {
    if (!patient?.child_id || policies.length || selectedPolicy) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      if (!cancelled) fetchPolicies("");
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patient?.child_id]);

  const discoveredPayers = [];
  for (const policy of policies) {
    const payer = payerFromPolicy(policy);
    if (payer && !discoveredPayers.some((p) => p.code === payer.code)) {
      discoveredPayers.push(payer);
    }
  }

  const visiblePolicies = payerFilter
    ? policies.filter((policy) => payerFromPolicy(policy)?.code === payerFilter)
    : policies;

  const clearSelection = () => {
    setSelectedPolicy(null);
    updateCaseState({
      policy: null,
      payer: null,
      cashless_case_id: null,
      claim_id: null,
      eligibility_correlation_id: null,
    });
  };

  const handlePayerFilter = (code) => {
    setPayerFilter(payerFilter === code ? null : code);
    clearSelection();
  };

  const handlePayerLookupSelect = async (payer) => {
    setPayerFilter(null);
    clearSelection();
    setShowPayerLookup(false);
    await fetchPolicies(identifierType, "", payer.code);
  };

  const handleIdentifierTypeChange = (idType) => {
    setIdentifierType(idType);
    clearSelection();
    const nextMemberId = idType === "MemberId" ? memberId || memberIdOnFile : "";
    setMemberId(nextMemberId);
    fetchPolicies(idType, nextMemberId);
  };

  const handleMemberIdSearch = () => {
    clearSelection();
    fetchPolicies("MemberId", memberId);
  };

  const handlePolicySelect = (policy) => {
    setSelectedPolicy(policy);
    updateCaseState({
      policy,
      payer: payerFromPolicy(policy),
      cashless_case_id: null,
      claim_id: null,
      eligibility_correlation_id: null,
    });
  };

  const effectivePayer = payerFromPolicy(selectedPolicy);

  const handleNext = () => {
    if (selectedPolicy && effectivePayer) {
      navigate("../prep");
    }
  };

  return (
    <div className="wizard-step">
      <div>
        {/* Policy Selection */}
        {(
          <Card
            title="Select Policy"
            headerAction={
              <select
                className="input-modern"
                style={{ width: "auto", minWidth: "170px" }}
                value={identifierType}
                disabled={loadingPolicies}
                onChange={(e) => handleIdentifierTypeChange(e.target.value)}
                title="Restrict policy search to a single identifier"
              >
                <option value="">Search by: Auto</option>
                <option value="AbhaNumber">Search by: ABHA Number</option>
                <option value="MemberId">Search by: Member ID</option>
                <option value="MobileNo">Search by: Mobile Number</option>
              </select>
            }
          >
            {identifierType === "MemberId" && (
              <div style={{ display: "flex", gap: "var(--space-3)", marginBottom: "var(--space-4)" }}>
                <div style={{ flex: 1 }}>
                  <Input
                    placeholder={memberIdOnFile ? "Member ID" : "Type a member ID..."}
                    value={memberId}
                    onChange={(e) => setMemberId(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleMemberIdSearch();
                    }}
                  />
                </div>
                <Button
                  variant="outline"
                  disabled={loadingPolicies || !memberId.trim()}
                  onClick={handleMemberIdSearch}
                >
                  Search
                </Button>
              </div>
            )}

            {!loadingPolicies && (discoveredPayers.length > 1 || showPayerLookup) && (
              <div className="pp-payerbar">
                <span className="pp-payerbar-key">Payer</span>
                <button
                  type="button"
                  className={`pp-chip${payerFilter === null ? " is-on" : ""}`}
                  onClick={() => handlePayerFilter(null)}
                >
                  All
                </button>
                {discoveredPayers.map((payer) => (
                  <button
                    type="button"
                    key={payer.code}
                    className={`pp-chip${payerFilter === payer.code ? " is-on" : ""}`}
                    onClick={() => handlePayerFilter(payer.code)}
                    title={payer.code}
                  >
                    <Building2 size={12} />
                    {payer.name}
                  </button>
                ))}
                <button
                  type="button"
                  className="pp-chip-link"
                  onClick={() => setShowPayerLookup((open) => !open)}
                >
                  {showPayerLookup ? "Close" : "Look up another payer"}
                </button>
              </div>
            )}

            {showPayerLookup && (
              <div className="pp-lookup">
                <div style={{ display: "flex", gap: "var(--space-3)" }}>
                  <div style={{ flex: 1 }}>
                    <Input
                      icon={Search}
                      placeholder="Search by payer name..."
                      value={payerSearch}
                      onChange={(e) => setPayerSearch(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handlePayerSearchClick();
                      }}
                    />
                  </div>
                  <Button variant="outline" onClick={handlePayerSearchClick}>
                    Search
                  </Button>
                </div>
                {loadingPayers ? (
                  <div className="spinner" style={{ margin: "var(--space-4) auto" }} />
                ) : payers.length > 0 ? (
                  <div className="pp-lookup-results">
                    {payers.map((payer) => (
                      <button
                        type="button"
                        key={payer.code}
                        className="pp-lookup-row"
                        onClick={() => handlePayerLookupSelect(payer)}
                      >
                        <Building2 size={16} />
                        <span className="pp-lookup-name">{payer.name}</span>
                        <code className="pp-lookup-code">{payer.code}</code>
                        <StatusBadge status={payer.status} />
                      </button>
                    ))}
                  </div>
                ) : hasSearched ? (
                  <div className="text-muted" style={{ marginTop: "var(--space-3)", fontSize: "13px" }}>
                    No payers found.
                  </div>
                ) : null}
              </div>
            )}

            {loadingPolicies ? (
              <div className="flex-center py-10 flex-col">
                <div className="spinner mb-4" />
                <p className="text-muted">Fetching policies...</p>
              </div>
            ) : policyError ? (
              <div className="warning-banner tone-error" style={{ color: "var(--error)", fontSize: "13px" }}>
                {policyError}
              </div>
            ) : visiblePolicies.length === 0 ? (
              <div className="text-center py-10 text-muted">
                No policies found for this patient
                {identifierType === "MemberId" && memberId.trim()
                  ? ` for member ID ${memberId.trim()}`
                  : identifierType
                    ? ` via ${IDENTIFIER_TYPE_LABELS[identifierType]}`
                    : ""}.
                {identifierType && (
                  <div style={{ fontSize: "12px", marginTop: "var(--space-2)" }}>
                    No other identifiers were tried
                    {identifierType === "MemberId" && memberId.trim()
                      ? " — check the member ID above for a typo."
                      : "."}
                  </div>
                )}
                {identifierType && (
                  <>
                    {" "}
                    <span
                      style={{ color: "var(--primary)", cursor: "pointer", textDecoration: "underline" }}
                      onClick={() => handleIdentifierTypeChange("")}
                    >
                      Try Auto instead
                    </span>
                  </>
                )}
              </div>
            ) : (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "var(--space-3)",
                }}
              >
                {visiblePolicies.map((policy) => {
                  const policyNumber = policyNumberOf(policy);
                  const sumInsured = sumInsuredOf(policy);
                  const policyPayer = payerFromPolicy(policy);
                  const effectiveFrom = field(policy, "effective_from", "effectiveFrom");
                  const effectiveTo = field(policy, "effective_to", "effectiveTo");
                  const isSelected = policyNumberOf(selectedPolicy) === policyNumber;
                  return (
                  <div
                    key={policyNumber}
                    onClick={() => handlePolicySelect(policy)}
                    style={{
                      padding: "var(--space-4)",
                      border: `1.5px solid ${isSelected ? "var(--primary)" : "var(--border-color)"}`,
                      borderRadius: "var(--radius-md)",
                      background: isSelected ? "var(--primary-light)" : "var(--bg-main)",
                      cursor: "pointer",
                      display: "flex",
                      gap: "var(--space-4)",
                    }}
                  >
                    <FileText
                      size={24}
                      color={isSelected ? "var(--primary)" : "var(--text-muted)"}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="pp-policy-row">
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 700, fontSize: "15px", marginBottom: "var(--space-1)" }}>
                            {field(policy, "product_name", "productName")}
                          </div>
                          <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
                            <code style={{ fontSize: "11px" }}>{policyNumber}</code>
                            {policyPayer && (
                              <span style={{ fontSize: "12px", color: "var(--text-muted)", display: "inline-flex", alignItems: "center", gap: "5px" }}>
                                <Building2 size={13} />
                                {policyPayer.name}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="pp-policy-meta">
                          {(effectiveFrom || effectiveTo) && (
                            <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                              Valid {effectiveFrom ? formatDate(effectiveFrom) : "—"} to {effectiveTo ? formatDate(effectiveTo) : "—"}
                            </span>
                          )}
                          <span style={{ display: "inline-flex", alignItems: "center", gap: "10px" }}>
                            {sumInsured ? (
                              <span className="num-cell" style={{ fontSize: "13px" }}>
                                Sum Insured:{" "}
                                <strong style={{ color: "var(--primary)" }}>
                                  {formatMoney(sumInsured)}
                                </strong>
                              </span>
                            ) : (
                              <span style={{ color: "var(--text-muted)", fontSize: "11px" }}>
                                Fetched: {formatDate(policy.fetched_at || Date.now())}
                              </span>
                            )}
                            {(policy.status || !policy.fetched_at) && <StatusBadge status={policy.status || "active"} />}
                          </span>
                        </div>
                      </div>
                      {caseState.estimatedBillAmount > 0 && sumInsured > 0 && sumInsured < caseState.estimatedBillAmount && (
                        <div
                          style={{
                            marginTop: "var(--space-2)",
                            display: "flex",
                            alignItems: "flex-start",
                            gap: "6px",
                            padding: "8px 10px",
                            background: "rgba(245,158,11,0.08)",
                            border: "1px solid var(--warning)",
                            borderRadius: "var(--radius-sm)",
                            fontSize: "12px",
                            color: "var(--text-main)",
                          }}
                        >
                          <AlertTriangle size={14} color="var(--warning)" style={{ flexShrink: 0, marginTop: "1px" }} />
                          <span>
                            Estimated bill ({formatMoney(caseState.estimatedBillAmount)}) may exceed this policy's sum insured ({formatMoney(sumInsured)}). Consider selecting a different policy.
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                  );
                })}
              </div>
            )}
          </Card>
        )}
      </div>

      {/* Navigation Footer */}
      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          marginTop: "var(--space-6)",
        }}
      >
        <Button
          variant="primary"
          disabled={!selectedPolicy || !effectivePayer}
          onClick={handleNext}
        >
          Proceed to Eligibility{" "}
          <ArrowRight size={18} style={{ marginLeft: "8px" }} />
        </Button>
      </div>
    </div>
  );
}
