import { useState, useEffect } from "react";
import { Paperclip, Send, RefreshCw } from "lucide-react";
import { api, markHandled } from "../../api";
import { Button, SkeletonTable, TablePagination, Tip } from "../ui/Common";
import PageActions from "../ui/PageActions";
import Dropdown from "../ui/Dropdown";
import { formatDateTime, formatRelative, priorityLabel } from "../../lib/format.js";
import SendMessageDrawer, { OUTBOUND_COMMUNICATIONS_ENABLED } from "./SendMessageDrawer";
import PayerName from "../ui/PayerName";
import CommunicationDetailDrawer from "./CommunicationDetail";
import { commHeadline, commPreview, commHasAttachment, commTime, hasOpenTask, isUrgent, priorityRank, reasonLabel } from "../../domain/communications";
import { taskLabel } from "../../domain/tasks";
import { usePulse, useOnChange } from "../../lib/pulse";

const PAGE_SIZE = 20;

const SORT_OPTIONS = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "priority", label: "Priority first" },
];

const VIEWS = [
  { key: "unread", label: "Unread", match: (c) => !c.provider_read, dot: "var(--info)" },
  { key: "action", label: "Needs action", match: hasOpenTask, dot: "var(--warning)" },
  { key: "read", label: "Read", match: (c) => !!c.provider_read },
  { key: "all", label: "All", match: () => true },
];

export default function Communications({ allFacilitiesMode = false }) {
  const [data, setData] = useState({ key: -1, list: null, error: null });
  const [reloadKey, setReloadKey] = useState(0);
  const [search, setSearch] = useState("");
  const [payerFilter, setPayerFilter] = useState("");
  const [selected, setSelected] = useState(null);
  const [sendOpen, setSendOpen] = useState(false);
  const [sortBy, setSortBy] = useState("newest");
  const [page, setPage] = useState(0);
  const [view, setView] = useState(() => localStorage.getItem("communications_readFilter") || "unread");

  useEffect(() => {
    localStorage.setItem("communications_readFilter", view);
  }, [view]);

  useEffect(() => {
    let live = true;
    api
      .listCommunications({ limit: 200 })
      .then((res) => live && setData({ key: reloadKey, list: res?.communications || [], error: null }))
      .catch((err) => {
        markHandled(err);
        if (live) setData((prev) => ({ ...prev, key: reloadKey, error: err?.message || "The messages could not be loaded." }));
      });
    return () => {
      live = false;
    };
  }, [reloadKey]);

  const loading = data.key !== reloadKey;
  const communications = data.list || [];
  const pulse = usePulse();
  const refresh = () => setReloadKey((k) => k + 1);
  useOnChange(pulse.commsStamp, refresh);
  const markRead = (id) => setData((prev) => ({ ...prev, list: (prev.list || []).map((c) => (c.correlation_id === id ? { ...c, provider_read: true } : c)) }));

  const payers = [...new Map(communications.filter((c) => c.payer_id).map((c) => [c.payer_id, c.payer_name || c.payer_id])).entries()];
  const q = search.trim().toLowerCase();
  const searched = communications.filter((c) => {
    const hit = !q || [c.topic_display, c.payer_id, c.payer_name, c.claim_reference, c.reason_display, c.subject, reasonLabel(c)].some((v) => v?.toLowerCase().includes(q));
    return hit && (!payerFilter || c.payer_id === payerFilter);
  });
  const current = VIEWS.find((v) => v.key === view) || VIEWS[0];
  const counts = Object.fromEntries(VIEWS.map((v) => [v.key, searched.filter(v.match).length]));
  const filtered = searched.filter(current.match).sort((a, b) => {
    if (sortBy === "priority" && priorityRank(a) !== priorityRank(b)) return priorityRank(b) - priorityRank(a);
    const tA = Date.parse(commTime(a)) || 0;
    const tB = Date.parse(commTime(b)) || 0;
    return sortBy === "oldest" ? tA - tB : tB - tA;
  });
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const paged = filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);
  const pickView = (key) => {
    setView(key);
    setPage(0);
  };

  return (
    <div className="cc-screen communications-screen">
      <PageActions>
        <Button variant="outline" size="small" icon={RefreshCw} disabled={loading} onClick={refresh} title="Reload the messages">
          {loading ? "Refreshing…" : "Refresh"}
        </Button>
        {OUTBOUND_COMMUNICATIONS_ENABLED && !allFacilitiesMode && (
          <Button variant="primary" size="small" icon={Send} write onClick={() => setSendOpen(true)}>
            Message the payer
          </Button>
        )}
      </PageActions>

      {data.error && (
        <div className="cv-notice is-warn" role="alert">
          <div className="cv-notice-body">The messages could not be loaded{data.list ? ", so the list may be out of date" : ""}: {data.error}</div>
          <div className="cv-notice-actions">
            <button type="button" className="cc-act" onClick={refresh}>
              Retry
            </button>
          </div>
        </div>
      )}

      <Tip className="wq-page-tip">Messages from payers about your cases. A query is a question from the payer: reply with what it asks for. A notification only needs to be read.</Tip>

      <div className="wq-panel">
        <div className="wq-toolbar">
          <input
            className="input-modern wq-search"
            placeholder="Search topic, payer, reference or subject…"
            aria-label="Search messages"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
          />
          <div className="wq-chips" role="group" aria-label="Message view">
            {VIEWS.map((v) => (
              <button key={v.key} type="button" aria-pressed={current.key === v.key} className={`wq-chip${current.key === v.key ? " is-on" : ""}`} onClick={() => pickView(v.key)}>
                {v.dot && <span className="wq-chip-dot" style={{ "--wq-dot": v.dot }} />}
                {v.label}
                <span className="wq-chip-count">{loading && !data.list ? "–" : counts[v.key]}</span>
              </button>
            ))}
          </div>
          <div className="wq-toolbar-spacer" />
          {payers.length > 1 && (
            <div className="cm-filter">
              <Dropdown
                compact
                ariaLabel="Payer"
                value={payerFilter}
                options={[{ value: "", label: "All payers" }, ...payers.map(([code, name]) => ({ value: code, label: name }))]}
                onChange={(v) => {
                  setPayerFilter(v);
                  setPage(0);
                }}
              />
            </div>
          )}
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
        </div>

        {loading && !data.list ? (
          <SkeletonTable rows={5} cols={4} />
        ) : filtered.length === 0 ? (
          <div className="wq-empty">
            <div className="wq-empty-title">{current.key === "unread" && communications.length > 0 && !q && !payerFilter ? "No unread messages" : communications.length === 0 ? "No payer messages yet" : "No messages match these filters"}</div>
            {communications.length > 0 && <div className="cc-empty-hint">{current.key === "unread" && !q && !payerFilter ? `All ${communications.length} payer message${communications.length === 1 ? " has" : "s have"} been read.` : "Try a different search, payer or view."}</div>}
            {communications.length > 0 && current.key !== "all" && (
              <Button variant="outline" size="small" onClick={() => pickView("all")}>
                Show all messages
              </Button>
            )}
          </div>
        ) : (
          <>
            <ul className="cm-inbox">
              {paged.map((comm) => {
                const action = hasOpenTask(comm);
                const unread = !comm.provider_read;
                const preview = commPreview(comm);
                return (
                  <li key={comm.correlation_id}>
                    <button type="button" className={`cm-item${unread ? " is-unread" : ""}${action ? " is-action" : ""}`} onClick={() => setSelected(comm.correlation_id)}>
                      <span className="cm-item-dot" aria-label={unread ? "Unread" : undefined} />
                      <span className="cm-item-main">
                        <span className="cm-item-title">
                          {commHeadline(comm)}
                          {commHasAttachment(comm) && <Paperclip size={13} className="cm-item-icon" aria-label="Has attachment" />}
                        </span>
                        <span className="cm-item-preview">{preview || "The payer sent no text with this message."}</span>
                        <span className="cm-item-tags">
                          {comm.priority && <span className={isUrgent(comm) ? "is-bad" : undefined}>{priorityLabel(comm.priority)}</span>}
                          {reasonLabel(comm) && reasonLabel(comm) !== commHeadline(comm) && <span>{reasonLabel(comm)}</span>}
                          {action && <span className="cm-item-task">{comm.pending_tasks.map((t) => taskLabel(t.task_type) || t.title).join(", ")}</span>}
                        </span>
                      </span>
                      <span className="cm-item-side">
                        <span className="cm-item-payer">
                          <PayerName id={comm.payer_id} name={comm.payer_name} />
                        </span>
                        {comm.claim_reference && <span className="wq-mono cm-item-ref">{comm.claim_reference}</span>}
                        {comm.facility_name && <span className="cm-item-ref">{comm.facility_name}</span>}
                      </span>
                      <span className="cm-item-time" title={formatDateTime(commTime(comm))}>
                        {formatRelative(commTime(comm))}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
            <div className="wq-pagination">
              <TablePagination page={safePage} pageSize={PAGE_SIZE} total={filtered.length} onPageChange={setPage} label="messages" />
            </div>
          </>
        )}
      </div>

      <CommunicationDetailDrawer correlationId={selected} open={!!selected} onClose={() => setSelected(null)} onRead={markRead} onChanged={refresh} allFacilitiesMode={allFacilitiesMode} />

      <SendMessageDrawer open={sendOpen} onClose={() => setSendOpen(false)} onSent={refresh} />
    </div>
  );
}
