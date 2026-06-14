import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Search, ArrowRight, Activity, FileText, CheckCircle,
  Clock, XCircle, AlertTriangle, Users,
} from "lucide-react";
import { api } from "../api";
import { PageHeader, Card, StatusBadge, Button, Input, SkeletonTable } from "./Common";
import { useNavigate } from "react-router-dom";

const METRICS = [
  { key: "total",           label: "Total Claims",         icon: FileText,      color: "var(--primary)",  filterStatus: null },
  { key: "preauth_pending", label: "Preauth Pending",       icon: Activity,      color: "var(--info)",     filterStatus: "pending" },
  { key: "pending",         label: "Awaiting Adjudication", icon: Clock,         color: "var(--warning)",  filterStatus: "pending" },
  { key: "partial",         label: "Partially Approved",    icon: AlertTriangle, color: "var(--warning)",  filterStatus: "partial" },
  { key: "complete",        label: "Approved / Complete",   icon: CheckCircle,   color: "var(--success)",  filterStatus: "complete" },
  { key: "failed",          label: "Failed / Rejected",     icon: XCircle,       color: "var(--error)",    filterStatus: "failed" },
];

function contextualAction(claim) {
  if (claim.payment_status === "PAYMENT_SETTLED") return { label: "View Payment", route: "payment" };
  if (claim.claim_decision === "APPROVED" || claim.claim_decision === "PARTIALLY_APPROVED") return { label: "View Payment", route: "payment" };
  if (claim.claim_decision === "QUERIED") return { label: "Respond to Query", route: "claim" };
  if (claim.claim_decision === "REJECTED") return { label: "Appeal / Reprocess", route: "reprocess" };
  if (claim.use_type === "claim") return { label: "View Claim", route: "claim" };
  if (claim.status === "draft") return { label: "Submit Preauth", route: "review" };
  if (claim.status === "pending" || claim.status === "complete") return { label: "View Preauth", route: "status" };
  return { label: "Open Case", route: "" };
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [claims, setClaims] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [statsData, claimsData] = await Promise.all([
          api.getDashboardStats(),
          api.getDashboardClaims(),
        ]);
        setStats(statsData);
        setClaims(claimsData?.claims || []);
      } catch (_) {
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const filteredClaims = claims.filter((c) => {
    const q = searchQuery.toLowerCase();
    const matchSearch =
      c.patient_name?.toLowerCase().includes(q) ||
      c.child_name?.toLowerCase().includes(q) ||
      c.id?.toString().includes(q);
    const matchStatus = !statusFilter || c.status === statusFilter;
    return matchSearch && matchStatus;
  });

  return (
    <div className="dashboard-screen">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
        <PageHeader title="Cashless Cases" subtitle="Overview of all active and past claims" />
        <Button variant="primary" onClick={() => navigate("/registry")}>
          New Cashless Case
        </Button>
      </div>

      {loading ? (
        <>
          <div className="metrics-grid-responsive">
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} style={{ padding: "18px 20px", background: "var(--bg-card)", border: "1px solid var(--border-color)", borderRadius: "var(--radius)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px" }}>
                  <span className="skeleton-line" style={{ width: 28, height: 28, borderRadius: 8, flexShrink: 0 }} />
                  <span className="skeleton-line" style={{ width: 44, height: 26 }} />
                </div>
                <span className="skeleton-line" style={{ width: "65%", height: 12 }} />
              </div>
            ))}
          </div>
          <div className="card-modern">
            <div className="card-header-modern">
              <span className="skeleton-line" style={{ width: 120, height: 16 }} />
            </div>
            <div className="card-body-modern">
              <div style={{ marginBottom: 20 }}>
                <span className="skeleton-line" style={{ width: 220, height: 36, borderRadius: 12 }} />
              </div>
              <SkeletonTable rows={6} cols={10} />
            </div>
          </div>
        </>
      ) : (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          {stats && (
            <div className="metrics-grid-responsive">
              {METRICS.map((m) => {
                const isActive = statusFilter === m.filterStatus && m.filterStatus !== null;
                return (
                  <motion.div
                    key={m.key}
                    whileHover={{ y: -2 }}
                    onClick={() => {
                      if (!m.filterStatus) { setStatusFilter(null); return; }
                      setStatusFilter(isActive ? null : m.filterStatus);
                    }}
                    style={{
                      padding: "18px 20px",
                      background: isActive ? `${m.color}10` : "var(--bg-card)",
                      border: `1px solid ${isActive ? m.color : "var(--border-color)"}`,
                      borderRadius: "var(--radius)",
                      cursor: m.filterStatus ? "pointer" : "default",
                      transition: "all 0.2s",
                      boxShadow: isActive ? `0 0 0 2px ${m.color}30` : "var(--shadow)",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "8px" }}>
                      <div style={{ padding: "6px", borderRadius: "8px", background: `${m.color}15`, color: m.color, display: "flex" }}>
                        <m.icon size={18} />
                      </div>
                      <div style={{ fontSize: "28px", fontWeight: 800, color: "var(--text-main)", fontFamily: "Outfit, sans-serif" }}>
                        {stats.claims?.[m.key] ?? 0}
                      </div>
                    </div>
                    <div style={{ fontSize: "12px", color: "var(--text-muted)", fontWeight: 600 }}>{m.label}</div>
                  </motion.div>
                );
              })}

              <motion.div
                style={{ padding: "18px 20px", background: "var(--bg-card)", border: "1px solid var(--border-color)", borderRadius: "var(--radius)", boxShadow: "var(--shadow)" }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "8px" }}>
                  <div style={{ padding: "6px", borderRadius: "8px", background: "rgba(129,140,248,0.15)", color: "var(--accent)", display: "flex" }}>
                    <Users size={18} />
                  </div>
                  <div style={{ fontSize: "28px", fontWeight: 800, color: "var(--text-main)", fontFamily: "Outfit, sans-serif" }}>
                    {stats.children?.with_claims ?? 0}
                  </div>
                </div>
                <div style={{ fontSize: "12px", color: "var(--text-muted)", fontWeight: 600 }}>Children with Claims</div>
              </motion.div>
            </div>
          )}

          <Card title="Recent Claims">
            <div style={{ display: "flex", gap: "12px", marginBottom: "20px", alignItems: "center" }}>
              <div style={{ flex: 1, maxWidth: "360px" }}>
                <Input
                  icon={Search}
                  placeholder="Search patient or claim ID…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              {statusFilter && (
                <button
                  onClick={() => setStatusFilter(null)}
                  style={{ fontSize: "12px", fontWeight: 600, color: "var(--primary)", background: "var(--primary-light)", border: "1px solid var(--primary)", borderRadius: "20px", padding: "6px 14px", cursor: "pointer" }}
                >
                  {statusFilter} ×
                </button>
              )}
            </div>

            <div className="table-responsive-wrapper">
              <table className="table-modern">
                <thead>
                  <tr>
                    <th>Claim ID</th>
                    <th>Patient</th>
                    <th>Use Type</th>
                    <th>Status</th>
                    <th>Decision</th>
                    <th style={{ textAlign: "right" }}>Approved</th>
                    <th>Payment</th>
                    <th>UTR</th>
                    <th>Submitted</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredClaims.map((claim) => {
                    const { label, route } = contextualAction(claim);
                    return (
                      <tr key={claim.id}>
                        <td style={{ fontWeight: 700 }}>#{claim.id}</td>
                        <td style={{ fontWeight: 600 }}>{claim.patient_name || claim.child_name}</td>
                        <td>
                          <span className="badge-modern badge-info" style={{ textTransform: "capitalize" }}>
                            {claim.use_type}
                          </span>
                        </td>
                        <td><StatusBadge status={claim.status} /></td>
                        <td>
                          {claim.claim_decision
                            ? <StatusBadge status={claim.claim_decision} />
                            : <span className="text-muted">—</span>}
                        </td>
                        <td style={{ textAlign: "right", fontWeight: 700, color: "var(--success)" }}>
                          {claim.approved_amount != null
                            ? `₹${claim.approved_amount.toLocaleString()}`
                            : <span className="text-muted">—</span>}
                        </td>
                        <td>
                          {claim.payment_status
                            ? <StatusBadge status={claim.payment_status.replace("PAYMENT_", "").toLowerCase()} />
                            : <span className="text-muted">—</span>}
                        </td>
                        <td>
                          {claim.latest_utr
                            ? <code style={{ fontSize: "11px" }}>{claim.latest_utr}</code>
                            : <span className="text-muted">—</span>}
                        </td>
                        <td style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                          {new Date(claim.created_at).toLocaleDateString()}
                        </td>
                        <td>
                          <Button
                            variant="outline"
                            size="small"
                            icon={ArrowRight}
                            onClick={() => navigate(`/case/${claim.child_id}/${route}`)}
                          >
                            {label}
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                  {filteredClaims.length === 0 && (
                    <tr>
                      <td colSpan="10" style={{ textAlign: "center", padding: "40px 0", color: "var(--text-muted)" }}>
                        No claims match your filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </motion.div>
      )}
    </div>
  );
}
