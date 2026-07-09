import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import {
  Search, Activity, FileText, CheckCircle,
  Clock, XCircle, AlertTriangle, Users, Inbox, AlertCircle, LayoutGrid, List, MoreVertical, ChevronDown
} from "lucide-react";
import { api } from "../api";
import { Card, StatusBadge, Button, Input, SkeletonTable } from "./Common";
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

function getActionOptions(claim) {
  const options = [];
  if (claim.pending_tasks?.some((t) => t.task_type === "review_payment_ack_failure")) {
    options.push({ label: "Retry Acknowledgement", route: "payment" });
  }
  if (claim.payment_status === "PAYMENT_SETTLED" || claim.claim_decision === "APPROVED" || claim.claim_decision === "PARTIALLY_APPROVED") {
    options.push({ label: "View Payment", route: "payment" });
  }
  if (claim.claim_decision === "QUERIED") {
    options.push({ label: "Respond to Query", route: "claim" });
  }
  if (claim.claim_decision === "REJECTED") {
    if (claim.use_type === "claim" || claim.claim_id) {
      options.push({ label: "Appeal / Reprocess", route: "reprocess" });
    } else {
      options.push({ label: "Resubmit Preauth", route: "status" });
    }
  }
  if (claim.use_type === "claim") {
    options.push({ label: "View Claim", route: "claim" });
  }
  if (claim.status === "draft") {
    options.push({ label: "Submit Preauth", route: "review" });
  }
  if (claim.status === "pending" || claim.status === "complete") {
    options.push({ label: "View Preauth", route: "status" });
  }
  if (options.length === 0) {
    options.push({ label: "Open Case", route: "" });
  }
  return options;
}

function ActionMenu({ options, onSelect, disabled, size = 32 }) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState(null);
  const triggerRef = useRef(null);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const updateCoords = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (rect) setCoords({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
    };
    updateCoords();
    const handleClick = (e) => {
      if (
        triggerRef.current && !triggerRef.current.contains(e.target) &&
        menuRef.current && !menuRef.current.contains(e.target)
      ) setOpen(false);
    };
    const handleKey = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    window.addEventListener("scroll", updateCoords, true);
    window.addEventListener("resize", updateCoords);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
      window.removeEventListener("scroll", updateCoords, true);
      window.removeEventListener("resize", updateCoords);
    };
  }, [open]);

  if (!options?.length) return null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        title="More Actions"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        style={{
          width: size, height: size, display: "flex", alignItems: "center", justifyContent: "center",
          background: open ? "var(--bg-main)" : "transparent", color: "var(--text-muted)",
          border: "1px solid var(--border-color)", borderRadius: "var(--radius-sm)",
          cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1,
          transition: "background 0.15s ease",
        }}
      >
        <MoreVertical size={16} />
      </button>
      {createPortal(
        <AnimatePresence>
          {open && coords && (
            <motion.div
              ref={menuRef}
              initial={{ opacity: 0, y: -4, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.96 }}
              transition={{ duration: 0.14, ease: "easeOut" }}
              style={{
                position: "fixed", top: coords.top, right: coords.right, zIndex: 1000,
                minWidth: "190px", background: "var(--bg-card)", border: "1px solid var(--border-color)",
                borderRadius: "var(--radius-md)", boxShadow: "var(--shadow-lg)", padding: "4px",
                transformOrigin: "top right",
              }}
            >
              {options.map((opt) => (
                <button
                  key={opt.route}
                  type="button"
                  onClick={() => { setOpen(false); onSelect(opt.route); }}
                  style={{
                    display: "block", width: "100%", textAlign: "left", padding: "8px 10px",
                    fontSize: "13px", fontWeight: 500, color: "var(--text-main)", background: "transparent",
                    border: "none", borderRadius: "var(--radius-sm)", cursor: "pointer",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-main)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                >
                  {opt.label}
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
  );
}

export default function Dashboard({ allFacilitiesMode = false }) {
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
  const [viewMode, setViewMode] = useState(() => localStorage.getItem("dash_viewMode") || "table");
  const [sortBy, setSortBy] = useState("newest");
  
  useEffect(() => { localStorage.setItem("dash_viewMode", viewMode); }, [viewMode]);

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
    const state = {
      claim_id: claim.claim_id ?? claim.id ?? null,
      cashless_case_id: claim.cashless_case_id ?? claim.id ?? null,
    };
    if (route === "status" && claim.claim_decision === "REJECTED" && !(claim.use_type === "claim" || claim.claim_id)) {
      state.openAction = "resubmit_preauth";
    }
    navigate(`/case/${cid}/${route}`, { state });
  };

  let filteredClaims = claims.filter((c) => {
    const q = searchQuery.toLowerCase();
    const matchSearch =
      c.patient_name?.toLowerCase().includes(q) ||
      c.child_name?.toLowerCase().includes(q) ||
      c.id?.toString().includes(q) ||
      c.payer_name?.toLowerCase().includes(q) ||
      c.payer_id?.toString().toLowerCase().includes(q);
    const matchStatus = !statusFilter || c.status === statusFilter || c.claim_decision === statusFilter || c.current_step === statusFilter;
    return matchSearch && matchStatus;
  });

  filteredClaims.sort((a, b) => {
    if (sortBy === "oldest") {
      return Date.parse(a.created_at) - Date.parse(b.created_at);
    } else if (sortBy === "newest") {
      return Date.parse(b.created_at) - Date.parse(a.created_at);
    } else if (sortBy === "amount") {
      return (b.approved_amount || 0) - (a.approved_amount || 0);
    }
    return 0;
  });

  const ClaimCard = ({ claim }) => {
    const actionOptions = getActionOptions(claim);
    const primaryAction = actionOptions[0];
    
    return (
      <motion.div
        layout
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        whileHover={{ y: -4, boxShadow: "0 12px 24px -8px rgba(0,0,0,0.15)" }}
        className="card-modern"
        style={{
          padding: "var(--space-4)",
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-3)",
          transition: "box-shadow 0.2s ease",
          borderTop: "3px solid " + (claim.claim_decision === "APPROVED" ? "var(--success)" : claim.claim_decision === "REJECTED" ? "var(--error)" : claim.claim_decision === "PARTIALLY_APPROVED" ? "var(--warning)" : "var(--primary)")
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "var(--space-2)" }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: "15px", lineHeight: "1.2", display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
              {claim.patient_name || claim.child_name}
              {claim.pending_tasks?.length > 0 && (
                <span className="badge-modern badge-error" style={{ fontSize: "9px", padding: "1px 4px", display: "flex", alignItems: "center", gap: "2px" }}>
                  <AlertCircle size={10} /> ACTION REQUIRED
                </span>
              )}
            </div>
            <div className="mono-cell" style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "var(--space-1)" }}>#{claim.id}</div>
          </div>
          <StatusBadge status={claim.current_step || claim.status} />
        </div>
        
        <div style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "12px", marginTop: "var(--space-1)" }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: "var(--text-muted)" }}>Payer:</span>
            <span style={{ fontWeight: 600, textAlign: "right" }}>{claim.payer_name || claim.payer_id || "-"}</span>
          </div>
          {allFacilitiesMode && (
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "var(--text-muted)" }}>Facility:</span>
              <span style={{ fontWeight: 600, textAlign: "right" }}>{claim.facility_name || "-"}</span>
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: "var(--text-muted)" }}>Submitted:</span>
            <span>{new Date(claim.created_at).toLocaleDateString()}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "var(--space-1)", paddingTop: "8px", borderTop: "1px dashed var(--border-color)" }}>
            <span style={{ color: "var(--text-muted)" }}>Approved:</span>
            <span className="mono-cell" style={{ fontWeight: 700, color: "var(--success)", fontSize: "14px" }}>
              {claim.approved_amount != null ? `₹${claim.approved_amount.toLocaleString()}` : "-"}
            </span>
          </div>
        </div>
        
        <div style={{ marginTop: "auto", paddingTop: "12px", display: "flex", gap: "var(--space-2)" }}>
          <Button
            variant="primary"
            size="small"
            disabled={!!navigating[claim.id]}
            onClick={() => navigateToClaim(claim, primaryAction.route)}
            style={{ flex: 1, justifyContent: "center" }}
          >
            {navigating[claim.id] ? "Loading…" : primaryAction.label}
          </Button>
          {actionOptions.length > 1 && (
            <ActionMenu
              options={actionOptions.slice(1)}
              disabled={!!navigating[claim.id]}
              onSelect={(route) => navigateToClaim(claim, route)}
              size={36}
            />
          )}
        </div>
      </motion.div>
    );
  };

  return (
    <div className="dashboard-screen">
      <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", marginBottom: "var(--space-4)" }}>
        <Button
          variant="primary"
          disabled={allFacilitiesMode}
          title={allFacilitiesMode ? "Select a facility in Settings to start a new case" : undefined}
          onClick={() => navigate("/registry")}
        >
          New Cashless Case
        </Button>
      </div>

      {allFacilitiesMode && (
        <div className="inline-error-banner" style={{ background: "color-mix(in srgb, var(--info) 10%, var(--bg-card))", borderColor: "color-mix(in srgb, var(--info) 30%, transparent)", color: "var(--info)" }}>
          <AlertCircle size={16} />
          Viewing all facilities (read-only). Select a facility in Settings to start or act on a case.
        </div>
      )}

      {loading ? (
        <>
          <div className="metrics-grid-responsive">
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="dx-stat-card">
                <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", marginBottom: "var(--space-2)" }}>
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
              <SkeletonTable rows={6} cols={allFacilitiesMode ? 11 : 10} />
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

          {allFacilitiesMode && stats?.by_facility?.length > 0 && (
            <Card title="By Facility" className="mb-6">
              <div className="table-responsive-wrapper">
                <table className="table-modern">
                  <thead>
                    <tr>
                      <th>Facility</th>
                      <th style={{ textAlign: "right" }}>Total</th>
                      <th style={{ textAlign: "right" }}>Pending</th>
                      <th style={{ textAlign: "right" }}>Partial</th>
                      <th style={{ textAlign: "right" }}>Complete</th>
                      <th style={{ textAlign: "right" }}>Failed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.by_facility.map((row) => (
                      <tr key={row.facility_name || row.facility_code}>
                        <td style={{ fontWeight: 600 }}>{row.facility_name || row.facility_code}</td>
                        <td className="mono-cell" style={{ textAlign: "right" }}>{row.total ?? 0}</td>
                        <td className="mono-cell" style={{ textAlign: "right" }}>{row.pending ?? 0}</td>
                        <td className="mono-cell" style={{ textAlign: "right" }}>{row.partial ?? 0}</td>
                        <td className="mono-cell" style={{ textAlign: "right", color: "var(--success)" }}>{row.complete ?? 0}</td>
                        <td className="mono-cell" style={{ textAlign: "right", color: "var(--error)" }}>{row.failed ?? 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          <Card title="Recent Claims">
            <div style={{ display: "flex", gap: "var(--space-3)", marginBottom: "var(--space-5)", alignItems: "center", flexWrap: "wrap" }}>
              <div style={{ flex: "1 1 250px", maxWidth: "360px" }}>
                <Input
                  icon={Search}
                  placeholder="Search patient or claim ID…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              
              <select
                className="input-modern"
                style={{ width: "auto", minWidth: "140px" }}
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
              >
                <option value="newest">Newest First</option>
                <option value="oldest">Oldest First</option>
                <option value="amount">Highest Amount</option>
              </select>

              <div style={{ display: "flex", background: "var(--bg-card)", border: "1px solid var(--border-color)", borderRadius: "var(--radius-md)", padding: "var(--space-1)", gap: "var(--space-1)" }}>
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

              {statusFilter && (
                <button
                  onClick={() => setStatusFilter(null)}
                  style={{ fontSize: "12px", fontWeight: 600, color: "var(--primary)", background: "var(--primary-light)", border: "1px solid var(--primary)", borderRadius: "var(--radius-pill)", padding: "6px 14px", cursor: "pointer", marginLeft: "auto" }}
                >
                  {statusFilter} ×
                </button>
              )}
            </div>

            <div className="table-responsive-wrapper">
              {viewMode === "grid" ? (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "var(--space-4)", padding: "var(--space-1)" }}>
                  {filteredClaims.map(claim => (
                    <ClaimCard key={claim.id} claim={claim} />
                  ))}
                  {filteredClaims.length === 0 && (
                    <div style={{ gridColumn: "1 / -1", textAlign: "center", padding: "60px 20px" }}>
                      <Inbox size={32} style={{ margin: "0 auto 12px", opacity: 0.3 }} />
                      <div style={{ fontSize: "14px", fontWeight: 700 }}>No claims match your filters</div>
                    </div>
                  )}
                </div>
              ) : (
              <table className="table-modern">
                <thead>
                  <tr>
                    <th>Claim ID</th>
                    <th>Patient</th>
                    {allFacilitiesMode && <th>Facility</th>}
                    <th>Payer</th>
                    <th>Workflow Status</th>
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
                    const actionOptions = getActionOptions(claim);
                    return (
                      <tr key={claim.id}>
                        <td className="mono-cell" style={{ fontWeight: 700 }}>#{claim.id}</td>
                        <td style={{ fontWeight: 600 }}>{claim.patient_name || claim.child_name}</td>
                        {allFacilitiesMode && (
                          <td style={{ fontSize: "12px", color: "var(--text-muted)" }}>{claim.facility_name || "-"}</td>
                        )}
                        <td>
                          <div style={{ fontWeight: 600 }}>{claim.payer_name || claim.payer_id || "-"}</div>
                          {(claim.payer_name && claim.payer_id) || claim.payer_id ? (
                            <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "2px" }}>
                              {claim.payer_id || claim.payer_name}
                            </div>
                          ) : null}
                        </td>
                        <td><StatusBadge status={claim.current_step || claim.status} /></td>
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
                          <div style={{ display: "flex", gap: "6px" }}>
                            <Button
                              variant="primary"
                              size="small"
                              disabled={!!navigating[claim.id]}
                              onClick={() => navigateToClaim(claim, actionOptions[0].route)}
                            >
                              {navigating[claim.id] ? "Loading…" : actionOptions[0].label}
                            </Button>
                            {actionOptions.length > 1 && (
                              <ActionMenu
                                options={actionOptions.slice(1)}
                                disabled={!!navigating[claim.id]}
                                onSelect={(route) => navigateToClaim(claim, route)}
                              />
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {filteredClaims.length === 0 && (
                    <tr>
                      <td colSpan={allFacilitiesMode ? 11 : 10}>
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
              )}
            </div>
          </Card>
        </motion.div>
      )}
    </div>
  );
}
