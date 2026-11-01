import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Send } from "lucide-react";
import { api } from "../../api";
import { useReadOnly } from "../../readOnly";
import { Button, DocumentChecklist, LoadingBlock, formatMoney, NextStep } from "../Common";
import { formatDate } from "../../format.js";
import { Section } from "../case/CaseFile";
import { CLAIM_WITH_PAYER } from "../case/caseStages";
import PatientDetailsForm from "../case/PatientDetailsForm";

// Fields only the hospital system can fill in.
const HIS_BLOCKERS = new Set(["diagnoses", "items", "preauth_ref"]);
const REVISED_ESTIMATE = { category: "revised_estimate", name: "Revised Estimate", code: "REVISED_ESTIMATE", optional: true };

const itemKey = (item) => item.service_code ?? item.service_name;

// The backend sends an enhancement as something else, or not at all, in these states.
function unavailableReason(legs) {
  if (CLAIM_WITH_PAYER.includes(legs?.claim)) return "The claim has gone to the payer, so the pre-authorisation can no longer be enhanced.";
  if (legs?.preauth === "queried") return "The payer has an open query on this pre-auth. Answer it on Approval first.";
  if (legs?.preauth === "submitting" || legs?.preauth === "cancelling") return "The payer is still working on this pre-auth. Wait for its answer on Approval.";
  if (legs?.preauth === "cancelled") return "This pre-auth was cancelled, so it cannot be enhanced.";
  return null;
}

export default function PreauthEnhancement({ ctx, onClose, onSubmitted }) {
  const navigate = useNavigate();
  const { caseState, updateCaseState, caseClosed, cashlessCase, draftFiles, setDraftFiles } = ctx;
  const { cashless_case_id, claim_id } = caseState;
  const readOnly = useReadOnly();
  const locked = readOnly || caseClosed;
  const filesKey = cashless_case_id || claim_id ? `${cashless_case_id || claim_id}:enhancement` : null;

  // Used both as a modal inside PreauthStatus (onClose provided) and as a routed
  // screen at /case/:id/enhancement (from the stepper's Enhancement branch and
  // the "File Enhancement" button on the claim screen). In the routed case there
  // is no onClose, so Cancel/Close and the post-submit hand-off must navigate
  // back to the Decision screen rather than being dead no-ops.
  const close = onClose || (() => navigate("../status"));

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [preview, setPreview] = useState(null);
  const [missingFields, setMissingFields] = useState([]);
  const [leftOutLines, setLeftOutLines] = useState({});
  const [lineEdits, setLineEdits] = useState({});
  const [checkedProcedures, setCheckedProcedures] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);

  const load = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      // Contract v1.7.0: enhancement prepare takes cashless_case_id as the
      // PREFERRED anchor; claim_id is transitional (resolved to the linked
      // case server-side). Prefer cashless_case_id, fall back to claim_id.
      const params = {};
      if (cashless_case_id) params.cashless_case_id = cashless_case_id;
      else if (claim_id) params.claim_id = claim_id;
      const res = await api.preparePreauthEnhancement(params);
      // The revised estimate gets a row of its own, and files attached earlier
      // come back over the list, which is rebuilt from the hospital records.
      const docs = [...(res.supporting_documents || [])];
      if (!docs.some((d) => d.code === REVISED_ESTIMATE.code)) docs.push(REVISED_ESTIMATE);
      (draftFiles?.[filesKey] || []).forEach((file) => {
        const idx = docs.findIndex((d) => d.code === file.code);
        if (idx >= 0) docs[idx] = { ...docs[idx], ...file };
        else docs.push(file);
      });
      setPreview({ ...res, supporting_documents: docs });
      setMissingFields(res.missing_fields ?? []);
      const initialChecked = {};
      (res.new_procedures || []).forEach((p, i) => { initialChecked[i] = true; });
      setCheckedProcedures(initialChecked);
    } catch (err) {
      setLoadError(err.message || "The enhancement could not be loaded.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const documentsNow = preview?.supporting_documents;
  useEffect(() => {
    if (!documentsNow || !filesKey) return;
    setDraftFiles(filesKey, documentsNow.filter((d) => d.attachment || d.custom));
  }, [documentsNow, filesKey, setDraftFiles]);

  const setDocuments = (update) => setPreview((prev) => ({ ...prev, supporting_documents: update(prev.supporting_documents || []) }));

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
  const lineOf = (item) => {
    const edit = lineEdits[itemKey(item)];
    if (!edit) return item;
    const next = { ...item, ...edit };
    return { ...next, net_amount: (Number(next.quantity) || 0) * (Number(next.unit_price) || 0) };
  };
  const excludedItem = (it) => uncheckedProcKeys.has(it.service_code) || uncheckedProcKeys.has(it.service_name) || !!leftOutLines[itemKey(it)];
  const submittedItems = (preview?.suggested_request?.items || []).filter((it) => !excludedItem(it)).map(lineOf);
  const scopeChanged = uncheckedProcKeys.size > 0 || Object.values(leftOutLines).some(Boolean) || Object.keys(lineEdits).length > 0;
  const revisedTotal = scopeChanged ? submittedItems.reduce((s, it) => s + (Number(it.net_amount) || 0), 0) : preview?.current?.total_amount;
  const revisedDelta =
    revisedTotal != null && preview?.authorized?.total_amount != null
      ? revisedTotal - preview.authorized.total_amount
      : preview?.delta_amount;
  const hisBlockers = missingFields.filter((f) => HIS_BLOCKERS.has(f.toLowerCase()));
  const patientMissing = missingFields.filter((f) => !HIS_BLOCKERS.has(f.toLowerCase()));
  const allDocs = preview?.supporting_documents || [];
  const missingDocs = allDocs.filter((d) => !d.optional && !d.url);
  const unavailable = unavailableReason(cashlessCase?.legs);
  const canSubmit = !locked && !unavailable && !submitting && missingFields.length === 0 && missingDocs.length === 0 && (revisedDelta ?? 0) > 0;

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
        supporting_documents: allDocs.filter((d) => d.url),
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
      if (filesKey) setDraftFiles(filesKey, []);
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

  if (loadError || preview?.status === "not_found") {
    return (
      <NextStep
        tone={loadError ? "bad" : "warn"}
        title={loadError ? "The enhancement could not be loaded" : "No pre-auth to enhance yet"}
        actions={
          <>
            {loadError && <button type="button" className="cv-btn" onClick={load}>Retry</button>}
            <button type="button" className="cv-btn" onClick={() => navigate("../review")}>Open pre-auth draft</button>
          </>
        }
      >
        {loadError || "Send a pre-auth first; an enhancement adds to one the payer has approved."}
      </NextStep>
    );
  }

  if (!preview.enhanceable) {
    return (
      <div className="wizard-step pd-screen">
        <Section id="en-none" title="Enhancement not available">
          <p className="ds-empty">{preview.reason || "No new procedures or billing found since the approved preauth."}</p>
          <NextStep tone="info" title="How to ask for more">
            An enhancement needs something new to justify it: a new procedure, or bills above the approved amount. Ask the
            doctor to record the new procedure or the billing desk to add the charges in the hospital system, then open this
            again.
          </NextStep>
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
  const authorizedItems = preview.authorized?.items || [];
  const authorizedTotal = preview.authorized?.total_amount;
  const approvedSoFar = preview.authorized?.approved_amount;

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
        disabled={!canSubmit}
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
      {unavailable && <div className="ep-notice is-warn">{unavailable}</div>}
      {hisBlockers.length > 0 && (
        <div className="ep-notice is-bad">The hospital records are missing: {hisBlockers.join(", ")}. Complete them in the hospital system, then open this again.</div>
      )}
      {patientMissing.length > 0 && (
        <PatientDetailsForm
          claimId={claim_id}
          cashlessCaseId={cashless_case_id}
          missingFields={patientMissing}
          locked={locked}
          onResolved={(remaining) => {
            setMissingFields(remaining);
            if (remaining.length === 0) load();
          }}
        />
      )}
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
                    disabled={locked}
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
                  <th style={{ width: 40 }} aria-label="Include" />
                  <th>Service</th>
                  <th className="ep-num" style={{ width: 90 }}>Qty</th>
                  <th className="ep-num" style={{ width: 130 }}>Unit price</th>
                  <th className="ep-num">Amount</th>
                </tr>
              </thead>
              <tbody>
                {newItems.map((item) => {
                  const key = itemKey(item);
                  const line = lineOf(item);
                  const excluded = excludedItem(item);
                  const edit = (field) => (e) => setLineEdits((p) => ({ ...p, [key]: { ...p[key], [field]: Number(e.target.value) } }));
                  return (
                    <tr key={key} className={excluded ? "en-excluded" : undefined}>
                      <td>
                        <input type="checkbox" aria-label={`Include ${item.service_name}`} checked={!leftOutLines[key]} disabled={locked} onChange={(e) => setLeftOutLines((p) => ({ ...p, [key]: !e.target.checked }))} />
                      </td>
                      <td className="ep-col-name">
                        <div className="ep-strong">{item.service_name}</div>
                        <div className="ep-muted">
                          {[item.service_code, item.category, excluded && "left out"].filter(Boolean).join(" · ")}
                        </div>
                      </td>
                      <td className="ep-num"><input className="cv-ctl cv-mono" style={{ width: "100%" }} type="number" min="1" aria-label="Quantity" value={line.quantity ?? ""} disabled={locked || excluded} onChange={edit("quantity")} /></td>
                      <td className="ep-num"><input className="cv-ctl cv-mono" style={{ width: "100%" }} type="number" min="0" aria-label="Unit price" value={line.unit_price ?? ""} disabled={locked || excluded} onChange={edit("unit_price")} /></td>
                      <td className="ep-num ep-mono">{formatMoney(line.net_amount)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {authorizedItems.length > 0 && (
        <Section id="en-authorised" title="Already authorised">
          <div className="ep-table-wrap">
            <table className="ep-table ds-lines-table">
              <thead>
                <tr>
                  <th>Service</th>
                  <th className="ep-num">Qty</th>
                  <th className="ep-num">Amount</th>
                </tr>
              </thead>
              <tbody>
                {authorizedItems.map((item) => (
                  <tr key={itemKey(item)}>
                    <td className="ep-col-name"><div className="ep-strong">{item.service_name}</div><div className="ep-muted">{item.service_code}</div></td>
                    <td className="ep-num ep-mono">{item.quantity}</td>
                    <td className="ep-num ep-mono">{formatMoney(item.net_amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      <Section id="en-docs" title="Documents sent with it" tip="Attach notes or reports that show why the extra treatment is needed.">
        <div className="ep-pad">
          <DocumentChecklist
            documents={allDocs}
            onUpload={(doc, uploaded) => setDocuments((list) => list.map((d) => (d.code === doc.code ? { ...d, ...uploaded } : d)))}
            onAddDocument={() => setDocuments((list) => [...list, { code: `CUSTOM-${Date.now()}`, name: "", category: "additional", optional: true, custom: true }])}
            onRenameDocument={(i, name) => setDocuments((list) => list.map((d, n) => (n === i ? { ...d, name } : d)))}
            onRemoveDocument={(i) => setDocuments((list) => list.filter((_, n) => n !== i))}
            readOnly={locked}
            hideSummary
          />
        </div>
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
