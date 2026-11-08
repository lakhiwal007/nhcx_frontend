import { useState, useEffect } from "react";
import StageBar from "../case/StageBar";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Send } from "lucide-react";
import { api } from "../../api";
import { useReadOnly } from "../../readOnly";
import { DocumentChecklist, LoadingBlock, formatMoney, NextStep } from "../Common";
import { formatDate } from "../../format.js";
import { CLAIM_WITH_PAYER } from "../case/caseStages";
import PatientDetailsForm from "../case/PatientDetailsForm";
import CaseChecklist from "../case/CaseChecklist";
import { useCasePane } from "../case/useCasePane";
import { buildEnhancementChecklist, firstEnhancementItem } from "../case/enhancementChecklist";

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

export default function PreauthEnhancement({ ctx }) {
  const navigate = useNavigate();
  const { caseState, updateCaseState, caseClosed, cashlessCase, draftFiles, setDraftFiles } = ctx;
  const { cashless_case_id, claim_id } = caseState;
  const readOnly = useReadOnly();
  const locked = readOnly || caseClosed;
  const filesKey = cashless_case_id || claim_id ? `${cashless_case_id || claim_id}:enhancement` : null;

  const { picked, paneRef, openItem } = useCasePane();
  const close = () => navigate("../status");

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
    const timer = setTimeout(load, 0);
    return () => clearTimeout(timer);
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
  const procedureKept = (proc, i) => !!checkedProcedures[i] && !leftOutLines[proc.code ?? proc.name];
  const uncheckedProcKeys = new Set(
    (preview?.new_procedures || [])
      .map((p, i) => (procedureKept(p, i) ? null : p.code ?? p.name))
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
      const selectedProcs = (preview.new_procedures || []).filter(procedureKept);
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
      // Approval remounts on the way back and polls the new request.
      if (filesKey) setDraftFiles(filesKey, []);
      updateCaseState({ preauthCorrelationId: res.correlation_id, preauthDecision: null });
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

  if (unavailable || !preview.enhanceable) {
    return (
      <NextStep
        tone={unavailable ? "warn" : "info"}
        title={unavailable ? "Enhancement not available" : preview.reason || "Nothing new to ask for"}
        actions={<button type="button" className="cv-btn" onClick={close}>Back to approval</button>}
      >
        {unavailable ||
          "An enhancement needs something new to justify it: a new procedure, or bills above the approved amount. Ask the doctor to record the new procedure or the billing desk to add the charges in the hospital system, then open this again."}
      </NextStep>
    );
  }

  const newProcs = preview.new_procedures || [];
  const newItems = preview.new_items || [];
  const authorizedItems = preview.authorized?.items || [];
  const authorizedTotal = preview.authorized?.total_amount;
  const approvedSoFar = preview.authorized?.approved_amount;

  const groups = buildEnhancementChecklist({
    patientMissing: patientMissing.length,
    hisMissing: hisBlockers.length,
    procedures: newProcs.length,
    proceduresKept: newProcs.filter(procedureKept).length,
    lines: newItems.length,
    linesKept: newItems.filter((it) => !excludedItem(it)).length,
    delta: revisedDelta,
    authorised: authorizedItems.length,
    missingDocs: missingDocs.length,
    attachedDocs: allDocs.filter((d) => d.url).length,
  });
  const blockers = groups.flatMap((g) => g.rows).filter((r) => r.blocks);
  const open = picked || firstEnhancementItem(groups);
  const paneFor = (id) => ({ hidden: open !== id });
  const barState = locked ? ["Not sent", "is-todo", "info"] : blockers.length > 0 ? [`${blockers.length} must be done`, "is-warn", "warn"] : ["Ready to send", "is-ok", "ok"];

  return (
    <div className="cv-elig">
      <div className={`cv-notice cv-verdict is-${barState[2]}`}>
        <div className="cv-verdict-row">
          <StageBar ctx={ctx} />
          <span className={`cv-chip ${barState[1]}`}>{barState[0]}</span>
          <span className="cv-notice-body">
            <strong>{formatMoney(revisedTotal)}</strong> revised
            {revisedDelta != null ? ` · ${revisedDelta >= 0 ? "+" : "−"} ${formatMoney(Math.abs(revisedDelta))}` : ""}
            {preview.preauth_ref && <span className="cv-mono cv-card-meta cv-bar-ref">{preview.preauth_ref}</span>}
          </span>
          <span className="cv-verdict-actions">
            <button type="button" className="cv-btn" onClick={close}><ArrowLeft size={14} /> Back to approval</button>
            {!caseClosed && (
              <button type="button" className="cv-btn is-primary" disabled={!canSubmit} title={!canSubmit && !submitting ? "Finish the items marked in red first." : undefined} onClick={handleSubmit}>
                <Send size={15} /> {submitting ? "Submitting…" : "Submit enhancement"}
              </button>
            )}
          </span>
        </div>
        {hisBlockers.length > 0 && <div className="cv-notice-hint cv-verdict-note is-bad">The hospital records are missing: {hisBlockers.join(", ")}. Complete them in the hospital system, then open this again.</div>}
        {submitError && <div className="cv-notice-hint cv-verdict-note is-bad"><strong>Not sent:</strong> {submitError} Fix what the message names and submit again.</div>}
      </div>

      <div className="cv-work">
        <CaseChecklist groups={groups} open={open} onOpen={openItem} label="Enhancement checklist" />

        <div className="cv-work-pane" ref={paneRef}>
          {patientMissing.length > 0 && (
            <div {...paneFor("details")}>
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
            </div>
          )}

          {newProcs.length > 0 && (
            <div {...paneFor("procedures")}>
              <section className="cv-card" aria-label="New procedures">
                <div className="cv-card-head">
                  <h2 className="cv-card-title">New procedures</h2>
                  <span className="cv-card-meta">Untick a procedure to leave it and its lines out.</span>
                </div>
                <ul className="en-procs">
                  {newProcs.map((proc, i) => (
                    <li key={i}>
                      <label>
                        <input
                          type="checkbox"
                          checked={procedureKept(proc, i)}
                          disabled={locked}
                          onChange={(e) => {
                            setCheckedProcedures((p) => ({ ...p, [i]: e.target.checked }));
                            setLeftOutLines((p) => ({ ...p, [proc.code ?? proc.name]: false }));
                          }}
                        />
                        <span>
                          <span className="ep-strong">{proc.name}</span>
                          <span className="ep-muted">{[proc.code, proc.date && formatDate(proc.date)].filter(Boolean).join(" · ")}</span>
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              </section>
            </div>
          )}

          {newItems.length > 0 && (
            <div {...paneFor("lines")}>
              <section className="cv-card" aria-label="New line items">
                <div className="cv-card-head">
                  <h2 className="cv-card-title">New line items</h2>
                  <span className="cv-card-meta">Untick a line to leave it out, or correct its quantity and price.</span>
                </div>
                <div className="cv-tw cv-in-card">
                  <table>
                    <thead>
                      <tr>
                        <th style={{ width: 40 }} aria-label="Include" />
                        <th>Service</th>
                        <th style={{ width: 100 }}>Qty</th>
                        <th style={{ width: 140 }}>Unit price</th>
                        <th className="is-num" style={{ width: 130 }}>Amount</th>
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
                            <td>
                              <strong>{item.service_name}</strong>
                              <div className="cv-card-meta">{[item.service_code, item.category, excluded && "left out"].filter(Boolean).join(" · ")}</div>
                            </td>
                            <td><input className="cv-ctl cv-mono" style={{ width: "100%" }} type="number" min="1" aria-label="Quantity" value={line.quantity ?? ""} disabled={locked || excluded} onChange={edit("quantity")} /></td>
                            <td><input className="cv-ctl cv-mono" style={{ width: "100%" }} type="number" min="0" aria-label="Unit price" value={line.unit_price ?? ""} disabled={locked || excluded} onChange={edit("unit_price")} /></td>
                            <td className="is-num" style={{ fontWeight: 600 }}>{formatMoney(line.net_amount)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          )}

          <div {...paneFor("revised")}>
            <section className="cv-card" aria-label="Revised amount">
              <div className="cv-card-head">
                <h2 className="cv-card-title">Revised amount</h2>
                <span className="cv-card-meta">What you are asking for on top of the earlier request.</span>
              </div>
              <div className="cv-card-body">
                <div className="cv-kv">
                  <span>Previously requested{approvedSoFar != null ? ` · ${formatMoney(approvedSoFar)} approved` : ""}</span>
                  <span>{formatMoney(authorizedTotal)}</span>
                </div>
                {revisedDelta != null && (
                  <div className="cv-kv"><span>New scope</span><span>{revisedDelta >= 0 ? "+ " : "− "}{formatMoney(Math.abs(revisedDelta))}</span></div>
                )}
                <div className="cv-kv"><span>Revised request</span><span>{formatMoney(revisedTotal)}</span></div>
              </div>
            </section>
          </div>

          {authorizedItems.length > 0 && (
            <div {...paneFor("authorised")}>
              <section className="cv-card" aria-label="Already authorised">
                <div className="cv-card-head"><h2 className="cv-card-title">Already authorised</h2></div>
                <div className="cv-tw cv-in-card">
                  <table>
                    <thead>
                      <tr>
                        <th>Service</th>
                        <th className="is-num">Qty</th>
                        <th className="is-num">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {authorizedItems.map((item) => (
                        <tr key={itemKey(item)}>
                          <td><strong>{item.service_name}</strong><div className="cv-card-meta">{item.service_code}</div></td>
                          <td className="is-num">{item.quantity}</td>
                          <td className="is-num">{formatMoney(item.net_amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          )}

          <div {...paneFor("documents")}>
            <section className="cv-card" aria-label="Documents">
              <div className="cv-card-head">
                <h2 className="cv-card-title">Documents sent with it</h2>
                <span className="cv-card-meta">Attached files stay until sent, but reloading the page drops them.</span>
              </div>
              <div className="cv-card-body">
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
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
