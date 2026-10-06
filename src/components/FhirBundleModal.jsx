import { useCallback, useEffect, useState } from "react";
import { Copy, Check, RefreshCw } from "lucide-react";
import { Modal } from "./Overlay";
import { api } from "../api";
import { Button, LoadingBlock } from "./Common";
import { formatDateTime } from "../format.js";

const TRANSACTION_LABELS = {
  preauth: "Preauth",
  preauth_cancellation: "Preauth cancellation",
  preauth_release: "Preauth release",
  preauth_nullification: "Preauth nullification",
  coverage_eligibility: "Coverage eligibility",
  insurance_plan: "Insurance plan",
  claim: "Claim",
  claim_search: "Claim search",
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
      className="ep-action"
      onClick={() => {
        navigator.clipboard?.writeText(JSON.stringify(value, null, 2));
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? <Check size={12} /> : <Copy size={12} />} {copied ? "Copied" : "Copy"}
    </button>
  );
}

function BundleSide({ label, emptyText, side }) {
  return (
    <section className="fb-side">
      <header className="fb-head">
        <span className="ep-strong">{label}</span>
        {side?.captured_at && <span className="ep-muted">{formatDateTime(side.captured_at)}</span>}
        <span className="fb-copy">
          <CopyButton value={side?.bundle} />
        </span>
      </header>
      {side?.bundle ? <pre className="fb-json">{JSON.stringify(side.bundle, null, 2)}</pre> : <p className="ds-empty fb-empty">{emptyText}</p>}
    </section>
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
    <Modal open={open} onClose={onClose} title={`FHIR bundle — ${TRANSACTION_LABELS[transactionType] || transactionType || ""}`} subtitle={data?.correlation_id ? `Correlation ${data.correlation_id}` : null} width={820}>

      {loading ? (
        <LoadingBlock compact text="Loading bundle…" />
      ) : error ? (
        <div className="fb-state">
          <div className="ep-notice is-bad">{error}</div>
          <div>
            <Button variant="outline" size="small" icon={RefreshCw} onClick={load}>
              Retry
            </Button>
          </div>
        </div>
      ) : !data ? (
        <p className="ds-empty fb-empty">No transaction of this type has been recorded yet.</p>
      ) : (
        <div className="fb-sides">
          <BundleSide label="Sent to payer" emptyText="Not submitted yet." side={data.outbound} />
          <BundleSide label="Received from payer" emptyText="No response yet." side={data.inbound} />
        </div>
      )}
    </Modal>
  );
}
