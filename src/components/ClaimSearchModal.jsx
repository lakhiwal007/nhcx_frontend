import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Search } from "lucide-react";
import { api } from "../api";
import { Button } from "./Common";
import { usePoll } from "../hooks/usePoll";

const POLL_INTERVAL_MS = 7000;

export default function ClaimSearchModal({ open, onClose, claims = [] }) {
  const [mode, setMode] = useState("existing"); // "existing" | "manual"
  const [selectedClaimId, setSelectedClaimId] = useState("");
  const [payerId, setPayerId] = useState("");
  const [claimNumber, setClaimNumber] = useState("");
  const [patientAbha, setPatientAbha] = useState("");
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
    setPatientAbha("");
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
    : payerId.trim() && (claimNumber.trim() || patientAbha.trim() || (fromDate && toDate)) && !submitting;

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const payload = mode === "existing"
        ? { claim_id: selectedClaim?.claim_id ?? selectedClaim?.id, cashless_case_id: selectedClaim?.id }
        : {
            payer_id: payerId,
            ...(claimNumber && { claim_number: claimNumber }),
            ...(patientAbha && { patient_abha: patientAbha }),
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

  return (
    <AnimatePresence>
      {open && (
        <div style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="glass-overlay"
            style={{ position: "absolute", inset: 0 }}
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="glass-panel"
            style={{ position: "relative", width: "100%", maxWidth: "520px", padding: "28px", borderRadius: "var(--radius-lg)", zIndex: 101, margin: "0 16px", maxHeight: "90vh", overflowY: "auto" }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--space-2)" }}>
              <h3 style={{ margin: 0, fontSize: "20px", fontWeight: 800 }}>Search via NHCX Gateway</h3>
              <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", display: "flex" }}>
                <X size={22} />
              </button>
            </div>
            <p style={{ fontSize: "12px", color: "var(--text-muted)", margin: "0 0 20px" }}>
              Queries the payer directly through NHCX for the current status of a claim. The response shape isn't
              standardized by ABDM, so the raw payer reply is shown as returned.
            </p>

            {correlationId ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                <div style={{ padding: "14px 16px", background: "rgba(59,130,246,0.08)", border: "1px solid var(--info)", borderRadius: "10px", fontSize: "13px" }}>
                  <div style={{ fontWeight: 700, color: "var(--info)", marginBottom: "6px" }}>
                    {status === "complete" ? "Response received" : status === "failed" ? "Search failed" : "Waiting for payer response…"}
                  </div>
                  <code style={{ fontSize: "11px" }}>{correlationId}</code>
                </div>
                {result && (
                  <pre style={{
                    fontSize: "11px", background: "var(--bg-main)", border: "1px solid var(--border-color)",
                    borderRadius: "8px", padding: "12px", maxHeight: "260px", overflow: "auto", whiteSpace: "pre-wrap", wordBreak: "break-word",
                  }}>
                    {JSON.stringify(result, null, 2)}
                  </pre>
                )}
                <Button variant="outline" onClick={onClose} style={{ justifyContent: "center", marginTop: "6px" }}>
                  Close
                </Button>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                <div style={{ display: "flex", gap: "8px" }}>
                  <button
                    type="button"
                    onClick={() => setMode("existing")}
                    className={mode === "existing" ? "btn-modern btn-primary-modern" : "btn-modern btn-outline-modern"}
                    style={{ flex: 1, justifyContent: "center", fontSize: "12px", padding: "8px" }}
                  >
                    Existing Case
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode("manual")}
                    className={mode === "manual" ? "btn-modern btn-primary-modern" : "btn-modern btn-outline-modern"}
                    style={{ flex: 1, justifyContent: "center", fontSize: "12px", padding: "8px" }}
                  >
                    Manual Entry
                  </button>
                </div>

                {mode === "existing" ? (
                  <div>
                    <label style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-muted)", display: "block", marginBottom: "6px" }}>Case</label>
                    <select className="input-modern" value={selectedClaimId} onChange={(e) => setSelectedClaimId(e.target.value)}>
                      <option value="">Select a case…</option>
                      {claims.map((c) => (
                        <option key={c.id} value={c.id}>
                          #{c.id} — {c.patient_name || c.child_name || "Unknown"} ({c.payer_name || c.payer_id || "no payer"})
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <>
                    <div>
                      <label style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-muted)", display: "block", marginBottom: "6px" }}>Payer ID</label>
                      <input className="input-modern" placeholder="1518@hcx" value={payerId} onChange={(e) => setPayerId(e.target.value)} />
                    </div>
                    <div className="grid-2-col" style={{ gap: "14px" }}>
                      <div>
                        <label style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-muted)", display: "block", marginBottom: "6px" }}>Claim Number</label>
                        <input className="input-modern" placeholder="CLM-1" value={claimNumber} onChange={(e) => setClaimNumber(e.target.value)} />
                      </div>
                      <div>
                        <label style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-muted)", display: "block", marginBottom: "6px" }}>Patient ABHA</label>
                        <input className="input-modern" placeholder="1234567890123456" value={patientAbha} onChange={(e) => setPatientAbha(e.target.value)} />
                      </div>
                    </div>
                    <div className="grid-2-col" style={{ gap: "14px" }}>
                      <div>
                        <label style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-muted)", display: "block", marginBottom: "6px" }}>From Date</label>
                        <input type="date" className="input-modern" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
                      </div>
                      <div>
                        <label style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-muted)", display: "block", marginBottom: "6px" }}>To Date</label>
                        <input type="date" className="input-modern" value={toDate} onChange={(e) => setToDate(e.target.value)} />
                      </div>
                    </div>
                  </>
                )}

                {error && (
                  <div style={{ padding: "10px 14px", background: "rgba(239,68,68,0.08)", border: "1px solid var(--error)", borderRadius: "8px", fontSize: "12px", color: "var(--error)" }}>
                    {error}
                  </div>
                )}

                <Button variant="primary" icon={Search} disabled={!canSubmit} onClick={handleSubmit} style={{ justifyContent: "center", marginTop: "6px" }}>
                  {submitting ? "Submitting…" : "Search"}
                </Button>
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
