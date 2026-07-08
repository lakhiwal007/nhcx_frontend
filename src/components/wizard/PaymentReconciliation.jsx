import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle2, Home, RefreshCw, AlertCircle, Edit2, ChevronDown, ChevronUp } from "lucide-react";
import { api } from "../../api";
import { Card, Button, StatusBadge, EmptyState, LoadingBlock } from "../Common";

export default function PaymentReconciliation({ ctx }) {
  const navigate = useNavigate();
  const { caseState } = ctx;

  const claimId = caseState.claim_id || caseState.draftData?.claim_id;
  const claimCorrelationId = caseState.claimCorrelationId;

  const [loading, setLoading] = useState(true);
  const [paymentData, setPaymentData] = useState(null);
  const [acknowledging, setAcknowledging] = useState({});
  const [ackResults, setAckResults] = useState({});
  // Advanced ack override state keyed by payment_reference
  const [ackOverrides, setAckOverrides] = useState({});
  const [showOverrides, setShowOverrides] = useState({});

  const fetchPayment = async () => {
    if (!claimId && !claimCorrelationId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = claimId
        ? await api.searchPaymentStatus({ claim_id: claimId })
        : await api.getPaymentStatus(claimCorrelationId);
      setPaymentData(res);
    } catch (_) {
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPayment();
  }, []);

  const handleAcknowledge = async (event) => {
    const ref = event.payment_reference;
    setAcknowledging((prev) => ({ ...prev, [ref]: true }));
    try {
      const overrides = ackOverrides[ref] || {};
      const body = { payment_reference: ref };
      if (overrides.claim_number) body.claim_number = overrides.claim_number;
      if (overrides.amount_received) body.amount_received = Number(overrides.amount_received);
      if (overrides.utr) body.utr = overrides.utr;
      const res = await api.acknowledgePayment(body);
      setAckResults((prev) => ({ ...prev, [ref]: { success: true, correlation_id: res.correlation_id } }));
      await fetchPayment();
    } catch (err) {
      setAckResults((prev) => ({ ...prev, [ref]: { success: false, message: err.message } }));
    } finally {
      setAcknowledging((prev) => ({ ...prev, [ref]: false }));
    }
  };

  const updateOverride = (ref, field, value) => {
    setAckOverrides((prev) => ({ ...prev, [ref]: { ...(prev[ref] || {}), [field]: value } }));
  };

  if (loading) {
    return <LoadingBlock text="Fetching payment status…" />;
  }

  const isNotFound = !paymentData || paymentData.status === "not_found" || paymentData.total_events === 0;

  return (
    <div className="wizard-step">
      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
          <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
            {paymentData?.settled && (
              <span className="badge-modern badge-success">SETTLED</span>
            )}
            {paymentData?.latest_stage && (
              <span className="badge-modern badge-info" style={{ fontSize: "11px" }}>
                {paymentData.latest_stage?.replace("PAYMENT_", "")}
              </span>
            )}
            {paymentData?.total_events != null && (
              <span style={{ fontSize: "13px", color: "var(--text-muted)" }}>
                {paymentData.total_events} event{paymentData.total_events !== 1 ? "s" : ""}
              </span>
            )}
          </div>
          <Button variant="outline" size="small" icon={RefreshCw} onClick={fetchPayment}>Refresh</Button>
        </div>

        {isNotFound ? (
          <EmptyState
            title="No Payment Events Yet"
            description="The payer initiates payment notices on their schedule - typically hours to days after claim approval. The backend will auto-acknowledge when it arrives."
          />
        ) : (
          <div>
            {paymentData?.settled && (
              <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "20px", padding: "14px 16px", background: "rgba(16,185,129,0.1)", borderRadius: "var(--radius-md)", border: "1px solid var(--success)" }}>
                <CheckCircle2 color="var(--success)" size={26} />
                <div>
                  <div style={{ fontWeight: 800, fontSize: "15px", color: "var(--success)" }}>Payment Settled</div>
                  <div style={{ fontSize: "13px", color: "var(--text-muted)" }}>All payment events for this claim are shown below.</div>
                </div>
              </div>
            )}

            <div className="table-responsive-wrapper">
              <table className="table-modern">
                <thead>
                  <tr>
                    <th>Payment Ref</th>
                    <th>Claim Ref</th>
                    <th>Date</th>
                    <th>Stage</th>
                    <th style={{ textAlign: "right" }}>Notice</th>
                    <th style={{ textAlign: "right" }}>Gross</th>
                    <th style={{ textAlign: "right" }}>TDS</th>
                    <th style={{ textAlign: "right" }}>Net Paid</th>
                    <th>UTR</th>
                    <th>Ack</th>
                  </tr>
                </thead>
                <tbody>
                  {paymentData.events?.map((pay, i) => {
                    const ref = pay.payment_reference;
                    const ackResult = ackResults[ref];
                    const isAcknowledging = acknowledging[ref];
                    const needsRetry = pay.acknowledgement_status === "failed" && !ackResult?.success;
                    const isOpen = showOverrides[ref];
                    return (
                      <>
                        <tr key={i}>
                          <td style={{ fontWeight: 700 }}>{ref}</td>
                          <td style={{ fontSize: "12px" }}>{pay.claim_reference || <span className="text-muted">-</span>}</td>
                          <td style={{ fontSize: "12px" }}>{pay.payment_date || "-"}</td>
                          <td>
                            <StatusBadge status={pay.payment_stage?.replace("PAYMENT_", "").toLowerCase()} />
                          </td>
                          <td style={{ textAlign: "right", color: "var(--text-muted)" }}>
                            {pay.notice_amount != null ? `₹${pay.notice_amount?.toLocaleString()}` : "-"}
                          </td>
                          <td style={{ textAlign: "right" }}>₹{pay.gross_amount?.toLocaleString()}</td>
                          <td style={{ textAlign: "right", color: "var(--error)" }}>-₹{pay.tds_amount?.toLocaleString()}</td>
                          <td style={{ textAlign: "right", fontWeight: 800, color: "var(--success)" }}>
                            ₹{pay.net_payment_amount?.toLocaleString()}
                          </td>
                          <td>{pay.utr ? <code style={{ fontSize: "11px" }}>{pay.utr}</code> : <span className="text-muted">-</span>}</td>
                          <td>
                            {pay.acknowledgement_status === "submitted" && !needsRetry ? (
                              <span className="badge-modern badge-success" style={{ fontSize: "10px" }}>Acked</span>
                            ) : pay.acknowledgement_status === "pending" ? (
                              <span className="badge-modern badge-info" style={{ fontSize: "10px" }}>Pending</span>
                            ) : (
                              <div>
                                <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                                  <Button
                                    size="small"
                                    variant="outline"
                                    disabled={isAcknowledging}
                                    onClick={() => handleAcknowledge(pay)}
                                  >
                                    {isAcknowledging ? "…" : "Retry Ack"}
                                  </Button>
                                  <button
                                    onClick={() => setShowOverrides((p) => ({ ...p, [ref]: !p[ref] }))}
                                    style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", display: "flex", alignItems: "center", padding: "2px" }}
                                    title="Edit values"
                                  >
                                    <Edit2 size={12} />
                                  </button>
                                </div>
                                {pay.acknowledgement_error && (
                                  <div style={{ fontSize: "10px", color: "var(--error)", marginTop: "4px" }}>{pay.acknowledgement_error}</div>
                                )}
                              </div>
                            )}
                            {ackResult && (
                              <div style={{ fontSize: "10px", color: ackResult.success ? "var(--success)" : "var(--error)", marginTop: "4px" }}>
                                {ackResult.success ? "Submitted ✓" : ackResult.message}
                              </div>
                            )}
                          </td>
                        </tr>
                        {/* Edit values row */}
                        {isOpen && (
                          <tr key={`${i}-overrides`} style={{ background: "var(--bg-main)" }}>
                            <td colSpan="10" style={{ padding: "12px 16px" }}>
                              <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "flex-end" }}>
                                <div>
                                  <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-muted)", marginBottom: "4px" }}>Claim Number</div>
                                  <input
                                    className="input-modern"
                                    style={{ fontSize: "12px", padding: "4px 8px", width: "160px" }}
                                    placeholder="Override claim number"
                                    value={ackOverrides[ref]?.claim_number || ""}
                                    onChange={(e) => updateOverride(ref, "claim_number", e.target.value)}
                                  />
                                </div>
                                <div>
                                  <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-muted)", marginBottom: "4px" }}>Amount Received</div>
                                  <input
                                    className="input-modern"
                                    style={{ fontSize: "12px", padding: "4px 8px", width: "130px" }}
                                    type="number"
                                    placeholder="Override amount"
                                    value={ackOverrides[ref]?.amount_received || ""}
                                    onChange={(e) => updateOverride(ref, "amount_received", e.target.value)}
                                  />
                                </div>
                                <div>
                                  <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-muted)", marginBottom: "4px" }}>UTR</div>
                                  <input
                                    className="input-modern"
                                    style={{ fontSize: "12px", padding: "4px 8px", width: "180px" }}
                                    placeholder="Override UTR"
                                    value={ackOverrides[ref]?.utr || ""}
                                    onChange={(e) => updateOverride(ref, "utr", e.target.value)}
                                  />
                                </div>
                                <button
                                  onClick={() => setShowOverrides((p) => ({ ...p, [ref]: false }))}
                                  style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", fontSize: "12px", padding: "4px 8px" }}
                                >
                                  Done
                                </button>
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Card>

      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "24px" }}>
        <Button variant="primary" onClick={() => navigate("/dashboard")} icon={Home}>
          Done & Return to Dashboard
        </Button>
      </div>
    </div>
  );
}
