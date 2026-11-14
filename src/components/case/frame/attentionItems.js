import { MessageSquare, Pin, Clock } from "lucide-react";
import { formatRelative } from "../../../lib/format.js";
import { commHeadline, commPreview } from "../../../domain/communications";

export function attentionItems({ communications = [], notes = [], heldTasks = [] }) {
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
        preview: commPreview(c),
        when: formatRelative(c.received_at || c.sent_at),
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
      preview: t.metadata?.hold?.reason || "Comes back to the work queue when the payer answers.",
      when: null,
    });
  });
  notes
    .filter((n) => n.pinned)
    .forEach((n) => {
      items.push({
        key: `note-${n.id}`,
        tone: "quiet",
        needsYou: false,
        icon: Pin,
        title: n.body,
        preview: n.author_name || "Staff",
        when: formatRelative(n.created_at),
        action: { label: "Notes", notes: true },
      });
    });
  return items;
}

export function attentionSummary(items) {
  const needYou = items.filter((i) => i.needsYou).length;
  const held = items.filter((i) => i.tone === "wait").length;
  if (needYou > 0) return { label: "Needs you", count: needYou, tone: "warn" };
  if (held > 0) return { label: "On hold", count: held, tone: "todo" };
  return { label: "Pinned", count: items.length, tone: "todo" };
}

export function leadLabel(item) {
  if (!item?.action) return null;
  if (item.action.reply) return "Reply to the payer";
  if (item.action.comm) return "Read the message";
  return "Open notes";
}
