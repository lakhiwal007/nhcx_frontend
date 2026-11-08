import { useState } from "react";
import { MessageSquare, Pin, Clock, ChevronDown } from "lucide-react";
import { formatRelative } from "../../format.js";
import { commHeadline, commPreview } from "../CommunicationDetail";

function itemsFor({ communications, notes, heldTasks }) {
  const items = [];
  const open = communications.filter((c) => !c.provider_read || c.pending_tasks?.length > 0);
  [...open]
    .sort((a, b) => (Date.parse(b.sent_at) || 0) - (Date.parse(a.sent_at) || 0))
    .forEach((c) => {
      items.push({
        key: `comm-${c.correlation_id}`,
        tone: c.pending_tasks?.length > 0 ? "urgent" : "info",
        icon: MessageSquare,
        title: commHeadline(c),
        detail: [commPreview(c), formatRelative(c.sent_at)].filter(Boolean).join(" · "),
        action: { label: c.pending_tasks?.length > 0 ? "Reply" : "Read", comm: c.correlation_id },
      });
    });
  heldTasks.forEach((t) => {
    items.push({
      key: `held-${t.id}`,
      tone: "wait",
      icon: Clock,
      title: `On hold: ${t.title}`,
      detail: t.metadata?.hold?.reason || "This comes back to the work queue when the payer answers.",
    });
  });
  notes.filter((n) => n.pinned).forEach((n) => {
    items.push({
      key: `note-${n.id}`,
      tone: "info",
      icon: Pin,
      title: n.body,
      detail: `${n.author_name || "Staff"} · ${formatRelative(n.created_at)}`,
      action: { label: "Notes", notes: true },
    });
  });
  return items;
}

export default function AttentionTray({ communications = [], notes = [], heldTasks = [], onOpenComm, onOpenNotes }) {
  const [open, setOpen] = useState(false);
  const items = itemsFor({ communications, notes, heldTasks });
  if (items.length === 0) return null;
  const urgent = items.some((i) => i.tone === "urgent");
  const needYou = items.filter((i) => i.tone === "urgent" || i.tone === "info").length;
  const first = items[0];

  return (
    <section className={`cv-tray${urgent ? " is-urgent" : ""}`} aria-label="Needs attention">
      <button type="button" className="cv-tray-head" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        {needYou > 0 ? <span className={`cv-chip ${urgent ? "is-warn" : "is-info"}`}>{needYou} {needYou === 1 ? "needs" : "need"} you</span> : <span className="cv-chip is-todo">Note</span>}
        <span className="cv-tray-line">{first.title}</span>
        {items.length > 1 && <span className="cv-tray-more">+{items.length - 1} more</span>}
        <ChevronDown size={16} className={`cv-tray-chevron${open ? " is-open" : ""}`} aria-hidden="true" />
      </button>
      {open && (
        <ul className="cv-tray-list">
          {items.map((i) => {
            const Icon = i.icon;
            return (
              <li key={i.key} className={`cv-tray-item is-${i.tone}`}>
                <Icon size={16} aria-hidden="true" />
                <div className="cv-tray-text">
                  <div className="cv-tray-title">{i.title}</div>
                  {i.detail && <div className="cv-tray-detail">{i.detail}</div>}
                </div>
                {i.action && (
                  <button
                    type="button"
                    className="cv-btn"
                    onClick={() => (i.action.notes ? onOpenNotes() : onOpenComm(i.action.comm))}
                  >
                    {i.action.label}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
