import { useState, useEffect } from "react";
import StageBar from "../case/StageBar";
import { useNavigate, useLocation } from "react-router-dom";
import { Send, Edit2 } from "lucide-react";
import { api } from "../../api";
import { useReadOnly } from "../../readOnly";
import { usePoll } from "../../hooks/usePoll";
import { Button, DocumentChecklist, LoadingBlock, NextStep, formatMoney } from "../Common";
import { formatDate, formatDateTime } from "../../format.js";
import CaseChecklist from "../case/CaseChecklist";
import { useCasePane } from "../case/useCasePane";
import { buildClaimChecklist, firstClaimItem } from "../case/claimChecklist";
import PayerAsks from "../case/PayerAsks";
import BiometricCard from "../case/BiometricCard";
import PatientDetailsForm from "../case/PatientDetailsForm";
import { liveAsks } from "../case/askStatus";
import { Drawer } from "../Overlay";
import SendCommunicationModal, { OUTBOUND_COMMUNICATIONS_ENABLED } from "../SendCommunicationModal";

const POLL_INTERVAL_MS = 7000;
// Fields that cannot be resolved from the UI — they must be completed in the
// HIS. Showing the patient-context form for these is a bug (per the spec):
// diagnosis codes and billing items come from clinical/billing records, and
// preauth_ref requires an approved preauth. preauth_ref has its own banner, so
// the HIS-blocker banner only surfaces diagnoses/items.
const HIS_BLOCKERS = new Set(["diagnoses", "items", "preauth_ref"]);

const DISCHARGE_TYPES = [
  { value: "DTH", label: "Home (normal discharge)" },
  { value: "DTM", label: "Death" },
  { value: "LAMA", label: "Left against medical advice (LAMA)" },
  { value: "DAMA", label: "Discharged against medical advice (DAMA)" },
];
const DISCHARGE_STAGES = ["Before Surgery", "During Surgery", "After Surgery"];
const LM100_STAGES = ["Before Surgery", "During Surgery"];

const toLocalInput = (iso) => (iso ? String(iso).slice(0, 16) : "");
const fromLocalInput = (value) => (value ? `${value}:00+05:30` : null);

function DischargeDetailsForm({ claimId, discharge, rules, readOnly, onSaved }) {
  const initial = () => ({
    type: discharge?.type || "",
    stage: discharge?.stage || "",
    surgery_at: toLocalInput(discharge?.surgery_at),
    death_at: toLocalInput(discharge?.death_at),
    discharged_at: toLocalInput(discharge?.discharged_at),
    stratification: discharge?.stratification || "",
  });
  const [values, setValues] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const set = (key) => (e) => setValues((p) => ({ ...p, [key]: e.target.value }));
  const lm100 = ["LAMA", "DAMA"].includes(values.type) && (rules?.lm100_stages || LM100_STAGES).includes(values.stage);
  const rates = rules?.lm100_rates || [];

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const body = {
        type: values.type || null,
        stage: values.stage || null,
        surgery_at: fromLocalInput(values.surgery_at),
        death_at: values.type === "DTM" ? fromLocalInput(values.death_at) : null,
        discharged_at: fromLocalInput(values.discharged_at),
        stratification: lm100 ? values.stratification || null : null,
      };
      const discharge = Object.fromEntries(Object.entries(body).filter(([, v]) => v));
      const res = await api.patchPatientContext(claimId, { patient_context: { discharge } });
      onSaved(res.missing_fields ?? []);
    } catch (err) {
      setError(err.message || "The discharge details could not be saved.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="pd-form">
        <label className="pd-form-field">
          <span>How the patient left</span>
          <select className="input-modern pd-input" value={values.type} disabled={readOnly} onChange={set("type")}>
            <option value="">Choose…</option>
            {DISCHARGE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </label>
        <label className="pd-form-field">
          <span>Stage</span>
          <select className="input-modern pd-input" value={values.stage} disabled={readOnly} onChange={set("stage")}>
            <option value="">Choose…</option>
            {DISCHARGE_STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <label className="pd-form-field">
          <span>Discharge date and time</span>
          <input className="input-modern pd-input" type="datetime-local" value={values.discharged_at} disabled={readOnly} onChange={set("discharged_at")} />
        </label>
        <label className="pd-form-field">
          <span>Surgery date and time (if any)</span>
          <input className="input-modern pd-input" type="datetime-local" value={values.surgery_at} disabled={readOnly} onChange={set("surgery_at")} />
        </label>
        {values.type === "DTM" && (
          <label className="pd-form-field">
            <span>Date and time of death</span>
            <input className="input-modern pd-input" type="datetime-local" value={values.death_at} disabled={readOnly} onChange={set("death_at")} />
          </label>
        )}
        {lm100 && (
          <label className="pd-form-field">
            <span>Ward for the LM100 claim</span>
            <select className="input-modern pd-input" value={values.stratification} disabled={readOnly} onChange={set("stratification")}>
              <option value="">Choose…</option>
              {rates.map((r) => <option key={r.code} value={r.code}>{`${r.label || r.code} · ${formatMoney(r.rate)} a day`}</option>)}
            </select>
          </label>
        )}
      </div>
      {lm100 && (
        <div className="cv-notice is-warn" style={{ marginTop: 10 }}>
          <div className="cv-notice-body">
            {rates.length
              ? "PMJAY pays a LAMA or DAMA before or during surgery as one LM100 line: the days admitted at the chosen ward's rate. Every other item on the bill drops out of this claim."
              : "PMJAY pays this discharge as LM100, but the payer's plan held for this case has no LM100 rates. Fetch the plan again on Eligibility."}
          </div>
        </div>
      )}
      {error && <div className="cv-notice is-bad" style={{ marginTop: 10 }}><div className="cv-notice-body">{error}</div></div>}
      {!readOnly && (
        <div className="pd-form-actions">
          <Button write variant="primary" size="small" disabled={saving} onClick={save}>
            {saving ? "Saving…" : "Save discharge details"}
          </Button>
        </div>
      )}
    </>
  );
}

// The payer's answer on each line, so staff can see what was cut and why.
function ClaimLines({ status, draftItems }) {
  const lines = status?.items || [];
  if (!lines.length) return null;
  const nameOf = (item, i) => {
    const line = (status.claim_items || []).find((c) => c.sequence === item.sequence) || draftItems?.[(item.sequence ?? i + 1) - 1];
    return line?.service_name || line?.product_or_service?.display || line?.name || line?.service_code || `Line ${item.sequence ?? i + 1}`;
  };
  return (
    <div className="cv-tw cv-in-card">
      <table>
        <thead>
          <tr>
            <th>Service</th>
            <th className="is-num">Claimed</th>
            <th className="is-num">Eligible</th>
            <th className="is-num">Co-pay</th>
            <th className="is-num">Approved</th>
            <th>Payer's reason</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((item, i) => {
            const adj = item.adjudication || {};
            const reasons = [adj.status, adj.eligible?.reason, adj.benefit?.reason, adj.reason?.text || adj.reason?.raw].filter((v, n, a) => v && a.indexOf(v) === n);
            const money = (v) => (v == null ? "—" : formatMoney(v));
            return (
              <tr key={i}>
                <td><strong>{nameOf(item, i)}</strong></td>
                <td className="is-num">{money(adj.submitted?.value)}</td>
                <td className="is-num">{money(adj.eligible?.value)}</td>
                <td className="is-num">{money(adj.copay?.value)}</td>
                <td className="is-num" style={{ fontWeight: 600 }}>{money(adj.benefit?.value)}</td>
                <td>{reasons.length ? reasons.join(" · ") : "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function ClaimsScreen({ ctx }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { caseState, updateCaseState, cashlessCase, moneyLedger, timelineEvents, refreshTimeline, caseClosed, draftFiles, setDraftFiles } = ctx;
  const readOnly = useReadOnly();
  const locked = readOnly || caseClosed;
  const payerId = caseState.payer?.code || cashlessCase?.payer_id || "";

  const [loading, setLoading] = useState(true);
  const [claimDraft, setClaimDraft] = useState(null);
  const [asksReload, setAsksReload] = useState(0);
  const [missingFields, setMissingFields] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  // Older links name the tabs this screen used to have.
  const linkedTab = location.state?.tab;
  const { picked, setPicked, paneRef, openItem } = useCasePane(linkedTab && linkedTab !== "draft" ? linkedTab : null);
  const [biometric, setBiometric] = useState(null);

  // Discharge flow
  const [dischargeCorrelationId, setDischargeCorrelationId] = useState(caseState.dischargeCorrelationId || null);
  const [dischargeStatus, setDischargeStatus] = useState(null);
  const [dischargePolling, setDischargePolling] = useState(false);
  const [dischargeSubmitError, setDischargeSubmitError] = useState(null);

  // Final claim flow
  const [finalCorrelationId, setFinalCorrelationId] = useState(caseState.claimCorrelationId || null);
  const [claimStatus, setClaimStatus] = useState(null);
  const [polling, setPolling] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [pollError, setPollError] = useState(null);
  const [recoverError, setRecoverError] = useState(null);
  const [asksError, setAsksError] = useState(null);

  const [showQueryDrawer, setShowQueryDrawer] = useState(false);
  const [showReleaseDrawer, setShowReleaseDrawer] = useState(false);
  const [releaseMessage, setReleaseMessage] = useState("");
  const [releaseCorrelationId, setReleaseCorrelationId] = useState(null);
  const [releaseStatus, setReleaseStatus] = useState(null);
  const [enquiring, setEnquiring] = useState(false);
  const [enquiryNote, setEnquiryNote] = useState(null);

  useEffect(() => {
    if (!releaseCorrelationId) return undefined;
    let stopped = false;
    let timer = null;
    const tick = async () => {
      try {
        const res = await api.getReprocessStatus(releaseCorrelationId);
        if (stopped) return;
        setReleaseStatus(res);
        if (res?.status === "complete" || res?.status === "failed") clearInterval(timer);
      } catch {
        // keep polling
      }
    };
    timer = setInterval(tick, POLL_INTERVAL_MS);
    tick();
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [releaseCorrelationId]);

  const handleClaimEnquiry = async () => {
    setEnquiring(true);
    setEnquiryNote(null);
    try {
      const res = await api.requestGatewayStatus({ correlation_id: finalCorrelationId, claim_id: resolvedClaimId, use_case: "claim" });
      if (res.status === "failed" || !res.enquiry_correlation_id) {
        setEnquiryNote(res.message || res.error?.message || "The status enquiry could not be sent.");
        return;
      }
      setEnquiryNote("Asked. The gateway's answer lands in the case timeline.");
    } catch (err) {
      setEnquiryNote(err.message || "The status enquiry could not be sent.");
    } finally {
      setEnquiring(false);
    }
  };
  const [releaseAmount, setReleaseAmount] = useState("");
  const [releaseNote, setReleaseNote] = useState("");
  // Corrects a rejected *discharge*
  // (interim, wf=14) claim via DC01, not the final claim (workflow 16) —
  // no reprocess option applies since no final claim exists yet.
  const [showDischargeResubmitDrawer, setShowDischargeResubmitDrawer] = useState(false);
  const [showSendModal, setShowSendModal] = useState(false);
  const [queryAnswer, setQueryAnswer] = useState("");
  const [queryDocs, setQueryDocs] = useState([]);
  const [dischargeAnswer, setDischargeAnswer] = useState("");

  // Editable items in resubmit drawer
  const [resubmitEditItems, setResubmitEditItems] = useState(null);

  // Acknowledgement that the final bill exceeds the authorized ceiling — the
  // over-ceiling excess is recovered from the patient (or needs an enhancement),
  // so the desk must confirm before the final claim goes out (J2 guard).
  const [ackOverCeiling, setAckOverCeiling] = useState(false);
  const [askForms, setAskForms] = useState([]);

  const claimId = caseState.claim_id || location.state?.claim_id;
  const resolvedClaimId = claimId || caseState.claim_id || null;
  const resolvedCashlessCaseId = caseState.cashless_case_id || location.state?.cashless_case_id || null;

  const filesKey = resolvedCashlessCaseId || resolvedClaimId ? `${resolvedCashlessCaseId || resolvedClaimId}:claim` : null;

  // Files attached here live only in memory until the send, so they come back
  // over each draft, which is rebuilt from the hospital records.
  const withAttachedFiles = (res) => {
    const list = [...(res.supporting_documents || [])];
    (draftFiles?.[filesKey] || []).forEach((file) => {
      const idx = list.findIndex((d) => d.code === file.code);
      if (idx >= 0) list[idx] = { ...list[idx], ...file };
      else list.push(file);
    });
    return { ...res, supporting_documents: list };
  };

  const draftParams = (id) => {
    if (id) return { claim_id: id };
    if (resolvedCashlessCaseId) return { cashless_case_id: resolvedCashlessCaseId };
    return resolvedClaimId ? { claim_id: resolvedClaimId } : {};
  };

  const refreshAsks = () => {
    setAsksReload((n) => n + 1);
    setAsksError(null);
    api.prepareClaimDraft(draftParams())
      .then((res) => setClaimDraft((prev) => (prev ? { ...prev, payer_asks: res.payer_asks } : prev)))
      .catch((err) => setAsksError(err.message || "The payer's asks could not be reloaded."));
  };

  const loadDraft = async (id, params) => {
    setLoading(true);
    try {
      const res = await api.prepareClaimDraft(params || draftParams(id));
      setClaimDraft(withAttachedFiles(res));
      setMissingFields(res.missing_fields ?? []);
      if (res.claim_id && !resolvedClaimId) {
        updateCaseState({ claim_id: res.claim_id });
      }
      if (res.cashless_case_id && !resolvedCashlessCaseId) {
        updateCaseState({ cashless_case_id: res.cashless_case_id });
      }
    } catch (e) {
      setClaimDraft({ _error: e?.message || "Could not load the claim draft." });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (finalCorrelationId) {
      setPolling(true);
    } else if (dischargeCorrelationId) {
      // Resume polling a discharge submission from a prior session/tab close
      // — e.g. a resubmit_discharge_claim Work Queue task landing here fresh.
      setDischargePolling(true);
    }

    if (!resolvedClaimId && !resolvedCashlessCaseId) {
      setLoading(false);
      setClaimDraft({ _error: "No claim ID available. Please complete the preauth step first." });
      return;
    }

    loadDraft(null, draftParams(null));
  }, []);

  const recoverCase = async () => {
    if (finalCorrelationId) return;
    if (!resolvedCashlessCaseId) return;
    setRecoverError(null);
    try {
      const res = await api.getCashlessStatus(resolvedCashlessCaseId);
      const correlationId = res.claim?.correlation_id;
      if (!correlationId) return;
      // `claim` is the latest claim transaction, which may be a discharge
      // claim. The claim leg stays "draft" until a final claim has gone out.
      if ((res.legs?.claim ?? "sent") === "draft") {
        if (!dischargeCorrelationId) {
          setDischargeCorrelationId(correlationId);
          updateCaseState({ dischargeCorrelationId: correlationId });
          setDischargePolling(true);
        }
        return;
      }
      setFinalCorrelationId(correlationId);
      updateCaseState({ claimCorrelationId: correlationId });
      setPolling(true);
    } catch (err) {
      setRecoverError(err.message || "The case could not be read.");
    }
  };

  useEffect(() => {
    recoverCase();
  }, []);

  // Keep what staff attached when they leave for another step of the case.
  const documentsNow = claimDraft?.supporting_documents;
  useEffect(() => {
    if (!documentsNow || !filesKey) return;
    setDraftFiles(filesKey, documentsNow.filter((d) => d.attachment || d.custom));
  }, [documentsNow, filesKey, setDraftFiles]);

  // Discharge claim polling
  const pollDischarge = async (signal) => {
    try {
      const res = await api.getClaimStatus(dischargeCorrelationId, signal);
      setPollError(null);
      setDischargeStatus(res);
      // REJECTED is terminal for the interim discharge submission too — the
      // claim itself reverts to draft, but there is nothing left to poll for
      // until the hospital corrects and resubmits via DC01.
      if (res.status === "complete" || res.status === "not_found" || res.status === "failed" || res.decision === "REJECTED") {
        setDischargePolling(false);
        // A terminal claim decision moves the money ledger — refresh the shared
        // timeline so the case header's money strip tracks it (this screen polls
        // locally, so caseState — which the header watches — wouldn't otherwise change).
        refreshTimeline?.();
      }
    } catch (err) {
      if (!signal.aborted) setPollError(err.message || "The payer's answer could not be checked.");
    }
  };
  usePoll(pollDischarge, {
    active: dischargePolling && dischargeCorrelationId ? dischargeCorrelationId : null,
    intervalMs: POLL_INTERVAL_MS,
  });

  // Final claim polling
  const pollFinal = async (signal) => {
    try {
      const res = await api.getClaimStatus(finalCorrelationId, signal);
      setPollError(null);
      setClaimStatus(res);
      if (res.status === "complete" || res.status === "not_found" || res.status === "failed") {
        setPolling(false);
        refreshTimeline?.();
      }
    } catch (err) {
      if (!signal.aborted) setPollError(err.message || "The payer's answer could not be checked.");
    }
  };
  usePoll(pollFinal, {
    active: polling && finalCorrelationId ? finalCorrelationId : null,
    intervalMs: POLL_INTERVAL_MS,
  });

  // Seed resubmit drawer items when either the final-claim or discharge-claim
  // resubmit drawer opens.
  useEffect(() => {
    if (showDischargeResubmitDrawer) {
      setResubmitEditItems(claimDraft?.items?.map((it) => ({ ...it })) ?? []);
    }
  }, [showDischargeResubmitDrawer]);

  const handleUpload = (doc, uploaded) => {
    setClaimDraft((prev) => ({
      ...prev,
      supporting_documents: prev.supporting_documents.map((d) =>
        d.code === doc.code ? { ...d, ...uploaded } : d
      ),
    }));
  };

  // Lets the hospital attach a document that isn't on the backend's
  // pre-populated required/optional checklist (e.g. a payer-specific extra).
  const addDocument = () => {
    setClaimDraft((prev) => ({
      ...prev,
      supporting_documents: [
        ...(prev.supporting_documents || []),
        { code: `CUSTOM-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, name: "", category: "additional", optional: true, custom: true },
      ],
    }));
  };
  const renameDocument = (idx, name) => {
    setClaimDraft((prev) => ({
      ...prev,
      supporting_documents: prev.supporting_documents.map((d, i) => (i === idx ? { ...d, name } : d)),
    }));
  };
  const removeDocument = (idx) => {
    setClaimDraft((prev) => ({
      ...prev,
      supporting_documents: prev.supporting_documents.filter((_, i) => i !== idx),
    }));
  };

  const updateResubmitItem = (idx, field, raw) => {
    const val = Number(raw);
    setResubmitEditItems((prev) =>
      prev.map((it, i) => {
        if (i !== idx) return it;
        const next = { ...it, [field]: isNaN(val) ? raw : val };
        if (field === "quantity" || field === "unit_price") {
          const qty = field === "quantity" ? val : it.quantity;
          const price = field === "unit_price" ? val : it.unit_price;
          next.net_amount = Math.round(qty * price * 100) / 100;
        }
        return next;
      })
    );
  };

  const handleSubmitDischarge = async () => {
    setSubmitting(true);
    setDischargeSubmitError(null);
    try {
      const attachedDocs = claimDraft?.supporting_documents?.filter((d) => d.url) ?? [];
      const res = await api.submitDischargeClaim({
        claim_id: claimDraft.claim_id,
        ...(attachedDocs.length > 0 && { supporting_documents: attachedDocs }),
      });
      if (res.status === "failed") {
        setDischargeSubmitError(res.message || res.error?.message || "Discharge claim submission failed. Please try again.");
        return;
      }
      setDischargeCorrelationId(res.correlation_id);
      updateCaseState({ dischargeCorrelationId: res.correlation_id });
      setDischargeStatus(null);
      setDischargePolling(true);
    } catch (err) {
      setDischargeSubmitError(err.message || "Discharge claim submission failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitFinal = async () => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const attachedDocs = claimDraft?.supporting_documents?.filter((d) => d.url) ?? [];
      const res = await api.submitFinalClaim({
        claim_id: claimDraft.claim_id,
        ...(attachedDocs.length > 0 && { supporting_documents: attachedDocs }),
      });
      if (res.status === "failed") {
        setSubmitError(res.message || res.error?.message || "Final claim submission failed. Please try again.");
        return;
      }
      setFinalCorrelationId(res.correlation_id);
      updateCaseState({ claimCorrelationId: res.correlation_id });
      setClaimStatus(null);
      if (filesKey) setDraftFiles(filesKey, []);
      setPicked("decision");
      setPolling(true);
    } catch (err) {
      setSubmitError(err.message || "Final claim submission failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleQuerySubmit = async () => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const queryFiles = queryDocs.filter((d) => d.url);
      const res = await api.respondClaimQuery({
        claim_id: claimDraft?.claim_id || claimId,
        ...(queryFiles.length > 0 && { supporting_documents: queryFiles }),
        ...(queryAnswer && {
          questionnaire_response: {
            status: "completed",
            item: [{ linkId: "query-1", answer: [{ valueString: queryAnswer }] }],
          },
        }),
      });
      if (res.status === "failed") {
        setSubmitError(res.message || res.error?.message || "Query response submission failed. Please try again.");
        return;
      }
      setShowQueryDrawer(false);
      setQueryDocs([]);
      setClaimStatus(null);
      setFinalCorrelationId(res.correlation_id);
      updateCaseState({ claimCorrelationId: res.correlation_id });
      setPicked("decision");
      setPolling(true);
    } catch (err) {
      setSubmitError(err.message || "Query response submission failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleRequestRelease = async () => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await api.requestClaimRelease({
        claim_id: resolvedClaimId,
        amount: Number(releaseAmount),
        ...(releaseNote.trim() ? { note: releaseNote.trim() } : {}),
      });
      if (res.status === "failed") {
        setSubmitError(res.message || res.error?.message || "The balance request could not be sent. Please try again.");
        return;
      }
      setShowReleaseDrawer(false);
      setReleaseMessage(res.message || "Balance release request sent to the payer.");
      setReleaseStatus(null);
      setReleaseCorrelationId(res.correlation_id || null);
    } catch (err) {
      setSubmitError(err.message || "The balance request could not be sent. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  // Corrects a rejected *discharge* claim under NHCX workflow DC01 — same
  // body shape as the original discharge submit, distinct from
  // handleResubmitClaim (final claim, workflow 16). Stays on the Discharge
  // Claim tab and resumes polling the same correlation id, mirroring how a
  // successful call clears the stale REJECTED decision server-side.
  const handleResubmitDischargeClaim = async () => {
    setSubmitting(true);
    setDischargeSubmitError(null);
    try {
      const body = {
        ...(resolvedClaimId ? { claim_id: resolvedClaimId } : {}),
      };
      if (resubmitEditItems?.length > 0) {
        body.items = resubmitEditItems;
      }
      const attachedDocs = claimDraft?.supporting_documents?.filter((d) => d.url) ?? [];
      if (attachedDocs.length > 0) body.supporting_documents = attachedDocs;
      if (dischargeStatus?.decision === "QUERIED" && dischargeAnswer.trim()) {
        body.questionnaire_response = { status: "completed", item: [{ linkId: "query-1", answer: [{ valueString: dischargeAnswer.trim() }] }] };
      }
      const res = await api.resubmitDischargeClaim(body);
      if (res.status === "failed") {
        setDischargeSubmitError(res.message || res.error?.message || "Discharge claim resubmission failed. Please try again.");
        return;
      }
      setShowDischargeResubmitDrawer(false);
      setDischargeAnswer("");
      setDischargeCorrelationId(res.correlation_id);
      updateCaseState({ dischargeCorrelationId: res.correlation_id });
      setDischargeStatus(null);
      setDischargePolling(true);
    } catch (err) {
      setDischargeSubmitError(err.message || "Discharge claim resubmission failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const hasMissingFields = missingFields.length > 0;
  // Split missing_fields: patient-context fields are resolvable inline via the
  // patient-context PATCH; HIS blockers (diagnoses/items) must be fixed in the
  // HIS and must NOT route to the patient-context form.
  const patientContextMissing = missingFields.filter((f) => !HIS_BLOCKERS.has(f.toLowerCase()) && !f.startsWith("discharge."));
  const dischargeMissing = missingFields.filter((f) => f.startsWith("discharge."));
  const dischargeRules = claimDraft?.discharge_rules;
  const hisBlockers = missingFields.filter(
    (f) => HIS_BLOCKERS.has(f.toLowerCase()) && f.toLowerCase() !== "preauth_ref",
  );
  const hasPreauthRef = !!claimDraft?.preauth_ref;
  // An empty optional row, such as one added and not filled, stops nothing.
  const hasMissingDocs = claimDraft?.supporting_documents?.some((d) => !d.optional && !d.url);

  // J2 — the final bill against the cumulative authorized ceiling (preauth +
  // enhancements). When it exceeds the sanction, warn and require an explicit
  // acknowledgement before submitting, since the excess is not payer-covered.
  const authorizedCeiling = moneyLedger?.authorized_ceiling?.value;
  const billedTotal = claimDraft?.total_amount;
  const overCeiling =
    authorizedCeiling != null && billedTotal != null && billedTotal > authorizedCeiling;
  const ceilingExcess = overCeiling ? billedTotal - authorizedCeiling : 0;

  const canSubmit = !hasMissingFields && hasPreauthRef && !hasMissingDocs && !submitting;
  // The final claim carries the extra over-ceiling acknowledgement gate; the
  // interim discharge submit (which has no ack UI) keeps the base canSubmit.
  const canSubmitFinal = canSubmit && (!overCeiling || ackOverCeiling);

  const claimDecision = claimStatus?.decision;
  // Latest claim decision event from the audit trail — carries the payer's raw
  // outcome / reason codes / classified_by / inbound workflow id for the banner
  // (fuller provenance). nhcx_workflow_id is a sibling of `decision`, fold it in.
  const claimDecisionEvent =
    [...(timelineEvents || [])].reverse().find((e) => e.workflow === "claim" && e.decision);
  const claimProvenance = claimDecisionEvent
    ? { ...claimDecisionEvent.decision, nhcx_workflow_id: claimDecisionEvent.nhcx_workflow_id }
    : null;
  const isClaimApproved = claimDecision === "APPROVED";
  const isPartialApproval = claimDecision === "PARTIALLY_APPROVED";
  const isClaimQueried = claimDecision === "QUERIED";
  const isClaimRejected = claimDecision === "REJECTED";

  useEffect(() => {
    const action = location.state?.openAction;
    // The discharge (interim, wf=14) rejection has no claimStatus-derived
    // decision to gate on — the task existing at all is the signal, there is
    // no separate "decided" state to wait for like the final-claim actions
    // below. Routes to the Discharge tab, not Claim Decision.
    if (action === "resubmit_discharge_claim") {
      if (resolvedCashlessCaseId && !caseState.cashless_case_id) {
        updateCaseState({ cashless_case_id: resolvedCashlessCaseId });
      }
      if (resolvedClaimId && !caseState.claim_id) {
        updateCaseState({ claim_id: resolvedClaimId });
      }
      setPicked("discharge");
      setShowDischargeResubmitDrawer(true);
      return;
    }
    if (action !== "request_claim_release" && action !== "respond_claim_query") return;
    if (isClaimQueried || isClaimApproved || isPartialApproval) {
      if (resolvedCashlessCaseId && !caseState.cashless_case_id) {
        updateCaseState({ cashless_case_id: resolvedCashlessCaseId });
      }
      if (resolvedClaimId && !caseState.claim_id) {
        updateCaseState({ claim_id: resolvedClaimId });
      }
      setPicked("decision");
      if (action === "request_claim_release" && (isClaimApproved || isPartialApproval)) {
        if (location.state?.releaseAmount) setReleaseAmount(String(location.state.releaseAmount));
        setShowReleaseDrawer(true);
      } else if (action === "respond_claim_query" && isClaimQueried) {
        setShowQueryDrawer(true);
      }
    }
  }, [location.state?.openAction, location.state?.releaseAmount, resolvedClaimId, resolvedCashlessCaseId, caseState.cashless_case_id, caseState.claim_id, isClaimQueried, isClaimApproved, isPartialApproval, updateCaseState, setPicked]);

  if (loading) {
    return <LoadingBlock text="Building claim draft…" />;
  }

  if (claimDraft?._error) {
    return (
      <NextStep
        tone="bad"
        title="The claim could not be loaded"
        actions={
          <>
            <button type="button" className="cv-btn" onClick={() => loadDraft(null, draftParams(null))}>Retry</button>
            <button type="button" className="cv-btn" onClick={() => navigate("../status")}>Back to pre-auth decision</button>
          </>
        }
      >
        {claimDraft._error}
      </NextStep>
    );
  }

  const docs = claimDraft?.supporting_documents || [];
  const asks = liveAsks(claimDraft?.payer_asks, docs, askForms);
  const askCodes = new Set(asks.filter((a) => a.kind === "document").map((a) => String(a.code).toUpperCase()));
  const otherDocs = docs.filter((d) => !askCodes.has(String(d.code || "").toUpperCase()));
  const blockingAsks = asks.filter((a) => a.blocking);
  const attachAsk = (row, uploaded) => {
    setClaimDraft((prev) => {
      const list = prev.supporting_documents || [];
      const idx = list.findIndex((d) => String(d.code || "").toUpperCase() === String(row.code).toUpperCase());
      const entry = { code: row.code, category: row.category || null, name: row.display, optional: false, ...uploaded };
      return { ...prev, supporting_documents: idx >= 0 ? list.map((d, i) => (i === idx ? { ...d, ...entry } : d)) : [...list, entry] };
    });
  };
  const dischargeRejected = dischargeStatus?.decision === "REJECTED";
  const dischargeQueried = dischargeStatus?.decision === "QUERIED";
  const dischargeFailed = dischargeStatus?.status === "failed";
  const dischargeSentence = dischargeRejected
    ? "rejected by the payer"
    : dischargeFailed
      ? "not delivered"
      : dischargeStatus?.status === "not_found"
        ? "no answer on record"
        : dischargeStatus?.decision
          ? String(dischargeStatus.decision).replace(/_/g, " ").toLowerCase()
          : dischargeCorrelationId
            ? "sent"
            : "not sent";
  const dischargeWord = dischargeSentence.charAt(0).toUpperCase() + dischargeSentence.slice(1);
  const dischargeIssues = [
    ...(dischargeStatus?.errors || []).map((e) => (typeof e === "string" ? e : e?.message || e?.code)),
    ...(dischargeStatus?.process_notes || []).map((n) => (typeof n === "string" ? n : n?.text)),
  ].filter(Boolean);
  const finalFailed = claimStatus?.status === "failed";
  // A final claim that never reached the payer has not been sent.
  const finalSent = !!finalCorrelationId && !finalFailed;
  const docsLocked = locked || finalSent;
  const dischargeIntimation = cashlessCase?.discharge_intimation !== false;
  const claimDecided = claimStatus?.status === "complete" && !!claimDecision;
  const claimTotals = claimStatus?.totals || {};
  const claimApproved = claimStatus?.approved_amount ?? claimTotals.benefit?.value ?? claimTotals.approved?.value ?? null;
  const claimRequested = claimTotals.submitted?.value ?? claimDraft?.total_amount ?? null;
  const justification = [
    ["Chief complaints", claimDraft?.chief_complaints],
    ["Clinical findings", claimDraft?.clinical_findings],
    ["Investigations", claimDraft?.investigations],
    ["Medications", claimDraft?.medications],
  ].filter(([, codes]) => codes?.length > 0);

  const openReleaseDrawer = () => {
    setReleaseAmount(releaseOwed > 0 ? String(releaseOwed) : "");
    setReleaseNote("");
    setSubmitError(null);
    setShowReleaseDrawer(true);
  };

  const balanceOwed = claimRequested != null && claimApproved != null ? claimRequested - claimApproved : 0;
  // Once settled, only money short of the approval is still owed.
  const settledGross = moneyLedger?.settlement?.gross;
  const releaseOwed = caseClosed ? (claimApproved != null && settledGross != null ? Math.max(0, claimApproved - settledGross) : 0) : balanceOwed;
  const groups = buildClaimChecklist({
    biometric,
    patientMissing: patientContextMissing.length,
    dischargeRequired: !!dischargeRules?.required,
    dischargeMissing: dischargeMissing.length,
    dischargeType: claimDraft?.discharge?.type,
    hasPreauthRef,
    preauthRef: claimDraft?.preauth_ref,
    dischargeDate: claimDraft?.discharge_date,
    justified: justification.reduce((sum, [, codes]) => sum + codes.length, 0),
    hisBlocked: hisBlockers.length > 0,
    ceilingExcess,
    ackOverCeiling,
    authorised: authorizedCeiling,
    total: claimDraft?.total_amount,
    asks,
    blockingAsks: blockingAsks.length,
    hasMissingDocs,
    attachedFiles: otherDocs.filter((d) => d.url).length,
    dischargeIntimation,
    dischargeRejected,
    dischargeFailed,
    dischargePolling,
    dischargeSent: !!dischargeCorrelationId,
    dischargeDecision: dischargeStatus?.decision,
    dischargeNoAnswer: dischargeStatus?.status === "not_found",
    finalFailed,
    finalSent,
    decision: claimStatus?.status === "complete" ? claimDecision || "UNKNOWN" : null,
    notFound: claimStatus?.status === "not_found",
    locked: docsLocked,
  });
  const blockers = groups.flatMap((g) => g.rows).filter((r) => r.blocks);
  const dischargeBlockers = blockers.filter((r) => r.id !== "bill" || hisBlockers.length > 0);
  const dischargeNext = dischargeIntimation && !finalCorrelationId && (!dischargeCorrelationId || dischargeFailed);
  const activeBlockers = dischargeNext ? dischargeBlockers : blockers;
  const open = picked || firstClaimItem(groups, { finalSent, locked });
  const paneFor = (id) => ({ hidden: open !== id });

  // One primary action, from where the case stands. The discharge claim comes
  // first where the payer takes one; the guide asks not to offer both as equals.
  let primary = null;
  if (finalSent) {
    if (isClaimApproved || isPartialApproval) primary = { label: "View payment status", onClick: () => navigate("../payment") };
    else if (isClaimQueried) primary = { label: "Respond to query", onClick: () => setShowQueryDrawer(true), write: true };
    else if (isClaimRejected) primary = { label: "Ask for a reprocess", onClick: () => navigate("../reprocess") };
  } else if (dischargeQueried) {
    primary = { label: "Answer the discharge query", onClick: () => setShowDischargeResubmitDrawer(true), write: true };
  } else if (dischargeRejected) {
    primary = { label: "Resubmit discharge claim", onClick: () => setShowDischargeResubmitDrawer(true), write: true };
  } else if (dischargeNext) {
    primary = { label: submitting ? "Submitting…" : "Submit discharge claim", onClick: handleSubmitDischarge, disabled: dischargeBlockers.length > 0 || !canSubmit, icon: Send, write: true };
  } else {
    primary = { label: submitting ? "Submitting…" : "Submit final claim", onClick: handleSubmitFinal, disabled: blockers.length > 0 || !canSubmitFinal, icon: Send, write: true };
  }
  if (primary?.write && caseClosed) primary = null;

  const secondary = [];
  if (recoverError) secondary.push({ label: "Check again", onClick: recoverCase });
  if (claimDecided && (isClaimApproved || isPartialApproval) && releaseOwed > 0) secondary.push({ label: "Ask for the balance", onClick: openReleaseDrawer });
  if (claimDecided && (isClaimQueried || isClaimRejected || isPartialApproval) && OUTBOUND_COMMUNICATIONS_ENABLED) {
    secondary.push({ label: "Message payer", icon: Send, onClick: () => setShowSendModal(true) });
  }

  const decisionWord = claimDecision ? String(claimDecision).replace(/_/g, " ").toLowerCase() : null;
  const barState = claimDecided
    ? [decisionWord, isClaimApproved ? "is-ok" : isClaimRejected ? "is-bad" : "is-warn"]
    : finalSent
      ? ["Sent", "is-info"]
      : docsLocked
        ? ["Not sent", "is-todo"]
        : finalFailed || dischargeFailed
          ? ["Not delivered", "is-bad"]
          : dischargeRejected
            ? ["Discharge rejected", "is-bad"]
            : dischargeQueried
              ? ["Discharge queried", "is-warn"]
              : activeBlockers.length > 0
                ? [`${activeBlockers.length} must be done`, "is-warn"]
                : ["Ready to send", "is-ok"];

  const notes = [
    !hasPreauthRef && !docsLocked && { tone: "bad", text: "The payer must approve the pre-auth before you can claim. Check the Approval step." },
    hisBlockers.length > 0 && { tone: "bad", text: `The clinical or billing records are incomplete (${hisBlockers.join(", ")}). Complete them in the hospital system, then reload.` },
    dischargeRejected && { tone: "bad", text: "The payer rejected the discharge claim. No final claim exists yet, so there is nothing to appeal; correct and resend it." },
    dischargeQueried && { tone: "warn", text: "The payer has a question about the discharge claim. Answer it from here; the final claim cannot be sent until it is answered." },
    dischargeFailed && { tone: "bad", text: `The discharge claim did not reach the payer. ${dischargeStatus?.error_message || ""} Check the documents and submit it again.` },
    dischargeIntimation && dischargeCorrelationId && !finalCorrelationId && !dischargeRejected && !dischargeQueried && !dischargeFailed && {
      tone: "info",
      text: `Discharge claim: ${dischargeSentence}${dischargeStatus?.submitted_at ? `, sent ${formatDateTime(dischargeStatus.submitted_at)}` : ""}.`,
    },
    finalFailed && (/PAYR-\d+|NHCX-\d+/.test(claimStatus?.error_message || "")
      ? { tone: "warn", text: `The payer refused the final claim: ${claimStatus.error_message}. Fix what it names and send it again.` }
      : { tone: "bad", text: `The final claim did not reach the payer. ${claimStatus?.error_message || ""} Submit it again.` }),
    claimStatus?.status === "not_found" && { tone: "warn", text: "The payer's system has no record of this claim yet. Refresh in a while, and call its helpdesk if it stays like this." },
    claimStatus?.status === "complete" && !claimDecided && { tone: "warn", text: "The payer answered without a clear decision. Read its response under Decision, and call its helpdesk if it is not clear." },
    isPartialApproval && { tone: "warn", text: dischargeIntimation
      ? "Approved for less than the bill. See what was cut under Decision; if the cut is wrong, ask for the balance with your reason, otherwise bill the patient the difference."
      : "Approved for less than the bill. See what was cut under Decision; if the cut is wrong, ask for the balance with your reason. A PMJAY beneficiary is never billed the difference." },
    isClaimQueried && { tone: "warn", text: "The payer has a question. The payment waits until you answer." },
    recoverError && { tone: "warn", text: `This case's claim status could not be read, so a claim already sent may not show here: ${recoverError}` },
    asksError && { tone: "warn", text: `The payer's asks could not be reloaded, so the list may be out of date: ${asksError}` },
    submitError && { tone: "bad", text: submitError },
    dischargeSubmitError && { tone: "bad", text: dischargeSubmitError },
    releaseMessage && !releaseStatus?.status?.match(/complete|failed/) && { tone: "info", text: releaseMessage },
    releaseStatus?.status === "complete" && { tone: "info", text: `The payer answered the balance request: ${releaseStatus.answer || releaseStatus.decision || "see the timeline"}${releaseStatus.detail ? ` — ${releaseStatus.detail}` : ""}.` },
    releaseStatus?.status === "failed" && { tone: "warn", text: `The balance request was refused: ${releaseStatus.error_message || releaseStatus.message || "see the timeline"}.` },
  ].filter(Boolean);

  const billTable = (
    <div className="cv-tw cv-in-card">
      <table>
        <thead>
          <tr>
            <th>Service</th>
            <th className="is-num">Qty</th>
            <th className="is-num">Unit price</th>
            <th className="is-num">Amount</th>
          </tr>
        </thead>
        <tbody>
          {(claimDraft?.items || []).map((item, i) => (
            <tr key={i}>
              <td>
                <strong>{item.service_name}</strong>
                <div className="cv-card-meta">{[item.service_code, item.category].filter(Boolean).join(" · ")}</div>
              </td>
              <td className="is-num">{item.quantity}</td>
              <td className="is-num">{formatMoney(item.unit_price)}</td>
              <td className="is-num" style={{ fontWeight: 600 }}>{formatMoney(item.net_amount)}</td>
            </tr>
          ))}
          {!claimDraft?.items?.length && (
            <tr><td colSpan={4} className="cv-card-meta">No billable items on the final bill.</td></tr>
          )}
          <tr className="is-total">
            <td colSpan={3}>Final bill</td>
            <td className="is-num">{formatMoney(claimDraft?.total_amount)}</td>
          </tr>
          {authorizedCeiling != null && (
            <tr className="is-total">
              <td colSpan={3}>Authorised{moneyLedger?.authorized_ceiling?.cumulative ? " (pre-auth and enhancements)" : ""}</td>
              <td className="is-num">{formatMoney(authorizedCeiling)}</td>
            </tr>
          )}
          {overCeiling && (
            <tr className="is-total">
              <td colSpan={3} style={{ color: "var(--warning)" }}>Above the authorised amount</td>
              <td className="is-num" style={{ color: "var(--warning)" }}>+{formatMoney(ceilingExcess)}</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );

  const card = (title, body, opts = {}) => (
    <section className="cv-card" aria-label={title}>
      <div className="cv-card-head">
        <h2 className="cv-card-title">{title}</h2>
        {opts.chip}
        {opts.meta && <span className="cv-card-meta">{opts.meta}</span>}
      </div>
      {body}
    </section>
  );

  const waitingSection = (title, correlationId) =>
    card(
      title,
      <div className="cv-card-body">
        <div className="cv-kv"><span>Status</span><span>Waiting for the payer's decision</span></div>
        <div className="cv-kv"><span>Checking every</span><span>{POLL_INTERVAL_MS / 1000} seconds</span></div>
        <div className="cv-kv"><span>Request</span><span className="cv-mono">{correlationId}</span></div>
        {title === "Final claim" && cashlessCase?.answers_status_enquiry !== false && (
          <div className="cv-kv">
            <span>Where it stands</span>
            <span>
              <button type="button" className="cv-btn" disabled={enquiring} onClick={handleClaimEnquiry}>{enquiring ? "Asking…" : "Ask the gateway"}</button>
              {enquiryNote && <div className="cv-card-meta">{enquiryNote}</div>}
            </span>
          </div>
        )}
        {pollError && <div className="cv-notice is-warn"><div className="cv-notice-body">The last check failed, and this page keeps trying: {pollError}</div></div>}
      </div>,
      { chip: <span className="cv-chip is-info">Waiting</span> },
    );

  return (
    <div className="cv-elig">
      <div className={`cv-notice cv-verdict is-${barState[1] === "is-todo" ? "info" : barState[1].replace("is-", "")}`}>
        <div className="cv-verdict-row">
          <StageBar ctx={ctx} />
          <span className={`cv-chip ${barState[1]}`} style={claimDecided ? { textTransform: "capitalize" } : undefined}>{barState[0]}</span>
          <span className="cv-notice-body">
            {isClaimApproved || isPartialApproval ? (
              <>
                <strong>{claimApproved != null ? formatMoney(claimApproved) : "—"}</strong> approved of {formatMoney(claimRequested)}
              </>
            ) : claimDecided ? (
              <>
                <strong>{formatMoney(claimRequested)}</strong> claimed
              </>
            ) : (
              <>
                <strong>{formatMoney(claimDraft?.total_amount)}</strong> final bill
                {authorizedCeiling != null ? ` · ${formatMoney(authorizedCeiling)} authorised` : ""}
              </>
            )}
          </span>
          <span className="cv-verdict-actions">
            {secondary.map((a) => (
              <button key={a.label} type="button" className="cv-btn" onClick={a.onClick}>
                {a.icon && <a.icon size={14} />}
                {a.label}
              </button>
            ))}
            {primary && (
              <button
                type="button"
                className="cv-btn is-primary"
                disabled={primary.disabled || (primary.write && readOnly)}
                title={primary.disabled ? "Finish the items marked in red first." : undefined}
                onClick={primary.onClick}
              >
                {primary.icon && <primary.icon size={15} />} {primary.label}
              </button>
            )}
          </span>
        </div>
        {notes.map((n, i) => (
          <div key={i} className={`cv-notice-hint cv-verdict-note${n.tone === "bad" ? " is-bad" : ""}`}>{n.text}</div>
        ))}
      </div>

      <div className="cv-work">
        <CaseChecklist groups={groups} open={open} onOpen={openItem} label="Claim checklist" />

        <div className="cv-work-pane" ref={paneRef}>
          <div {...paneFor("verify")}>
            <BiometricCard
              caseId={resolvedCashlessCaseId}
              stage="Discharge"
              readOnly={locked}
              onCard={setBiometric}
              onVerified={() => {
                setPicked("verify");
                refreshAsks();
              }}
            />
          </div>

          {patientContextMissing.length > 0 && (
            <div {...paneFor("details")}>
              <PatientDetailsForm
                claimId={claimDraft?.claim_id || claimId}
                cashlessCaseId={resolvedCashlessCaseId}
                missingFields={patientContextMissing}
                locked={locked}
                onResolved={(remaining) => {
                  setMissingFields(remaining);
                  if (remaining.length === 0) loadDraft(claimDraft?.claim_id || claimId);
                }}
              />
            </div>
          )}

          {dischargeRules?.required && (
            <div {...paneFor("left")}>
              {card(
                "How the patient left",
                <div className="cv-card-body">
                  <DischargeDetailsForm
                    key={JSON.stringify(claimDraft?.discharge || {})}
                    claimId={claimDraft?.claim_id || claimId}
                    discharge={claimDraft?.discharge}
                    rules={dischargeRules}
                    readOnly={locked || finalSent}
                    onSaved={(remaining) => {
                      setPicked("left");
                      setMissingFields(remaining);
                      loadDraft(claimDraft?.claim_id || claimId);
                    }}
                  />
                </div>,
              )}
            </div>
          )}

          <div {...paneFor("stay")}>
            {card(
              "Stay & pre-auth",
              <div className="cv-card-body cv-cols">
                <div>
                  <div className="cv-kv"><span>Admitted</span><span>{claimDraft?.admission_date ? formatDate(claimDraft.admission_date) : "—"}</span></div>
                  <div className="cv-kv"><span>Discharged</span><span>{claimDraft?.discharge_date ? formatDate(claimDraft.discharge_date) : "Not yet"}</span></div>
                  {claimDraft?.discharge_summary && (
                    <>
                      <div className="cv-kv"><span>Condition</span><span>{claimDraft.discharge_summary.condition || "—"}</span></div>
                      <div className="cv-kv"><span>Advice</span><span>{claimDraft.discharge_summary.advice || "—"}</span></div>
                      <div className="cv-kv"><span>Follow-up</span><span>{claimDraft.discharge_summary.followup_on ? formatDate(claimDraft.discharge_summary.followup_on) : "—"}</span></div>
                    </>
                  )}
                </div>
                <div>
                  <div className="cv-kv"><span>Pre-auth</span><span className="cv-mono">{claimDraft?.preauth_ref || "None approved"}</span></div>
                  <div className="cv-kv"><span>Authorised</span><span>{authorizedCeiling != null ? formatMoney(authorizedCeiling) : "—"}</span></div>
                </div>
              </div>,
              { meta: "From the hospital records; fix any mistake there first." },
            )}
          </div>

          <div {...paneFor("justification")}>
            {card(
              "Clinical justification",
              <div className="cv-card-body">
                {justification.length ? (
                  justification.map(([label, codes]) => (
                    <div key={label} className="cv-kv"><span>{label}</span><span>{codes.map((c) => c.name || c.code).join(", ")}</span></div>
                  ))
                ) : (
                  <div className="cv-card-meta">No complaints, findings or tests are coded on the clinical note.</div>
                )}
              </div>,
            )}
          </div>

          <div {...paneFor("bill")}>
            {card("Final bill against the authorised amount", billTable, {
              chip: overCeiling ? <span className="cv-chip is-warn">{formatMoney(ceilingExcess)} over</span> : authorizedCeiling != null ? <span className="cv-chip is-ok">Within</span> : null,
            })}
            {overCeiling && !docsLocked && (
              <div className="cv-notice is-warn cv-pane-note">
                <div className="cv-notice-body">The payer will not cover the {formatMoney(ceilingExcess)} above the authorised amount. Collect it from the patient, or file an enhancement first.</div>
                <label style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 10, fontWeight: 600 }}>
                  <input type="checkbox" checked={ackOverCeiling} onChange={(e) => setAckOverCeiling(e.target.checked)} />
                  I will collect the {formatMoney(ceilingExcess)} from the patient.
                </label>
                <div className="cv-notice-actions">
                  <button type="button" className="cv-btn" onClick={() => navigate("../enhancement")}>File an enhancement</button>
                </div>
              </div>
            )}
          </div>

          <div {...paneFor("asks")}>
            <PayerAsks
              caseId={resolvedCashlessCaseId}
              stage="claim"
              title="What the payer asks for at claim"
              asks={claimDraft?.payer_asks}
              documents={docs}
              readOnly={docsLocked}
              onAttach={attachAsk}
              onFormsChange={setAskForms}
              reloadKey={asksReload}
            />
          </div>

          <div {...paneFor("files")}>
            {card(
              "Other files",
              <div className="cv-card-body">
                <DocumentChecklist
                  documents={otherDocs}
                  onUpload={handleUpload}
                  onAddDocument={addDocument}
                  onRenameDocument={(i, name) => renameDocument(docs.indexOf(otherDocs[i]), name)}
                  onRemoveDocument={(i) => removeDocument(docs.indexOf(otherDocs[i]))}
                  readOnly={docsLocked}
                  hideSummary
                />
              </div>,
              { meta: "Sent with the claim. Attached files stay until sent, but reloading the page drops them." },
            )}
          </div>

          {dischargeIntimation && (
            <div {...paneFor("discharge")}>
              {dischargePolling ? (
                waitingSection("Discharge claim", dischargeCorrelationId)
              ) : (
                card(
                  "Discharge claim",
                  <div className="cv-card-body">
                    <div className="cv-kv"><span>Status</span><span>{dischargeWord}</span></div>
                    <div className="cv-kv"><span>Request</span><span className="cv-mono">{dischargeCorrelationId || "—"}</span></div>
                    {dischargeStatus?.submitted_at && <div className="cv-kv"><span>Sent</span><span>{formatDateTime(dischargeStatus.submitted_at)}</span></div>}
                    {dischargeStatus?.outcome && <div className="cv-kv"><span>Raw outcome</span><span className="cv-mono">{dischargeStatus.outcome}</span></div>}
                    {dischargeStatus?.claim_response_ref && <div className="cv-kv"><span>Payer reference</span><span className="cv-mono">{dischargeStatus.claim_response_ref}</span></div>}
                    {dischargeStatus?.error_code && <div className="cv-kv"><span>Error code</span><span className="cv-mono">{dischargeStatus.error_code}</span></div>}
                    {dischargeStatus?.error_message && <div className="cv-kv"><span>Reason</span><span style={{ fontWeight: 400 }}>{dischargeStatus.error_message}</span></div>}
                    {dischargeIssues.map((text, i) => (
                      <div key={i} className="cv-kv"><span className="cv-mono">{i + 1}</span><span style={{ fontWeight: 400 }}>{text}</span></div>
                    ))}
                    {dischargeCorrelationId && (
                      <div className="cv-notice-actions">
                        <button type="button" className="cv-btn" onClick={() => setDischargePolling(true)}>Refresh</button>
                        {(dischargeRejected || dischargeQueried) && !caseClosed && !readOnly && (
                          <button type="button" className="cv-btn is-primary" onClick={() => setShowDischargeResubmitDrawer(true)}>
                            {dischargeQueried ? "Answer the discharge query" : "Resubmit discharge claim"}
                          </button>
                        )}
                      </div>
                    )}
                  </div>,
                  { meta: "Most payers need this, with the discharge papers, before the final claim." },
                )
              )}
            </div>
          )}

          <div {...paneFor("final")}>
            {card(
              "Final claim",
              <div className="cv-card-body">
                <div className="cv-kv"><span>Status</span><span>{finalFailed ? "Not delivered" : finalSent ? "Sent" : "Not sent"}</span></div>
                <div className="cv-kv"><span>Final bill</span><span>{formatMoney(claimDraft?.total_amount)}</span></div>
                <div className="cv-kv"><span>Files going with it</span><span>{docs.filter((d) => d.url).length}</span></div>
                {finalCorrelationId && <div className="cv-kv"><span>Request</span><span className="cv-mono">{finalCorrelationId}</span></div>}
              </div>,
              { meta: "Asks the payer to pay the final bill. Private insurers must decide within 3 hours (IRDAI)." },
            )}
          </div>

          <div {...paneFor("decision")}>
            {!finalCorrelationId ? (
              card("No final claim yet", <div className="cv-card-intro">Send the final claim to receive the payer's decision here.</div>)
            ) : !claimStatus || polling ? (
              waitingSection("Final claim", finalCorrelationId)
            ) : claimStatus.status === "not_found" ? (
              card(
                "No answer on record",
                <div className="cv-card-body">
                  <div className="cv-kv"><span>Request</span><span className="cv-mono">{finalCorrelationId}</span></div>
                  <button type="button" className="cv-btn cv-pane-action" onClick={() => setPolling(true)}>Refresh</button>
                </div>,
              )
            ) : finalFailed ? (
              card("Not delivered", <div className="cv-card-intro">{claimStatus.error_message || "The request did not reach the payer."}</div>)
            ) : (
              <div className="cv-pane-stack">
                {card(
                  "Payer decision",
                  <div className="cv-card-body">
                    <div className="cv-kv"><span>Claimed</span><span>{formatMoney(claimRequested)}</span></div>
                    {claimTotals.eligible?.value != null && <div className="cv-kv"><span>Eligible</span><span>{formatMoney(claimTotals.eligible.value)}</span></div>}
                    {claimTotals.copay?.value > 0 && <div className="cv-kv"><span>Co-payment</span><span>− {formatMoney(claimTotals.copay.value)}</span></div>}
                    {claimTotals.deductible?.value > 0 && <div className="cv-kv"><span>Deductible</span><span>− {formatMoney(claimTotals.deductible.value)}</span></div>}
                    <div className="cv-kv"><span>Approved</span><span>{claimApproved != null ? formatMoney(claimApproved) : "—"}</span></div>
                    {claimStatus.payment_status && <div className="cv-kv"><span>Payment</span><span style={{ textTransform: "capitalize" }}>{String(claimStatus.payment_status).replace(/^PAYMENT_/, "").toLowerCase()}</span></div>}
                  </div>,
                )}
                {claimStatus.items?.length > 0 && card("Line by line", <ClaimLines status={claimStatus} draftItems={claimDraft?.items} />)}
                {claimStatus.process_notes?.length > 0 &&
                  card(
                    "Payer notes",
                    <div className="cv-card-body">
                      {claimStatus.process_notes.map((n, i) => (
                        <div key={n.number ?? i} className="cv-kv"><span className="cv-mono">{n.number ?? i + 1}</span><span style={{ fontWeight: 400 }}>{n.text}</span></div>
                      ))}
                    </div>,
                  )}
                {card(
                  "Payer response",
                  <div className="cv-card-body cv-cols">
                    <div>
                      <div className="cv-kv"><span>Decision</span><span>{decisionWord || "—"}</span></div>
                      <div className="cv-kv"><span>Raw outcome</span><span className="cv-mono">{claimProvenance?.raw_outcome ?? claimStatus.outcome ?? "—"}</span></div>
                      <div className="cv-kv"><span>Reason codes</span><span className="cv-mono">{claimProvenance?.reason_codes?.join(", ") || "—"}</span></div>
                    </div>
                    <div>
                      <div className="cv-kv"><span>Payer reference</span><span className="cv-mono">{claimStatus.claim_response_ref || "—"}</span></div>
                      <div className="cv-kv"><span>Sent</span><span>{claimStatus.submitted_at ? formatDateTime(claimStatus.submitted_at) : "—"}</span></div>
                      <div className="cv-kv"><span>Request</span><span className="cv-mono">{finalCorrelationId}</span></div>
                    </div>
                  </div>,
                  { meta: "As received over NHCX" },
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Query Drawer ── */}
      <Drawer open={showQueryDrawer} onClose={() => setShowQueryDrawer(false)} title="Respond to Claim Query">
        <p className="cv-drawer-intro">
          Answer the payer's question and attach any documents it asked for.
        </p>
        {(claimStatus?.process_notes || []).length > 0 && (
          <div className="cv-notice is-warn cv-drawer-note">
            <div className="cv-notice-body">
              <strong>The payer asked:</strong>
              {(claimStatus.process_notes || []).map((n, i) => <div key={i}>{typeof n === "string" ? n : n?.text}</div>)}
            </div>
          </div>
        )}
        <div style={{ marginBottom: "var(--space-4)" }}>
          <label className="cv-drawer-label">Clarification</label>
          <textarea
            className="input-modern"
            style={{ height: "100px", resize: "vertical" }}
            placeholder="Describe your response to the payer's query…"
            value={queryAnswer}
            onChange={(e) => setQueryAnswer(e.target.value)}
          />
        </div>
        <div style={{ marginBottom: "var(--space-4)" }}>
          <DocumentChecklist
            documents={queryDocs}
            onUpload={(doc, uploaded) => setQueryDocs((list) => list.map((d) => (d.code === doc.code ? { ...d, ...uploaded } : d)))}
            onAddDocument={() => setQueryDocs((list) => [...list, { code: `QUERY-${Date.now()}`, name: "", category: "additional", optional: true, custom: true }])}
            onRenameDocument={(i, name) => setQueryDocs((list) => list.map((d, n) => (n === i ? { ...d, name } : d)))}
            onRemoveDocument={(i) => setQueryDocs((list) => list.filter((_, n) => n !== i))}
            hideSummary
          />
        </div>
        {submitError && (
          <div className="cv-notice is-bad cv-drawer-note"><div className="cv-notice-body">{submitError}</div></div>
        )}
        <Button write variant="primary" className="w-full" disabled={!queryAnswer || submitting} onClick={handleQuerySubmit} style={{ justifyContent: "center" }}>
          {submitting ? "Submitting…" : "Submit Response"}
        </Button>
      </Drawer>

      {/* ── Balance release drawer ── */}
      <Drawer open={showReleaseDrawer} onClose={() => setShowReleaseDrawer(false)} title="Ask for the balance">
        <p className="cv-drawer-intro">
          A decided claim is not sent again. Ask the payer to release what is still owed on it instead.
        </p>
        <div style={{ marginBottom: "14px" }}>
          <label className="cv-drawer-label">Amount still owed (INR)</label>
          <input
            className="input-modern"
            type="number"
            min="0"
            step="0.01"
            value={releaseAmount}
            onChange={(e) => setReleaseAmount(e.target.value)}
          />
        </div>
        <div style={{ marginBottom: "var(--space-5)" }}>
          <label className="cv-drawer-label">Note to the payer (optional)</label>
          <textarea
            className="input-modern"
            style={{ height: "80px", resize: "vertical" }}
            placeholder="Why the balance is owed…"
            value={releaseNote}
            onChange={(e) => setReleaseNote(e.target.value)}
          />
        </div>
        {submitError && (
          <div className="cv-notice is-bad cv-drawer-note"><div className="cv-notice-body">{submitError}</div></div>
        )}
        <Button write variant="primary" className="w-full" disabled={submitting || !(Number(releaseAmount) > 0)} onClick={handleRequestRelease} style={{ justifyContent: "center" }}>
          {submitting ? "Sending…" : "Send to payer"}
        </Button>
      </Drawer>

      {/* ── Discharge Resubmit Drawer (DC01 correction — editable items) ── */}
      <Drawer open={showDischargeResubmitDrawer} onClose={() => setShowDischargeResubmitDrawer(false)} title={dischargeQueried ? "Answer the discharge claim query" : "Resubmit Discharge Claim"}>
        <p className="cv-drawer-intro">
          {dischargeQueried
            ? "Answer the payer's question. The discharge claim goes back with your answer, the documents attached on this step and any line you correct below; the final claim stays untouched."
            : "Correct clinical or billing data on the discharge intimation. Only the fields you change are sent; everything else is re-derived from the hospital DB. This resends under NHCX workflow DC01 (Discharge Correction Intimation) — it does not touch the final claim."}
        </p>
        {dischargeQueried && (dischargeStatus?.process_notes || []).length > 0 && (
          <div className="cv-notice is-warn cv-drawer-note">
            <div className="cv-notice-body">
              <strong>The payer asked:</strong>
              {(dischargeStatus.process_notes || []).map((n, i) => <div key={i}>{typeof n === "string" ? n : n?.text}</div>)}
            </div>
          </div>
        )}
        {dischargeQueried && (
          <div style={{ marginBottom: "var(--space-4)" }}>
            <label className="cv-drawer-label">Your answer</label>
            <textarea
              className="input-modern"
              style={{ height: "100px", resize: "vertical" }}
              placeholder="Answer the payer's question about the discharge claim…"
              value={dischargeAnswer}
              onChange={(e) => setDischargeAnswer(e.target.value)}
            />
          </div>
        )}
        {resubmitEditItems?.length > 0 && (
          <div style={{ marginBottom: "var(--space-5)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--space-2)" }}>
              <div style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-muted)" }}>Line Items</div>
              <span style={{ display: "flex", alignItems: "center", gap: "var(--space-1)", fontSize: "11px", color: "var(--primary)" }}><Edit2 size={11} /> Editable</span>
            </div>
            <div className="table-responsive-wrapper">
              <table className="table-modern" style={{ fontSize: "13px" }}>
                <thead>
                  <tr>
                    <th>Service</th>
                    <th>Qty</th>
                    <th>Unit Price</th>
                    <th style={{ textAlign: "right" }}>Net Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {resubmitEditItems.map((item, i) => (
                    <tr key={i}>
                      <td>{item.service_name}</td>
                      <td>
                        <input
                          className="input-modern"
                          style={{ width: "60px", fontSize: "12px", padding: "4px 6px" }}
                          type="number"
                          min="1"
                          value={item.quantity}
                          onChange={(e) => updateResubmitItem(i, "quantity", e.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          className="input-modern"
                          style={{ width: "90px", fontSize: "12px", padding: "4px 6px" }}
                          type="number"
                          min="0"
                          value={item.unit_price}
                          onChange={(e) => updateResubmitItem(i, "unit_price", e.target.value)}
                        />
                      </td>
                      <td style={{ textAlign: "right", fontWeight: 700 }}>{formatMoney(item.net_amount)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan="3" style={{ textAlign: "right", fontWeight: 700 }}>Total</td>
                    <td style={{ textAlign: "right", fontWeight: 800, color: "var(--primary)" }}>
                      {formatMoney(resubmitEditItems.reduce((s, it) => s + (Number(it.net_amount) || 0), 0))}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}
        {dischargeSubmitError && (
          <div className="cv-notice is-bad cv-drawer-note"><div className="cv-notice-body">{dischargeSubmitError}</div></div>
        )}
        <Button write variant="primary" className="w-full" disabled={submitting || (dischargeQueried && !dischargeAnswer.trim())} onClick={handleResubmitDischargeClaim} style={{ justifyContent: "center" }}>
          {submitting ? "Sending…" : dischargeQueried ? "Send the answer" : "Resubmit Discharge Claim"}
        </Button>
      </Drawer>

      <SendCommunicationModal
        open={showSendModal}
        onClose={() => setShowSendModal(false)}
        defaultPayerId={payerId}
        defaultClaimReference={claimStatus?.claim_response_ref || ""}
        claimId={claimId}
        cashlessCaseId={caseState.cashless_case_id}
      />
    </div>
  );
}
