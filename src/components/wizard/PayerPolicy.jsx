import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Building2, FileText, ArrowRight, AlertTriangle, CheckCircle2, Radar } from "lucide-react";
import { api } from "../../api";
import { useReadOnly } from "../../readOnly";
import { Button, StatusBadge } from "../Common";
import Dropdown from "../Dropdown";
import { formatMoney, formatDate } from "../../format.js";

const IDENTIFIER_TYPE_LABELS = {
  AbhaNumber: "ABHA Number",
  MemberId: "Member ID",
  MobileNo: "Mobile Number",
};

const IDENTIFIER_OPTIONS = [
  { value: "", label: "Auto" },
  { value: "AbhaNumber", label: IDENTIFIER_TYPE_LABELS.AbhaNumber },
  { value: "MemberId", label: IDENTIFIER_TYPE_LABELS.MemberId },
  { value: "MobileNo", label: IDENTIFIER_TYPE_LABELS.MobileNo },
];

const policyNumberOf = (policy) => policy?.policy_number;
const sumInsuredOf = (policy) => policy?.sum_insured;

const payerFromPolicy = (policy) => {
  const code = policy?.payer_id;
  if (!code) return null;
  return { code, name: policy?.payer_name || code };
};

export default function PayerPolicy({ ctx }) {
  const navigate = useNavigate();
  const readOnly = useReadOnly();
  const { patient, caseState, updateCaseState, caseClosed } = ctx;

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
    if (readOnly || !patient?.child_id || policies.length || selectedPolicy) return;
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

  const canDiscover = !readOnly && !caseClosed;
  const openDiscovery = () => {
    const typed = identifierType === "MemberId" ? memberId.trim() : "";
    navigate(typed ? `../discover?member_id=${encodeURIComponent(typed)}` : "../discover");
  };
  const discoverButton = (label) => (
    <button type="button" className="pp-btn" onClick={openDiscovery}>
      <Radar size={14} /> {label}
    </button>
  );

  const handleNext = () => {
    if (selectedPolicy && effectivePayer) {
      navigate("../prep");
    }
  };

  const policyCount = visiblePolicies.length;
  const selectedNumber = policyNumberOf(selectedPolicy);
  const overBill = (sumInsured) =>
    caseState.estimatedBillAmount > 0 && sumInsured > 0 && sumInsured < caseState.estimatedBillAmount;

  return (
    <div className="wizard-step">
      <div className="pp-panel">
        <div className="pp-head">
          <div className="pp-head-text">
            <h2 className="pp-title">Select a policy</h2>
            <div className="pp-subtitle">
              {loadingPolicies
                ? "Searching the patient's policies…"
                : policyError
                  ? "Policy search failed"
                  : `${policyCount} ${policyCount === 1 ? "policy" : "policies"} found${patient?.name ? ` for ${patient.name}` : ""}`}
            </div>
          </div>
          <div className="pp-searchby">
            {canDiscover &&
              !loadingPolicies &&
              discoverButton(policies.length > 0 ? "None of these? Discover with a payer" : "Discover with a payer")}
            <span className="pp-searchby-key">Search by</span>
            <div style={{ width: "170px" }}>
              <Dropdown
                compact
                ariaLabel="Search policies by identifier"
                value={identifierType}
                options={IDENTIFIER_OPTIONS}
                onChange={(v) => !loadingPolicies && handleIdentifierTypeChange(v)}
              />
            </div>
          </div>
        </div>

        {identifierType === "MemberId" && (
          <div className="pp-member">
            <input
              className="input-modern pp-input"
              placeholder={memberIdOnFile ? "Member ID" : "Type a member ID…"}
              aria-label="Member ID"
              value={memberId}
              onChange={(e) => setMemberId(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleMemberIdSearch();
              }}
            />
            <button
              type="button"
              className="pp-btn"
              disabled={loadingPolicies || !memberId.trim()}
              onClick={handleMemberIdSearch}
            >
              Search
            </button>
          </div>
        )}

        {!loadingPolicies && (discoveredPayers.length > 1 || showPayerLookup) && (
          <div className="pp-payerbar">
            <span className="pp-payerbar-key">Payer</span>
            <button
              type="button"
              className={`wq-chip${payerFilter === null ? " is-on" : ""}`}
              onClick={() => handlePayerFilter(null)}
            >
              All
              <span className="wq-chip-count">{policies.length}</span>
            </button>
            {discoveredPayers.map((payer) => (
              <button
                type="button"
                key={payer.code}
                className={`wq-chip${payerFilter === payer.code ? " is-on" : ""}`}
                onClick={() => handlePayerFilter(payer.code)}
                title={payer.code}
              >
                {payer.name}
                <span className="wq-chip-count">
                  {policies.filter((p) => payerFromPolicy(p)?.code === payer.code).length}
                </span>
              </button>
            ))}
            <button
              type="button"
              className="pp-link"
              onClick={() => setShowPayerLookup((open) => !open)}
            >
              {showPayerLookup ? "Close payer lookup" : "Look up another payer"}
            </button>
          </div>
        )}

        {showPayerLookup && (
          <div className="pp-lookup">
            <div className="pp-member" style={{ padding: 0, border: "none" }}>
              <input
                className="input-modern pp-input"
                placeholder="Search by payer name…"
                aria-label="Payer name"
                value={payerSearch}
                onChange={(e) => setPayerSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handlePayerSearchClick();
                }}
              />
              <button type="button" className="pp-btn" onClick={handlePayerSearchClick}>
                <Search size={14} /> Search
              </button>
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
                    <Building2 size={14} />
                    <span className="pp-lookup-name">{payer.name}</span>
                    <code className="pp-lookup-code">{payer.code}</code>
                    <StatusBadge status={payer.status} />
                  </button>
                ))}
              </div>
            ) : hasSearched ? (
              <div className="pp-muted" style={{ marginTop: "var(--space-3)" }}>No payers found.</div>
            ) : null}
          </div>
        )}

        {readOnly ? (
          <div className="pp-state">
            <div>
              <div className="pp-state-title">View only</div>
              <div className="pp-muted">Looking up a patient's policies asks the payer, which this account cannot do.</div>
            </div>
          </div>
        ) : loadingPolicies ? (
          <div className="pp-list" aria-busy="true">
            {[0, 1].map((i) => (
              <div key={i} className="pp-row is-skeleton">
                <span className="skeleton-line" style={{ width: 16, height: 16, borderRadius: "50%" }} />
                <div style={{ flex: 1 }}>
                  <span className="skeleton-line" style={{ width: "40%", height: 12 }} />
                  <span className="skeleton-line" style={{ width: "65%", height: 10, marginTop: 8 }} />
                </div>
              </div>
            ))}
          </div>
        ) : policyError ? (
          <div className="pp-state is-error">
            <AlertTriangle size={16} />
            <div>
              <div className="pp-state-title">Couldn't fetch policies</div>
              <div className="pp-muted">{policyError}</div>
            </div>
            <button type="button" className="pp-btn" onClick={() => fetchPolicies(identifierType, memberId)}>
              Retry
            </button>
            {canDiscover && discoverButton("Discover with a payer")}
          </div>
        ) : visiblePolicies.length === 0 ? (
          <div className="pp-state">
            <FileText size={16} />
            <div>
              <div className="pp-state-title">
                No policies found
                {identifierType === "MemberId" && memberId.trim()
                  ? ` for member ID ${memberId.trim()}`
                  : identifierType
                    ? ` via ${IDENTIFIER_TYPE_LABELS[identifierType]}`
                    : " for this patient"}
              </div>
              {identifierType && (
                <div className="pp-muted">
                  No other identifiers were tried
                  {identifierType === "MemberId" && memberId.trim() ? " — check the member ID for a typo." : "."}
                </div>
              )}
              <div className="pp-muted">
                The lookup only finds policies linked to the patient's identifiers. A payer can still be asked directly.
              </div>
            </div>
            {identifierType && (
              <button type="button" className="pp-btn" onClick={() => handleIdentifierTypeChange("")}>
                Try Auto instead
              </button>
            )}
            {canDiscover && discoverButton("Discover with a payer")}
          </div>
        ) : (
          <div className="pp-list" role="radiogroup" aria-label="Policies">
            {visiblePolicies.map((policy) => {
              const policyNumber = policyNumberOf(policy);
              const sumInsured = sumInsuredOf(policy);
              const policyPayer = payerFromPolicy(policy);
              const memberNo = policy?.member_id;
              const effectiveFrom = policy?.effective_from;
              const effectiveTo = policy?.effective_to;
              const isSelected = selectedNumber === policyNumber;
              const status = policy.status || (!policy.fetched_at ? "active" : null);
              return (
                <div
                  key={policyNumber}
                  role="radio"
                  aria-checked={isSelected}
                  tabIndex={isSelected || (!selectedNumber && policy === visiblePolicies[0]) ? 0 : -1}
                  className={`pp-row${isSelected ? " is-selected" : ""}`}
                  onClick={() => handlePolicySelect(policy)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      handlePolicySelect(policy);
                    }
                  }}
                >
                  <span className="pp-radio" aria-hidden="true" />
                  <div className="pp-row-main">
                    <div className="pp-row-title">
                      <span className="pp-product">{policy?.product_name || "Policy"}</span>
                      {status && (
                        <span className={`pp-status${/active|in.?force/i.test(status) ? " is-active" : ""}`}>
                          {status.replace(/_/g, " ")}
                        </span>
                      )}
                    </div>
                    <div className="pp-row-meta">
                      <span className="pp-mono" title="Policy number">{policyNumber}</span>
                      {policyPayer && (
                        <span title={policyPayer.code}>
                          <Building2 size={12} /> {policyPayer.name}
                        </span>
                      )}
                      {memberNo && <span title="Member ID">Member {memberNo}</span>}
                      {(effectiveFrom || effectiveTo) && (
                        <span>
                          {effectiveFrom ? formatDate(effectiveFrom) : "—"} – {effectiveTo ? formatDate(effectiveTo) : "—"}
                        </span>
                      )}
                    </div>
                    {overBill(sumInsured) && (
                      <div className="pp-row-warn">
                        <AlertTriangle size={12} />
                        Estimated bill {formatMoney(caseState.estimatedBillAmount)} is above this sum insured.
                      </div>
                    )}
                  </div>
                  <div className="pp-row-amount">
                    {sumInsured ? (
                      <>
                        <span className="pp-amount">{formatMoney(sumInsured)}</span>
                        <span className="pp-amount-key">Sum insured</span>
                      </>
                    ) : (
                      <span className="pp-amount-key">
                        {policy.fetched_at ? `Fetched ${formatDate(policy.fetched_at)}` : "Sum insured not given"}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="pp-footer">
          <div className="pp-footer-text">
            {selectedPolicy && effectivePayer ? (
              <>
                <CheckCircle2 size={14} className="pp-footer-ok" />
                <span>
                  <strong>{selectedPolicy?.product_name || selectedNumber}</strong>
                  {" · "}
                  {effectivePayer.name}
                </span>
              </>
            ) : (
              <span className="pp-muted">{caseClosed ? "The case is settled; its policy can't be changed." : "Select a policy to continue."}</span>
            )}
          </div>
          {!caseClosed && (
            <Button
              variant="primary"
              size="small"
              disabled={!selectedPolicy || !effectivePayer}
              onClick={handleNext}
            >
              Continue to eligibility
              <ArrowRight size={14} />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
