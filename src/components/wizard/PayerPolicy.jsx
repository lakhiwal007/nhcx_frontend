import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Building2, FileText, ArrowRight } from "lucide-react";
import { api } from "../../api";
import { Card, Button, Input, StatusBadge } from "../Common";

export default function PayerPolicy({ ctx }) {
  const navigate = useNavigate();
  const { patient, caseState, updateCaseState } = ctx;
  
  const [payers, setPayers] = useState([]);
  const [loadingPayers, setLoadingPayers] = useState(false);
  const [payerSearch, setPayerSearch] = useState("");
  const [selectedPayer, setSelectedPayer] = useState(caseState.payer || null);

  const [policies, setPolicies] = useState([]);
  const [loadingPolicies, setLoadingPolicies] = useState(false);
  const [selectedPolicy, setSelectedPolicy] = useState(caseState.policy || null);

  useEffect(() => {
    const fetchPayers = async () => {
      setLoadingPayers(true);
      try {
        const res = await api.searchPayers({ name: payerSearch });
        setPayers(res);
      } catch (err) {
        console.error(err);
      } finally {
        setLoadingPayers(false);
      }
    };
    const timer = setTimeout(fetchPayers, 400);
    return () => clearTimeout(timer);
  }, [payerSearch]);

  useEffect(() => {
    if (!selectedPayer || !patient) return;
    const fetchPol = async () => {
      setLoadingPolicies(true);
      try {
        const res = await api.fetchPolicies({
          child_id: patient.child_id,
          payer_code: selectedPayer.participant_code
        });
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
          <Input
            icon={Search}
            placeholder="Search by payer name..."
            value={payerSearch}
            onChange={(e) => setPayerSearch(e.target.value)}
          />
          <div style={{ marginTop: "16px", maxHeight: "400px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "12px" }}>
            {loadingPayers ? (
              <div className="spinner" />
            ) : payers.length === 0 ? (
              <div className="text-muted text-center py-4">No payers found.</div>
            ) : (
              payers.map(payer => (
                <div 
                  key={payer.participant_code}
                  onClick={() => handlePayerSelect(payer)}
                  style={{
                    padding: "16px", border: `1.5px solid ${selectedPayer?.participant_code === payer.participant_code ? "var(--primary)" : "var(--border-color)"}`,
                    borderRadius: "12px", background: selectedPayer?.participant_code === payer.participant_code ? "var(--primary-light)" : "var(--bg-main)",
                    cursor: "pointer", display: "flex", alignItems: "center", gap: "16px"
                  }}
                >
                  <Building2 size={24} color={selectedPayer?.participant_code === payer.participant_code ? "var(--primary)" : "var(--text-muted)"} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: "15px" }}>{payer.name}</div>
                    <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>{payer.participant_code} • {payer.scheme_type}</div>
                  </div>
                  <StatusBadge status={payer.status} />
                </div>
              ))
            )}
          </div>
        </Card>

        {/* Policy Selection */}
        <Card title="2. Select Policy">
          {!selectedPayer ? (
            <div className="text-center py-10 text-muted">
              Select a payer first to fetch associated policies.
            </div>
          ) : loadingPolicies ? (
            <div className="flex-center py-10 flex-col"><div className="spinner mb-4" /><p className="text-muted">Fetching policies...</p></div>
          ) : policies.length === 0 ? (
            <div className="text-center py-10 text-muted">
              No policies found for this patient under {selectedPayer.name}.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {policies.map(policy => (
                <div 
                  key={policy.policy_number}
                  onClick={() => handlePolicySelect(policy)}
                  style={{
                    padding: "16px", border: `1.5px solid ${selectedPolicy?.policy_number === policy.policy_number ? "var(--primary)" : "var(--border-color)"}`,
                    borderRadius: "12px", background: selectedPolicy?.policy_number === policy.policy_number ? "var(--primary-light)" : "var(--bg-main)",
                    cursor: "pointer", display: "flex", gap: "16px"
                  }}
                >
                  <FileText size={24} color={selectedPolicy?.policy_number === policy.policy_number ? "var(--primary)" : "var(--text-muted)"} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: "15px", marginBottom: "4px" }}>{policy.product_name}</div>
                    <code style={{ fontSize: "11px", color: "var(--text-muted)", display: "block", marginBottom: "8px" }}>{policy.policy_number}</code>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px" }}>
                      <span>Sum Insured: <strong style={{ color: "var(--primary)" }}>{policy.currency} {policy.sum_insured?.toLocaleString()}</strong></span>
                      <StatusBadge status={policy.status} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Navigation Footer */}
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "24px" }}>
        <Button 
          variant="primary" 
          disabled={!selectedPayer || !selectedPolicy} 
          onClick={handleNext}
        >
          Proceed to Eligibility <ArrowRight size={18} style={{ marginLeft: "8px" }} />
        </Button>
      </div>
    </div>
  );
}
