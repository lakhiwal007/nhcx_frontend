import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, RefreshCw, PlusCircle, AlertCircle } from "lucide-react";
import { api } from "../../api";
import { Card, Button, DecisionBanner, AmountGrid, StatusBadge } from "../Common";
import PreauthEnhancement from "./PreauthEnhancement";

export default function PreauthStatus({ ctx }) {
  const navigate = useNavigate();
  const { caseState } = ctx;
  const { preauthResponse } = caseState;

  const [statusData, setStatusData] = useState(null);
  const [polling, setPolling] = useState(true);
  const [error, setError] = useState(null);
  const [showEnhancementModal, setShowEnhancementModal] = useState(false);

  useEffect(() => {
    if (!preauthResponse?.correlation_id) {
      // If we got here without submitting, maybe navigate back
      // navigate("../review");
      // For demo, we'll just wait or simulate
    }

    let intervalId;
    
    const pollStatus = async () => {
      try {
        const res = await api.getPreauthStatus(preauthResponse?.correlation_id || "demo-corr-id");
        setStatusData(res);
        
        // Stop polling if we reach a terminal state
        if (res.status === "complete" || res.status === "failed") {
          setPolling(false);
          clearInterval(intervalId);
        }
      } catch (err) {
        console.error(err);
        setError("Failed to fetch status");
        setPolling(false);
        clearInterval(intervalId);
      }
    };

    // Initial poll
    pollStatus();

    // Setup polling every 3 seconds
    if (polling) {
      intervalId = setInterval(pollStatus, 3000);
    }

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [preauthResponse, polling]);

  const handleManualRefresh = () => {
    setPolling(true);
  };

  if (!statusData && polling) {
    return (
      <div className="flex-center py-20 flex-col">
        <div className="spinner mb-4" />
        <h3 className="mb-2">Awaiting Payer Response</h3>
        <p className="text-muted">Correlation ID: {preauthResponse?.correlation_id || "Processing..."}</p>
        <p className="text-muted text-sm mt-4">Polling for updates... (Treating 202 as accepted, awaiting terminal state)</p>
      </div>
    );
  }

  const isComplete = statusData?.status === "complete";
  const isApproved = statusData?.decision === "APPROVED";
  const isQueried = statusData?.decision === "QUERIED";

  return (
    <div className="wizard-step">
      {!isComplete && (
        <Card className="mb-6">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <div className="spinner" style={{ width: "24px", height: "24px", borderTopColor: "var(--warning)" }} />
              <div>
                <div style={{ fontWeight: 700 }}>Request Pending at Payer</div>
                <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>Auto-refreshing status...</div>
              </div>
            </div>
            <Button variant="outline" size="small" icon={RefreshCw} onClick={handleManualRefresh}>Refresh Now</Button>
          </div>
        </Card>
      )}

      {isComplete && (
        <>
          <DecisionBanner 
            decision={statusData?.decision} 
            approvedAmount={statusData?.totals?.benefit?.value}
            message={statusData?.process_notes?.[0]?.text}
          />

          <Card title="Adjudication Breakdown" className="mb-6">
            <AmountGrid totals={statusData?.totals} />
            
            {statusData?.items?.length > 0 && (
              <div className="table-responsive-wrapper mt-4">
                <table className="table-modern" style={{ fontSize: "13px" }}>
                  <thead>
                    <tr>
                      <th>Line Item Seq</th>
                      <th style={{ textAlign: "right" }}>Submitted</th>
                      <th style={{ textAlign: "right" }}>Eligible</th>
                      <th style={{ textAlign: "right" }}>Copay</th>
                      <th style={{ textAlign: "right" }}>Benefit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {statusData.items.map((item, i) => (
                      <tr key={i}>
                        <td>Seq #{item.sequence}</td>
                        <td style={{ textAlign: "right" }}>₹{item.adjudication?.submitted?.value?.toLocaleString()}</td>
                        <td style={{ textAlign: "right" }}>₹{item.adjudication?.eligible?.value?.toLocaleString()}</td>
                        <td style={{ textAlign: "right", color: "var(--error)" }}>₹{item.adjudication?.copay?.value?.toLocaleString()}</td>
                        <td style={{ textAlign: "right", fontWeight: 700, color: "var(--success)" }}>₹{item.adjudication?.benefit?.value?.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {isQueried && (
            <div className="warning-banner mb-6" style={{ background: "rgba(59,130,246,0.1)", border: "1px solid #3b82f6", display: "flex", gap: "12px" }}>
              <AlertCircle size={20} color="#3b82f6" style={{ flexShrink: 0 }} />
              <div>
                <div style={{ fontWeight: 700, color: "#3b82f6", marginBottom: "4px" }}>Payer Query Received</div>
                <p style={{ fontSize: "13px", margin: 0, color: "var(--text-main)" }}>
                  The payer has requested additional information. Please check your Work Queue to respond to this query with the required documents.
                </p>
                <Button size="small" variant="primary" className="mt-3" onClick={() => navigate("/work-queue")}>Go to Work Queue</Button>
              </div>
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "space-between", marginTop: "24px" }}>
            <Button variant="outline" onClick={() => navigate("/")}>Save & Close</Button>
            
            <div style={{ display: "flex", gap: "12px" }}>
              {isApproved && (
                <Button variant="outline" icon={PlusCircle} onClick={() => setShowEnhancementModal(true)}>
                  Request Enhancement
                </Button>
              )}
              <Button 
                variant="primary" 
                disabled={!isApproved}
                onClick={() => navigate("../claim")}
              >
                Proceed to Final Claim <ArrowRight size={18} style={{ marginLeft: "8px" }} />
              </Button>
            </div>
          </div>
        </>
      )}

      {/* Enhancement Modal */}
      <AnimatePresence>
        {showEnhancementModal && (
          <div style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }} 
              style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)" }}
              onClick={() => setShowEnhancementModal(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              style={{ position: "relative", background: "var(--bg-card)", width: "100%", maxWidth: "600px", padding: "24px", borderRadius: "16px", boxShadow: "var(--shadow-lg)", border: "1px solid var(--border-color)", zIndex: 101 }}
            >
              <h3 style={{ fontSize: "20px", fontWeight: 800, marginBottom: "16px" }}>Request Preauth Enhancement</h3>
              <PreauthEnhancement ctx={ctx} onClose={() => setShowEnhancementModal(false)} />
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
