import { useState, useEffect } from "react";
import { Search, CreditCard, CheckCircle, AlertCircle, Clock, Landmark, Wallet } from "lucide-react";
import { PageHeader, Card, StatusBadge, Input, SkeletonTable } from "./Common";
import { api } from "../api";
import { useNavigate } from "react-router-dom";

const METRICS = [
  { key: "settledThisMonth", label: "Settled This Month", icon: CheckCircle, color: "var(--success)", format: "currency" },
  { key: "pendingAck",       label: "Pending Acknowledgement", icon: Clock,  color: "var(--warning)", format: "count" },
  { key: "totalTds",         label: "TDS Deducted",       icon: Landmark,   color: "var(--error)",   format: "currency" },
  { key: "totalNetSettled",  label: "Total Net Settled",  icon: Wallet,     color: "var(--primary)", format: "currency" },
];

function computePaymentMetrics(payments) {
  const now = new Date();
  const isThisMonth = (d) => {
    const date = d ? new Date(d) : null;
    return date && date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
  };
  const settled = payments.filter((p) => p.acknowledgement_status === "submitted");
  return {
    settledThisMonth: settled.filter((p) => isThisMonth(p.payment_date)).reduce((s, p) => s + (p.net_payment_amount ?? 0), 0),
    pendingAck: payments.filter((p) => p.acknowledgement_status !== "submitted").length,
    totalTds: payments.reduce((s, p) => s + (p.tds_amount ?? 0), 0),
    totalNetSettled: settled.reduce((s, p) => s + (p.net_payment_amount ?? 0), 0),
  };
}

export default function Payments() {
  const navigate = useNavigate();
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    const fetchPayments = async () => {
      setLoading(true);
      setLoadError(false);
      try {
        const response = await api.searchPaymentStatus();
        setPayments(response?.events || []);
      } catch (err) {
        console.error(err);
        setLoadError(true);
      } finally {
        setLoading(false);
      }
    };
    fetchPayments();
  }, []);

  const filtered = payments.filter(
    (p) =>
      p.claim_reference?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.payment_reference?.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  return (
    <div className="payments-screen">
      <PageHeader
        title="Payment Reconciliation"
        subtitle="Track payment settlements, UTRs, and TDS deductions from payers."
      />

      {loadError && (
        <div className="inline-error-banner">
          <AlertCircle size={16} />
          Could not load payment events. Showing the last known results, if any.
        </div>
      )}

      {!loading && payments.length > 0 && (() => {
        const metrics = computePaymentMetrics(payments);
        return (
          <div className="metrics-grid-responsive">
            {METRICS.map((m) => (
              <div key={m.key} className="dx-stat-card">
                <div className="dx-stat-top">
                  <div className="dx-stat-icon" style={{ background: `color-mix(in srgb, ${m.color} 16%, transparent)`, color: m.color }}>
                    <m.icon size={14} />
                  </div>
                  <div className="dx-stat-value">
                    {m.format === "currency" ? `₹${Math.round(metrics[m.key]).toLocaleString()}` : metrics[m.key]}
                  </div>
                </div>
                <div className="dx-stat-label">{m.label}</div>
              </div>
            ))}
          </div>
        );
      })()}

      <Card className="mb-6">
        <div style={{ maxWidth: "400px" }}>
          <Input
            icon={Search}
            placeholder="Search claim ref or payment ref..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </Card>

      {loading ? (
        <Card title="Payment Events">
          <SkeletonTable rows={5} cols={9} />
        </Card>
      ) : filtered.length === 0 ? (
        <div className="empty-view py-20 text-center">
          <CreditCard
            size={48}
            className="text-muted mb-4 mx-auto"
            style={{ opacity: 0.5 }}
          />
          <h3>No Payments Found</h3>
          <p className="text-muted mt-2">No matching payment records.</p>
        </div>
      ) : (
        <Card title="Payment Events">
          <div className="table-responsive-wrapper">
            <table className="table-modern">
              <thead>
                <tr>
                  <th>Payment Ref</th>
                  <th>Claim Ref</th>
                  <th>Date</th>
                  <th>Stage</th>
                  <th>Gross Amt</th>
                  <th>TDS</th>
                  <th>Net Payment</th>
                  <th>UTR</th>
                  <th>Ack Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((pay, i) => (
                  <tr key={i}>
                    <td className="mono-cell" style={{ fontWeight: 700 }}>{pay.payment_reference}</td>
                    <td>
                      <a
                        href="#"
                        onClick={(e) => {
                          e.preventDefault();
                          navigate(`/dashboard?q=${encodeURIComponent(pay.claim_reference)}`);
                        }}
                        title="Find this claim in the dashboard"
                      >
                        {pay.claim_reference}
                      </a>
                    </td>
                    <td className="mono-cell">{pay.payment_date}</td>
                    <td>
                      <StatusBadge
                        status={pay.payment_stage?.replace("PAYMENT_", "")}
                      />
                    </td>
                    <td className="mono-cell">₹{pay.gross_amount?.toLocaleString()}</td>
                    <td className="mono-cell" style={{ color: "var(--error)" }}>
                      -₹{pay.tds_amount?.toLocaleString()}
                    </td>
                    <td className="mono-cell" style={{ fontWeight: 800, color: "var(--success)" }}>
                      ₹{pay.net_payment_amount?.toLocaleString()}
                    </td>
                    <td>
                      {pay.utr ? (
                        <code>{pay.utr}</code>
                      ) : (
                        <span className="text-muted">-</span>
                      )}
                    </td>
                    <td>
                      {pay.acknowledgement_status === "submitted" ? (
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "4px",
                            color: "var(--success)",
                            fontSize: "11px",
                            fontWeight: 600,
                          }}
                        >
                          <CheckCircle size={12} /> ACKNOWLEDGED
                        </div>
                      ) : (
                        <span
                          className="badge-modern badge-warning"
                          style={{ fontSize: "10px" }}
                        >
                          PENDING
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              {filtered.length > 1 && (
                <tfoot>
                  <tr>
                    <td colSpan={4} style={{ fontSize: "12px", color: "var(--text-muted)", fontWeight: 600 }}>
                      {filtered.length} payments
                    </td>
                    <td className="mono-cell" style={{ fontWeight: 700 }}>
                      ₹{filtered.reduce((s, p) => s + (p.gross_amount ?? 0), 0).toLocaleString()}
                    </td>
                    <td className="mono-cell" style={{ color: "var(--error)", fontWeight: 700 }}>
                      -₹{filtered.reduce((s, p) => s + (p.tds_amount ?? 0), 0).toLocaleString()}
                    </td>
                    <td className="mono-cell" style={{ color: "var(--success)", fontWeight: 800 }}>
                      ₹{filtered.reduce((s, p) => s + (p.net_payment_amount ?? 0), 0).toLocaleString()}
                    </td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
