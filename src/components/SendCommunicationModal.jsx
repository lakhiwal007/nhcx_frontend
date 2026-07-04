import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Send } from "lucide-react";
import { api } from "../api";
import { Button } from "./Common";

// Backend docs (2026-07-04 sync) flag the outbound-communication gateway route
// as pending ABDM confirmation — flip this off to hide all "Message Payer"
// entry points without touching call sites.
export const OUTBOUND_COMMUNICATIONS_ENABLED = true;

const REASON_OPTIONS = [
  { value: "grievance", label: "Grievance" },
  { value: "tatquery", label: "TAT Dispute" },
  { value: "additionalinfo", label: "Additional Info (proactive)" },
  { value: "policychange", label: "Policy Change" },
  { value: "walletupdate", label: "Wallet Update" },
];

const PRIORITY_OPTIONS = ["routine", "urgent", "asap", "stat"];

export default function SendCommunicationModal({
  open,
  onClose,
  defaultPayerId = "",
  defaultClaimReference = "",
  claimId,
  cashlessCaseId,
}) {
  const [payerId, setPayerId] = useState(defaultPayerId);
  const [claimReference, setClaimReference] = useState(defaultClaimReference);
  const [reasonCode, setReasonCode] = useState("grievance");
  const [priority, setPriority] = useState("routine");
  const [message, setMessage] = useState("");
  const [attachmentUrl, setAttachmentUrl] = useState("");
  const [attachmentTitle, setAttachmentTitle] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (!open) return;
    setPayerId(defaultPayerId);
    setClaimReference(defaultClaimReference);
    setReasonCode("grievance");
    setPriority("routine");
    setMessage("");
    setAttachmentUrl("");
    setAttachmentTitle("");
    setResult(null);
  }, [open, defaultPayerId, defaultClaimReference]);

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const res = await api.sendCommunication({
        payer_id: payerId,
        claim_reference: claimReference,
        reason_code: reasonCode,
        priority,
        ...(message && { message }),
        ...(attachmentUrl && { attachments: [{ url: attachmentUrl, title: attachmentTitle || "Attachment" }] }),
        ...(claimId && { claim_id: claimId }),
        ...(cashlessCaseId && { cashless_case_id: cashlessCaseId }),
      });
      setResult({ success: true, correlation_id: res?.correlation_id, message: res?.message });
    } catch (err) {
      setResult({ success: false, message: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  const canSubmit = payerId.trim() && claimReference.trim() && reasonCode && !submitting;

  return (
    <AnimatePresence>
      {open && (
        <div style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)" }}
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            style={{ position: "relative", background: "var(--bg-card)", width: "100%", maxWidth: "520px", padding: "28px", borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-lg)", border: "1px solid var(--border-color)", zIndex: 101, margin: "0 16px", maxHeight: "90vh", overflowY: "auto" }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
              <h3 style={{ margin: 0, fontSize: "20px", fontWeight: 800 }}>Message Payer</h3>
              <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", display: "flex" }}>
                <X size={22} />
              </button>
            </div>
            <p style={{ fontSize: "12px", color: "var(--text-muted)", margin: "0 0 20px" }}>
              Beta - the payer's reply arrives later through the normal Communications inbox, not in this dialog.
            </p>

            {result ? (
              <div style={{ padding: "14px 16px", background: result.success ? "rgba(16,185,129,0.08)" : "rgba(239,68,68,0.08)", border: `1px solid ${result.success ? "var(--success)" : "var(--error)"}`, borderRadius: "10px", fontSize: "13px", marginBottom: "8px" }}>
                <div style={{ fontWeight: 700, color: result.success ? "var(--success)" : "var(--error)", marginBottom: "4px" }}>
                  {result.success ? "Sent to payer" : "Could not send"}
                </div>
                {result.correlation_id && <code style={{ fontSize: "11px" }}>{result.correlation_id}</code>}
                {result.message && <div style={{ color: "var(--text-muted)", marginTop: "4px" }}>{result.message}</div>}
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                <div className="grid-2-col" style={{ gap: "14px" }}>
                  <div>
                    <label style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-muted)", display: "block", marginBottom: "6px" }}>Payer ID</label>
                    <input className="input-modern" placeholder="1518@hcx" value={payerId} onChange={(e) => setPayerId(e.target.value)} />
                  </div>
                  <div>
                    <label style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-muted)", display: "block", marginBottom: "6px" }}>Claim / Preauth Reference</label>
                    <input className="input-modern" placeholder="PA-2026-00001" value={claimReference} onChange={(e) => setClaimReference(e.target.value)} />
                  </div>
                </div>

                <div className="grid-2-col" style={{ gap: "14px" }}>
                  <div>
                    <label style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-muted)", display: "block", marginBottom: "6px" }}>Reason</label>
                    <select className="input-modern" value={reasonCode} onChange={(e) => setReasonCode(e.target.value)}>
                      {REASON_OPTIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-muted)", display: "block", marginBottom: "6px" }}>Priority</label>
                    <select className="input-modern" value={priority} onChange={(e) => setPriority(e.target.value)}>
                      {PRIORITY_OPTIONS.map((p) => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </div>
                </div>

                <div>
                  <label style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-muted)", display: "block", marginBottom: "6px" }}>Message</label>
                  <textarea
                    className="input-modern"
                    style={{ height: "90px", resize: "vertical" }}
                    placeholder="Describe the grievance, dispute, or additional info you're submitting…"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                  />
                </div>

                <div className="grid-2-col" style={{ gap: "14px" }}>
                  <div>
                    <label style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-muted)", display: "block", marginBottom: "6px" }}>Attachment URL (optional)</label>
                    <input className="input-modern" placeholder="https://hospital.example/appeal.pdf" value={attachmentUrl} onChange={(e) => setAttachmentUrl(e.target.value)} />
                  </div>
                  <div>
                    <label style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-muted)", display: "block", marginBottom: "6px" }}>Attachment Title</label>
                    <input className="input-modern" placeholder="Appeal letter" value={attachmentTitle} onChange={(e) => setAttachmentTitle(e.target.value)} />
                  </div>
                </div>

                <Button variant="primary" icon={Send} disabled={!canSubmit} onClick={handleSubmit} style={{ justifyContent: "center", marginTop: "6px" }}>
                  {submitting ? "Sending…" : "Send to Payer"}
                </Button>
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
