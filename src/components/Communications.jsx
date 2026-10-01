import { useState, useEffect } from "react";
import { Paperclip, AlertCircle, Send } from "lucide-react";
import { api } from "../api";
import { Button, SkeletonTable, TablePagination } from "./Common";
import Dropdown from "./Dropdown";
import { formatDateTime, formatRelative } from "../format.js";
import SendCommunicationModal, { OUTBOUND_COMMUNICATIONS_ENABLED } from "./SendCommunicationModal";
import CommunicationDetailDrawer, {
  REASON_CONFIG,
  commHeadline,
  commPreview,
  commHasAttachment,
} from "./CommunicationDetail";

const COMMS_PAGE_SIZE = 20;

const SORT_OPTIONS = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "priority", label: "Priority first" },
];

export default function Communications({ allFacilitiesMode = false }) {
  const [communications, setCommunications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [payerFilter, setPayerFilter] = useState("");
  const [selectedCorrelationId, setSelectedCorrelationId] = useState(null);
  const [showSendModal, setShowSendModal] = useState(false);
  const [sortBy, setSortBy] = useState("newest");
  // One view filter: unread / action / read / all (persisted per browser).
  const [readFilter, setReadFilter] = useState(() => localStorage.getItem("communications_readFilter") || "unread");

  useEffect(() => { localStorage.setItem("communications_readFilter", readFilter); }, [readFilter]);

  const fetchComms = async (params = {}) => {
    setLoading(true);
    setLoadError(false);
    try {
      const res = await api.listCommunications(params);
      setCommunications(res?.communications || []);
    } catch (_) {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchComms({ limit: 200 }); }, []);

  const handleRead = (correlationId) => {
    setCommunications((prev) =>
      prev.map((c) => c.correlation_id === correlationId ? { ...c, provider_read: true } : c)
    );
  };

  const uniquePayers = [...new Set(communications.map((c) => c.payer_id).filter(Boolean))];
  const payerLabel = (code) => communications.find((c) => c.payer_id === code)?.payer_name || code;
  const unreadCount = communications.filter((c) => !c.provider_read).length;
  const actionNeededCount = communications.filter((c) => c.pending_tasks?.length > 0).length;

  const [commsPage, setCommsPage] = useState(0);
  const isAction = (c) => c.pending_tasks?.length > 0;
  const VIEWS = [
    { key: "unread", label: "Unread", match: (c) => !c.provider_read, dot: "var(--info)" },
    { key: "action", label: "Needs action", match: isAction, dot: "var(--warning)" },
    { key: "read", label: "Read", match: (c) => !!c.provider_read },
    { key: "all", label: "All", match: () => true },
  ];
  const view = VIEWS.find((v) => v.key === readFilter) || VIEWS[0];

  const q = searchQuery.trim().toLowerCase();
  const searched = communications.filter((c) => {
    const matchSearch = !q ||
      c.topic_display?.toLowerCase().includes(q) ||
      c.payer_id?.toLowerCase().includes(q) ||
      c.payer_name?.toLowerCase().includes(q) ||
      c.claim_reference?.toLowerCase().includes(q) ||
      c.reason_display?.toLowerCase().includes(q) ||
      c.subject?.toLowerCase().includes(q);
    return matchSearch && (!payerFilter || c.payer_id === payerFilter);
  });
  const viewCounts = Object.fromEntries(VIEWS.map((v) => [v.key, searched.filter(v.match).length]));

  const priorityRank = (c) => (c.priority === "urgent" || c.priority === "stat" ? 2 : c.priority === "asap" ? 1 : 0);
  const filteredComms = searched.filter(view.match).sort((a, b) => {
    if (sortBy === "priority" && priorityRank(a) !== priorityRank(b)) return priorityRank(b) - priorityRank(a);
    const tA = Date.parse(a.sent_at) || 0;
    const tB = Date.parse(b.sent_at) || 0;
    return sortBy === "oldest" ? tA - tB : tB - tA;
  });

  const commsPageCount = Math.max(1, Math.ceil(filteredComms.length / COMMS_PAGE_SIZE));
  const safeCommsPage = Math.min(commsPage, commsPageCount - 1);
  const pagedComms = filteredComms.slice(safeCommsPage * COMMS_PAGE_SIZE, (safeCommsPage + 1) * COMMS_PAGE_SIZE);

  const payerOptions = [{ value: "", label: "All payers" }, ...uniquePayers.map((p) => ({ value: p, label: payerLabel(p) }))];

  return (
    <div className="cc-screen communications-screen">
      <div className="wq-header">
        <div>
          <div className="wq-counts">
            <span>{loading ? "Loading messages…" : `${communications.length} message${communications.length === 1 ? "" : "s"}`}</span>
            {!loading && unreadCount > 0 && <span>{unreadCount} unread</span>}
            {!loading && actionNeededCount > 0 && <span className="is-overdue">{actionNeededCount} need action</span>}
          </div>
        </div>
        {OUTBOUND_COMMUNICATIONS_ENABLED && (
          <div className="cc-header-actions">
            <Button variant="outline" size="small" icon={Send} onClick={() => setShowSendModal(true)}>
              Message payer
            </Button>
          </div>
        )}
      </div>

      {loadError && (
        <div className="inline-error-banner" style={{ margin: 0 }}>
          <AlertCircle size={16} />
          Could not load communications. Showing the last known results, if any.
        </div>
      )}

      <div className="wq-panel">
        <div className="wq-toolbar">
          <input
            className="input-modern wq-search"
            placeholder="Search topic, payer, claim, subject…"
            aria-label="Search messages"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCommsPage(0);
            }}
          />
          <div className="wq-chips" role="tablist" aria-label="Message view">
            {VIEWS.map((v) => (
              <button
                key={v.key}
                type="button"
                role="tab"
                aria-selected={view.key === v.key}
                className={`wq-chip${view.key === v.key ? " is-on" : ""}`}
                onClick={() => {
                  setReadFilter(v.key);
                  setCommsPage(0);
                }}
              >
                {v.dot && <span className="wq-chip-dot" style={{ "--wq-dot": v.dot }} />}
                {v.label}
                <span className="wq-chip-count">{loading ? "–" : viewCounts[v.key]}</span>
              </button>
            ))}
          </div>
          <div className="wq-toolbar-spacer" />
          {uniquePayers.length > 1 && (
            <div style={{ width: "180px" }}>
              <Dropdown compact ariaLabel="Payer" value={payerFilter} options={payerOptions} onChange={(v) => { setPayerFilter(v); setCommsPage(0); }} />
            </div>
          )}
          <div style={{ width: "160px" }}>
            <Dropdown compact ariaLabel="Sort" value={sortBy} options={SORT_OPTIONS} onChange={(v) => { setSortBy(v); setCommsPage(0); }} />
          </div>
        </div>

        {loading ? (
          <SkeletonTable rows={5} cols={4} />
        ) : filteredComms.length === 0 ? (
          <div className="wq-empty">
            <div className="wq-empty-title">
              {view.key === "unread" && communications.length > 0 && !q && !payerFilter
                ? "You're all caught up"
                : communications.length === 0
                  ? "No payer messages yet"
                  : "No messages match these filters"}
            </div>
            {communications.length > 0 && (
              <div className="cc-empty-hint">
                {view.key === "unread" && !q && !payerFilter
                  ? `All ${communications.length} payer message${communications.length === 1 ? " has" : "s have"} been read.`
                  : "Try a different search, payer or view."}
              </div>
            )}
            {communications.length > 0 && view.key !== "all" && (
              <Button variant="outline" size="small" onClick={() => setReadFilter("all")}>
                Show all messages
              </Button>
            )}
          </div>
        ) : (
          <>
            <ul className="cm-inbox">
              {pagedComms.map((comm) => {
                const hasAction = isAction(comm);
                const isUnread = !comm.provider_read;
                const preview = commPreview(comm);
                const reasonLabel = REASON_CONFIG[comm.reason_code]?.label || comm.reason_display || comm.reason_code;
                const urgent = /urgent|stat/i.test(comm.priority || "");
                return (
                  <li key={comm.correlation_id}>
                    <button
                      type="button"
                      className={`cm-item${isUnread ? " is-unread" : ""}${hasAction ? " is-action" : ""}`}
                      onClick={() => setSelectedCorrelationId(comm.correlation_id)}
                    >
                      <span className="cm-item-dot" aria-label={isUnread ? "Unread" : undefined} />
                      <span className="cm-item-main">
                        <span className="cm-item-title">
                          {commHeadline(comm)}
                          {commHasAttachment(comm) && <Paperclip size={13} className="cm-item-icon" aria-label="Has attachment" />}
                        </span>
                        <span className="cm-item-preview">{preview || "No message body was sent with this notification."}</span>
                        <span className="cm-item-tags">
                          {comm.priority && <span className={urgent ? "is-bad" : undefined}>{String(comm.priority).toUpperCase()}</span>}
                          {reasonLabel && <span>{reasonLabel}</span>}
                          {hasAction && (
                            <span className="cm-item-task">
                              {comm.pending_tasks.length} open task{comm.pending_tasks.length > 1 ? "s" : ""}: {comm.pending_tasks.map((t) => t.title).join(", ")}
                            </span>
                          )}
                        </span>
                      </span>
                      <span className="cm-item-side">
                        <span className="cm-item-payer">{comm.payer_name || comm.payer_id}</span>
                        {comm.claim_reference && <span className="wq-mono cm-item-ref">{comm.claim_reference}</span>}
                        {comm.facility_name && <span className="cm-item-ref">{comm.facility_name}</span>}
                      </span>
                      <span className="cm-item-time" title={formatDateTime(comm.sent_at)}>
                        {formatRelative(comm.sent_at)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
            <div className="wq-pagination">
              <TablePagination
                page={safeCommsPage}
                pageSize={COMMS_PAGE_SIZE}
                total={filteredComms.length}
                onPageChange={setCommsPage}
                label="messages"
              />
            </div>
          </>
        )}
      </div>

      <CommunicationDetailDrawer
        correlationId={selectedCorrelationId}
        open={!!selectedCorrelationId}
        onClose={() => setSelectedCorrelationId(null)}
        onRead={handleRead}
        allFacilitiesMode={allFacilitiesMode}
      />

      <SendCommunicationModal open={showSendModal} onClose={() => setShowSendModal(false)} />
    </div>
  );
}
