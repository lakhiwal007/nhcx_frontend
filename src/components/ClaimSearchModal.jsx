import { useEffect, useState } from "react";
import { Search, Database, PencilLine } from "lucide-react";
import { Modal } from "./Overlay";
import { api } from "../api";
import { Button } from "./Common";
import { formatMoney, formatPercent, currencySymbol, humanize } from "../format.js";
import { usePoll } from "../hooks/usePoll";

const POLL_INTERVAL_MS = 7000;

const PERCENT_TOTALS = ["elig_percent", "eligpercent"];
// Payer totals in statement order; anything else the payer sends follows.
const TOTAL_ORDER = ["submitted", "eligible", "copay", "deductible", "tax", "benefit", "approved"];
const DEDUCTIONS = ["copay", "deductible"];
const PAYABLE = ["benefit", "approved"];

const amountValue = (v) => (v && typeof v === "object" ? v.value : v);

const formatTotal = (k, v) => {
  const raw = amountValue(v);
  if (PERCENT_TOTALS.includes(k)) return formatPercent(raw);
  return formatMoney(raw, { currency: currencySymbol(v && typeof v === "object" ? v.currency : null) });
};

const orderedTotals = (totals) =>
  Object.entries(totals || {}).sort(([a], [b]) => {
    const ia = TOTAL_ORDER.indexOf(a);
    const ib = TOTAL_ORDER.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });

// The verdict as one line; the raw payer outcome sits beside it so a
// mis-classified decision is visible.
function decisionTone(decision, outcome) {
  const d = String(decision || "").toUpperCase();
  const ambiguous = d === "APPROVED" && outcome != null && !["complete", "partial"].includes(String(outcome).toLowerCase());
  if (ambiguous) return { tone: "warn", ambiguous };
  if (d === "APPROVED") return { tone: "ok" };
  if (d === "REJECTED" || d === "DENIED") return { tone: "bad" };
  return { tone: "warn" };
}

export default function ClaimSearchModal({ open, onClose, claims = [] }) {
  const [mode, setMode] = useState("existing"); // "existing" | "manual"
  const [selectedClaimId, setSelectedClaimId] = useState("");
  const [payerId, setPayerId] = useState("");
  const [claimNumber, setClaimNumber] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [correlationId, setCorrelationId] = useState(null);
  const [status, setStatus] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open) return;
    setMode("existing");
    setSelectedClaimId("");
    setPayerId("");
    setClaimNumber("");
    setFromDate("");
    setToDate("");
    setSubmitting(false);
    setCorrelationId(null);
    setStatus(null);
    setResult(null);
    setError(null);
  }, [open]);

  usePoll(
    async (signal) => {
      const res = await api.getClaimSearchStatus(correlationId, signal);
      setStatus(res?.status);
      if (res?.status === "complete" || res?.status === "failed") {
        setResult(res?.result);
      }
    },
    { active: correlationId && status !== "complete" && status !== "failed" ? correlationId : null, intervalMs: POLL_INTERVAL_MS }
  );

  const selectedClaim = claims.find((c) => String(c.id) === String(selectedClaimId));

  const canSubmit = mode === "existing"
    ? !!selectedClaimId && !submitting
    : payerId.trim() && (claimNumber.trim() || (fromDate && toDate)) && !submitting;

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const payload = mode === "existing"
        ? { claim_id: selectedClaim?.claim_id ?? null, cashless_case_id: selectedClaim?.id }
        : {
            payer_id: payerId,
            ...(claimNumber && { claim_number: claimNumber }),
            ...(fromDate && { from_date: fromDate }),
            ...(toDate && { to_date: toDate }),
          };
      const res = await api.searchClaims(payload);
      setCorrelationId(res?.correlation_id);
      setStatus(res?.status || "submitted");
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const waiting = status !== "complete" && status !== "failed";
  const decided = result && (result.decision || result.outcome);
  const verdict = decided ? decisionTone(result.decision, result.outcome) : null;
  const totals = orderedTotals(result?.totals);

  return (
    <Modal open={open} onClose={onClose} title="Search via NHCX gateway" subtitle="Asks the payer directly, through NHCX, where a claim stands.">
      {correlationId ? (
        <div className="cs-body">
          <div className="cs-panel">
            <div className={`ds-verdict is-${status === "failed" ? "bad" : waiting ? "warn" : verdict?.tone || "ok"}`}>
              <span className="ep-dot" aria-hidden="true" />
              <span className="ds-verdict-label">
                {status === "failed"
                  ? "Search failed"
                  : waiting
                    ? "Waiting for the payer…"
                    : decided
                      ? humanize(result.decision || "Decision unavailable")
                      : "Response received"}
              </span>
              {waiting && <span className="spinner ds-spinner" aria-hidden="true" />}
            </div>
            <dl className="ds-statement cs-refs">
              <div>
                <dt className="ep-muted">Correlation ID</dt>
                <dd className="ep-mono">{correlationId}</dd>
              </div>
              {result?.outcome && (
                <div>
                  <dt className="ep-muted">Payer outcome</dt>
                  <dd className="ep-mono">{result.outcome}</dd>
                </div>
              )}
              {result?.claim_response_ref && (
                <div>
                  <dt className="ep-muted">Payer reference</dt>
                  <dd className="ep-mono">{result.claim_response_ref}</dd>
                </div>
              )}
            </dl>
            {verdict?.ambiguous && (
              <div className="ep-notice is-warn ds-notice-in">Verify — the payer outcome does not corroborate this approval.</div>
            )}
          </div>

          {decided && (totals.length > 0 || result.approved_amount != null) && (
            <div className="cs-panel">
              <dl className="ds-statement">
                {totals.map(([k, v]) => (
                  <div key={k} className={PAYABLE.includes(k) ? "is-total" : undefined}>
                    <dt className="ep-cap">
                      {DEDUCTIONS.includes(k) ? "Less " : ""}
                      {k.replace(/_/g, " ")}
                    </dt>
                    <dd className="ep-mono">{formatTotal(k, v)}</dd>
                  </div>
                ))}
                {result.approved_amount != null && !totals.some(([k]) => PAYABLE.includes(k)) && (
                  <div className="is-total">
                    <dt>Approved</dt>
                    <dd className="ep-mono">{formatMoney(result.approved_amount)}</dd>
                  </div>
                )}
              </dl>
            </div>
          )}

          {result && !decided && <pre className="cs-raw">{JSON.stringify(result.raw_response ?? result, null, 2)}</pre>}

          <div className="cs-footer">
            <Button variant="outline" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      ) : (
        <div className="cs-body">
          <div className="st-seg cs-mode" role="radiogroup">
            <button type="button" role="radio" aria-checked={mode === "existing"} className={mode === "existing" ? "is-on" : ""} onClick={() => setMode("existing")}>
              <Database size={14} /> Existing case
            </button>
            <button type="button" role="radio" aria-checked={mode === "manual"} className={mode === "manual" ? "is-on" : ""} onClick={() => setMode("manual")}>
              <PencilLine size={14} /> Manual entry
            </button>
          </div>

          {mode === "existing" ? (
            <label className="st-field">
              <span className="st-field-label">Case</span>
              <select className="input-modern pd-input" value={selectedClaimId} onChange={(e) => setSelectedClaimId(e.target.value)}>
                <option value="">Select a case…</option>
                {claims.map((c) => (
                  <option key={c.id} value={c.id}>
                    #{c.id} — {c.patient_name || c.child_name || "Unknown"} ({c.payer_name || c.payer_id || "no payer"})
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <div className="st-grid">
              <label className="st-field">
                <span className="st-field-label">Payer ID</span>
                <input className="input-modern pd-input ep-mono" placeholder="1518@hcx" value={payerId} onChange={(e) => setPayerId(e.target.value)} />
              </label>
              <label className="st-field">
                <span className="st-field-label">Claim number</span>
                <input className="input-modern pd-input ep-mono" placeholder="CLM-1" value={claimNumber} onChange={(e) => setClaimNumber(e.target.value)} />
              </label>
              <label className="st-field">
                <span className="st-field-label">From date</span>
                <input type="date" className="input-modern pd-input" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
              </label>
              <label className="st-field">
                <span className="st-field-label">To date</span>
                <input type="date" className="input-modern pd-input" value={toDate} onChange={(e) => setToDate(e.target.value)} />
              </label>
              <span className="st-hint is-wide">Give a claim number, or both dates.</span>
            </div>
          )}

          {error && <div className="ep-notice is-bad">{error}</div>}

          <div className="cs-footer">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" icon={Search} disabled={!canSubmit} onClick={handleSubmit}>
              {submitting ? "Submitting…" : "Search"}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
