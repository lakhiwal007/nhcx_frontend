import { useEffect, useRef, useState } from "react";
import { MessageSquare, ChevronDown } from "lucide-react";
import { attentionSummary, leadLabel } from "./attentionItems";

const SHOWN = 3;

function act(item, handlers) {
  if (!item?.action) return;
  const { onOpenComm, onOpenNotes, onReply, after } = handlers;
  if (item.action.notes) onOpenNotes();
  else if (item.action.reply && onReply) onReply(item.action.reply);
  else onOpenComm(item.action.comm || item.action.reply?.correlation_id);
  if (after) after();
}

export function NeedsYouPanel({ items, onOpenComm, onOpenNotes, onReply }) {
  const [all, setAll] = useState(false);
  if (items.length === 0) return null;
  const handlers = { onOpenComm, onOpenNotes, onReply };
  const summary = attentionSummary(items);
  const shown = all ? items : items.slice(0, SHOWN);
  const lead = items.find((i) => i.action?.reply && onReply) || items.find((i) => i.action);
  const hidden = items.length - shown.length;
  return (
    <section className={`cv-panel cv-panel-asks is-${summary.tone}`} aria-label={summary.label}>
      <div className="cv-panel-title cv-ask-head">
        <MessageSquare size={13} aria-hidden="true" />
        <span>{summary.label}</span>
        <span className="cv-ask-count">{summary.count}</span>
      </div>
      <ul className="cv-ask-lines">
        {shown.map((i) => (
          <li key={i.key} className={`cv-ask-line is-${i.tone}`}>
            <button type="button" className="cv-ask-linebtn" onClick={() => act(i, handlers)} disabled={!i.action} title={i.preview || undefined}>
              <span className="cv-ask-linetitle">{i.title}</span>
              {i.when && <span className="cv-ask-when"> · {i.when}</span>}
            </button>
          </li>
        ))}
      </ul>
      <div className="cv-ask-foot">
        {lead && (
          <button type="button" className="cv-btn cv-ask-lead" onClick={() => act(lead, handlers)}>
            {leadLabel(lead)}
          </button>
        )}
        {(hidden > 0 || all) && (
          <button type="button" className="cv-link" onClick={() => setAll((v) => !v)}>
            {all ? "Fewer" : `${hidden} more`}
          </button>
        )}
      </div>
    </section>
  );
}

export function NeedsYouChip({ items, onOpenComm, onOpenNotes, onReply }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  if (items.length === 0) return null;
  const handlers = { onOpenComm, onOpenNotes, onReply, after: () => setOpen(false) };
  const summary = attentionSummary(items);
  return (
    <div className="cv-chain-trail" ref={ref}>
      <button type="button" className={`cv-ask-chip is-${summary.tone}`} aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen((v) => !v)}>
        <MessageSquare size={14} aria-hidden="true" />
        <span>
          {summary.label} · {summary.count}
        </span>
        <ChevronDown size={12} aria-hidden="true" className={`cv-ask-chevron${open ? " is-open" : ""}`} />
      </button>
      {open && (
        <div className="cv-ask-pop" role="dialog" aria-label={summary.label}>
          <ul className="cv-ask-list">
            {items.map((i) => {
              const Icon = i.icon;
              const detail = [i.preview, i.when].filter(Boolean).join(" · ");
              return (
                <li key={i.key} className={`cv-ask-item is-${i.tone}`}>
                  <Icon size={16} aria-hidden="true" />
                  <div className="cv-ask-text">
                    <div className="cv-ask-title">{i.title}</div>
                    {detail && <div className="cv-ask-detail">{detail}</div>}
                  </div>
                  {i.action && (
                    <button type="button" className="cv-btn" onClick={() => act(i, handlers)}>
                      {i.action.label}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
