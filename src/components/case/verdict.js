import { humanize } from "../../format.js";

export const approvedOf = (adj) => adj?.benefit?.value ?? adj?.eligible?.value ?? null;

export const cutLines = (items) =>
  (items || []).filter((line) => {
    const adj = line.adjudication || {};
    const approved = approvedOf(adj);
    return approved != null && adj.submitted?.value != null && approved < adj.submitted.value;
  });

const DECIDED = {
  APPROVED: { tone: "ok", word: "Approved" },
  PARTIALLY_APPROVED: { tone: "ok", word: "Partly approved" },
  QUERIED: { tone: "warn", word: "Query raised" },
  REPROCESS_QUERIED: { tone: "warn", word: "Query raised" },
  REJECTED: { tone: "bad", word: "Rejected" },
  CANCELLED: { tone: "bad", word: "Cancelled" },
  CANCELLATION_REJECTED: { tone: "warn", word: "Cancellation refused" },
};

const base = (phase, tone, word, extra = {}) => ({
  phase,
  tone,
  word,
  decision: null,
  approved: null,
  requested: null,
  cutLines: [],
  notes: [],
  errors: [],
  ambiguous: false,
  message: null,
  ...extra,
});

export function verdictFor(res) {
  if (!res) return base("idle", "idle", "");
  if (res.status === "failed") {
    return base("failed", "bad", "Not delivered", {
      errors: res.errors || [],
      message: res.error_message || res.message || res.errors?.[0]?.message || null,
    });
  }
  if (res.status === "not_found") return base("not_found", "warn", "No record");
  const decision = res.decision ? String(res.decision).toUpperCase() : null;
  if (!decision || decision === "PENDING") return base("waiting", "wait", "Waiting for the payer");
  const ambiguous = decision === "UNKNOWN" || res.outcome === "error" || !!res.ambiguous;
  const known = DECIDED[decision];
  const items = res.items || [];
  return base("decided", ambiguous ? "warn" : known?.tone || "warn", ambiguous ? "Unclear answer" : known?.word || humanize(decision), {
    decision,
    approved: res.approved_amount ?? approvedOf(res.totals),
    requested: res.totals?.submitted?.value ?? res.total_amount ?? null,
    cutLines: cutLines(items),
    notes: res.process_notes || [],
    errors: res.errors || [],
    ambiguous,
  });
}
