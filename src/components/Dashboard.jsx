import { useState, useEffect } from "react";
import { Inbox, AlertCircle, LayoutGrid, List, Plus, RefreshCw } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { api, markHandled } from "../api";
import { Button, EmptyState, SkeletonTable, TablePagination, Tip } from "./Common";
import PageActions from "./PageActions";
import Dropdown from "./Dropdown";
import PayerName from "./PayerName";
import RowMenu from "./dashboard/RowMenu";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { formatMoney, formatDate, formatRelative, formatCaseRef } from "../format.js";
import { stageIndex, isSettled, isClosedCase, needsAttention } from "../caseStatus.js";
import { taskLabel } from "../tasks";
import { CaseStatusChip, StageTrack } from "./caseJourney";

const PAGE_SIZE = 20;

const STAGE_TABS = [
  { key: "all", label: "All cases", match: () => true, dot: "var(--text-muted)" },
  { key: "eligibility", label: "Eligibility", match: (c) => !isClosedCase(c) && stageIndex(c) === 0, dot: "var(--info)" },
  { key: "preauth", label: "Pre-auth", match: (c) => !isClosedCase(c) && stageIndex(c) === 1, dot: "var(--info)" },
  { key: "claim", label: "Claim", match: (c) => !isClosedCase(c) && stageIndex(c) === 2, dot: "var(--accent)" },
  { key: "payment", label: "Payment", match: (c) => !isClosedCase(c) && stageIndex(c) === 3 && !isSettled(c), dot: "var(--warning)" },
  { key: "settled", label: "Settled", match: (c) => !isClosedCase(c) && isSettled(c), dot: "var(--success)" },
  { key: "closed", label: "Closed", match: isClosedCase, dot: "var(--text-muted)" },
];

const SORT_OPTIONS = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "amount", label: "Highest approved" },
];

const hasTask = (claim, type) => claim.pending_tasks?.some((t) => t.task_type === type);

function rowActions(claim) {
  const actions = [];
  if (hasTask(claim, "review_payment_ack_failure")) actions.push({ label: "Retry the acknowledgement", route: "payment" });
  if (claim.claim_decision === "QUERIED") actions.push({ label: "Answer the claim query", route: "claim", openAction: "respond_claim_query" });
  if (claim.claim_decision === "REJECTED") {
    if (hasTask(claim, "resubmit_discharge_claim")) actions.push({ label: "Resend the discharge claim", route: "claim" });
    else if (claim.use_type === "claim" || claim.claim_id) actions.push({ label: "Ask for a reprocess", route: "reprocess" });
    else actions.push({ label: "Resubmit the pre-auth", route: "status", openAction: "resubmit_preauth" });
  }
  if (claim.preauth_status === "QUERIED" && claim.claim_decision == null) actions.push({ label: "Answer the pre-auth query", route: "status", openAction: "respond_preauth_query" });
  if (claim.payment_status || claim.claim_decision === "APPROVED" || claim.claim_decision === "PARTIALLY_APPROVED") actions.push({ label: "View payment", route: "payment" });
  if (claim.use_type === "claim") actions.push({ label: "View claim", route: "claim" });
  if (hasTask(claim, "submit_preauth")) actions.push({ label: "Send the pre-auth", route: "review" });
  else if (claim.preauth_status) actions.push({ label: "View pre-auth decision", route: "status" });
  return actions;
}

function StatusDetail({ claim }) {
  const task = claim.pending_tasks?.[0];
  if (task && needsAttention(claim)) {
    return (
      <div className="wq-sub cc-task" title={task.title}>
        <AlertCircle size={12} aria-hidden="true" /> {taskLabel(task.task_type) || task.title || "Action required"}
      </div>
    );
  }
  if (claim.approved_amount != null) {
    const partial = /PARTIAL/i.test(claim.claim_decision || "");
    return (
      <div className="wq-sub cc-approved">
        <span className="wq-num">{formatMoney(claim.approved_amount)}</span>
        {partial ? " partly approved" : " approved"}
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
    claim.policy_number || "Payer not chosen yet"
  );

function RowActions({ claim, busy, onOpen }) {
  const actions = rowActions(claim);
  return (
    <div className="cc-actions" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
      <button type="button" className="cc-act" disabled={busy} onClick={() => onOpen(claim)}>
        {busy ? "Opening…" : "Open"}
      </button>
      <RowMenu label={`More for ${formatCaseRef(claim.id)}`} disabled={busy} items={actions.map((a) => ({ label: a.label, onClick: () => onOpen(claim, a) }))} />
    </div>
  );
}

function ClaimCard({ claim, allFacilitiesMode, busy, onOpen }) {
  const attention = needsAttention(claim);
  return (
    <div
      className={`cc-card${attention ? " needs-action" : ""}`}
      role="button"
      tabIndex={0}
      onClick={() => onOpen(claim)}
      onKeyDown={(e) => {
        if (e.key === "Enter") onOpen(claim);
      }}
    >
      <div className="cc-card-head">
        <div className="cc-card-who">
          <div className="cc-patient">{claim.patient_name || claim.child_name || "—"}</div>
          <div className="wq-sub">
            <span className="wq-mono">{formatCaseRef(claim.id)}</span> · {formatDate(claim.created_at)}
          </div>
        </div>
        <CaseStatusChip claim={claim} />
      </div>
      <div className="cc-card-stage">
        <StageTrack claim={claim} />
        <StatusDetail claim={claim} />
      </div>
      <dl className="cc-card-meta">
        <dt>Payer</dt>
        <dd>
          <PayerName id={claim.payer_id} name={claim.payer_name} fallback="Not chosen yet" />
        </dd>
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
      <div className="cc-card-foot">
        <RowActions claim={claim} busy={busy} onOpen={onOpen} />
      </div>
    </div>
  );
}

export default function Dashboard({ allFacilitiesMode = false }) {
  const navigate = useNavigate();
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const urlQuery = params.get("q") || "";
  const urlCase = params.get("case") || "";
  const urlStage = params.get("stage") || "all";

  const urlKey = `${urlQuery}|${urlCase}`;
  const [data, setData] = useState({ key: -1, claims: null, total: null, error: null });
  const [reloadKey, setReloadKey] = useState(0);
  const [stage, setStage] = useState(() => (STAGE_TABS.some((t) => t.key === urlStage) ? urlStage : "all"));
  const [attentionOnly, setAttentionOnly] = useState(false);
  const [page, setPage] = useState(0);
  const [sync, setSync] = useState({ key: urlKey, search: urlQuery, caseFilter: urlCase });
  if (sync.key !== urlKey) {
    setSync({ key: urlKey, search: urlQuery, caseFilter: urlCase });
    setPage(0);
  }
  const { search, caseFilter } = sync;
  const setSearch = (value) => setSync((prev) => ({ ...prev, search: value, caseFilter: "" }));
  const claims = data.claims;
  const totalCount = data.total;
  const loading = data.key !== reloadKey;
  const loadError = data.error;
  const [navigating, setNavigating] = useState({});
  const [navError, setNavError] = useState(null);
  const [viewMode, setViewMode] = useState(() => localStorage.getItem("dash_viewMode") || "table");
  const [sortBy, setSortBy] = useState("newest");
  const narrow = useMediaQuery("(max-width: 768px)");
  const effectiveView = narrow ? "grid" : viewMode;

  useEffect(() => {
    localStorage.setItem("dash_viewMode", viewMode);
  }, [viewMode]);

  useEffect(() => {
    let cancelled = false;
    api
      .getDashboardClaims({ limit: 200 })
      .then((res) => {
        if (!cancelled) setData({ key: reloadKey, claims: res?.claims || [], total: res?.total_count ?? null, error: null });
      })
      .catch((err) => {
        if (cancelled) return;
        markHandled(err);
        setData((prev) => ({ ...prev, key: reloadKey, error: err?.message || "The cases could not be loaded." }));
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const openCase = async (claim, action) => {
    let cid = claim.child_id;
    setNavError(null);
    if (!cid && claim.id) {
      setNavigating((p) => ({ ...p, [claim.id]: true }));
      try {
        const cs = await api.getCashlessStatus(claim.id);
        cid = cs.child_id;
      } catch (err) {
        markHandled(err);
        setNavError(err?.message || "The case could not be opened.");
      }
      setNavigating((p) => ({ ...p, [claim.id]: false }));
    }
    if (!cid) {
      setNavError((prev) => prev || "This case has no patient on record, so it cannot be opened.");
      return;
    }
    const state = { claim_id: claim.claim_id ?? null, cashless_case_id: claim.cashless_case_id ?? claim.id ?? null, from: "/dashboard", ...(action?.openAction ? { openAction: action.openAction } : {}) };
    navigate(`/case/${cid}/${action?.route || ""}`, { state });
  };

  const list = claims || [];
  const q = search.trim().toLowerCase();
  const searched = list.filter((c) => {
    if (caseFilter) return String(c.cashless_case_id ?? c.id) === String(caseFilter);
    if (!q) return true;
    return c.patient_name?.toLowerCase().includes(q) || c.child_name?.toLowerCase().includes(q) || formatCaseRef(c.id).toLowerCase().includes(q) || String(c.id).includes(q) || c.payer_name?.toLowerCase().includes(q) || c.payer_id?.toString().toLowerCase().includes(q) || c.policy_number?.toLowerCase().includes(q);
  });
  const attentionScoped = attentionOnly ? searched.filter(needsAttention) : searched;
  const tabCounts = Object.fromEntries(STAGE_TABS.map((t) => [t.key, attentionScoped.filter(t.match).length]));
  const attentionCount = searched.filter(needsAttention).length;
  const activeTab = STAGE_TABS.find((t) => t.key === stage) || STAGE_TABS[0];
  const filtered = attentionScoped.filter(activeTab.match).sort((a, b) => {
    if (sortBy === "oldest") return Date.parse(a.created_at) - Date.parse(b.created_at);
    if (sortBy === "amount") return (b.approved_amount || 0) - (a.approved_amount || 0);
    return Date.parse(b.created_at) - Date.parse(a.created_at);
  });
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const paged = filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);
  const filtersActive = !!q || !!caseFilter || stage !== "all" || attentionOnly;
  const clearFilters = () => {
    setSync((prev) => ({ ...prev, search: "", caseFilter: "" }));
    setStage("all");
    setAttentionOnly(false);
    setPage(0);
    if (urlQuery || urlCase) navigate("/dashboard", { replace: true });
  };
  const pickStage = (key) => {
    setStage(key);
    setPage(0);
  };

  const facilities = allFacilitiesMode
    ? [...new Set(list.map((c) => c.facility_name || c.facility_code).filter(Boolean))].map((name) => {
        const mine = list.filter((c) => (c.facility_name || c.facility_code) === name);
        return { name, total: mine.length, attention: mine.filter(needsAttention).length, settled: mine.filter(isSettled).length };
      })
    : [];

  const columns = ["Case", "Patient · Payer", allFacilitiesMode && "Facility", "Stage", "Status", "Actions"].filter(Boolean);

  return (
    <div className="dashboard-screen cc-screen">
      <PageActions>
        <Button variant="outline" size="small" icon={RefreshCw} disabled={loading} onClick={() => setReloadKey((k) => k + 1)} title="Reload the cases">
          {loading ? "Refreshing…" : "Refresh"}
        </Button>
        {!allFacilitiesMode && (
          <Button variant="primary" size="small" icon={Plus} write onClick={() => navigate("/registry")} title="Start a case from the patient registry">
            New case
          </Button>
        )}
      </PageActions>

      {allFacilitiesMode && (
        <div className="cv-notice is-info">
          <div className="cv-notice-body">Viewing all facilities. This account can see every case but not start or act on one.</div>
        </div>
      )}

      {loadError && (
        <div className="cv-notice is-warn" role="alert">
          <div className="cv-notice-body">The cases could not be loaded{claims ? ", so the list may be out of date" : ""}: {loadError}</div>
          <div className="cv-notice-actions">
            <button type="button" className="cc-act" onClick={() => setReloadKey((k) => k + 1)}>
              Retry
            </button>
          </div>
        </div>
      )}

      {navError && (
        <div className="cv-notice is-bad" role="alert">
          <div className="cv-notice-body">{navError}</div>
        </div>
      )}

      <div className="cc-kpis" role="group" aria-label="Case stage">
        {STAGE_TABS.map((t) => (
          <button key={t.key} type="button" aria-pressed={stage === t.key} className={`cc-kpi cc-kpi-btn${stage === t.key ? " is-on" : ""}`} onClick={() => pickStage(t.key)}>
            <span className="cc-kpi-label">
              <span className="cc-kpi-dot" style={{ background: t.dot }} />
              {t.label}
            </span>
            {loading && !claims ? (
              <span className="skeleton-line cc-kpi-skeleton" />
            ) : (
              <span className="cc-kpi-value">
                {tabCounts[t.key]}
                {t.key === "all" && !q && !caseFilter && !attentionOnly && totalCount > list.length && <span className="cc-kpi-of"> of {totalCount}</span>}
              </span>
            )}
          </button>
        ))}
      </div>

      {allFacilitiesMode && facilities.length > 0 && (
        <div className="wq-panel">
          <div className="cc-panel-title">By facility</div>
          <div className="wq-table-scroll">
            <table className="wq-table cc-facility-table">
              <thead>
                <tr>
                  <th>Facility</th>
                  <th className="cc-num">Cases</th>
                  <th className="cc-num">Need action</th>
                  <th className="cc-num">Settled</th>
                </tr>
              </thead>
              <tbody>
                {facilities.map((row) => (
                  <tr key={row.name}>
                    <td className="cc-patient">{row.name}</td>
                    <td className="wq-num cc-num">{row.total}</td>
                    <td className="wq-num cc-num">{row.attention}</td>
                    <td className="wq-num cc-num">{row.settled}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Tip className="wq-page-tip">Every insurance case and where it stands. Open a case to see what to do next; the stage tiles and the search narrow the list.</Tip>

      <div className="wq-panel">
        <div className="wq-toolbar">
          <input
            className="input-modern wq-search"
            placeholder="Search patient, case, policy or payer…"
            aria-label="Search cases"
            value={caseFilter ? formatCaseRef(caseFilter) : search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
          />
          <div className="wq-chips" role="group" aria-label="Attention">
            <button
              type="button"
              className={`wq-chip${attentionOnly ? " is-on" : ""}`}
              aria-pressed={attentionOnly}
              onClick={() => {
                setAttentionOnly((v) => !v);
                setPage(0);
              }}
            >
              <span className="wq-chip-dot is-urgent" aria-hidden="true" />
              Needs action
              <span className="wq-chip-count">{attentionCount}</span>
            </button>
          </div>
          <div className="wq-toolbar-spacer" />
          <div className="cc-sort">
            <Dropdown
              compact
              ariaLabel="Sort"
              value={sortBy}
              options={SORT_OPTIONS}
              onChange={(v) => {
                setSortBy(v);
                setPage(0);
              }}
            />
          </div>
          {!narrow && (
            <div className="cc-view-toggle" role="group" aria-label="View">
              <button type="button" title="Table view" aria-pressed={viewMode === "table"} className={viewMode === "table" ? "is-on" : ""} onClick={() => setViewMode("table")}>
                <List size={16} aria-hidden="true" />
              </button>
              <button type="button" title="Card view" aria-pressed={viewMode === "grid"} className={viewMode === "grid" ? "is-on" : ""} onClick={() => setViewMode("grid")}>
                <LayoutGrid size={16} aria-hidden="true" />
              </button>
            </div>
          )}
        </div>

        {loading && !claims ? (
          <SkeletonTable rows={6} cols={columns.length} />
        ) : list.length === 0 ? (
          <EmptyState icon={Inbox} title="No cashless cases yet" description="To start one, open the Patient Registry, find the admitted patient and press Start case. It shows up here." />
        ) : filtered.length === 0 ? (
          <div className="wq-empty">
            <div className="wq-empty-title">{caseFilter ? `${formatCaseRef(caseFilter)} is not in this list` : "No cases match these filters"}</div>
            <div className="cc-empty-hint">{caseFilter ? "It may belong to another facility, or be older than the cases loaded here." : "Try a different search term or stage."}</div>
            {filtersActive && (
              <Button variant="outline" size="small" onClick={clearFilters}>
                Clear filters
              </Button>
            )}
          </div>
        ) : effectiveView === "grid" ? (
          <div className="cc-grid">
            {paged.map((claim) => (
              <ClaimCard key={claim.id} claim={claim} allFacilitiesMode={allFacilitiesMode} busy={!!navigating[claim.id]} onOpen={openCase} />
            ))}
          </div>
        ) : (
          <div className="wq-table-scroll">
            <table className="wq-table cc-table">
              <thead>
                <tr>
                  {columns.map((c) => (
                    <th key={c} className={c === "Actions" ? "cc-actions-col" : undefined}>
                      {c === "Actions" ? <span className="sr-only">Actions</span> : c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paged.map((claim) => (
                  <tr
                    key={claim.id}
                    tabIndex={0}
                    onClick={() => openCase(claim)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") openCase(claim);
                    }}
                  >
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
                    {allFacilitiesMode && <td className="cc-facility">{claim.facility_name || "—"}</td>}
                    <td>
                      <StageTrack claim={claim} />
                    </td>
                    <td>
                      <CaseStatusChip claim={claim} />
                      <StatusDetail claim={claim} />
                    </td>
                    <td className="cc-actions-col">
                      <RowActions claim={claim} busy={!!navigating[claim.id]} onOpen={openCase} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!loading && filtered.length > 0 && (
          <div className="wq-pagination">
            <TablePagination page={safePage} pageSize={PAGE_SIZE} total={filtered.length} onPageChange={setPage} label="cases" />
          </div>
        )}
      </div>
    </div>
  );
}
