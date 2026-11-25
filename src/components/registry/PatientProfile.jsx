import BackButton from "../ui/BackButton";
import { useState, useEffect } from "react";
import { User, Search, RefreshCw } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api, markHandled } from "../../api";
import { useReadOnly } from "../../lib/readOnly";
import { useMediaQuery } from "../../hooks/util/useMediaQuery";
import { Button, EmptyState, LoadingBlock, SkeletonTable, TablePagination, Tip } from "../ui/Common";
import { formatPhone, formatCaseRef, formatRelative, formatAge, humanize, formatDate } from "../../lib/format.js";
import { taskScreen, taskNavState } from "../../domain/tasks";
import PayerName from "../ui/PayerName";
import PageActions from "../ui/PageActions";
import Dropdown from "../ui/Dropdown";
import { StageTrack } from "../ui/caseJourney";
import CommunicationDetailDrawer from "../communications/CommunicationDetail";
import PatientHeader, { Avatar } from "./PatientHeader";
import { AdmissionsLedger, CasesLedger, MessagesLedger, AdmissionDrawer, CaseDrawer } from "./CaseLedger";
import StartCasePrompt from "./StartCasePrompt";
import { currentAdmission, isOpenCase, sortedVisits, patientCases, casesOfVisit, estimatedBill } from "./registryUtil";

const PAGE_SIZE = 20;

const CASE_STATE_TABS = [
  { key: "any", label: "All" },
  { key: "open_case", label: "Open case", dot: "var(--info)" },
  { key: "with_case", label: "Has cases", dot: "var(--success)" },
  { key: "no_case", label: "No case", dot: "var(--text-muted)" },
];

const SORT_OPTIONS = [
  { value: "newest", label: "Newest first" },
  { value: "recent_activity", label: "Recent activity" },
  { value: "name", label: "Name A–Z" },
];

const searchParamsFor = (query) => {
  const q = query.trim();
  if (!q) return {};
  const phone = q.replace(/[\s-]/g, "").replace(/^(\+91|0)(?=\d{10}$)/, "");
  if (/^\d{10}$/.test(phone)) return { mobile: phone };
  if (/^\d+$/.test(q)) return { child_id: Number(q) };
  return { name: q };
};

function PatientDetail({ patient }) {
  const navigate = useNavigate();
  const readOnly = useReadOnly();
  const [extra, setExtra] = useState({ key: null, tasks: [], communications: [], error: null });
  const [tab, setTab] = useState("admissions");
  const [openVisit, setOpenVisit] = useState(null);
  const [openCase, setOpenCase] = useState(null);
  const [drawerComm, setDrawerComm] = useState(null);
  const [startPrompt, setStartPrompt] = useState(null);

  const childId = patient.child_id;
  useEffect(() => {
    let live = true;
    Promise.all([api.listTasks({ child_id: childId, status: "pending", limit: 500 }), api.listCommunications({ child_id: childId })])
      .then(([tasksRes, commsRes]) => live && setExtra({ key: childId, tasks: tasksRes?.tasks || [], communications: commsRes?.communications || [], error: null }))
      .catch((err) => {
        markHandled(err);
        if (live) setExtra({ key: childId, tasks: [], communications: [], error: err?.message || "The tasks and messages could not be read." });
      });
    return () => {
      live = false;
    };
  }, [childId, patient]);
  const extraLoaded = extra.key === childId;
  const tasks = extraLoaded ? extra.tasks : [];
  const communications = extraLoaded ? extra.communications : [];

  const visits = sortedVisits(patient);
  const current = currentAdmission(visits);
  const cases = patientCases(patient);
  const caseCount = Math.max(patient.cashless_cases_count || 0, cases.length);
  const sameCase = (t, c) => c.cashless_case_id != null && String(t.cashless_case_id) === String(c.cashless_case_id);
  const tasksFor = (c) => tasks.filter((t) => sameCase(t, c));
  const focusCase = (current ? casesOfVisit(current).find(isOpenCase) : null) || (isOpenCase(patient.latest_claim) ? patient.latest_claim : null) || cases.find(isOpenCase) || null;
  const from = `/registry?child_id=${childId}`;

  const goStartCase = (visit) => {
    navigate(`/case/${childId}/payer`, { state: { admission_id: visit?.admission_id ?? visit?.admission_no ?? null, newCase: true, estimatedBillAmount: estimatedBill(visit), from } });
  };
  const startCase = (visit) => {
    const ofVisit = casesOfVisit(visit).map((c) => String(c.cashless_case_id));
    const stale = cases.filter(
      (c) =>
        c.cashless_case_id &&
        isOpenCase(c) &&
        !c.claim_decision &&
        !c.payment_status &&
        !/APPROVED|QUERIED/i.test(c.preauth_status || "") &&
        !ofVisit.includes(String(c.cashless_case_id)),
    );
    if (stale.length && !readOnly) setStartPrompt({ visit, cases: stale });
    else goStartCase(visit);
  };
  const resumeCase = (c) => {
    if (!c?.cashless_case_id) {
      startCase(current);
      return;
    }
    navigate(`/case/${childId}/?case=${c.cashless_case_id}`, { state: { cashless_case_id: c.cashless_case_id, claim_id: c.claim_id ?? null, from } });
  };
  const openTask = (task) => {
    const path = taskScreen(task.task_type, childId, task.workflow) || `/case/${childId}/`;
    navigate(path, { state: { ...taskNavState(task), from } });
  };
  const openComm = (comm) => {
    setDrawerComm(comm.correlation_id);
  };
  const markRead = (id) => setExtra((prev) => ({ ...prev, communications: prev.communications.map((c) => (c.correlation_id === id ? { ...c, provider_read: true } : c)) }));

  const unread = communications.filter((c) => !c.provider_read).length;
  const sortedComms = [...communications].sort((a, b) => String(b.received_at || b.sent_at || "").localeCompare(String(a.received_at || a.sent_at || "")));
  const tabs = [
    { key: "admissions", label: "Admissions", count: visits.length },
    { key: "cases", label: "Cashless cases", count: caseCount, alert: tasks.length ? `${tasks.length} task${tasks.length === 1 ? "" : "s"}` : null },
    { key: "messages", label: "Payer messages", count: extraLoaded ? communications.length : "–", alert: unread ? `${unread} unread` : null },
  ];

  return (
    <div className="pt-screen">
      <PatientHeader patient={patient} current={current} focusCase={focusCase} openTasks={tasks.length} onResume={resumeCase} onStart={startCase} readOnly={readOnly} />

      <section className="pt-card pt-panel">
        <nav className="pt-tabs" role="tablist" aria-label="Patient sections">
          {tabs.map((t) => (
            <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} aria-controls={`pt-panel-${t.key}`} className={`pt-tab${tab === t.key ? " is-on" : ""}`} onClick={() => setTab(t.key)}>
              {t.label}
              <span className="pt-count">{t.count}</span>
              {t.alert && <span className="pt-count is-alert">{t.alert}</span>}
            </button>
          ))}
        </nav>

        <div className="pt-tab-body" role="tabpanel" id={`pt-panel-${tab}`}>
          {extra.error && (
            <div className="cv-notice is-warn pt-notice">
              <div className="cv-notice-body">Pending tasks and payer messages could not be read, so the counts may be wrong: {extra.error}</div>
            </div>
          )}
          {tab === "admissions" && <AdmissionsLedger visits={visits} onOpen={setOpenVisit} />}
          {tab === "cases" && (
            <>
              <CasesLedger cases={cases} tasksFor={tasksFor} onOpen={setOpenCase} />
              {cases.length < caseCount && <p className="pt-empty">Only the latest case is listed here. The rest are under Cashless Cases.</p>}
            </>
          )}
          {tab === "messages" && (!extraLoaded ? <LoadingBlock compact text="Loading messages…" /> : <MessagesLedger communications={sortedComms} onOpen={openComm} />)}
        </div>
      </section>

      <StartCasePrompt prompt={startPrompt} onCancel={() => setStartPrompt(null)} onStart={goStartCase} />
      <AdmissionDrawer visit={openVisit} onClose={() => setOpenVisit(null)} onStart={startCase} onResume={resumeCase} readOnly={readOnly} />
      <CaseDrawer summary={openCase} tasks={openCase ? tasksFor(openCase) : []} onClose={() => setOpenCase(null)} onOpenCase={resumeCase} onOpenTask={openTask} readOnly={readOnly} />
      <CommunicationDetailDrawer correlationId={drawerComm} open={!!drawerComm} onClose={() => setDrawerComm(null)} onRead={markRead} showOpenCase />
    </div>
  );
}

export default function PatientProfile() {
  const navigate = useNavigate();
  const readOnly = useReadOnly();
  const [searchParams, setSearchParams] = useSearchParams();
  const deepLinkChildId = searchParams.get("child_id");

  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState({ query: "", caseState: "any", sort: "newest", page: 1, n: 0 });
  const [list, setList] = useState({ n: -1, children: [], total: 0, counts: {}, error: null });
  const [detail, setDetail] = useState({ id: null, patient: null, error: null });
  const [detailReloads, setDetailReloads] = useState(0);
  const narrow = useMediaQuery("(max-width: 768px)");

  useEffect(() => {
    let live = true;
    api
      .searchChildren({ limit: PAGE_SIZE, offset: (filters.page - 1) * PAGE_SIZE, case_state: filters.caseState, sort: filters.sort, ...searchParamsFor(filters.query) })
      .then((res) => live && setList({ n: filters.n, children: res?.children || [], total: res?.total_count || 0, counts: res?.state_counts || {}, error: null }))
      .catch((err) => {
        markHandled(err);
        if (live) setList((prev) => ({ ...prev, n: filters.n, error: err?.message || "The patients could not be loaded." }));
      });
    return () => {
      live = false;
    };
  }, [filters]);

  useEffect(() => {
    if (!deepLinkChildId || !/^\d+$/.test(deepLinkChildId)) return undefined;
    let live = true;
    api
      .searchChildren({ child_id: Number(deepLinkChildId) })
      .then((res) => {
        if (!live) return;
        const full = res?.children?.find((c) => String(c.child_id) === deepLinkChildId) || null;
        setDetail({ id: deepLinkChildId, patient: full, error: null });
      })
      .catch((err) => {
        markHandled(err);
        if (live) setDetail({ id: deepLinkChildId, patient: null, error: err?.message || "The patient could not be loaded." });
      });
    return () => {
      live = false;
    };
  }, [deepLinkChildId, detailReloads]);

  const loading = list.n !== filters.n;
  const hasSearched = !!filters.query.trim();
  const apply = (patch) => setFilters((prev) => ({ ...prev, ...patch, n: prev.n + 1 }));
  const search = () => apply({ query, page: 1 });

  const selectPatient = (child) => {
    const next = new URLSearchParams(searchParams);
    next.set("child_id", String(child.child_id));
    setSearchParams(next);
  };
  const clearSelection = () => {
    const next = new URLSearchParams(searchParams);
    next.delete("child_id");
    setSearchParams(next, { replace: true });
  };

  if (deepLinkChildId) {
    const bad = !/^\d+$/.test(deepLinkChildId);
    const ready = detail.id === deepLinkChildId;
    return (
      <div className="cc-screen">
        <PageActions>
          <Button variant="outline" size="small" icon={RefreshCw} onClick={() => setDetailReloads((n) => n + 1)} title="Reload this patient's admissions, cases and messages">
            Refresh
          </Button>
        </PageActions>
        <div>
          <BackButton onClick={clearSelection}>All patients</BackButton>
        </div>
        {bad || (ready && !detail.patient) ? (
          <EmptyState icon={User} title="Patient not found" description={detail.error ? detail.error : `No patient ${deepLinkChildId}. Search by name or mobile.`}>
            <BackButton onClick={clearSelection}>All patients</BackButton>
          </EmptyState>
        ) : !ready ? (
          <LoadingBlock text="Loading the patient…" />
        ) : (
          <PatientDetail patient={detail.patient} />
        )}
      </div>
    );
  }

  return (
    <div className="cc-screen">
      <PageActions>
        <Button variant="outline" size="small" icon={RefreshCw} disabled={loading} onClick={() => apply({})} title="Reload the patients">
          {loading ? "Refreshing…" : "Refresh"}
        </Button>
      </PageActions>
      {list.error && (
        <div className="cv-notice is-warn" role="alert">
          <div className="cv-notice-body">The patients could not be loaded{list.children.length ? ", so the list may be out of date" : ""}: {list.error}</div>
          <div className="cv-notice-actions">
            <button type="button" className="cc-act" onClick={() => apply({})}>
              Retry
            </button>
          </div>
        </div>
      )}

      <Tip className="wq-page-tip">Find the patient, then press Start case.</Tip>

      <div className="wq-panel">
        <div className="wq-toolbar">
          <input
            className="input-modern wq-search"
            placeholder="Name, patient id or 10-digit mobile…"
            aria-label="Search patients"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") search();
            }}
          />
          <Button variant="outline" size="small" icon={Search} onClick={search}>
            Search
          </Button>
          <div className="wq-chips" role="group" aria-label="Case state">
            {CASE_STATE_TABS.map((t) => (
              <button key={t.key} type="button" aria-pressed={filters.caseState === t.key} className={`wq-chip${filters.caseState === t.key ? " is-on" : ""}`} onClick={() => apply({ caseState: t.key, page: 1 })}>
                {t.dot && <span className="wq-chip-dot" style={{ "--wq-dot": t.dot }} />}
                {t.label}
                <span className="wq-chip-count">{loading ? "–" : list.counts[t.key] ?? 0}</span>
              </button>
            ))}
          </div>
          <div className="wq-toolbar-spacer" />
          <div className="cc-sort">
            <Dropdown compact ariaLabel="Sort" value={filters.sort} options={SORT_OPTIONS} onChange={(v) => apply({ sort: v, page: 1 })} />
          </div>
        </div>

        {loading && !list.children.length ? (
          <SkeletonTable rows={6} cols={7} />
        ) : list.children.length === 0 ? (
          <EmptyState
            icon={User}
            title={hasSearched || filters.caseState !== "any" ? "No patients found" : "No patients registered yet"}
            description={filters.caseState !== "any" ? "No match. Try another filter." : hasSearched ? "Try a different name, patient id or mobile number." : "Patients registered in the hospital system appear here."}
          />
        ) : narrow ? (
          <ul className="pt-cards">
            {list.children.map((child) => {
              const claim = child.latest_claim;
              const admission = child.current_admission || currentAdmission(sortedVisits(child));
              return (
                <li key={child.child_id}>
                  <button type="button" className="pt-cardrow" onClick={() => selectPatient(child)}>
                    <Avatar patient={child} />
                    <span className="pt-cardrow-text">
                      <span className="cc-patient">{child.name}</span>
                      <span className="wq-sub">{[`#${child.child_id}`, humanize(child.gender, null), child.dob && formatAge(child.dob), child.mobile && formatPhone(child.mobile)].filter(Boolean).join(" · ")}</span>
                      <span className="wq-sub">
                        {admission ? (admission.ended_at ? `Discharged ${formatDate(admission.ended_at)}` : "In hospital") : "No admission"}
                        {claim ? ` · ${formatCaseRef(claim.cashless_case_id)}` : " · no case yet"}
                      </span>
                    </span>
                    {claim && <StageTrack claim={claim} />}
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="wq-table-scroll">
            <table className="wq-table cc-table">
              <thead>
                <tr>
                  <th>Patient</th>
                  <th>Mobile</th>
                  <th>Now</th>
                  <th>Latest case</th>
                  <th>Stage</th>
                  <th>Last activity</th>
                  <th className="cc-actions-col">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {list.children.map((child) => {
                  const claim = child.latest_claim;
                  const open = isOpenCase(claim);
                  const admission = child.current_admission || currentAdmission(sortedVisits(child));
                  return (
                    <tr
                      key={child.child_id}
                      tabIndex={0}
                      onClick={() => selectPatient(child)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") selectPatient(child);
                      }}
                    >
                      <td>
                        <div className="pt-person">
                          <Avatar patient={child} />
                          <div>
                            <div className="cc-patient">{child.name}</div>
                            <div className="wq-sub">{[`#${child.child_id}`, humanize(child.gender, null), child.dob && formatAge(child.dob), child.abha_number ? "ABHA linked" : null].filter(Boolean).join(" · ")}</div>
                          </div>
                        </div>
                      </td>
                      <td className="wq-num">{child.mobile ? formatPhone(child.mobile) : "—"}</td>
                      <td>{admission ? (admission.ended_at ? `Discharged ${formatDate(admission.ended_at)}` : <span className="pt-strong">In hospital</span>) : <span className="wq-sub">No admission</span>}</td>
                      <td>
                        {claim ? (
                          <>
                            <div className="wq-mono cc-case-id">{formatCaseRef(claim.cashless_case_id)}</div>
                            <div className="wq-sub cc-payer">
                              <PayerName id={claim.payer_id} name={claim.payer_name} />
                              {claim.policy_number && ` · ${claim.policy_number}`}
                            </div>
                          </>
                        ) : (
                          <span className="wq-sub">No case yet{child.cashless_cases_count ? ` · ${child.cashless_cases_count} earlier` : ""}</span>
                        )}
                      </td>
                      <td>{claim ? <StageTrack claim={claim} /> : null}</td>
                      <td className="wq-sub" title={child.last_activity ? formatDate(child.last_activity) : undefined}>
                        {child.last_activity ? formatRelative(child.last_activity) : "—"}
                      </td>
                      <td className="cc-actions-col">
                        <div className="cc-actions" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                          {!readOnly && (
                            <button
                              type="button"
                              className="cc-act"
                              onClick={() =>
                                open
                                  ? navigate(`/case/${child.child_id}/?case=${claim.cashless_case_id}`, { state: { cashless_case_id: claim.cashless_case_id, claim_id: claim.claim_id ?? null, from: "/registry" } })
                                  : navigate(`/case/${child.child_id}/payer`, { state: { newCase: true, admission_id: admission?.admission_id ?? admission?.admission_no ?? null, estimatedBillAmount: estimatedBill(admission), from: "/registry" } })
                              }
                            >
                              {open ? "Resume case" : "Start case"}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {!loading && list.children.length > 0 && (
          <div className="wq-pagination">
            <TablePagination page={filters.page - 1} pageSize={PAGE_SIZE} total={list.total} onPageChange={(p) => apply({ page: p + 1 })} label="patients" />
          </div>
        )}
      </div>
    </div>
  );
}
