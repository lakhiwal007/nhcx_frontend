import { useState, useEffect } from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
  Search, ArrowRight, Activity, FileText, CheckCircle,
  Clock, XCircle, AlertTriangle, Users, Inbox, AlertCircle,
} from "lucide-react";
import { api } from "../api";
import { PageHeader, Card, StatusBadge, Button, Input, SkeletonTable } from "./Common";
import { useNavigate, useLocation } from "react-router-dom";

const statsContainerVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05 } },
};
const statCardVariants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 26 } },
};

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
  const location = useLocation();
  const prefersReducedMotion = useReducedMotion();
  const [stats, setStats] = useState(null);
  const [claims, setClaims] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [statusFilter, setStatusFilter] = useState(null);
  const [searchQuery, setSearchQuery] = useState(
    () => new URLSearchParams(location.search).get("q") || ""
  );
  const [navigating, setNavigating] = useState({});

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setLoadError(false);
      try {
        const [statsData, claimsData] = await Promise.all([
          api.getDashboardStats(),
          api.getDashboardClaims(),
        ]);
        setStats(statsData);
        setClaims(claimsData?.claims || []);
      } catch (_) {
        setLoadError(true);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const navigateToClaim = async (claim, route) => {
    let cid = claim.child_id;
    if (!cid && claim.id) {
      setNavigating((p) => ({ ...p, [claim.id]: true }));
      try {
        const cs = await api.getCashlessStatus(claim.id);
        cid = cs.child_id;
      } catch (_) {}
      setNavigating((p) => ({ ...p, [claim.id]: false }));
    }
    if (!cid) return;
    navigate(`/case/${cid}/${route}`);
  };

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
              <div key={i} className="dx-stat-card">
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                  <span className="skeleton-line" style={{ width: 20, height: 20, borderRadius: "var(--radius-xs)", flexShrink: 0 }} />
                  <span className="skeleton-line" style={{ width: 34, height: 20 }} />
                </div>
                <span className="skeleton-line" style={{ width: "65%", height: 10 }} />
              </div>
            ))}
          </div>
          <div className="card-modern">
            <div className="card-header-modern">
              <span className="skeleton-line" style={{ width: 120, height: 16 }} />
            </div>
            <div className="card-body-modern">
              <div style={{ marginBottom: 20 }}>
                <span className="skeleton-line" style={{ width: 220, height: 36, borderRadius: "var(--radius-md)" }} />
              </div>
              <SkeletonTable rows={6} cols={10} />
            </div>
          </div>
        </>
      ) : (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          {loadError && (
            <div className="inline-error-banner">
              <AlertCircle size={16} />
              Could not load the latest dashboard data. Showing the last known results, if any.
            </div>
          )}

          {stats && (
            <motion.div
              className="metrics-grid-responsive"
              variants={statsContainerVariants}
              initial={prefersReducedMotion ? false : "hidden"}
              animate="show"
            >
              {METRICS.map((m) => {
                const isActive = statusFilter === m.filterStatus && m.filterStatus !== null;
                return (
                  <motion.div
                    key={m.key}
                    variants={statCardVariants}
                    whileHover={m.filterStatus ? { y: -2 } : undefined}
                    className={`dx-stat-card${m.filterStatus ? " is-clickable" : ""}${isActive ? " is-active" : ""}`}
                    style={{ "--stat-color": m.color }}
                    onClick={() => {
                      if (!m.filterStatus) { setStatusFilter(null); return; }
                      setStatusFilter(isActive ? null : m.filterStatus);
                    }}
                  >
                    <div className="dx-stat-top">
                      <div className="dx-stat-icon" style={{ background: `color-mix(in srgb, ${m.color} 16%, transparent)`, color: m.color }}>
                        <m.icon size={14} />
                      </div>
                      <div className="dx-stat-value">{stats.claims?.[m.key] ?? 0}</div>
                    </div>
                    <div className="dx-stat-label">{m.label}</div>
                  </motion.div>
                );
              })}

              <motion.div variants={statCardVariants} className="dx-stat-card">
                <div className="dx-stat-top">
                  <div className="dx-stat-icon" style={{ background: "color-mix(in srgb, var(--accent) 16%, transparent)", color: "var(--accent)" }}>
                    <Users size={14} />
                  </div>
                  <div className="dx-stat-value">{stats.children?.with_claims ?? 0}</div>
                </div>
                <div className="dx-stat-label">Children with Claims</div>
              </motion.div>
            </motion.div>
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
                  style={{ fontSize: "12px", fontWeight: 600, color: "var(--primary)", background: "var(--primary-light)", border: "1px solid var(--primary)", borderRadius: "var(--radius-pill)", padding: "6px 14px", cursor: "pointer" }}
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
                        <td className="mono-cell" style={{ fontWeight: 700 }}>#{claim.id}</td>
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
                            : <span className="text-muted">-</span>}
                        </td>
                        <td className="mono-cell" style={{ textAlign: "right", fontWeight: 700, color: "var(--success)" }}>
                          {claim.approved_amount != null
                            ? `₹${claim.approved_amount.toLocaleString()}`
                            : <span className="text-muted">-</span>}
                        </td>
                        <td>
                          {claim.payment_status
                            ? <StatusBadge status={claim.payment_status.replace("PAYMENT_", "").toLowerCase()} />
                            : <span className="text-muted">-</span>}
                        </td>
                        <td>
                          {claim.latest_utr
                            ? <code style={{ fontSize: "11px" }}>{claim.latest_utr}</code>
                            : <span className="text-muted">-</span>}
                        </td>
                        <td className="mono-cell" style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                          {new Date(claim.created_at).toLocaleDateString()}
                        </td>
                        <td>
                          <Button
                            variant="outline"
                            size="small"
                            icon={ArrowRight}
                            disabled={!!navigating[claim.id]}
                            onClick={() => navigateToClaim(claim, route)}
                          >
                            {navigating[claim.id] ? "Loading…" : label}
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                  {filteredClaims.length === 0 && (
                    <tr>
                      <td colSpan="10">
                        <div className="dx-empty-cell">
                          <Inbox size={28} />
                          <div className="dx-empty-heading">No claims match your filters</div>
                          <div className="dx-empty-hint">
                            {searchQuery || statusFilter
                              ? "Try a different search term or clear the active status filter."
                              : "New cashless cases will show up here once created."}
                          </div>
                        </div>
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
