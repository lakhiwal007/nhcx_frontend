import { useState, useEffect } from "react";
import { Search, CreditCard, CheckCircle, AlertCircle, Clock, Landmark, Wallet, LayoutGrid, List } from "lucide-react";
import { Card, StatusBadge, Input, SkeletonTable, EmptyState } from "./Common";
import { api } from "../api";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";

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
  const [viewMode, setViewMode] = useState(() => localStorage.getItem("payments_viewMode") || "table");
  const [sortBy, setSortBy] = useState("newest");
  
  useEffect(() => { localStorage.setItem("payments_viewMode", viewMode); }, [viewMode]);

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
  ).sort((a, b) => {
    const dA = Date.parse(a.payment_date) || 0;
    const dB = Date.parse(b.payment_date) || 0;
    const nA = a.net_payment_amount || 0;
    const nB = b.net_payment_amount || 0;
    const tA = a.tds_amount || 0;
    const tB = b.tds_amount || 0;
    if (sortBy === "oldest") return dA - dB;
    if (sortBy === "highest_amount") return nB - nA;
    if (sortBy === "highest_tds") return tB - tA;
    return dB - dA;
  });

  return (
    <div className="payments-screen">
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
              <motion.div whileHover={{ y: -4, boxShadow: "0 12px 24px -8px rgba(0,0,0,0.15)" }} key={m.key} className="dx-stat-card" style={{ transition: "box-shadow 0.2s ease" }}>
                <div className="dx-stat-top">
                  <div className="dx-stat-icon" style={{ background: `color-mix(in srgb, ${m.color} 16%, transparent)`, color: m.color }}>
                    <m.icon size={14} />
                  </div>
                  <div className="dx-stat-value">
                    {m.format === "currency" ? `₹${Math.round(metrics[m.key]).toLocaleString()}` : metrics[m.key]}
                  </div>
                </div>
                <div className="dx-stat-label">{m.label}</div>
              </motion.div>
            ))}
          </div>
        );
      })()}

      <Card className="mb-6">
        <div style={{ display: "flex", flexWrap: "wrap", gap: "12px", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ flex: 1, minWidth: "280px", maxWidth: "400px" }}>
            <Input
              icon={Search}
              placeholder="Search claim ref or payment ref..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <select
              className="input-modern"
              style={{ width: "auto", minWidth: "160px" }}
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
            >
              <option value="newest">Newest First</option>
              <option value="oldest">Oldest First</option>
              <option value="highest_amount">Highest Amount</option>
              <option value="highest_tds">Highest TDS</option>
            </select>
            <div style={{ display: "flex", background: "var(--bg-card)", border: "1px solid var(--border-color)", borderRadius: "var(--radius-md)", padding: "4px", gap: "4px" }}>
              <button
                title="Grid View"
                onClick={() => setViewMode("grid")}
                style={{ padding: "6px 12px", background: viewMode === "grid" ? "var(--bg-main)" : "transparent", color: viewMode === "grid" ? "var(--text-main)" : "var(--text-muted)", border: viewMode === "grid" ? "1px solid var(--border-color)" : "1px solid transparent", borderRadius: "var(--radius-sm)", cursor: "pointer", display: "flex", alignItems: "center", boxShadow: viewMode === "grid" ? "0 1px 3px rgba(0,0,0,0.05)" : "none", transition: "all 0.2s ease" }}
              >
                <LayoutGrid size={16} />
              </button>
              <button
                title="Table View"
                onClick={() => setViewMode("table")}
                style={{ padding: "6px 12px", background: viewMode === "table" ? "var(--bg-main)" : "transparent", color: viewMode === "table" ? "var(--text-main)" : "var(--text-muted)", border: viewMode === "table" ? "1px solid var(--border-color)" : "1px solid transparent", borderRadius: "var(--radius-sm)", cursor: "pointer", display: "flex", alignItems: "center", boxShadow: viewMode === "table" ? "0 1px 3px rgba(0,0,0,0.05)" : "none", transition: "all 0.2s ease" }}
              >
                <List size={16} />
              </button>
            </div>
          </div>
        </div>
      </Card>

      {loading ? (
        <Card title="Payment Events">
          <SkeletonTable rows={5} cols={9} />
        </Card>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={CreditCard}
          iconOpacity={0.5}
          title="No Payments Found"
          description="No matching payment records."
        />
      ) : viewMode === "grid" ? (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "16px" }}>
          {filtered.map((pay, i) => (
            <motion.div
              key={pay.payment_reference || i}
              layout
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              whileHover={{ y: -4, boxShadow: "0 12px 24px -8px rgba(0,0,0,0.15)" }}
              className="card-modern"
              style={{
                padding: "16px",
                display: "flex",
                flexDirection: "column",
                gap: "12px",
                transition: "box-shadow 0.2s ease",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "8px" }}>
                <div>
                  <div style={{ fontSize: "11px", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 700 }}>Claim Ref</div>
                  <a href="#" onClick={(e) => { e.preventDefault(); navigate(`/dashboard?q=${encodeURIComponent(pay.claim_reference)}`); }} style={{ fontWeight: 700, fontSize: "15px" }}>
                    {pay.claim_reference}
                  </a>
                </div>
                <StatusBadge status={pay.payment_stage?.replace("PAYMENT_", "")} />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "12px" }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "var(--text-muted)" }}>Payment Ref:</span>
                  <span className="mono-cell" style={{ fontWeight: 600 }}>{pay.payment_reference}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "var(--text-muted)" }}>Date:</span>
                  <span>{pay.payment_date}</span>
                </div>
                {pay.utr && (
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "var(--text-muted)" }}>UTR:</span>
                    <span className="mono-cell" style={{ color: "var(--primary)", fontWeight: 600 }}>{pay.utr}</span>
                  </div>
                )}
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: "4px", paddingTop: "8px", borderTop: "1px dashed var(--border-color)" }}>
                  <span style={{ color: "var(--text-muted)" }}>Gross Amount:</span>
                  <span className="mono-cell">₹{pay.gross_amount?.toLocaleString()}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "var(--text-muted)" }}>TDS Deducted:</span>
                  <span className="mono-cell" style={{ color: "var(--error)" }}>-₹{pay.tds_amount?.toLocaleString()}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: "4px", paddingTop: "8px", borderTop: "1px dashed var(--border-color)" }}>
                  <span style={{ fontWeight: 700 }}>Net Payment:</span>
                  <span className="mono-cell" style={{ fontWeight: 800, color: "var(--success)", fontSize: "14px" }}>₹{pay.net_payment_amount?.toLocaleString()}</span>
                </div>
              </div>
              <div style={{ marginTop: "auto", paddingTop: "12px" }}>
                {pay.acknowledgement_status === "submitted" ? (
                  <div style={{ display: "inline-flex", alignItems: "center", gap: "4px", color: "var(--success)", fontSize: "11px", fontWeight: 700, background: "var(--success-light)", padding: "4px 8px", borderRadius: "4px" }}>
                    <CheckCircle size={12} /> ACKNOWLEDGED
                  </div>
                ) : (
                  <div style={{ display: "inline-flex", alignItems: "center", gap: "4px", color: "var(--warning)", fontSize: "11px", fontWeight: 700, background: "var(--warning-light)", padding: "4px 8px", borderRadius: "4px" }}>
                    <Clock size={12} /> PENDING ACKNOWLEDGEMENT
                  </div>
                )}
              </div>
            </motion.div>
          ))}
        </motion.div>
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
                  <tr key={pay.payment_reference || i}>
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
