import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Search, MessageSquare, AlertTriangle, CheckCircle2,
  Paperclip, Clock, Circle, AlertCircle, Send, LayoutGrid, List
} from "lucide-react";
import { api } from "../api";
import { Card, Button, Input, EmptyState, LoadingBlock, TablePagination } from "./Common";
import { formatDateTime, formatRelative } from "../format.js";
import SendCommunicationModal, { OUTBOUND_COMMUNICATIONS_ENABLED } from "./SendCommunicationModal";
import CommunicationDetailDrawer, {
  REASON_CONFIG,
  commHeadline,
  commPreview,
  commHasAttachment,
  commTone,
  priorityBadge,
} from "./CommunicationDetail";

const COMMS_PAGE_SIZE = 20;

const READ_FILTERS = [
  { key: "unread", label: "Unread" },
  { key: "read", label: "Read" },
  { key: "all", label: "All" },
];

function payerInitials(comm) {
  const words = String(comm?.payer_name || "")
    .replace(/[^A-Za-z0-9 ]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!words.length) return null;
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

export default function Communications({ allFacilitiesMode = false }) {
  const [communications, setCommunications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [payerFilter, setPayerFilter] = useState("");
  const [selectedCorrelationId, setSelectedCorrelationId] = useState(null);
  const [showSendModal, setShowSendModal] = useState(false);
  const [viewMode, setViewMode] = useState(() => localStorage.getItem("communications_viewMode") || "grid");
  const [sortBy, setSortBy] = useState("newest");
  const [quickFilter, setQuickFilter] = useState(null);
  const [readFilter, setReadFilter] = useState(() => localStorage.getItem("communications_readFilter") || "unread");

  useEffect(() => { localStorage.setItem("communications_viewMode", viewMode); }, [viewMode]);
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
  const readFilterCounts = {
    unread: unreadCount,
    read: communications.length - unreadCount,
    all: communications.length,
  };

  const [commsPage, setCommsPage] = useState(0);
  const filteredComms = communications.filter((c) => {
    const q = searchQuery.toLowerCase();
    const matchSearch = !q ||
      c.topic_display?.toLowerCase().includes(q) ||
      c.payer_id?.toLowerCase().includes(q) ||
      c.payer_name?.toLowerCase().includes(q) ||
      c.claim_reference?.toLowerCase().includes(q) ||
      c.reason_display?.toLowerCase().includes(q) ||
      c.subject?.toLowerCase().includes(q);
    const matchPayer = !payerFilter || c.payer_id === payerFilter;
    const matchRead =
      readFilter === "all" || (readFilter === "unread" ? !c.provider_read : !!c.provider_read);
    const matchQuick = !quickFilter || c.pending_tasks?.length > 0;
    return matchSearch && matchPayer && matchRead && matchQuick;
  }).sort((a, b) => {
    if (sortBy === "priority") {
      const pA = a.priority === "urgent" || a.priority === "stat" ? 2 : a.priority === "asap" ? 1 : 0;
      const pB = b.priority === "urgent" || b.priority === "stat" ? 2 : b.priority === "asap" ? 1 : 0;
      if (pA !== pB) return pB - pA;
    }
    const tA = Date.parse(a.sent_at) || 0;
    const tB = Date.parse(b.sent_at) || 0;
    return sortBy === "oldest" ? tA - tB : tB - tA;
  });

  const commsPageCount = Math.max(1, Math.ceil(filteredComms.length / COMMS_PAGE_SIZE));
  const safeCommsPage = Math.min(commsPage, commsPageCount - 1);
  const pagedComms = filteredComms.slice(safeCommsPage * COMMS_PAGE_SIZE, (safeCommsPage + 1) * COMMS_PAGE_SIZE);

  return (
    <div className="communications-screen">
      {loadError && (
        <div className="inline-error-banner">
          <AlertCircle size={16} />
          Could not load communications. Showing the last known results, if any.
        </div>
      )}

      <div className="cm-toolbar">
        <div className="cm-toolbar-search">
          <Input icon={Search} placeholder="Search topic, payer, claim, subject…" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
        </div>
        {uniquePayers.length > 0 && (
          <select className="input-modern cm-toolbar-select" value={payerFilter} onChange={(e) => setPayerFilter(e.target.value)}>
            <option value="">All Payers</option>
            {uniquePayers.map((p) => <option key={p} value={p}>{payerLabel(p)}</option>)}
          </select>
        )}
        <select
          className="input-modern cm-toolbar-select"
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
        >
          <option value="newest">Newest First</option>
          <option value="oldest">Oldest First</option>
          <option value="priority">Priority First</option>
        </select>
        <div className="cm-viewtoggle" role="group" aria-label="View mode">
          <button
            type="button"
            title="Grid View"
            aria-pressed={viewMode === "grid"}
            onClick={() => setViewMode("grid")}
          >
            <LayoutGrid size={16} />
          </button>
          <button
            type="button"
            title="Table View"
            aria-pressed={viewMode === "table"}
            onClick={() => setViewMode("table")}
          >
            <List size={16} />
          </button>
        </div>
        {OUTBOUND_COMMUNICATIONS_ENABLED && (
          <Button variant="outline" size="small" icon={Send} onClick={() => setShowSendModal(true)}>
            Message Payer
          </Button>
        )}
      </div>

      <div className="cm-resultbar">
        <div className="cm-segmented" role="group" aria-label="Filter by read state">
          {READ_FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              aria-pressed={readFilter === f.key}
              onClick={() => setReadFilter(f.key)}
            >
              {f.label}
              <span className="cm-segmented-count">{readFilterCounts[f.key]}</span>
            </button>
          ))}
        </div>
        <span className="cm-resultbar-count">
          {filteredComms.length}
          <span> {filteredComms.length === 1 ? "message" : "messages"}</span>
          {filteredComms.length !== communications.length && <em> of {communications.length}</em>}
        </span>
        <div className="cm-resultbar-chips">
          {actionNeededCount > 0 && (
            <button
              type="button"
              className={`cm-count${quickFilter === "action" ? " is-on" : ""}`}
              style={{ "--cm-count-tone": "var(--error)" }}
              aria-pressed={quickFilter === "action"}
              title={quickFilter === "action" ? "Show all messages" : "Show only messages with an open task"}
              onClick={() => {
                setQuickFilter((f) => (f === "action" ? null : "action"));
                if (quickFilter !== "action") setReadFilter("all");
              }}
            >
              {actionNeededCount} need action
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <LoadingBlock text="Loading communications…" />
      ) : filteredComms.length === 0 ? (
        readFilter !== "all" && communications.length > 0 && readFilterCounts[readFilter] === 0 ? (
          <EmptyState
            icon={readFilter === "unread" ? CheckCircle2 : MessageSquare}
            title={readFilter === "unread" ? "You are all caught up" : "No read messages"}
            description={
              readFilter === "unread"
                ? `Every one of your ${communications.length} payer message${communications.length === 1 ? "" : "s"} has been read.`
                : "None of your payer messages have been read yet."
            }
          >
            <Button variant="outline" size="small" onClick={() => setReadFilter("all")}>
              Show all messages
            </Button>
          </EmptyState>
        ) : (
          <EmptyState
            icon={MessageSquare}
            title="No Communications"
            description="No payer messages match your filters."
          />
        )
      ) : viewMode === "grid" ? (
        <div className="cm-well">
          <motion.div className="cm-grid" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
            {pagedComms.map((comm) => {
              const reasonCfg = REASON_CONFIG[comm.reason_code] ?? {};
              const hasAction = comm.pending_tasks?.length > 0;
              const isUnread = !comm.provider_read;
              const preview = commPreview(comm);
              return (
                <motion.article
                  key={comm.correlation_id}
                  layout
                  initial={{ opacity: 0, scale: 0.97 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="cm-card"
                  data-tone={commTone(comm)}
                >
                  <div className="cm-card-top">
                    <span className="cm-avatar" aria-hidden="true">
                      {payerInitials(comm) ?? <MessageSquare size={17} />}
                      {isUnread && <span className="cm-avatar-dot" />}
                    </span>
                    <div className="cm-card-headline">
                      <h3 className="cm-title">{commHeadline(comm)}</h3>
                      <div className="cm-meta">
                        <span className="cm-meta-strong">{comm.payer_name || comm.payer_id}</span>
                        {comm.facility_name && <span>{comm.facility_name}</span>}
                      </div>
                    </div>
                    {comm.claim_reference && <code className="cm-ref">{comm.claim_reference}</code>}
                  </div>

                  <div className="cm-tags">
                    {comm.priority && priorityBadge(comm.priority)}
                    {comm.reason_code && <span className={`badge-modern ${reasonCfg.badge || "badge-info"}`}>{reasonCfg.label || comm.reason_display || comm.reason_code}</span>}
                    {hasAction && <span className="cm-flag"><AlertTriangle size={11} /> Action Required</span>}
                    {commHasAttachment(comm) && <span className="cm-chip"><Paperclip size={11} /> Attachment</span>}
                  </div>

                  {preview ? (
                    <p className="cm-subject">{preview}</p>
                  ) : (
                    <p className="cm-subject is-empty">No message body was sent with this notification.</p>
                  )}

                  {hasAction && (
                    <div className="cm-tasks">
                      <strong>{comm.pending_tasks.length} open task{comm.pending_tasks.length > 1 ? "s" : ""}</strong>
                      <span>{comm.pending_tasks.map((t) => t.title).join(", ")}</span>
                    </div>
                  )}

                  <div className="cm-card-foot">
                    <div className="cm-meta">
                      <span title={formatDateTime(comm.sent_at)}>
                        <Clock size={11} /> {formatRelative(comm.sent_at)}
                      </span>
                      {isUnread && <span className="cm-state is-unread"><Circle size={11} /> Unread</span>}
                    </div>
                    <Button variant={hasAction ? "primary" : "outline"} size="small" onClick={() => setSelectedCorrelationId(comm.correlation_id)}>
                      {hasAction ? "Review & Act" : "View"}
                    </Button>
                  </div>
                </motion.article>
              );
            })}
          </motion.div>
          <TablePagination
            page={safeCommsPage}
            pageSize={COMMS_PAGE_SIZE}
            total={filteredComms.length}
            onPageChange={setCommsPage}
            label="messages"
          />
        </div>
      ) : (
        <Card style={{ padding: 0, overflow: "hidden" }}>
          <div className="table-responsive-wrapper">
            <table className="table-modern">
              <thead>
                <tr>
                  <th>Topic</th>
                  <th>Payer</th>
                  <th>Claim Reference</th>
                  <th>Date</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {pagedComms.map((comm) => {
                  const hasAction = comm.pending_tasks?.length > 0;
                  const isUnread = !comm.provider_read;
                  const preview = commPreview(comm);
                  return (
                    <tr key={comm.correlation_id} className="cm-row" data-tone={commTone(comm)}>
                      <td>
                        <div className="cm-row-title">{commHeadline(comm)}</div>
                        {preview && <div className="cm-row-preview">{preview}</div>}
                        {hasAction && <div className="cm-flag"><AlertTriangle size={10} /> Action Required</div>}
                      </td>
                      <td>
                        <div className="cm-row-payer">{comm.payer_name || comm.payer_id}</div>
                        {comm.payer_name && comm.payer_id && <div className="cm-row-sub">{comm.payer_id}</div>}
                      </td>
                      <td>{comm.claim_reference ? <code className="cm-ref">{comm.claim_reference}</code> : "—"}</td>
                      <td title={formatDateTime(comm.sent_at)} style={{ whiteSpace: "nowrap" }}>
                        {formatDateTime(comm.sent_at)}
                      </td>
                      <td>
                        {isUnread
                          ? <span className="cm-state is-unread"><Circle size={11} /> Unread</span>
                          : <span className="cm-state"><CheckCircle2 size={11} /> Read</span>}
                      </td>
                      <td>
                        <Button variant={hasAction ? "primary" : "outline"} size="small" onClick={() => setSelectedCorrelationId(comm.correlation_id)}>
                          {hasAction ? "Review & Act" : "View"}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <TablePagination
              page={safeCommsPage}
              pageSize={COMMS_PAGE_SIZE}
              total={filteredComms.length}
              onPageChange={setCommsPage}
              label="messages"
            />
          </div>
        </Card>
      )}

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
