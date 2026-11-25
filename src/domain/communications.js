import { humanize } from "../lib/format.js";

export const REASONS = {
  tatquery: { label: "Turnaround dispute", hint: "Reply overdue. Answer now.", tone: "warn" },
  additionalinfo: { label: "More information needed", hint: "Send the documents it asks for.", tone: "warn" },
  grievance: { label: "Grievance", hint: "Handle it, then mark reviewed.", tone: "warn" },
  policychange: { label: "Policy changed", hint: "Fetch the policies again.", tone: "info" },
  walletupdate: { label: "Wallet updated", hint: "For information only.", tone: "info" },
};

export const CATEGORY_LABELS = {
  alert: "Payer alert",
  notification: "Notification",
  reminder: "Reminder",
  instruction: "Instruction",
};

export const SEND_REASONS = [
  { value: "grievance", label: "Grievance" },
  { value: "tatquery", label: "Turnaround dispute" },
  { value: "additionalinfo", label: "More information, sent on our own" },
  { value: "policychange", label: "Policy changed" },
  { value: "walletupdate", label: "Wallet updated" },
];

export const PRIORITIES = [
  { value: "routine", label: "Routine" },
  { value: "asap", label: "As soon as possible" },
  { value: "urgent", label: "Urgent" },
  { value: "stat", label: "Immediate" },
];

const NON_DOCUMENT_KEYS = new Set(["claimnumber", "claimid", "include", "_include", "payload", "subject"]);

export const reasonLabel = (comm) => REASONS[comm?.reason_code]?.label || comm?.reason_display || (comm?.reason_code ? humanize(comm.reason_code) : null);

export function commHeadline(comm) {
  if (!comm) return "";
  if (comm.topic_display) return comm.topic_display;
  const reason = reasonLabel(comm);
  if (reason) return reason;
  if (comm.category_display) return comm.category_display;
  const category = CATEGORY_LABELS[String(comm.category || "").toLowerCase()];
  if (category) return category;
  const payer = comm.payer_name || comm.payer_id;
  return payer ? `Message from ${payer}` : "Payer message";
}

export function commPreview(comm) {
  if (comm?.subject) return comm.subject;
  return comm?.payload?.find((p) => p.content_string)?.content_string || "";
}

export const commHasAttachment = (comm) => !!comm?.payload?.some((p) => p.content_attachment);

export const commTime = (comm) => comm?.received_at || comm?.sent_at || null;

export const priorityRank = (comm) => (comm?.priority === "urgent" || comm?.priority === "stat" ? 2 : comm?.priority === "asap" ? 1 : 0);

export const isUrgent = (comm) => priorityRank(comm) === 2;

export const hasOpenTask = (comm) => comm?.pending_tasks?.length > 0;

export function parseDocumentsFromTaskInputs(taskInputs) {
  if (!taskInputs) return [];
  return Object.entries(taskInputs)
    .filter(([k]) => !NON_DOCUMENT_KEYS.has(String(k).toLowerCase()))
    .map(([code, name]) => ({ code, name: typeof name === "string" ? name : code }));
}

export const sameMoment = (a, b) => !!a && !!b && Math.abs(new Date(a) - new Date(b)) < 60_000;
