import { useState } from "react";
import { MessageSquare, Pin, Clock, ChevronDown } from "lucide-react";
import { formatRelative } from "../../format.js";
import { commHeadline, commPreview } from "../CommunicationDetail";

function itemsFor({ communications, notes, heldTasks }) {
  const items = [];
  const open = communications.filter((c) => !c.provider_read || c.pending_tasks?.length > 0);
  [...open]
    .sort((a, b) => (Date.parse(b.received_at || b.sent_at) || 0) - (Date.parse(a.received_at || a.sent_at) || 0))
    .forEach((c) => {
      const asks = c.pending_tasks?.length > 0;
      items.push({
        key: `comm-${c.correlation_id}`,
        tone: asks ? "urgent" : "info",
        needsYou: true,
        icon: MessageSquare,
        title: commHeadline(c),
        detail: [commPreview(c), formatRelative(c.received_at || c.sent_at)].filter(Boolean).join(" · "),
        action: asks ? { label: "Reply", reply: c } : { label: "Read", comm: c.correlation_id },
      });
    });
  heldTasks.forEach((t) => {
    items.push({
      key: `held-${t.id}`,
      tone: "wait",
      needsYou: false,
      icon: Clock,
      title: `On hold: ${t.title}`,
      detail: t.metadata?.hold?.reason || "Comes back to the work queue when the payer answers.",
    });
  });
  notes.filter((n) => n.pinned).forEach((n) => {
    items.push({
      key: `note-${n.id}`,
      tone: "quiet",
      needsYou: false,
      icon: Pin,
      title: n.body,
      detail: `${n.author_name || "Staff"} · ${formatRelative(n.created_at)}`,
      action: { label: "Notes", notes: true },
    });
  });
  return items;
}

export default function AttentionTray({ communications = [], notes = [], heldTasks = [], onOpenComm, onOpenNotes, onReply }) {
  const [open, setOpen] = useState(false);
  const items = itemsFor({ communications, notes, heldTasks });
  if (items.length === 0) return null;
  const urgent = items.some((i) => i.tone === "urgent");
  const needYou = items.filter((i) => i.needsYou).length;
  const held = items.filter((i) => i.tone === "wait").length;
  const first = items[0];
  const chip = needYou > 0 ? [`${needYou} ${needYou === 1 ? "needs" : "need"} you`, urgent ? "is-warn" : "is-info"] : held > 0 ? [`${held} on hold`, "is-todo"] : ["Pinned note", "is-todo"];

  return (
    <section className={`cv-tray${urgent ? " is-urgent" : ""}`} aria-label="Needs attention">
      <button type="button" className="cv-tray-head" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span className={`cv-chip ${chip[1]}`}>{chip[0]}</span>
        <span className="cv-tray-line">{first.title}</span>
        {items.length > 1 && <span className="cv-tray-more">+{items.length - 1} more</span>}
        <ChevronDown size={16} className={`cv-tray-chevron${open ? " is-open" : ""}`} aria-hidden="true" />
      </button>
      {open && (
        <ul className="cv-tray-list">
          {items.map((i) => {
            const Icon = i.icon;
            const act = () => {
              if (i.action.notes) return onOpenNotes();
              if (i.action.reply && onReply) return onReply(i.action.reply);
              return onOpenComm(i.action.comm || i.action.reply?.correlation_id);
            };
            return (
              <li key={i.key} className={`cv-tray-item is-${i.tone}`}>
                <Icon size={16} aria-hidden="true" />
                <div className="cv-tray-text">
                  <div className="cv-tray-title">{i.title}</div>
                  {i.detail && <div className="cv-tray-detail">{i.detail}</div>}
                </div>
                {i.action && (
                  <button type="button" className="cv-btn" onClick={act}>
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
