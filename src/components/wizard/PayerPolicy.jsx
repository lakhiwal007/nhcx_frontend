import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Building2, FileText, ArrowRight, AlertTriangle } from "lucide-react";
import { api } from "../../api";
import { Card, Button, Input, StatusBadge } from "../Common";

export default function PayerPolicy({ ctx }) {
  const navigate = useNavigate();
  const { patient, caseState, updateCaseState } = ctx;

  const DUMMY_PAYER = { code: "1000003538@hcx", name: "Demo Payer", is_demo: true };

  const [payers, setPayers] = useState([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [loadingPayers, setLoadingPayers] = useState(false);
  const [payerSearch, setPayerSearch] = useState("");
  const [selectedPayer, setSelectedPayer] = useState(caseState.payer || null);

  const [policies, setPolicies] = useState([]);
  const [loadingPolicies, setLoadingPolicies] = useState(false);
  const [policyError, setPolicyError] = useState(null);
  const [selectedPolicy, setSelectedPolicy] = useState(
    caseState.policy || null,
  );

  const handlePayerSearchClick = async () => {
    setHasSearched(true);
    setLoadingPayers(true);
    try {
      const params = payerSearch.trim() ? { name: payerSearch } : {};
      const res = await api.searchPayers(params);
      setPayers([...(res || []), DUMMY_PAYER]);
    } catch (err) {
      console.error(err);
      setPayers([DUMMY_PAYER]);
    } finally {
      setLoadingPayers(false);
    }
  };

  const DUMMY_POLICY = {
    policy_number: "100217",
    product_name: "Demo Policy",
    payer_id: DUMMY_PAYER.code,
    status: "active",
  };

  const handlePayerSelect = async (payer) => {
    setSelectedPayer(payer);
    setSelectedPolicy(null);
    // Changing the payer invalidates any case prepared for a previous
    // payer/policy. Clear the case identifiers so `prep` runs a fresh
    // prepareCashless instead of resuming the stale case via status.
    updateCaseState({
      payer,
      policy: null,
      cashless_case_id: null,
      claim_id: null,
      eligibility_correlation_id: null,
    });

    if (payer.is_demo) {
      setPolicies([DUMMY_POLICY]);
      setPolicyError(null);
      return;
    }

    setLoadingPolicies(true);
    setPolicyError(null);
    setPolicies([]);
    try {
      const body = { child_id: patient.child_id, payer_id: payer.code, force_refresh: false };
      if (caseState.admission_id) body.admission_id = caseState.admission_id;
      const res = await api.fetchPolicies(body);
      setPolicies(res?.data?.policies || []);
    } catch (err) {
      setPolicyError(err.message);
    } finally {
      setLoadingPolicies(false);
    }
  };

  const handlePolicySelect = (policy) => {
    setSelectedPolicy(policy);
    // A different policy under the same payer also invalidates a prior case.
    updateCaseState({
      policy,
      cashless_case_id: null,
      claim_id: null,
      eligibility_correlation_id: null,
    });
  };

  const handleNext = () => {
    if (selectedPayer && selectedPolicy) {
      navigate("../prep");
    }
  };

  return (
    <div className="wizard-step">
      <div className="grid-1-to-2" style={{ gap: "var(--space-6)" }}>
        {/* Payer Selection */}
        <Card title="Select Payer">
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
            <Button variant="primary" onClick={handlePayerSearchClick}>
              Search
            </Button>
          </div>
          <div
            style={{
              marginTop: "var(--space-4)",
              maxHeight: "400px",
              overflowY: "auto",
              display: "flex",
              flexDirection: "column",
              gap: "var(--space-3)",
            }}
          >
            {loadingPayers ? (
              <div className="spinner" />
            ) : payers.length === 0 ? (
              <div className="text-muted text-center py-4">
                {hasSearched ? "No payers found." : "Search for a payer above."}
              </div>
            ) : (
              payers.map((payer) => (
                <div
                  key={payer.code}
                  onClick={() => handlePayerSelect(payer)}
                  style={{
                    padding: "var(--space-4)",
                    border: `1.5px solid ${selectedPayer?.code === payer.code ? "var(--primary)" : "var(--border-color)"}`,
                    borderRadius: "var(--radius-md)",
                    background:
                      selectedPayer?.code === payer.code
                        ? "var(--primary-light)"
                        : "var(--bg-main)",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "var(--space-4)",
                  }}
                >
                  <Building2
                    size={24}
                    color={
                      selectedPayer?.code === payer.code
                        ? "var(--primary)"
                        : "var(--text-muted)"
                    }
                  />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: "15px", display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                      {payer.name}
                      {payer.is_demo && (
                        <span className="badge-modern badge-warning" style={{ fontSize: "10px" }}>Demo</span>
                      )}
                    </div>
                    <div
                      style={{ fontSize: "12px", color: "var(--text-muted)" }}
                    >
                      {payer.code}{payer.scheme_type ? ` • ${payer.scheme_type}` : ""}
                    </div>
                  </div>
                  {!payer.is_demo && <StatusBadge status={payer.status} />}
                </div>
              ))
            )}
          </div>
        </Card>

        {/* Policy Selection */}
        {selectedPayer && (
          <Card title="Select Policy">
            {loadingPolicies ? (
              <div className="flex-center py-10 flex-col">
                <div className="spinner mb-4" />
                <p className="text-muted">Fetching policies...</p>
              </div>
            ) : policyError ? (
              <div className="warning-banner" style={{ background: "rgba(239,68,68,0.08)", borderColor: "var(--error)", color: "var(--error)", fontSize: "13px" }}>
                {policyError}
              </div>
            ) : policies.length === 0 ? (
              <div className="text-center py-10 text-muted">
                No policies found for this patient under {selectedPayer.name}.
              </div>
            ) : (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "var(--space-3)",
                }}
              >
                {policies.map((policy) => (
                  <div
                    key={policy.policyNumber || policy.policy_number}
                    onClick={() => handlePolicySelect(policy)}
                    style={{
                      padding: "var(--space-4)",
                      border: `1.5px solid ${selectedPolicy?.policyNumber === (policy.policyNumber || policy.policy_number) || selectedPolicy?.policy_number === (policy.policyNumber || policy.policy_number) ? "var(--primary)" : "var(--border-color)"}`,
                      borderRadius: "var(--radius-md)",
                      background:
                        selectedPolicy?.policyNumber === (policy.policyNumber || policy.policy_number) || selectedPolicy?.policy_number === (policy.policyNumber || policy.policy_number)
                          ? "var(--primary-light)"
                          : "var(--bg-main)",
                      cursor: "pointer",
                      display: "flex",
                      gap: "var(--space-4)",
                    }}
                  >
                    <FileText
                      size={24}
                      color={
                        selectedPolicy?.policyNumber === (policy.policyNumber || policy.policy_number) || selectedPolicy?.policy_number === (policy.policyNumber || policy.policy_number)
                          ? "var(--primary)"
                          : "var(--text-muted)"
                      }
                    />
                    <div style={{ flex: 1 }}>
                      <div
                        style={{
                          fontWeight: 700,
                          fontSize: "15px",
                          marginBottom: "var(--space-1)",
                        }}
                      >
                        {policy.productName || policy.product_name}
                      </div>
                      <code
                        style={{
                          fontSize: "11px",
                          color: "var(--text-muted)",
                          display: "block",
                          marginBottom: "var(--space-2)",
                        }}
                      >
                        {policy.policyNumber || policy.policy_number}
                      </code>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          fontSize: "13px",
                        }}
                      >
                        {policy.sum_insured ? (
                          <span>
                            Sum Insured:{" "}
                            <strong style={{ color: "var(--primary)" }}>
                              {policy.currency}{" "}
                              {policy.sum_insured?.toLocaleString()}
                            </strong>
                          </span>
                        ) : (
                          <span style={{ color: "var(--text-muted)", fontSize: "11px" }}>
                            Fetched: {new Date(policy.fetched_at || Date.now()).toLocaleDateString()}
                          </span>
                        )}
                        {(policy.status || !policy.fetched_at) && <StatusBadge status={policy.status || "active"} />}
                      </div>
                      {caseState.estimatedBillAmount > 0 && policy.sum_insured > 0 && policy.sum_insured < caseState.estimatedBillAmount && (
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
                            Estimated bill (₹{caseState.estimatedBillAmount.toLocaleString()}) may exceed this policy's sum insured (₹{policy.sum_insured.toLocaleString()}). Consider selecting a different policy.
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
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
          disabled={!selectedPayer || !selectedPolicy}
          onClick={handleNext}
        >
          Proceed to Eligibility{" "}
          <ArrowRight size={18} style={{ marginLeft: "8px" }} />
        </Button>
      </div>
    </div>
  );
}
