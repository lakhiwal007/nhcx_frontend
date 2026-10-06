import { useState, useEffect, useRef, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Inbox, AlertCircle, LayoutGrid, List, MoreVertical, Radio, Plus,
} from "lucide-react";
import { api } from "../api";
import { resolveCaseStatus } from "../caseStatus.js";
import { Button, EmptyState, SkeletonTable, TablePagination } from "./Common";
import PageActions from "./PageActions";
import Dropdown from "./Dropdown";
import { formatMoney, formatDate, formatRelative, formatCaseRef } from "../format.js";
import { useNavigate, useLocation } from "react-router-dom";
import ClaimSearchModal from "./ClaimSearchModal";
import PayerName from "./PayerName";

const CLAIMS_PAGE_SIZE = 20;

// Headline numbers from the stats endpoint. Read-only: filtering the list is
// done by the status tabs, whose counts come from the loaded rows themselves.
const KPIS = [
  { key: "total",           label: "Total cases",           color: "var(--primary)", value: (s) => s.claims?.total },
  { key: "preauth_pending", label: "Preauth pending",       color: "var(--info)",    value: (s) => s.claims?.preauth_pending },
  { key: "pending",         label: "In adjudication",       color: "var(--warning)", value: (s) => s.claims?.pending },
  { key: "partial",         label: "Partially approved",    color: "var(--accent)",  value: (s) => s.claims?.partial },
  { key: "complete",        label: "Approved / complete",   color: "var(--success)", value: (s) => s.claims?.complete },
  { key: "failed",          label: "Failed / rejected",     color: "var(--error)",   value: (s) => s.claims?.failed },
  { key: "children",        label: "Children with claims",  color: "var(--text-muted)", value: (s) => s.children?.with_claims },
];

// The four stages of the journey, and which `current_step` values belong to
// each. `current_step` is the authoritative journey position; a row's
// `status` only rolls up eligibility prep (its "complete" does not mean the
// preauth or claim is done), so nothing here reads `status`.
const STAGES = [
  { key: "eligibility", label: "Eligibility", steps: ["insurance_and_eligibility"] },
  { key: "preauth",     label: "Pre-auth",    steps: ["preauth_ready", "preauth_submitted", "preauth_decided"] },
  { key: "claim",       label: "Claim",       steps: ["claim_submitted", "claim_decided"] },
  { key: "payment",     label: "Payment",     steps: ["payment_pending", "settled"] },
];

// `current_step` is nullable on the row; infer the closest step from the
// decision/payment fields rather than leave the case unplaced.
function caseStep(claim) {
  if (claim.current_step) return claim.current_step;
  if (/SETTLED/i.test(claim.payment_status || "")) return "settled";
  if (claim.payment_status) return "payment_pending";
  if (claim.claim_decision) return claim.use_type === "claim" ? "claim_decided" : "preauth_decided";
  if (claim.preauth_status) return "preauth_decided";
  return "insurance_and_eligibility";
}

function stageIndex(claim) {
  const step = caseStep(claim);
  const i = STAGES.findIndex((st) => st.steps.includes(step));
  return i < 0 ? 0 : i;
}

const isSettled = (c) => caseStep(c) === "settled";

const STATUS_TABS = [
  { key: "all",       label: "All",          match: () => true },
  { key: "attention", label: "Needs action", match: (c) => needsAttention(c), dot: "var(--warning)" },
  { key: "preauth",   label: "Pre-auth",     match: (c) => stageIndex(c) <= 1, dot: "var(--info)" },
  { key: "claim",     label: "Claim",        match: (c) => stageIndex(c) === 2, dot: "var(--accent)" },
  { key: "payment",   label: "Payment",      match: (c) => stageIndex(c) === 3 && !isSettled(c), dot: "var(--warning)" },
  { key: "settled",   label: "Settled",      match: isSettled, dot: "var(--success)" },
];

// Phones get the card view regardless of the saved preference; a nine-column
// table only scrolls sideways at that width.
const NARROW_QUERY = "(max-width: 768px)";
const subscribeNarrow = (cb) => {
  const mq = window.matchMedia(NARROW_QUERY);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
};
const getNarrow = () => window.matchMedia(NARROW_QUERY).matches;

const SORT_OPTIONS = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "amount", label: "Highest approved" },
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
    // A rejected *discharge* (interim) claim has no adjudicated final claim to
    // appeal — it must be corrected and resent via DC01, signalled by a
    // resubmit_discharge_claim task. Route there instead of Reprocess.
    if (claim.pending_tasks?.some((t) => t.task_type === "resubmit_discharge_claim")) {
      options.push({ label: "Resubmit Discharge", route: "claim" });
    } else if (claim.use_type === "claim" || claim.claim_id) {
      options.push({ label: "Appeal / Reprocess", route: "reprocess" });
    } else {
      options.push({ label: "Resubmit Preauth", route: "status" });
    }
  }
  if (claim.use_type === "claim") {
    options.push({ label: "View Claim", route: "claim" });
  }
  // claim.status here is the cashless case's own aggregate status
  // (pending/partial/complete/failed — see NhcxCashlessCase#status); "draft"
  // is a Claim#status value from a different endpoint's shape and never
  // appears on dashboard/claims rows, so "Submit Preauth" could never surface.
  // Gate off the fields this endpoint actually populates instead: a pending
  // submit_preauth task means the case is ready but nothing's been sent yet;
  // preauth_status being set means a preauth already exists to view.
  if (claim.pending_tasks?.some((t) => t.task_type === "submit_preauth")) {
    options.push({ label: "Submit Preauth", route: "review" });
  } else if (claim.preauth_status) {
    options.push({ label: "View Preauth", route: "status" });
  }
  if (options.length === 0) {
    options.push({ label: "Open Case", route: "" });
  }
  return options;
}

function needsAttention(claim) {
  if (claim.pending_tasks?.length) return true;
  const terminalQuery = /QUERIED|REJECTED/i;
  return (
    terminalQuery.test(String(claim.claim_decision || "")) ||
    terminalQuery.test(String(claim.preauth_status || ""))
  );
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
          border: "1px solid var(--border-color)", borderRadius: "var(--radius-xs)",
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
              className="glass-panel"
              style={{
                position: "fixed", top: coords.top, right: coords.right, zIndex: 1000,
                minWidth: "190px", borderRadius: "var(--radius-md)", padding: "4px",
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

function CaseStatusChip({ claim }) {
  const cfg = resolveCaseStatus({ ...claim, current_step: caseStep(claim) });
  return (
    <span className={`badge-modern cc-status-chip ${cfg.badgeClass}`} title={cfg.label}>
      {cfg.label}
    </span>
  );
}

// Four-segment journey tracker: done stages filled, the current one tinted by
// how the case stands, later ones empty. Always has something to show.
function StageTrack({ claim }) {
  const idx = stageIndex(claim);
  const settled = isSettled(claim);
  const rejected = /REJECTED/i.test(`${claim.claim_decision || ""} ${claim.preauth_status || ""}`);
  const tone = settled ? "is-done" : rejected ? "is-error" : needsAttention(claim) ? "is-warn" : "is-current";
  return (
    <div className="cc-stage" title={`${STAGES[idx].label} · stage ${idx + 1} of ${STAGES.length}`}>
      <div className="cc-stage-track" aria-hidden="true">
        {STAGES.map((st, i) => (
          <span
            key={st.key}
            className={`cc-stage-seg${settled || i < idx ? " is-done" : i === idx ? ` ${tone}` : ""}`}
          />
        ))}
      </div>
      <div className="cc-stage-label">
        {settled ? "Settled" : STAGES[idx].label}
        <span className="cc-stage-count">{idx + 1}/{STAGES.length}</span>
      </div>
    </div>
  );
}

// The line under the status chip: an open task first, otherwise the approved
// amount once there is one. Nothing at all rather than a placeholder.
function StatusDetail({ claim, card = false }) {
  const task = claim.pending_tasks?.[0];
  if (task && needsAttention(claim) && !card) {
    return (
      <div className="wq-sub cc-task" title={task.title}>
        <AlertCircle size={12} /> {task.title || "Action required"}
      </div>
    );
  }
  if (claim.approved_amount != null) {
    const partial = /PARTIAL/i.test(claim.claim_decision || "");
    return (
      <div className="wq-sub cc-approved">
        <span className="wq-mono">{formatMoney(claim.approved_amount)}</span>
        {partial ? " partially approved" : " approved"}
      </div>
    );
  }
  return null;
}

const payerLine = (claim) =>
  claim.payer_name || claim.payer_id ? (
    <>
      <PayerName id={claim.payer_id} name={claim.payer_name} />
      {claim.policy_number && ` · ${claim.policy_number}`}
    </>
  ) : (
    claim.policy_number || "Payer not selected"
  );

function RowActions({ claim, busy, onNavigate }) {
  const actionOptions = getActionOptions(claim);
  const primary = actionOptions[0];
  const attention = needsAttention(claim);
  return (
    <div className="cc-actions" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
      <button
        type="button"
        className={`cc-act${attention ? " is-primary" : ""}`}
        disabled={busy}
        title={primary.label}
        onClick={() => onNavigate(claim, primary.route)}
      >
        {busy ? "Opening…" : primary.label}
      </button>
      {actionOptions.length > 1 ? (
        <ActionMenu
          options={actionOptions.slice(1)}
          disabled={busy}
          onSelect={(route) => onNavigate(claim, route)}
          size={30}
        />
      ) : (
        // Holds the menu's slot so every row's button sits in the same column.
        <span className="cc-menu-slot" aria-hidden="true" />
      )}
    </div>
  );
}

function ClaimCard({ claim, allFacilitiesMode, busy, onNavigate }) {
  const attention = needsAttention(claim);
  return (
    <div
      className={`cc-card${attention ? " needs-action" : ""}`}
      role="button"
      tabIndex={0}
      onClick={() => onNavigate(claim, "")}
      onKeyDown={(e) => {
        if (e.key === "Enter") onNavigate(claim, "");
      }}
    >
      <div className="cc-card-head">
        <div style={{ minWidth: 0 }}>
          <div className="cc-patient">{claim.patient_name || claim.child_name || "—"}</div>
          <div className="wq-sub">
            <span className="wq-mono">{formatCaseRef(claim.id)}</span> · {formatDate(claim.created_at)}
          </div>
        </div>
        <CaseStatusChip claim={claim} />
      </div>
      <div className="cc-card-stage">
        <StageTrack claim={claim} />
        <StatusDetail claim={claim} card />
      </div>
      <dl className="cc-card-meta">
        <dt>Payer</dt>
        <dd><PayerName id={claim.payer_id} name={claim.payer_name} fallback="Not selected" /></dd>
        {claim.policy_number && (
          <>
            <dt>Policy</dt>
            <dd className="wq-mono">{claim.policy_number}</dd>
          </>
        )}
        {allFacilitiesMode && (
          <>
            <dt>Facility</dt>
            <dd>{claim.facility_name || "—"}</dd>
          </>
        )}
      </dl>
      {attention && claim.pending_tasks?.length > 0 && (
        <div className="cc-card-task">
          <AlertCircle size={13} />
          <span>{claim.pending_tasks[0].title || "Action required"}</span>
        </div>
      )}
      <div className="cc-card-foot">
        <RowActions claim={claim} busy={busy} onNavigate={onNavigate} />
      </div>
    </div>
  );
}

export default function Dashboard({ allFacilitiesMode = false }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [stats, setStats] = useState(null);
  const [claims, setClaims] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [statusTab, setStatusTab] = useState("all");
  const [claimsPage, setClaimsPage] = useState(0);
  const [searchQuery, setSearchQuery] = useState(
    () => new URLSearchParams(location.search).get("q") || ""
  );
  const [navigating, setNavigating] = useState({});
  const [viewMode, setViewMode] = useState(() => localStorage.getItem("dash_viewMode") || "table");
  const [sortBy, setSortBy] = useState("newest");
  const [showSearchModal, setShowSearchModal] = useState(false);
  const isNarrow = useSyncExternalStore(subscribeNarrow, getNarrow);
  const effectiveView = isNarrow ? "grid" : viewMode;

  useEffect(() => { localStorage.setItem("dash_viewMode", viewMode); }, [viewMode]);

  // Bumped by the error banner's Retry to re-run the load below.
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setLoadError(false);
      try {
        const [statsData, claimsData] = await Promise.all([
          api.getDashboardStats(),
          api.getDashboardClaims({ limit: 200 }),
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
  }, [reloadKey]);

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
      claim_id: claim.claim_id ?? null,
      cashless_case_id: claim.cashless_case_id ?? claim.id ?? null,
    };
    if (route === "status" && claim.claim_decision === "REJECTED" && !(claim.use_type === "claim" || claim.claim_id)) {
      state.openAction = "resubmit_preauth";
    }
    navigate(`/case/${cid}/${route}`, { state });
  };

  const q = searchQuery.trim().toLowerCase();
  const searched = claims.filter((c) =>
    !q ||
    c.patient_name?.toLowerCase().includes(q) ||
    c.child_name?.toLowerCase().includes(q) ||
    c.id?.toString().includes(q) ||
    c.payer_name?.toLowerCase().includes(q) ||
    c.payer_id?.toString().toLowerCase().includes(q)
  );

  const tabCounts = Object.fromEntries(
    STATUS_TABS.map((t) => [t.key, searched.filter(t.match).length])
  );
  const activeTab = STATUS_TABS.find((t) => t.key === statusTab) || STATUS_TABS[0];

  const filteredClaims = searched.filter(activeTab.match).sort((a, b) => {
    if (sortBy === "oldest") return Date.parse(a.created_at) - Date.parse(b.created_at);
    if (sortBy === "amount") return (b.approved_amount || 0) - (a.approved_amount || 0);
    return Date.parse(b.created_at) - Date.parse(a.created_at);
  });

  const claimsPageCount = Math.max(1, Math.ceil(filteredClaims.length / CLAIMS_PAGE_SIZE));
  const safeClaimsPage = Math.min(claimsPage, claimsPageCount - 1);
  const pagedClaims = filteredClaims.slice(safeClaimsPage * CLAIMS_PAGE_SIZE, (safeClaimsPage + 1) * CLAIMS_PAGE_SIZE);

  const filtersActive = !!q || statusTab !== "all";
  const clearFilters = () => {
    setSearchQuery("");
    setStatusTab("all");
    setClaimsPage(0);
  };

  const colCount = allFacilitiesMode ? 7 : 6;

  return (
    <div className="dashboard-screen cc-screen">
      <PageActions>
        <Button
          variant="outline"
          size="small"
          icon={Radio}
          disabled={allFacilitiesMode}
          title={allFacilitiesMode ? "Select a facility in Settings to search the gateway" : "Look up a claim on the NHCX gateway"}
          onClick={() => setShowSearchModal(true)}
        >
          Search NHCX Gateway
        </Button>
        <Button
          variant="primary"
          size="small"
          icon={Plus}
          disabled={allFacilitiesMode}
          title={allFacilitiesMode ? "Select a facility in Settings to start a new case" : "New Cashless Case"}
          onClick={() => navigate("/registry")}
        >
          New Cashless Case
        </Button>
      </PageActions>

      {allFacilitiesMode && (
        <div className="inline-error-banner cc-info-banner">
          <AlertCircle size={16} />
          Viewing all facilities (read-only). Select a facility in Settings to start or act on a case.
        </div>
      )}

      {loadError && (
        <div className="inline-error-banner" style={{ margin: 0 }}>
          <AlertCircle size={16} />
          Could not load the latest case data. Showing the last known results, if any.
          <button type="button" className="cc-retry" onClick={() => setReloadKey((k) => k + 1)}>Retry</button>
        </div>
      )}

      {loading ? (
        <div className="cc-kpis" aria-hidden="true">
          {KPIS.map((k) => (
            <div key={k.key} className="cc-kpi">
              <span className="skeleton-line" style={{ width: "70%", height: 10 }} />
              <span className="skeleton-line" style={{ width: 36, height: 22, marginTop: 8 }} />
            </div>
          ))}
        </div>
      ) : stats && (
        <div className="cc-kpis">
          {KPIS.map((k) => (
            <div key={k.key} className="cc-kpi">
              <div className="cc-kpi-label">
                <span className="cc-kpi-dot" style={{ background: k.color }} />
                {k.label}
              </div>
              <div className="cc-kpi-value">{k.value(stats) ?? 0}</div>
            </div>
          ))}
        </div>
      )}

      {allFacilitiesMode && stats?.by_facility?.length > 0 && (
        <div className="wq-panel">
          <div className="cc-panel-title">By facility</div>
          <div className="wq-table-scroll">
            <table className="wq-table cc-facility-table">
              <thead>
                <tr>
                  <th>Facility</th>
                  <th className="cc-num">Total</th>
                  <th className="cc-num">Pending</th>
                  <th className="cc-num">Partial</th>
                  <th className="cc-num">Complete</th>
                  <th className="cc-num">Failed</th>
                </tr>
              </thead>
              <tbody>
                {stats.by_facility.map((row) => (
                  <tr key={row.facility_name || row.facility_code}>
                    <td style={{ fontWeight: 600 }}>{row.facility_name || row.facility_code}</td>
                    <td className="wq-mono cc-num">{row.total ?? 0}</td>
                    <td className="wq-mono cc-num">{row.pending ?? 0}</td>
                    <td className="wq-mono cc-num">{row.partial ?? 0}</td>
                    <td className="wq-mono cc-num" style={{ color: "var(--success)" }}>{row.complete ?? 0}</td>
                    <td className="wq-mono cc-num" style={{ color: "var(--error)" }}>{row.failed ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="wq-panel">
        <div className="wq-toolbar">
          <input
            className="input-modern wq-search"
            placeholder="Search patient, case ID or payer…"
            aria-label="Search cases"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setClaimsPage(0);
            }}
          />
          <div className="wq-chips" role="tablist" aria-label="Case status">
            {STATUS_TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={statusTab === t.key}
                className={`wq-chip${statusTab === t.key ? " is-on" : ""}`}
                onClick={() => {
                  setStatusTab(t.key);
                  setClaimsPage(0);
                }}
              >
                {t.dot && <span className="wq-chip-dot" style={{ "--wq-dot": t.dot }} />}
                {t.label}
                <span className="wq-chip-count">{loading ? "–" : tabCounts[t.key]}</span>
              </button>
            ))}
          </div>
          <div className="wq-toolbar-spacer" />
          <div style={{ width: "170px" }}>
            <Dropdown
              compact
              ariaLabel="Sort"
              value={sortBy}
              options={SORT_OPTIONS}
              onChange={(v) => {
                setSortBy(v);
                setClaimsPage(0);
              }}
            />
          </div>
          <div className="cc-view-toggle" role="group" aria-label="View">
            <button
              type="button"
              title="Table view"
              aria-pressed={viewMode === "table"}
              className={viewMode === "table" ? "is-on" : ""}
              onClick={() => setViewMode("table")}
            >
              <List size={16} />
            </button>
            <button
              type="button"
              title="Card view"
              aria-pressed={viewMode === "grid"}
              className={viewMode === "grid" ? "is-on" : ""}
              onClick={() => setViewMode("grid")}
            >
              <LayoutGrid size={16} />
            </button>
          </div>
        </div>

        {loading ? (
          <SkeletonTable rows={6} cols={colCount} />
        ) : claims.length === 0 ? (
          <EmptyState
            icon={Inbox}
            title="No cashless cases yet"
            description="Start a case from the child registry and it will show up here."
          >
            {!allFacilitiesMode && (
              <Button variant="primary" size="small" icon={Plus} onClick={() => navigate("/registry")}>
                New Cashless Case
              </Button>
            )}
          </EmptyState>
        ) : filteredClaims.length === 0 ? (
          <div className="wq-empty">
            <div className="wq-empty-title">No cases match these filters</div>
            <div className="cc-empty-hint">Try a different search term or status.</div>
            {filtersActive && (
              <Button variant="outline" size="small" onClick={clearFilters}>
                Clear filters
              </Button>
            )}
          </div>
        ) : effectiveView === "grid" ? (
          <div className="cc-grid">
            {pagedClaims.map((claim) => (
              <ClaimCard
                key={claim.id}
                claim={claim}
                allFacilitiesMode={allFacilitiesMode}
                busy={!!navigating[claim.id]}
                onNavigate={navigateToClaim}
              />
            ))}
          </div>
        ) : (
          <div className="wq-table-scroll">
            <table className="wq-table cc-table">
              <thead>
                <tr>
                  <th className="cc-edge-col" aria-hidden="true" />
                  <th>Case</th>
                  <th>Patient · Payer</th>
                  {allFacilitiesMode && <th>Facility</th>}
                  <th>Stage</th>
                  <th>Status</th>
                  <th className="cc-actions-col"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {pagedClaims.map((claim) => {
                  const attention = needsAttention(claim);
                  return (
                    <tr
                      key={claim.id}
                      tabIndex={0}
                      title="Open case"
                      onClick={() => navigateToClaim(claim, "")}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") navigateToClaim(claim, "");
                      }}
                    >
                      <td className="cc-edge-col">
                        {attention && <span className="wq-edge is-high" />}
                      </td>
                      <td>
                        <div className="wq-mono cc-case-id">{formatCaseRef(claim.id)}</div>
                        <div className="wq-sub" title={formatDate(claim.created_at)}>
                          {formatRelative(claim.created_at)}
                        </div>
                      </td>
                      <td>
                        <div className="cc-patient">{claim.patient_name || claim.child_name || "—"}</div>
                        <div className="wq-sub cc-payer">{payerLine(claim)}</div>
                      </td>
                      {allFacilitiesMode && (
                        <td className="cc-facility">{claim.facility_name || "—"}</td>
                      )}
                      <td>
                        <StageTrack claim={claim} />
                      </td>
                      <td>
                        <CaseStatusChip claim={claim} />
                        <StatusDetail claim={claim} />
                      </td>
                      <td className="cc-actions-col">
                        <RowActions claim={claim} busy={!!navigating[claim.id]} onNavigate={navigateToClaim} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {!loading && filteredClaims.length > 0 && (
          <div className="wq-pagination">
            <TablePagination
              page={safeClaimsPage}
              pageSize={CLAIMS_PAGE_SIZE}
              total={filteredClaims.length}
              onPageChange={setClaimsPage}
              label="cases"
            />
          </div>
        )}
      </div>

      <ClaimSearchModal
        open={showSearchModal}
        onClose={() => setShowSearchModal(false)}
        claims={claims}
      />
    </div>
  );
}
