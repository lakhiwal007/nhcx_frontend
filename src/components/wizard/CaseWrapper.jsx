import { useState, useEffect, useCallback, useRef } from "react";
import { Routes, Route, useNavigate, useParams, useLocation, Navigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { api } from "../../api";
import { useReadOnly } from "../../readOnly";
import { Button, EmptyState, LoadingBlock } from "../Common";
import { saveWorkflow, loadWorkflow } from "../../workflowStorage";
import CaseFileHeader from "../case/CaseFileHeader";
import CaseStepper from "../case/CaseStepper";
import AttentionTray from "../case/AttentionTray";
import CaseNotesDrawer from "../case/CaseNotes";
import AnswerPayerQuery from "../case/AnswerPayerQuery";
import TechnicalDetails from "../case/TechnicalDetails";
import { useCaseNotes } from "../../hooks/useCaseNotes";
import CommunicationDetailDrawer from "../CommunicationDetail";
import { buildStages, landingStage, stageInfo } from "../case/caseStages";
import { useCaseRecord } from "../../hooks/useCaseRecord";
import "../case/case-v2.css";

import PayerPolicy from "./PayerPolicy";
import EligibilityPrep from "./EligibilityPrep";
import PreauthDraft from "./PreauthDraft";
import PreauthStatus from "./PreauthStatus";
import PreauthEnhancement from "./PreauthEnhancement";
import ClaimsScreen from "./ClaimsScreen";
import ReprocessScreen from "./ReprocessScreen";
import PaymentReconciliation from "./PaymentReconciliation";
import CaseTimeline from "./CaseTimeline";
import ErrorBoundary from "../ErrorBoundary";

const COMMS_POLL_MS = 60_000;
const ISSUE_LABELS = { timeline: "the money summary", comms: "payer messages", case: "the case status" };

function DiscoverRedirect() {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  params.set("discover", "1");
  return <Navigate to={{ pathname: "../payer", search: `?${params.toString()}` }} replace />;
}

export default function CaseWrapper() {
  const { id } = useParams();
  const location = useLocation();
  const caseParam = new URLSearchParams(location.search).get("case");
  const knownCase = useRef(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (caseParam && knownCase.current && String(caseParam) !== String(knownCase.current)) {
      knownCase.current = null;
      setNonce((n) => n + 1);
    }
  }, [caseParam]);

  const reportCase = useCallback((cid) => {
    knownCase.current = cid;
  }, []);

  return <CaseWorkspace key={`${id}:${nonce}`} reportCase={reportCase} />;
}

function CaseWorkspace({ reportCase }) {
  const readOnly = useReadOnly();
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const currentStepPath = location.pathname.split("/").pop();
  const caseParam = new URLSearchParams(location.search).get("case");

  const [patient, setPatient] = useState(null);
  const [loading, setLoading] = useState(true);

  const childSaved = loadWorkflow(id);
  const resumeCaseId = location.state?.cashless_case_id ?? caseParam ?? (location.state?.newCase ? null : childSaved?.cashless_case_id) ?? null;
  const childSavedForCase = childSaved && (!childSaved.cashless_case_id || String(childSaved.cashless_case_id) === String(resumeCaseId)) ? childSaved : null;
  const saved = location.state?.newCase ? null : resumeCaseId ? loadWorkflow(resumeCaseId) || childSavedForCase : childSaved;

  const isNewCase = !!location.state?.newCase || (!!saved && !saved.cashless_case_id);
  const navAdmissionId = location.state?.admission_id ?? saved?.admission_id ?? null;

  const [caseState, setCaseState] = useState({
    payer: null,
    policy: null,
    admission_id: location.state?.admission_id || null,
    estimatedBillAmount: location.state?.estimatedBillAmount || null,
    cashless_case_id: resumeCaseId || null,
    claim_id: location.state?.claim_id || null,
    eligibility_correlation_id: null,
    preauthCorrelationId: null,
    preauthRef: null,
    preauthDecision: null,
    approvedAmount: null,
    claimCorrelationId: null,
    dischargeCorrelationId: null,
    draftData: null,
    ...saved,
    ...(location.state?.preauthCorrelationId ? { preauthCorrelationId: location.state.preauthCorrelationId } : {}),
  });

  const [seed, setSeed] = useState(null);
  const [timeline, setTimeline] = useState(null);
  const [loadIssues, setLoadIssues] = useState({});
  const [patientError, setPatientError] = useState(null);
  const flagIssue = useCallback((key, message) => {
    setLoadIssues((prev) => {
      if (message ? prev[key] === message : !(key in prev)) return prev;
      const next = { ...prev };
      if (message) next[key] = message;
      else delete next[key];
      return next;
    });
  }, []);

  const [draftFiles, setDraftFilesState] = useState({});
  const setDraftFiles = useCallback((key, files) => {
    setDraftFilesState((prev) => ({ ...prev, [key]: files }));
  }, []);

  const updateCaseState = useCallback(
    (updates) => {
      setCaseState((prev) => {
        const next = { ...prev, ...updates };
        const storageKey = next.cashless_case_id ?? id;
        saveWorkflow(storageKey, next);
        if (next.cashless_case_id && String(storageKey) !== String(id)) {
          saveWorkflow(id, { cashless_case_id: next.cashless_case_id });
        }
        return next;
      });
    },
    [id],
  );

  const ledgerCaseId = caseState.cashless_case_id;
  const refreshTimeline = useCallback(async () => {
    if (!ledgerCaseId) return;
    try {
      const res = await api.getCaseTimeline(ledgerCaseId, {});
      setTimeline(res || null);
      flagIssue("timeline", null);
    } catch (err) {
      flagIssue("timeline", err?.message || "The audit trail could not be read.");
    }
  }, [ledgerCaseId, flagIssue]);
  useEffect(() => {
    const timer = setTimeout(refreshTimeline, 0);
    return () => clearTimeout(timer);
  }, [refreshTimeline, caseState.preauthDecision, caseState.approvedAmount, caseState.claimCorrelationId, caseState.dischargeCorrelationId]);

  const { notes, loaded: notesLoaded, error: notesError, refresh: refreshNotes } = useCaseNotes(ledgerCaseId);
  const [notesOpen, setNotesOpen] = useState(false);

  const [communications, setCommunications] = useState([]);
  const [openCommId, setOpenCommId] = useState(null);
  const [replyTo, setReplyTo] = useState(null);

  const refreshComms = useCallback(async () => {
    if (!ledgerCaseId) return;
    try {
      const res = await api.listCommunications({ cashless_case_id: ledgerCaseId, limit: 50 });
      setCommunications(res?.communications || []);
      flagIssue("comms", null);
    } catch (err) {
      flagIssue("comms", err?.message || "The payer messages could not be read.");
    }
  }, [ledgerCaseId, flagIssue]);

  const caseRecord = useCaseRecord(ledgerCaseId, {
    seed,
    onLoaded: (full) => {
      const claimId = location.state?.claim_id ?? full.claim?.claim_id ?? null;
      const sameCase = String(full.cashless_case_id) === String(caseState.cashless_case_id);
      const sameClaim = claimId == null || claimId === caseState.claim_id;
      if (full.cashless_case_id && (!sameCase || !sameClaim)) {
        updateCaseState({ cashless_case_id: full.cashless_case_id, claim_id: claimId ?? caseState.claim_id ?? null });
      }
    },
  });
  const cashlessCase = caseRecord.record;
  const overrideCase = caseRecord.override;
  const resetCase = useCallback(() => {
    setSeed(null);
    overrideCase(() => null);
  }, [overrideCase]);

  useEffect(() => {
    const first = setTimeout(refreshComms, 0);
    const timer = ledgerCaseId ? setInterval(refreshComms, COMMS_POLL_MS) : null;
    return () => {
      clearTimeout(first);
      if (timer) clearInterval(timer);
    };
  }, [refreshComms, ledgerCaseId]);

  const markCommRead = useCallback((correlationId) => {
    setCommunications((prev) => prev.map((c) => (c.correlation_id === correlationId ? { ...c, provider_read: true } : c)));
  }, []);

  useEffect(() => {
    const scroller = document.querySelector(".content");
    if (scroller) scroller.scrollTo({ top: 0 });
    else window.scrollTo({ top: 0 });
  }, [currentStepPath]);

  const loadPatient = async () => {
    setLoading(true);
    setPatientError(null);
    let found = false;
    try {
      const response = await api.searchChildren({ child_id: id });
      const children = response?.children || [];
      const child = children.find((c) => c.child_id.toString() === id) || children[0];
      if (child) {
        found = true;
        setPatient(child);
        const prior = child.latest_claim;
        const priorMatchesTarget =
          !!prior && !isNewCase && (resumeCaseId ? String(prior.cashless_case_id) === String(resumeCaseId) : !navAdmissionId || String(prior.admission_id ?? "") === String(navAdmissionId));
        if (priorMatchesTarget) {
          setSeed(prior);
          updateCaseState({
            cashless_case_id: resumeCaseId ?? prior.cashless_case_id ?? caseState.cashless_case_id,
            claim_id: location.state?.claim_id ?? prior.claim_id ?? null,
          });
        }
      }
    } catch (err) {
      const message = err?.message || "The case could not be loaded.";
      if (found) flagIssue("case", message);
      else setPatientError(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(loadPatient, 0);
    return () => clearTimeout(timer);
  }, [id]);

  useEffect(() => {
    const cid = caseState.cashless_case_id;
    if (!cid || loading) return;
    reportCase(cid);
    const params = new URLSearchParams(location.search);
    if (params.get("case") !== String(cid)) {
      params.set("case", String(cid));
      navigate({ pathname: location.pathname, search: `?${params.toString()}` }, { replace: true, state: location.state });
    }
  }, [caseState.cashless_case_id, loading, location.pathname, location.search, location.state, navigate, reportCase]);

  if (loading) {
    return <LoadingBlock text="Loading the case…" />;
  }

  if (!patient && patientError) {
    return (
      <EmptyState title="The case could not be loaded" description={patientError}>
        <Button onClick={loadPatient} className="mt-4">
          Retry
        </Button>
        <Button variant="outline" onClick={() => navigate("/registry")} className="mt-4">
          Back to Patient Registry
        </Button>
      </EmptyState>
    );
  }

  if (!patient) {
    return (
      <EmptyState title="Patient not found" description="The patient record you are looking for does not exist.">
        <Button onClick={() => navigate("/registry")} className="mt-4">
          Back to Patient Registry
        </Button>
      </EmptyState>
    );
  }

  const issues = caseRecord.error ? { ...loadIssues, case: caseRecord.error } : loadIssues;
  const issueKeys = Object.keys(issues);
  const retryIssues = () => {
    refreshTimeline();
    refreshComms();
    caseRecord.reload();
  };

  const effectiveCase = cashlessCase || {};
  const preauthRef = caseState.preauthRef || effectiveCase.preauth_ref;
  const preauthDecision = caseState.preauthDecision || effectiveCase.preauth_status;

  const stages = buildStages({
    caseState,
    effectiveCase,
    preauthRef,
    preauthDecision,
    currentPath: currentStepPath,
    moneyLedger: timeline?.money_ledger || null,
    paymentSummary: effectiveCase.payment || null,
  });
  const activeStage = stages.find((s) => s.state === "active") || stageInfo(currentStepPath);
  const caseClosed = stages.some((s) => s.id === "payment" && s.done);

  const stageTools = [];
  if (ledgerCaseId) stageTools.push({ label: notes.length ? `Notes (${notes.length})` : "Notes", onClick: () => setNotesOpen(true) });
  stageTools.push(currentStepPath === "timeline" ? { label: "Back to case", onClick: () => navigate(-1) } : { label: "Audit trail", onClick: () => navigate(`/case/${id}/timeline`) });

  const from = location.state?.from;
  const goBack = () => {
    if (from) navigate(from);
    else if (location.key !== "default") navigate(-1);
    else navigate("/work-queue");
  };
  const backLabel = from === "/work-queue" ? "Work queue" : from === "/dashboard" ? "Cases" : from?.startsWith("/registry") ? "Registry" : "Back";

  const contextValue = {
    patient,
    cashlessCase,
    overrideCase,
    resetCase,
    caseState,
    updateCaseState,
    moneyLedger: timeline?.money_ledger || null,
    timelineEvents: timeline?.events || [],
    timelineTotal: timeline?.total_count ?? null,
    refreshTimeline,
    caseClosed,
    draftFiles,
    setDraftFiles,
    stageBar: { title: activeStage?.label || "Case", tools: stageTools },
    communications,
    refreshComms,
    caseRecord: caseRecord.full,
    reloadCase: caseRecord.reload,
    applyCase: caseRecord.apply,
    caseLoading: caseRecord.loading,
    caseError: caseRecord.error,
  };

  const replyQuestion = replyTo ? { notes: [], description: [replyTo.subject, ...(replyTo.payload || []).map((p) => p?.content_string).filter(Boolean)].filter(Boolean).join("\n"), requestedDocuments: replyTo.task_inputs ? Object.values(replyTo.task_inputs).filter((v) => typeof v === "string") : [] } : {};
  const sendReply = async ({ answer, docs }) =>
    api.respondToCommunication(replyTo.correlation_id, {
      message: answer || undefined,
      documents: (docs || []).map((d) => ({ title: d.attachment?.title || d.name, content_type: d.content_type || d.attachment?.contentType, data: d.attachment?.data })),
    });

  return (
    <div className="cv-root">
      <div className="cv-top">
        <CaseFileHeader
          patient={patient}
          onBack={goBack}
          backLabel={backLabel}
          caseState={caseState}
          effectiveCase={effectiveCase}
          preauthRef={preauthRef}
          moneyLedger={timeline?.money_ledger || null}
          statusPill={caseClosed ? <span className="cv-chip is-todo">Settled · read-only</span> : readOnly ? <span className="cv-chip is-todo">View only</span> : null}
        />
        <CaseStepper stages={stages} onNavigate={(path) => navigate(`/case/${id}/${path}`)} />
      </div>

      <div className="cv-page">
        {issueKeys.length > 0 && (
          <div className="cv-notice is-warn">
            <div className="cv-notice-body">
              Could not refresh {issueKeys.map((k) => ISSUE_LABELS[k] || k).join(", ")}, so what is shown may be out of date.
              <TechnicalDetails summary="What went wrong" ids={issueKeys.map((k) => ({ label: ISSUE_LABELS[k] || k, value: issues[k] }))} />
            </div>
            <div className="cv-notice-actions">
              <button type="button" className="cv-btn" onClick={retryIssues}>
                Retry
              </button>
            </div>
          </div>
        )}
        <AttentionTray communications={communications} notes={notes} heldTasks={effectiveCase.held_tasks} onOpenComm={setOpenCommId} onOpenNotes={() => setNotesOpen(true)} onReply={readOnly ? null : setReplyTo} />

        <div className="cv-stage-body">
          <AnimatePresence mode="wait">
            <motion.div key={location.pathname} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.18 }}>
              <ErrorBoundary key={currentStepPath}>
                <Routes location={location}>
                  <Route path="/" element={caseRecord.loading ? <LoadingBlock compact text="Opening the case…" /> : <Navigate to={landingStage(effectiveCase, { full: caseRecord.full })} replace state={location.state} />} />
                  <Route path="payer" element={<PayerPolicy ctx={contextValue} />} />
                  <Route path="discover" element={<DiscoverRedirect />} />
                  <Route path="prep" element={<EligibilityPrep ctx={contextValue} />} />
                  <Route path="review" element={<PreauthDraft ctx={contextValue} />} />
                  <Route path="status" element={<PreauthStatus ctx={contextValue} />} />
                  <Route path="enhancement" element={<PreauthEnhancement ctx={contextValue} />} />
                  <Route path="claim" element={<ClaimsScreen ctx={contextValue} />} />
                  <Route path="reprocess" element={<ReprocessScreen ctx={contextValue} />} />
                  <Route path="payment" element={<PaymentReconciliation ctx={contextValue} />} />
                  <Route path="timeline" element={<CaseTimeline ctx={contextValue} />} />
                </Routes>
              </ErrorBoundary>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      <CaseNotesDrawer
        open={notesOpen}
        onClose={() => setNotesOpen(false)}
        cashlessCaseId={ledgerCaseId}
        notes={notes}
        loaded={notesLoaded}
        loadError={notesError}
        onChanged={async () => {
          await refreshNotes();
          refreshTimeline();
        }}
      />

      <CommunicationDetailDrawer
        correlationId={openCommId}
        open={!!openCommId}
        onClose={() => {
          setOpenCommId(null);
          refreshComms();
        }}
        onRead={markCommRead}
        showOpenCase={false}
      />

      <AnswerPayerQuery
        open={!!replyTo}
        onClose={() => setReplyTo(null)}
        title="Reply to the payer"
        question={replyQuestion}
        send={sendReply}
        onSent={refreshComms}
        successMessage="Reply sent to the payer"
        answerLabel="Your reply"
        sendLabel="Send reply"
      />
    </div>
  );
}
