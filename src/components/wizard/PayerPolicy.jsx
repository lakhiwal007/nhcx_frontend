import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Building2, FileText, ArrowRight } from "lucide-react";
import { api } from "../../api";
import { Card, Button, Input, StatusBadge } from "../Common";

export default function PayerPolicy({ ctx }) {
  const navigate = useNavigate();
  const { patient, caseState, updateCaseState } = ctx;

  const DUMMY_PAYER = {
    code: "1000003538@hcx",
    name: "Demo Payer",
  };

  const [payers, setPayers] = useState([DUMMY_PAYER]);
  const [loadingPayers, setLoadingPayers] = useState(false);
  const [payerSearch, setPayerSearch] = useState("");
  const [selectedPayer, setSelectedPayer] = useState(caseState.payer || DUMMY_PAYER);

  const [policies, setPolicies] = useState([]);
  const [loadingPolicies, setLoadingPolicies] = useState(false);
  const [selectedPolicy, setSelectedPolicy] = useState(
    caseState.policy || null,
  );

  useEffect(() => {
    // If caseState doesn't have a payer, auto-sync the default selectedPayer
    if (!caseState.payer && selectedPayer) {
      updateCaseState({ payer: selectedPayer });
    }
  }, []);

  const handlePayerSearchClick = async () => {
    if (!payerSearch.trim()) {
      setPayers([DUMMY_PAYER]);
      return;
    }
    setLoadingPayers(true);
    try {
      const res = await api.searchPayers({ name: payerSearch });
      setPayers(res || []);
    } catch (err) {
      console.error(err);
      setPayers([]);
    } finally {
      setLoadingPayers(false);
    }
  };

  useEffect(() => {
    if (!selectedPayer || !patient) return;
    const fetchPol = async () => {
      setLoadingPolicies(true);
      try {
        const body = {
          child_id: patient.child_id,
          payer_id: selectedPayer.code,
        };
        if (caseState.admission_id) body.admission_id = caseState.admission_id;
        const res = await api.fetchPolicies(body);
        setPolicies(res?.data?.policies || []);
      } catch (err) {
        console.error(err);
      } finally {
        setLoadingPolicies(false);
      }
    };
    fetchPol();
  }, [selectedPayer, patient]);

  const handlePayerSelect = (payer) => {
    setSelectedPayer(payer);
    setSelectedPolicy(null);
    updateCaseState({ payer, policy: null });
  };

  const handlePolicySelect = (policy) => {
    setSelectedPolicy(policy);
    updateCaseState({ policy });
  };

  const handleNext = () => {
    if (selectedPayer && selectedPolicy) {
      navigate("../prep");
    }
  };

  return (
    <div className="wizard-step">
      <div className="grid-1-to-2" style={{ gap: "24px" }}>
        {/* Payer Selection */}
        <Card title="1. Select Payer">
          <div style={{ display: "flex", gap: "12px" }}>
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
              marginTop: "16px",
              maxHeight: "400px",
              overflowY: "auto",
              display: "flex",
              flexDirection: "column",
              gap: "12px",
            }}
          >
            {loadingPayers ? (
              <div className="spinner" />
            ) : payers.length === 0 ? (
              <div className="text-muted text-center py-4">
                No payers found.
              </div>
            ) : (
              payers.map((payer) => (
                <div
                  key={payer.code}
                  onClick={() => handlePayerSelect(payer)}
                  style={{
                    padding: "16px",
                    border: `1.5px solid ${selectedPayer?.code === payer.code ? "var(--primary)" : "var(--border-color)"}`,
                    borderRadius: "12px",
                    background:
                      selectedPayer?.code === payer.code
                        ? "var(--primary-light)"
                        : "var(--bg-main)",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "16px",
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
                    <div style={{ fontWeight: 700, fontSize: "15px" }}>
                      {payer.name}
                    </div>
                    <div
                      style={{ fontSize: "12px", color: "var(--text-muted)" }}
                    >
                      {payer.code} • {payer.scheme_type}
                    </div>
                  </div>
                  <StatusBadge status={payer.status} />
                </div>
              ))
            )}
          </div>
        </Card>

        {/* Policy Selection */}
        {selectedPayer && (
          <Card title="2. Select Policy">
            {loadingPolicies ? (
              <div className="flex-center py-10 flex-col">
                <div className="spinner mb-4" />
                <p className="text-muted">Fetching policies...</p>
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
                  gap: "12px",
                }}
              >
                {policies.map((policy) => (
                  <div
                    key={policy.policyNumber || policy.policy_number}
                    onClick={() => handlePolicySelect(policy)}
                    style={{
                      padding: "16px",
                      border: `1.5px solid ${selectedPolicy?.policyNumber === (policy.policyNumber || policy.policy_number) || selectedPolicy?.policy_number === (policy.policyNumber || policy.policy_number) ? "var(--primary)" : "var(--border-color)"}`,
                      borderRadius: "12px",
                      background:
                        selectedPolicy?.policyNumber === (policy.policyNumber || policy.policy_number) || selectedPolicy?.policy_number === (policy.policyNumber || policy.policy_number)
                          ? "var(--primary-light)"
                          : "var(--bg-main)",
                      cursor: "pointer",
                      display: "flex",
                      gap: "16px",
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
                          marginBottom: "4px",
                        }}
                      >
                        {policy.productName || policy.product_name}
                      </div>
                      <code
                        style={{
                          fontSize: "11px",
                          color: "var(--text-muted)",
                          display: "block",
                          marginBottom: "8px",
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
          marginTop: "24px",
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
