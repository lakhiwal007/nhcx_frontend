import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle2, Home } from "lucide-react";
import { api } from "../../api";
import { Card, Button, StatusBadge } from "../Common";

export default function PaymentReconciliation({ ctx }) {
  const navigate = useNavigate();
  const { caseState } = ctx;
  
  const [loading, setLoading] = useState(true);
  const [paymentData, setPaymentData] = useState(null);

  useEffect(() => {
    const fetchPayment = async () => {
      setLoading(true);
      try {
        const res = await api.getPaymentStatus(caseState.claimResponse?.correlation_id || "demo-payment-id");
        setPaymentData(res);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchPayment();
  }, [caseState.claimResponse]);

  const handleAcknowledge = async (payRef) => {
    try {
      await api.acknowledgePayment({ payment_reference: payRef });
      alert("Payment acknowledged successfully.");
      // In real app, refresh status
    } catch (err) {
      console.error(err);
    }
  };

  if (loading) {
    return <div className="flex-center py-20 flex-col"><div className="spinner mb-4" /><p className="text-muted">Fetching Payment Status...</p></div>;
  }

  return (
    <div className="wizard-step">
      <Card title="Case Payment Reconciliation">
        {(!paymentData || paymentData.total_events === 0) ? (
          <div className="empty-view py-10 text-center">
            <h3>No Payments Yet</h3>
            <p className="text-muted">No payment events have been received for this claim yet.</p>
          </div>
        ) : (
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "24px", padding: "16px", background: "rgba(16,185,129,0.1)", borderRadius: "12px", border: "1px solid var(--success)" }}>
              <CheckCircle2 color="var(--success)" size={28} />
              <div>
                <div style={{ fontWeight: 800, fontSize: "16px", color: "var(--success)" }}>Latest Stage: {paymentData.latest_stage?.replace('PAYMENT_', '')}</div>
                <div style={{ fontSize: "13px" }}>All payment events for this case are shown below.</div>
              </div>
            </div>

            <div className="table-responsive-wrapper">
              <table className="table-modern">
                <thead>
                  <tr>
                    <th>Payment Ref</th>
                    <th>Date</th>
                    <th>Stage</th>
                    <th>Gross Amt</th>
                    <th>TDS</th>
                    <th>Net Amount</th>
                    <th>UTR</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {paymentData.events?.map((pay, i) => (
                    <tr key={i}>
                      <td style={{ fontWeight: 700 }}>{pay.payment_reference}</td>
                      <td>{pay.payment_date}</td>
                      <td><StatusBadge status={pay.payment_stage?.replace('PAYMENT_', '')} /></td>
                      <td>₹{pay.gross_amount?.toLocaleString()}</td>
                      <td style={{ color: "var(--error)" }}>-₹{pay.tds_amount?.toLocaleString()}</td>
                      <td style={{ fontWeight: 800, color: "var(--success)" }}>₹{pay.net_payment_amount?.toLocaleString()}</td>
                      <td>{pay.utr ? <code>{pay.utr}</code> : <span className="text-muted">—</span>}</td>
                      <td>
                        <Button 
                          size="small" 
                          variant={pay.acknowledgement_status === 'submitted' ? "text" : "outline"}
                          disabled={pay.acknowledgement_status === 'submitted'}
                          onClick={() => handleAcknowledge(pay.payment_reference)}
                        >
                          {pay.acknowledgement_status === 'submitted' ? "Acknowledged" : "Acknowledge"}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Card>

      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "24px" }}>
        <Button variant="primary" onClick={() => navigate("/")} icon={Home}>
          Done & Return to Dashboard
        </Button>
      </div>
    </div>
  );
}
