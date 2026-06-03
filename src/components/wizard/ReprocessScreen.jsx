import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Send, ArrowRight } from "lucide-react";
import { api } from "../../api";
import { Card, Button, Input, DecisionBanner } from "../Common";

export default function ReprocessScreen({ ctx }) {
  const navigate = useNavigate();
  const { caseState } = ctx;
  
  const [submitting, setSubmitting] = useState(false);
  const [reprocessReason, setReprocessReason] = useState("");
  const [uploaded, setUploaded] = useState(false);
  
  const [status, setStatus] = useState(null);
  const [polling, setPolling] = useState(false);

  useEffect(() => {
    let intervalId;
    if (polling && caseState.claimResponse?.correlation_id) {
      const pollStatus = async () => {
        try {
          const res = await api.getReprocessStatus(caseState.claimResponse.correlation_id);
          setStatus(res);
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

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      await api.submitReprocess({
        claim_id: caseState.claimResponse?.claim_id || Date.now(),
        reason: reprocessReason
      });
      setPolling(true);
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  if (polling || status) {
    const isComplete = status?.status === "complete";
    return (
      <div className="wizard-step">
        {!isComplete ? (
          <Card className="mb-6">
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <div className="spinner" style={{ width: "24px", height: "24px" }} />
              <div>
                <div style={{ fontWeight: 700 }}>Appeal in Progress</div>
                <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>Awaiting payer response to appeal...</div>
              </div>
            </div>
          </Card>
        ) : (
          <>
            <DecisionBanner 
              decision={status?.decision} 
              message={status?.process_notes?.[0]?.text}
            />
            
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: "24px" }}>
              <Button variant="outline" onClick={() => navigate("/")}>Save & Close</Button>
              <Button variant="primary" onClick={() => navigate("../payment")}>
                Proceed to Payment <ArrowRight size={18} style={{ marginLeft: "8px" }} />
              </Button>
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="wizard-step">
      <div className="grid-1-to-2" style={{ gap: "24px" }}>
        <Card title="File an Appeal (Reprocess)">
          <p className="text-muted" style={{ fontSize: "14px", marginBottom: "20px" }}>
            If the claim was partially approved or rejected and you have additional justification or missing documents, you can request a reprocessing of the claim.
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <div>
              <label className="input-label-modern">Reason for Appeal</label>
              <textarea 
                className="input-modern"
                style={{ height: "100px", resize: "vertical" }}
                placeholder="Explain why the claim should be re-evaluated..."
                value={reprocessReason}
                onChange={(e) => setReprocessReason(e.target.value)}
              />
            </div>
          </div>
        </Card>
        
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          <Card title="Supporting Evidence">
            <div className="warning-banner mb-4" style={{ background: "rgba(245,158,11,0.1)", color: "var(--warning)" }}>
              Ensure you upload any documents requested in the payer's rejection notes.
            </div>
            <div className="doc-row" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px", border: "1px solid var(--border-color)", borderRadius: "8px" }}>
              <span style={{ fontSize: "14px", fontWeight: 600 }}>Justification Letter</span>
              {uploaded ? (
                <span className="badge-modern badge-success" style={{ fontSize: '10px' }}>Attached</span>
              ) : (
                <Button variant="outline" size="small" onClick={() => setUploaded(true)}>Upload</Button>
              )}
            </div>
          </Card>

          <Card>
            <Button 
              variant="primary" 
              className="w-full" 
              icon={Send}
              disabled={!reprocessReason || submitting}
              onClick={handleSubmit}
              style={{ justifyContent: "center" }}
            >
              {submitting ? "Submitting..." : "Submit Appeal"}
            </Button>
          </Card>
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", marginTop: "24px" }}>
        <Button variant="text" onClick={() => navigate("../claim")}>← Back to Claim</Button>
        <Button variant="outline" onClick={() => navigate("../payment")}>Skip to Payment <ArrowRight size={18} style={{ marginLeft: "8px" }} /></Button>
      </div>
    </div>
  );
}
