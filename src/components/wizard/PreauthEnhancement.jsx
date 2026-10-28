import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Send } from "lucide-react";
import { api } from "../../api";
import { Button, LoadingBlock, formatMoney, NextStep } from "../Common";
import { formatDate } from "../../format.js";
import { Section, Fields } from "../case/CaseFile";

export default function PreauthEnhancement({ ctx, onClose, onSubmitted }) {
  const navigate = useNavigate();
  const { caseState, updateCaseState, caseClosed } = ctx;
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
  const [submitError, setSubmitError] = useState(null);

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
    setSubmitError(null);
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
      if (res?.status === "failed") {
        setSubmitError(res.message || res.error?.message || "The enhancement could not be submitted.");
        return;
      }
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
    } catch (err) {
      setSubmitError(err.message || "The enhancement could not be submitted.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <LoadingBlock compact />;
  }

  // Routed as its own step it gets the side panel; inside the Decision
  // screen's dialog the same sections stack with the actions at the foot.
  const routed = !onClose;

  if (!preview || !preview.enhanceable) {
    return (
      <div className="wizard-step pd-screen">
        <Section id="en-none" title={preview ? "Enhancement not available" : "Could not load the enhancement"}>
          <p className="ds-empty">
            {!preview
              ? "The enhancement preview didn't load. Try again from the Approval stage."
              : preview.reason || "No new procedures or billing found since the approved preauth."}
          </p>
          {preview && (
            <NextStep tone="info" title="How to ask for more">
              An enhancement needs something new to justify it: a new procedure, or bills above the approved amount. Ask the
              doctor to record the new procedure or the billing desk to add the charges in the hospital system, then open this
              again.
            </NextStep>
          )}
          <div className="ds-empty-actions">
            <Button variant="outline" size="small" onClick={close}>
              {routed ? "Back to approval" : "Close"}
            </Button>
          </div>
        </Section>
      </div>
    );
  }

  const newProcs = preview.new_procedures || [];
  const newItems = preview.new_items || [];
  const excludedItem = (it) => uncheckedProcKeys.has(it.service_code) || uncheckedProcKeys.has(it.service_name);
  const authorizedTotal = preview.authorized?.total_amount;
  const approvedSoFar = preview.authorized?.approved_amount;
  const docs = (preview.supporting_documents || []).filter((d) => d.url);

  const statement = (
    <dl className="ds-statement">
      <div>
        <dt>
          Previously requested
          {approvedSoFar != null && <span className="ep-muted"> · {formatMoney(approvedSoFar)} approved</span>}
        </dt>
        <dd className="ep-mono">{formatMoney(authorizedTotal)}</dd>
      </div>
      {revisedDelta != null && (
        <div>
          <dt>New scope</dt>
          <dd className="ep-mono">{revisedDelta >= 0 ? "+ " : "− "}{formatMoney(Math.abs(revisedDelta))}</dd>
        </div>
      )}
      <div className="is-total">
        <dt>Revised request</dt>
        <dd className="ep-mono">{formatMoney(revisedTotal)}</dd>
      </div>
    </dl>
  );

  const actions = (
    <>
      {submitError && (
        <NextStep tone="bad" title="Not sent">
          {submitError} Fix what the message names and submit again.
        </NextStep>
      )}
      <Button write
        variant="primary"
        icon={Send}
        disabled={submitting || caseClosed}
        title={caseClosed ? "The case is settled" : undefined}
        onClick={handleSubmit}
        className="pd-submit-btn"
      >
        {submitting ? "Submitting…" : "Submit enhancement"}
      </Button>
      <button type="button" className="pd-text-btn" onClick={close}>
        {routed ? "Back to approval" : "Cancel"}
      </button>
    </>
  );

  const sections = (
    <>
      {!routed && (
        <Section
          id="en-amounts"
          title="Amount"
          info="enhancement"
          tip="The extra amount you are asking for, on top of what the payer already approved."
        >
          {statement}
        </Section>
      )}

      {newProcs.length > 0 && (
        <Section
          id="en-procs"
          title="New procedures"
          meta="Untick a procedure to leave it and its lines out"
          tip="Only treatment added since the approval is sent. Untick anything that isn't needed."
        >
          <ul className="en-procs">
            {newProcs.map((proc, i) => (
              <li key={i}>
                <label>
                  <input
                    type="checkbox"
                    checked={!!checkedProcedures[i]}
                    onChange={(e) => setCheckedProcedures((p) => ({ ...p, [i]: e.target.checked }))}
                  />
                  <span>
                    <span className="ep-strong">{proc.name}</span>
                    <span className="ep-muted">{[proc.code, proc.date && formatDate(proc.date)].filter(Boolean).join(" · ")}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {newItems.length > 0 && (
        <Section id="en-items" title="New line items">
          <div className="ep-table-wrap">
            <table className="ep-table ds-lines-table">
              <thead>
                <tr>
                  <th>Service</th>
                  <th className="ep-num">Qty</th>
                  <th className="ep-num">Unit price</th>
                  <th className="ep-num">Amount</th>
                </tr>
              </thead>
              <tbody>
                {newItems.map((item, i) => (
                  <tr key={i} className={excludedItem(item) ? "en-excluded" : undefined}>
                    <td className="ep-col-name">
                      <div className="ep-strong">{item.service_name}</div>
                      <div className="ep-muted">
                        {[item.service_code, item.category, excludedItem(item) && "left out"].filter(Boolean).join(" · ")}
                      </div>
                    </td>
                    <td className="ep-num ep-mono">{item.quantity}</td>
                    <td className="ep-num ep-mono">{formatMoney(item.unit_price)}</td>
                    <td className="ep-num ep-mono">{formatMoney(item.net_amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      <Section id="en-docs" title="Documents sent with it" tip="Attach notes or reports that show why the extra treatment is needed.">
        <Fields cols={1} rows={docs.map((d, i) => ({ label: i === 0 ? "Attached" : " ", value: d.name || d.code, sub: d.event_date ? formatDate(d.event_date) : null }))} />
        <label className="en-url">
          <span>Revised estimate URL (optional)</span>
          <input
            className="input-modern pd-input"
            placeholder="https://hospital.example/records/revised-estimate.pdf"
            value={additionalDocUrl}
            onChange={(e) => setAdditionalDocUrl(e.target.value)}
          />
        </label>
      </Section>
    </>
  );

  if (!routed) {
    return (
      <div className="pd-screen">
        {sections}
        <div className="en-footer">{actions}</div>
      </div>
    );
  }

  return (
    <div className="wizard-step pd-screen">
      <div className="pd-layout">
        <div className="pd-main">{sections}</div>
        <aside className="pd-side">
          <section className="ep-section pd-request">
            <header className="ep-section-head">
              <h3 className="ep-section-title">Enhancement request</h3>
            </header>
            {preview.preauth_ref && (
              <div className="ds-ref ds-ref-top">
                <span className="ep-muted">Enhancing</span>
                <span className="ep-mono">{preview.preauth_ref}</span>
              </div>
            )}
            {statement}
            <div className="pd-submit">{actions}</div>
          </section>
        </aside>
      </div>
    </div>
  );
}
