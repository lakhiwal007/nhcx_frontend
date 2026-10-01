import { useCallback, useEffect, useState } from "react";
import { Copy, Check, RefreshCw } from "lucide-react";
import { Modal } from "./Overlay";
import { api } from "../api";
import { Button } from "./Common";
import { formatDateTime } from "../format.js";

const TRANSACTION_LABELS = {
  preauth: "Preauth",
  preauth_cancellation: "Preauth Cancellation",
  preauth_release: "Preauth Release",
  preauth_nullification: "Preauth Nullification",
  coverage_eligibility: "Coverage Eligibility",
  insurance_plan: "Insurance Plan",
  claim: "Claim",
  claim_search: "Claim Search",
  reprocess: "Reprocess",
  communication: "Communication",
  payment: "Payment",
};

function CopyButton({ value }) {
  const [copied, setCopied] = useState(false);
  if (!value) return null;
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard?.writeText(JSON.stringify(value, null, 2));
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      style={{
        display: "inline-flex", alignItems: "center", gap: "4px", background: "none",
        border: "1px solid var(--border-color)", borderRadius: "6px", padding: "4px 8px",
        fontSize: "11px", color: "var(--text-muted)", cursor: "pointer",
      }}
    >
      {copied ? <Check size={12} /> : <Copy size={12} />} {copied ? "Copied" : "Copy"}
    </button>
  );
}

function BundleSide({ label, emptyText, side }) {
  return (
    <div style={{ flex: "1 1 320px", minWidth: 0 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
        <span style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", color: "var(--text-muted)" }}>{label}</span>
        {side?.captured_at && <span style={{ fontSize: "10px", color: "var(--text-muted)" }}>{formatDateTime(side.captured_at)}</span>}
      </div>
      {side?.bundle ? (
        <>
          <pre
            style={{
              fontSize: "11px", background: "var(--bg-main)", border: "1px solid var(--border-color)",
              borderRadius: "8px", padding: "12px", maxHeight: "360px", overflow: "auto",
              whiteSpace: "pre-wrap", wordBreak: "break-word", margin: 0,
            }}
          >
            {JSON.stringify(side.bundle, null, 2)}
          </pre>
          <div style={{ marginTop: "6px" }}>
            <CopyButton value={side.bundle} />
          </div>
        </>
      ) : (
        <div
          style={{
            padding: "20px 12px", textAlign: "center", fontSize: "12px", color: "var(--text-muted)",
            background: "var(--bg-main)", border: "1px dashed var(--border-color)", borderRadius: "8px",
          }}
        >
          {emptyText}
        </div>
      )}
    </div>
  );
}

// Shows exactly what was sent to and received from the payer for one
// transaction — the real bundle captured at dispatch time (outbound) and the
// decrypted callback payload (inbound), not a reconstruction.
export default function FhirBundleModal({ open, onClose, cashlessCaseId, transactionType, correlationId }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const res = await api.getCaseBundle(cashlessCaseId, transactionType, correlationId ? { correlation_id: correlationId } : {});
      setData(res);
    } catch (err) {
      setError(err.message || "Could not load the bundle for this transaction.");
    } finally {
      setLoading(false);
    }
  }, [cashlessCaseId, transactionType, correlationId]);

  useEffect(() => { if (open) load(); }, [open, load]);

  return (
    <Modal open={open} onClose={onClose} title={`FHIR bundle — ${TRANSACTION_LABELS[transactionType] || transactionType}`} subtitle={data?.correlation_id ? `Correlation ${data.correlation_id}` : null} width={820}>

            {loading ? (
              <div style={{ padding: "40px 0", textAlign: "center", fontSize: "13px", color: "var(--text-muted)" }}>Loading bundle…</div>
            ) : error ? (
              <div style={{ padding: "20px", textAlign: "center" }}>
                <div style={{ fontSize: "13px", color: "var(--error)", marginBottom: "12px" }}>{error}</div>
                <Button variant="outline" size="small" icon={RefreshCw} onClick={load} style={{ margin: "0 auto" }}>Retry</Button>
              </div>
            ) : !data ? (
              <div style={{ padding: "20px", textAlign: "center", fontSize: "13px", color: "var(--text-muted)" }}>No transaction of this type has been recorded yet.</div>
            ) : (
              <div style={{ display: "flex", gap: "16px", flexWrap: "wrap", marginTop: "10px" }}>
                <BundleSide label="Sent to payer" emptyText="Not submitted yet" side={data.outbound} />
                <BundleSide label="Received from payer" emptyText="No response yet" side={data.inbound} />
              </div>
            )}
    </Modal>
  );
}
