import { useState, useEffect } from "react";
import { Send, AlertCircle } from "lucide-react";
import { api } from "../../api";
import { Button, StatusBadge, LoadingBlock } from "../Common";

export default function PreauthEnhancement({ ctx, onClose }) {
  const { caseState, updateCaseState } = ctx;
  const { cashless_case_id, claim_id } = caseState;

  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState(null);
  const [checkedProcedures, setCheckedProcedures] = useState({});
  const [additionalDocUrl, setAdditionalDocUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const params = {};
        if (cashless_case_id) params.cashless_case_id = cashless_case_id;
        else if (claim_id) params.claim_id = claim_id;
        const res = await api.preparePreauthEnhancement(params);
        setPreview(res);
        const initialChecked = {};
        (res.new_procedures || []).forEach((p, i) => { initialChecked[i] = true; });
        setCheckedProcedures(initialChecked);
      } catch (_) {
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const selectedProcs = (preview.new_procedures || []).filter((_, i) => checkedProcedures[i]);
      const body = {
        ...(cashless_case_id ? { cashless_case_id } : { claim_id }),
        total_amount: preview.current?.total_amount,
        items: preview.suggested_request?.items || [],
        ...(selectedProcs.length > 0 && { procedures: selectedProcs }),
        supporting_documents: [
          ...(preview.supporting_documents || []),
          ...(additionalDocUrl
            ? [{ category: "revised_estimate", name: "Revised Estimate", code: "REVISED_ESTIMATE", url: additionalDocUrl }]
            : []),
        ].filter((d) => d.url),
      };
      const res = await api.submitPreauthEnhancement(body);
      updateCaseState({ preauthCorrelationId: res.correlation_id });
      if (onClose) onClose();
    } catch (_) {
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <LoadingBlock compact />;
  }

  if (!preview) {
    return (
      <div style={{ padding: "var(--space-4)", color: "var(--error)", fontSize: "14px" }}>
        Failed to load enhancement preview.
      </div>
    );
  }

  if (!preview.enhanceable) {
    return (
      <div>
        <div style={{ display: "flex", gap: "var(--space-3)", alignItems: "flex-start", padding: "14px", background: "rgba(245,158,11,0.08)", border: "1px solid var(--warning)", borderRadius: "var(--radius-md)", marginBottom: "var(--space-5)" }}>
          <AlertCircle size={18} color="var(--warning)" style={{ flexShrink: 0, marginTop: "2px" }} />
          <div>
            <div style={{ fontWeight: 700, color: "var(--warning)", marginBottom: "var(--space-1)" }}>Enhancement Unavailable</div>
            <div style={{ fontSize: "13px" }}>{preview.reason || "No new procedures or billing found since the approved preauth."}</div>
          </div>
        </div>
        <Button variant="outline" onClick={onClose}>Close</Button>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-5)" }}>
      <div style={{ display: "flex", gap: "var(--space-4)", alignItems: "center", padding: "12px 16px", background: "var(--bg-main)", borderRadius: "var(--radius-md)", border: "1px solid var(--border-color)", fontSize: "13px" }}>
        <div>
          <div style={{ fontSize: "11px", color: "var(--text-muted)", fontWeight: 700, textTransform: "uppercase" }}>Preauth Ref</div>
          <div style={{ fontWeight: 700 }}>{preview.preauth_ref || "-"}</div>
        </div>
        <div>
          <div style={{ fontSize: "11px", color: "var(--text-muted)", fontWeight: 700, textTransform: "uppercase" }}>Authorized Total</div>
          <div style={{ fontWeight: 700 }}>₹{preview.authorized?.total_amount?.toLocaleString()}</div>
        </div>
        <div>
          <div style={{ fontSize: "11px", color: "var(--text-muted)", fontWeight: 700, textTransform: "uppercase" }}>Revised Total</div>
          <div style={{ fontWeight: 800, color: "var(--primary)" }}>₹{preview.current?.total_amount?.toLocaleString()}</div>
        </div>
        {preview.delta_amount != null && (
          <div>
            <div style={{ fontSize: "11px", color: "var(--text-muted)", fontWeight: 700, textTransform: "uppercase" }}>Delta</div>
            <div style={{ fontWeight: 700, color: "var(--success)" }}>+₹{preview.delta_amount?.toLocaleString()}</div>
          </div>
        )}
      </div>

      {preview.new_procedures?.length > 0 && (
        <div>
          <div style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", marginBottom: "10px" }}>New Procedures</div>
          {preview.new_procedures.map((proc, i) => (
            <label key={i} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px", border: "1px solid var(--border-color)", borderRadius: "var(--radius-sm)", marginBottom: "var(--space-2)", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={!!checkedProcedures[i]}
                onChange={(e) => setCheckedProcedures((p) => ({ ...p, [i]: e.target.checked }))}
              />
              <div>
                <div style={{ fontWeight: 600, fontSize: "13px" }}>{proc.name}</div>
                <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>{proc.code} · {proc.date}</div>
              </div>
            </label>
          ))}
        </div>
      )}

      {preview.new_items?.length > 0 && (
        <div>
          <div style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", marginBottom: "var(--space-2)" }}>New Line Items</div>
          <table className="table-modern" style={{ fontSize: "12px", width: "100%" }}>
            <thead>
              <tr>
                <th>Service</th>
                <th>Qty</th>
                <th style={{ textAlign: "right" }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {preview.new_items.map((item, i) => (
                <tr key={i}>
                  <td>{item.service_name}</td>
                  <td>{item.quantity}</td>
                  <td style={{ textAlign: "right" }}>₹{item.net_amount?.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div>
        <label style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-muted)", display: "block", marginBottom: "6px" }}>Revised Estimate URL (required)</label>
        <input
          className="input-modern"
          placeholder="https://hospital.example/records/revised-estimate.pdf"
          value={additionalDocUrl}
          onChange={(e) => setAdditionalDocUrl(e.target.value)}
        />
      </div>

      <div style={{ display: "flex", gap: "var(--space-3)", justifyContent: "flex-end" }}>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button
          variant="primary"
          icon={Send}
          disabled={!additionalDocUrl || submitting}
          onClick={handleSubmit}
        >
          {submitting ? "Submitting…" : "Submit Enhancement"}
        </Button>
      </div>
    </div>
  );
}
