import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Send, FileText, CheckCircle2, ArrowRight } from "lucide-react";
import { api } from "../../api";
import { Card, Button, DocumentChecklist, DecisionBanner, AmountGrid } from "../Common";

export default function ClaimsScreen({ ctx }) {
  const navigate = useNavigate();
  const { caseState, updateCaseState } = ctx;
  
  const [loading, setLoading] = useState(true);
  const [claimDraft, setClaimDraft] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState("draft"); // 'draft', 'discharge', 'final', 'decision'
  
  // Status after submission
  const [claimStatus, setClaimStatus] = useState(null);
  const [polling, setPolling] = useState(false);

  const tabs = [
    { id: "draft", label: "Claim Draft" },
    { id: "discharge", label: "Discharge Claim" },
    { id: "final", label: "Final Claim" },
    { id: "decision", label: "Claim Decision" }
  ];

  useEffect(() => {
    const loadDraft = async () => {
      setLoading(true);
      try {
        const res = await api.prepareClaimDraft({
          claim_id: caseState.draftData?.claim_id || Date.now()
        });
        setClaimDraft(res);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    
    if (!caseState.claimResponse) {
      loadDraft();
    } else {
      setLoading(false);
      setActiveTab("decision");
      setPolling(true);
    }
  }, [caseState.claimResponse, caseState.draftData]);

  useEffect(() => {
    let intervalId;
    if (polling && caseState.claimResponse?.correlation_id) {
      const pollStatus = async () => {
        try {
          const res = await api.getClaimStatus(caseState.claimResponse.correlation_id);
          setClaimStatus(res);
          if (res.status === "complete" || res.status === "failed") {
            setPolling(false);
            clearInterval(intervalId);
          }
        } catch (err) {
          console.error(err);
          setPolling(false);
          clearInterval(intervalId);
        }
      };
      pollStatus();
      intervalId = setInterval(pollStatus, 3000);
    }
    return () => { if (intervalId) clearInterval(intervalId); };
  }, [polling, caseState.claimResponse]);

  const handleSubmitDischarge = async () => {
    setSubmitting(true);
    try {
      const res = await api.submitDischargeClaim({
        claim_id: claimDraft.claim_id,
        supporting_documents: claimDraft.supporting_documents
      });
      // Just moving to the next tab for UI flow
      setActiveTab("final");
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitFinal = async () => {
    setSubmitting(true);
    try {
      const res = await api.submitFinalClaim({
        claim_id: claimDraft.claim_id,
        supporting_documents: claimDraft.supporting_documents
      });
      updateCaseState({ claimResponse: res });
      setActiveTab("decision");
      setPolling(true);
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpload = (docToUpload) => {
    const updatedDocs = claimDraft.supporting_documents.map(d => 
      d.code === docToUpload.code ? { ...d, url: "https://mock-url.com/doc.pdf" } : d
    );
    setClaimDraft({ ...claimDraft, supporting_documents: updatedDocs });
  };

  const hasMissingDocs = claimDraft?.supporting_documents?.some(d => !d.optional && !d.url);

  if (loading) {
    return <div className="flex-center py-20 flex-col"><div className="spinner mb-4" /><p className="text-muted">Generating Claim Draft...</p></div>;
  }

  return (
    <div className="wizard-step">
      {/* Tabs Header */}
      <div style={{ display: "flex", gap: "8px", borderBottom: "1px solid var(--border-color)", paddingBottom: "16px", marginBottom: "24px", overflowX: "auto" }}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: "10px 20px",
              background: activeTab === tab.id ? "var(--primary)" : "transparent",
              color: activeTab === tab.id ? "white" : "var(--text-muted)",
              border: `1px solid ${activeTab === tab.id ? "var(--primary)" : "var(--border-color)"}`,
              borderRadius: "20px",
              cursor: "pointer",
              fontWeight: activeTab === tab.id ? 600 : 400,
              whiteSpace: "nowrap",
              transition: "all 0.2s"
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="tab-content">
        {activeTab === "draft" && (
          <Card title="Final Claim Details">
            <div style={{ display: "flex", gap: "24px", marginBottom: "20px" }}>
              <div>
                <div style={{ fontSize: "11px", color: "var(--text-muted)", fontWeight: 700, textTransform: "uppercase" }}>Admission</div>
                <div style={{ fontWeight: 600 }}>{claimDraft?.admission_date}</div>
              </div>
              <div>
                <div style={{ fontSize: "11px", color: "var(--text-muted)", fontWeight: 700, textTransform: "uppercase" }}>Discharge</div>
                <div style={{ fontWeight: 600 }}>{claimDraft?.discharge_date}</div>
              </div>
              <div>
                <div style={{ fontSize: "11px", color: "var(--text-muted)", fontWeight: 700, textTransform: "uppercase" }}>Preauth Ref</div>
                <div style={{ fontWeight: 600 }}>{claimDraft?.preauth_ref}</div>
              </div>
            </div>

            <div className="table-responsive-wrapper">
              <table className="table-modern" style={{ fontSize: "13px" }}>
                <thead>
                  <tr>
                    <th>Final Bill Items</th>
                    <th>Qty</th>
                    <th style={{ textAlign: "right" }}>Net Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {claimDraft?.items?.map((item, i) => (
                    <tr key={i}>
                      <td>{item.service_name}</td>
                      <td>{item.quantity}</td>
                      <td style={{ textAlign: "right", fontWeight: 700 }}>₹{item.net_amount?.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "24px" }}>
              <Button variant="primary" onClick={() => setActiveTab("discharge")}>Proceed to Discharge Docs <ArrowRight size={16} style={{ marginLeft: "8px" }} /></Button>
            </div>
          </Card>
        )}

        {activeTab === "discharge" && (
          <Card title="Discharge Documents">
            <DocumentChecklist documents={claimDraft?.supporting_documents} onUpload={handleUpload} />
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: "24px" }}>
              <Button variant="text" onClick={() => setActiveTab("draft")}>Back</Button>
              <Button 
                variant="primary" 
                disabled={hasMissingDocs || submitting}
                onClick={handleSubmitDischarge}
              >
                {submitting ? "Submitting..." : "Submit Discharge & Proceed"}
              </Button>
            </div>
          </Card>
        )}

        {activeTab === "final" && (
          <Card>
            <div style={{ textAlign: "center", marginBottom: "16px" }}>
              <div style={{ fontSize: "12px", color: "var(--text-muted)", fontWeight: 700, textTransform: "uppercase", marginBottom: "8px" }}>Final Claim Total</div>
              <div style={{ fontSize: "32px", fontWeight: 800, color: "var(--primary)" }}>₹{claimDraft?.total_amount?.toLocaleString()}</div>
            </div>
            
            <div style={{ display: "flex", justifyContent: "center", marginBottom: "24px" }}>
              <Button 
                variant="primary" 
                size="large"
                icon={Send} 
                disabled={submitting}
                onClick={handleSubmitFinal}
              >
                {submitting ? "Submitting..." : "Submit Final Claim"}
              </Button>
            </div>
          </Card>
        )}

        {activeTab === "decision" && (
          <div>
            {!claimStatus || polling ? (
              <Card className="mb-6">
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <div className="spinner" style={{ width: "24px", height: "24px" }} />
                  <div>
                    <div style={{ fontWeight: 700 }}>Claim Adjudication in Progress</div>
                    <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>Awaiting response from payer...</div>
                  </div>
                </div>
              </Card>
            ) : (
              <>
                <DecisionBanner 
                  decision={claimStatus?.decision} 
                  approvedAmount={claimStatus?.approved_amount}
                />
                <Card title="Adjudication Summary" className="mb-6">
                  <AmountGrid totals={claimStatus?.totals} />
                </Card>
                
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <Button variant="outline" onClick={() => navigate("/")}>Save & Close</Button>
                  <div style={{ display: "flex", gap: "12px" }}>
                    <Button variant="outline" onClick={() => navigate("../reprocess")}>Appeal / Reprocess</Button>
                    <Button variant="primary" onClick={() => navigate("../payment")}>
                      Proceed to Payment <ArrowRight size={18} style={{ marginLeft: "8px" }} />
                    </Button>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
