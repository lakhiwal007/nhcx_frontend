import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Send, AlertCircle } from "lucide-react";
import { api } from "../../api";
import { Button, StatusBadge, LoadingBlock, formatMoney } from "../Common";

export default function PreauthEnhancement({ ctx, onClose, onSubmitted }) {
  const navigate = useNavigate();
  const { caseState, updateCaseState } = ctx;
  const { cashless_case_id, claim_id } = caseState;

  // Used both as a modal inside PreauthStatus (onClose provided) and as a routed
  // screen at /case/:id/enhancement (from the stepper's Enhancement branch and
  // the "File Enhancement" button on the claim screen). In the routed case there
  // is no onClose, so Cancel/Close and the post-submit hand-off must navigate
  // back to the Decision screen rather than being dead no-ops.
  const close = onClose || (() => navigate("../status"));

  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState(null);
  const [checkedProcedures, setCheckedProcedures] = useState({});
  const [additionalDocUrl, setAdditionalDocUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        // Contract v1.7.0: enhancement prepare takes cashless_case_id as the
        // PREFERRED anchor; claim_id is transitional (resolved to the linked
        // case server-side). Prefer cashless_case_id, fall back to claim_id.
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

  // Unchecking a new procedure drops it AND its line item from the submission,
  // and the revised total is recomputed from what's actually being sent — so the
  // checkboxes change the amount, not just the procedures list. New items are
  // matched to their procedure by service_code/service_name; an item with no
  // matching unchecked procedure is always kept (never silently dropped).
  const uncheckedProcKeys = new Set(
    (preview?.new_procedures || [])
      .map((p, i) => (checkedProcedures[i] ? null : p.code ?? p.name))
      .filter((k) => k != null),
  );
  const submittedItems = (preview?.suggested_request?.items || []).filter(
    (it) => !uncheckedProcKeys.has(it.service_code) && !uncheckedProcKeys.has(it.service_name),
  );
  const revisedTotal =
    uncheckedProcKeys.size === 0
      ? preview?.current?.total_amount
      : submittedItems.reduce((s, it) => s + (Number(it.net_amount) || 0), 0);
  const revisedDelta =
    revisedTotal != null && preview?.authorized?.total_amount != null
      ? revisedTotal - preview.authorized.total_amount
      : preview?.delta_amount;

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const selectedProcs = (preview.new_procedures || []).filter((_, i) => checkedProcedures[i]);
      const body = {
        ...(cashless_case_id ? { cashless_case_id } : { claim_id }),
        total_amount: revisedTotal,
        items: submittedItems,
        ...(selectedProcs.length > 0 && { procedures: selectedProcs }),
        supporting_documents: [
          ...(preview.supporting_documents || []),
          ...(additionalDocUrl
            ? [{ category: "revised_estimate", name: "Revised Estimate", code: "REVISED_ESTIMATE", url: additionalDocUrl }]
            : []),
        ].filter((d) => d.url),
      };
      const res = await api.submitPreauthEnhancement(body);
      // As a modal inside PreauthStatus, onSubmitted is that screen's own
      // restartPoll - it must be the one to resume polling, since `polling`
      // is local state there that a plain updateCaseState can't reach (this
      // instance doesn't remount, so nothing else would ever resume it).
      // Routed (no onSubmitted), navigating to ../status remounts
      // PreauthStatus fresh, so clearing preauthDecision here just avoids a
      // stale flash before that screen's own poll resolves.
      if (onSubmitted) onSubmitted(res.correlation_id);
      else updateCaseState({ preauthCorrelationId: res.correlation_id, preauthDecision: null });
      close();
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
        <Button variant="outline" onClick={close}>Close</Button>
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
          <div style={{ fontWeight: 700 }}>{formatMoney(preview.authorized?.total_amount)}</div>
        </div>
        <div>
          <div style={{ fontSize: "11px", color: "var(--text-muted)", fontWeight: 700, textTransform: "uppercase" }}>Revised Total</div>
          <div style={{ fontWeight: 800, color: "var(--primary)" }}>{formatMoney(revisedTotal)}</div>
        </div>
        {revisedDelta != null && (
          <div>
            <div style={{ fontSize: "11px", color: "var(--text-muted)", fontWeight: 700, textTransform: "uppercase" }}>Delta</div>
            <div style={{ fontWeight: 700, color: revisedDelta > 0 ? "var(--success)" : "var(--text-muted)" }}>
              {revisedDelta > 0 ? "+" : ""}{formatMoney(revisedDelta)}
            </div>
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
                  <td style={{ textAlign: "right" }}>{formatMoney(item.net_amount)}</td>
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
        <Button variant="outline" onClick={close}>Cancel</Button>
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
