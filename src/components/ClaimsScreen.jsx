import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FileText, CheckCircle2, AlertTriangle, Clock, RefreshCw,
  Send, ArrowRight, AlertCircle, ChevronRight, BadgeCheck,
  Stethoscope, Receipt, ClipboardCheck, MessageSquare
} from 'lucide-react';
import { api } from '../api';
import { saveClaimsStep, loadClaimsStep, clearClaimsStep } from '../workflowStorage';
import { Card, Button, StatusBadge, PageHeader } from './Common';

// ─── Step definitions ─────────────────────────────────────────────────────────
const STEPS = [
  {
    id: 'draft',
    number: 1,
    title: 'Claim Draft',
    subtitle: 'Review bill items, diagnoses and documents',
    icon: FileText
  },
  {
    id: 'discharge',
    number: 2,
    title: 'Discharge Claim',
    subtitle: 'Submit provisional claim on patient discharge',
    icon: Receipt
  },
  {
    id: 'final',
    number: 3,
    title: 'Final Claim',
    subtitle: 'Submit for full adjudication after billing is closed',
    icon: ClipboardCheck
  },
  {
    id: 'decision',
    number: 4,
    title: 'Claim Decision',
    subtitle: 'Payer adjudication result',
    icon: BadgeCheck
  }
];

// ─── Stepper header ───────────────────────────────────────────────────────────
const Stepper = ({ currentStep, completedSteps }) => (
  <div className="claim-stepper">
    {STEPS.map((step, idx) => {
      const isCompleted = completedSteps.includes(step.id);
      const isCurrent = currentStep === step.id;
      const isLocked = !isCurrent && !isCompleted && !completedSteps.includes(STEPS[idx - 1]?.id);
      const Icon = step.icon;

      return (
        <div key={step.id} className="stepper-item">
          {/* Connector line */}
          {idx > 0 && (
            <div className={`stepper-connector ${completedSteps.includes(STEPS[idx - 1].id) ? 'done' : ''}`} />
          )}
          <div className={`stepper-circle ${isCurrent ? 'current' : ''} ${isCompleted ? 'completed' : ''} ${isLocked ? 'locked' : ''}`}>
            {isCompleted ? <CheckCircle2 size={18} /> : <Icon size={18} />}
          </div>
          <div className="stepper-label">
            <div className={`stepper-title ${isCurrent ? 'active' : ''}`}>{step.title}</div>
            <div className="stepper-sub">{step.subtitle}</div>
          </div>
        </div>
      );
    })}
  </div>
);

// ─── Missing fields alert ─────────────────────────────────────────────────────
const MissingFieldsAlert = ({ fields }) => {
  if (!fields?.length) return null;
  return (
    <div className="warning-banner mb-6" style={{ background: 'rgba(239,68,68,0.08)', borderColor: 'var(--error)', display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
      <AlertCircle size={18} color="var(--error)" style={{ flexShrink: 0, marginTop: '2px' }} />
      <div>
        <div style={{ fontWeight: 700, marginBottom: '6px', color: 'var(--error)' }}>Missing Required Fields — submission blocked</div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {fields.map((f, i) => (
            <span key={i} className="badge-modern badge-error" style={{ fontSize: '11px' }}>{f}</span>
          ))}
        </div>
      </div>
    </div>
  );
};

// ─── Document checklist ───────────────────────────────────────────────────────
const DocumentChecklist = ({ documents }) => {
  if (!documents?.length) return null;
  const missingRequired = documents.filter(d => !d.optional && !d.url);
  return (
    <div>
      {missingRequired.length > 0 && (
        <div className="warning-banner mb-4" style={{ display: 'flex', gap: '10px', alignItems: 'center', background: 'rgba(239,68,68,0.08)' }}>
          <AlertCircle size={16} color="var(--error)" />
          <span style={{ color: 'var(--error)', fontWeight: 600 }}>
            {missingRequired.length} required document(s) missing
          </span>
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {documents.map((doc, i) => (
          <div key={i} className="doc-row">
            <FileText size={14} color={doc.url ? 'var(--success)' : 'var(--text-muted)'} />
            <div style={{ flex: 1 }}>
              <span style={{ fontWeight: 600, fontSize: '13px' }}>{doc.name}</span>
              <span className="text-muted" style={{ fontSize: '11px', marginLeft: '8px' }}>{doc.code}</span>
              {!doc.optional && <span style={{ fontSize: '10px', color: 'var(--error)', marginLeft: '6px' }}>required</span>}
            </div>
            {doc.url
              ? <span className="badge-modern badge-success" style={{ fontSize: '10px' }}>Attached</span>
              : <span className="badge-modern badge-error" style={{ fontSize: '10px' }}>Missing</span>}
          </div>
        ))}
      </div>
    </div>
  );
};

// ─── Step 1: Claim Draft ──────────────────────────────────────────────────────
const StepDraft = ({ draft, onProceed }) => {
  const canProceed = !draft?.missing_fields?.length;

  return (
    <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
      style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

      <MissingFieldsAlert fields={draft?.missing_fields} />

      {/* Summary row */}
      <Card title="Claim Summary">
        <div className="grid-1-to-4" style={{ gap: '20px' }}>
          {[
            { label: 'Admission Date', value: draft?.admission_date || '—' },
            { label: 'Discharge Date', value: draft?.discharge_date || <span className="badge-modern badge-warning" style={{ fontSize: '11px' }}>Not yet</span> },
            { label: 'Total Amount', value: <strong style={{ color: 'var(--primary)', fontSize: '18px' }}>₹{draft?.total_amount?.toLocaleString()}</strong> },
            { label: 'Policy', value: <span style={{ fontFamily: 'monospace', fontSize: '11px' }}>{draft?.policy_number}</span> },
            { label: 'Preauth Ref', value: draft?.preauth_ref ? <span style={{ color: 'var(--success)', fontWeight: 700 }}>{draft.preauth_ref}</span> : <span className="text-muted">—</span> },
            { label: 'Preauth Status', value: draft?.preauth_status ? <StatusBadge status={draft.preauth_status} /> : '—' },
          ].map(({ label, value }) => (
            <div key={label}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '6px', textTransform: 'uppercase' }}>{label}</div>
              <div>{value}</div>
            </div>
          ))}
        </div>
      </Card>

      {/* Diagnoses & Procedures */}
      <Card title="Clinical Details">
        <div className="grid-1-to-2" style={{ gap: '24px' }}>
          <div>
            <div className="pm-sub-title"><Stethoscope size={13} /> Diagnoses</div>
            {draft?.diagnoses?.map((d, i) => (
              <div key={i} style={{ display: 'flex', gap: '8px', marginBottom: '8px', alignItems: 'center' }}>
                <code style={{ background: 'var(--primary-light)', color: 'var(--primary)', padding: '2px 7px', borderRadius: '4px', fontSize: '12px', fontWeight: 700 }}>{d.code}</code>
                <span style={{ fontSize: '13px' }}>{d.name}</span>
                {d.primary && <span className="badge-modern badge-info" style={{ fontSize: '10px' }}>Primary</span>}
              </div>
            ))}
          </div>
          <div>
            <div className="pm-sub-title"><Receipt size={13} /> Procedures</div>
            {draft?.procedures?.map((p, i) => (
              <div key={i} style={{ display: 'flex', gap: '8px', marginBottom: '8px', alignItems: 'center' }}>
                <code style={{ background: 'rgba(16,185,129,0.1)', color: 'var(--success)', padding: '2px 7px', borderRadius: '4px', fontSize: '12px', fontWeight: 700 }}>{p.code}</code>
                <span style={{ fontSize: '13px' }}>{p.name}</span>
              </div>
            ))}
          </div>
        </div>
      </Card>

      {/* Bill Items */}
      <Card title="Bill Items">
        <div className="table-responsive-wrapper mt-6">
          <table className="table-modern">
            <thead>
              <tr>
                <th>Service</th><th>Category</th><th>Qty</th><th>Unit Price</th><th>Net Amount</th>
              </tr>
            </thead>
            <tbody>
              {draft?.items?.map((item, i) => (
                <tr key={i}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{item.service_name}</div>
                    <small className="text-muted">{item.service_code}</small>
                  </td>
                  <td><span className="badge-modern badge-info" style={{ fontSize: '10px' }}>{item.category}</span></td>
                  <td>{item.quantity}</td>
                  <td>₹{item.unit_price?.toLocaleString()}</td>
                  <td><strong style={{ color: 'var(--primary)' }}>₹{item.net_amount?.toLocaleString()}</strong></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ textAlign: 'right', padding: '14px 0 0', fontWeight: 800, fontSize: '20px', color: 'var(--primary)' }}>
            Total: ₹{draft?.total_amount?.toLocaleString()}
          </div>
        </div>
      </Card>

      {/* Documents */}
      {draft?.supporting_documents?.length > 0 && (
        <Card title="Supporting Documents">
          <DocumentChecklist documents={draft.supporting_documents} />
        </Card>
      )}

      {/* CTA */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '14px', padding: '20px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontWeight: 700 }}>Draft looks good?</div>
          <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '2px' }}>Proceed to submit a discharge claim immediately after patient discharge.</div>
        </div>
        <Button icon={ArrowRight} disabled={!canProceed} onClick={onProceed}>
          Proceed to Discharge Claim
        </Button>
      </div>
    </motion.div>
  );
};

// ─── Step 2: Discharge Claim ──────────────────────────────────────────────────
const StepDischarge = ({ draft, onSubmitted }) => {
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);

  const hasPreauthRef = !!draft?.preauth_ref;

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const res = await api.submitDischargeClaim({ claim_id: draft?.claim_id || 101 });
      setResult(res);
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
      style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

      <div className="info-block-blue">
        <div style={{ fontWeight: 700, fontSize: '13px', marginBottom: '4px' }}>What is a Discharge Claim?</div>
        <p style={{ fontSize: '13px', lineHeight: 1.6, color: 'var(--text-muted)' }}>
          A discharge claim (workflow 14) is submitted immediately when the patient is discharged, before the final bill is prepared.
          It lets the payer begin initial processing while the hospital closes the bill.
        </p>
      </div>

      {/* Pre-flight checklist */}
      <Card title="Pre-submission Checklist">
        {[
          { label: 'Preauth reference obtained', ok: hasPreauthRef, detail: draft?.preauth_ref || 'Missing — must complete preauth first' },
          { label: 'Patient discharged', ok: !!draft?.discharge_date, detail: draft?.discharge_date || 'Discharge date not set' },
          { label: 'Admission date available', ok: !!draft?.admission_date, detail: draft?.admission_date || 'Missing' },
          { label: 'No blocking missing fields', ok: !draft?.missing_fields?.length, detail: draft?.missing_fields?.length ? `${draft.missing_fields.length} fields missing` : 'All clear' },
        ].map(({ label, ok, detail }) => (
          <div key={label} style={{ display: 'flex', gap: '12px', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid var(--border-color)' }}>
            {ok
              ? <CheckCircle2 size={18} color="var(--success)" />
              : <AlertCircle size={18} color="var(--error)" />}
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: '13px' }}>{label}</div>
              <div style={{ fontSize: '12px', color: ok ? 'var(--text-muted)' : 'var(--error)' }}>{detail}</div>
            </div>
          </div>
        ))}
      </Card>

      {result ? (
        <div style={{ background: 'rgba(16,185,129,0.08)', border: '1.5px solid var(--success)', borderRadius: '14px', padding: '24px', textAlign: 'center' }}>
          <CheckCircle2 size={40} color="var(--success)" style={{ margin: '0 auto 12px' }} />
          <h3 style={{ marginBottom: '8px' }}>Discharge Claim Submitted</h3>
          <p className="text-muted" style={{ fontSize: '13px', marginBottom: '16px' }}>
            Correlation ID: <code style={{ color: 'var(--primary)' }}>{result.correlation_id}</code>
          </p>
          <Button icon={ArrowRight} onClick={() => onSubmitted(result)}>
            Proceed to Final Claim
          </Button>
        </div>
      ) : (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '14px', padding: '20px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontWeight: 700 }}>Ready to submit discharge claim?</div>
            <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '2px' }}>
              This sends a provisional claim (workflow 14) to the payer.
            </div>
          </div>
          <Button
            icon={submitting ? RefreshCw : Send}
            disabled={submitting || !hasPreauthRef}
            onClick={handleSubmit}
          >
            {submitting ? 'Submitting...' : 'Submit Discharge Claim'}
          </Button>
        </div>
      )}
    </motion.div>
  );
};

// ─── Step 3: Final Claim ──────────────────────────────────────────────────────
const StepFinal = ({ draft, dischargeCorrelationId, onSubmitted }) => {
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const res = await api.submitFinalClaim({
        claim_id: draft?.claim_id || 101,
        discharge_correlation_id: dischargeCorrelationId
      });
      setResult(res);
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
      style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

      <div className="info-block-blue">
        <div style={{ fontWeight: 700, fontSize: '13px', marginBottom: '4px' }}>What is a Final Claim?</div>
        <p style={{ fontSize: '13px', lineHeight: 1.6, color: 'var(--text-muted)' }}>
          The final claim (workflow 5) is submitted after the discharge claim is accepted and the final invoice is closed.
          This triggers full adjudication by the payer.
        </p>
      </div>

      {/* Discharge ref */}
      {dischargeCorrelationId && (
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', padding: '14px 18px', background: 'rgba(16,185,129,0.08)', border: '1px solid var(--success)', borderRadius: '12px' }}>
          <CheckCircle2 size={20} color="var(--success)" />
          <div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Discharge Claim Correlation ID</div>
            <code style={{ color: 'var(--success)', fontWeight: 700 }}>{dischargeCorrelationId}</code>
          </div>
        </div>
      )}

      {/* Final summary */}
      <Card title="Final Bill Summary">
        <div className="grid-1-to-3" style={{ gap: '20px', marginBottom: '20px' }}>
          {[
            { label: 'Total Billed', value: `₹${draft?.total_amount?.toLocaleString()}` },
            { label: 'Discharge Date', value: draft?.discharge_date || '—' },
            { label: 'Preauth Ref', value: draft?.preauth_ref || '—' },
            { label: 'Policy', value: draft?.policy_number },
          ].map(({ label, value }) => (
            <div key={label}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '4px', textTransform: 'uppercase' }}>{label}</div>
              <div style={{ fontWeight: 600 }}>{value}</div>
            </div>
          ))}
        </div>
        <div className="table-responsive-wrapper">
          <table className="table-modern">
            <thead><tr><th>Service</th><th>Qty</th><th>Net Amount</th></tr></thead>
            <tbody>
              {draft?.items?.map((item, i) => (
                <tr key={i}>
                  <td><div style={{ fontWeight: 600 }}>{item.service_name}</div><small className="text-muted">{item.service_code}</small></td>
                  <td>{item.quantity}</td>
                  <td><strong style={{ color: 'var(--primary)' }}>₹{item.net_amount?.toLocaleString()}</strong></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ textAlign: 'right', padding: '14px 0 0', fontWeight: 800, fontSize: '20px', color: 'var(--primary)' }}>
            Grand Total: ₹{draft?.total_amount?.toLocaleString()}
          </div>
        </div>
      </Card>

      {result ? (
        <div style={{ background: 'rgba(16,185,129,0.08)', border: '1.5px solid var(--success)', borderRadius: '14px', padding: '24px', textAlign: 'center' }}>
          <CheckCircle2 size={40} color="var(--success)" style={{ margin: '0 auto 12px' }} />
          <h3 style={{ marginBottom: '8px' }}>Final Claim Submitted</h3>
          <p className="text-muted" style={{ fontSize: '13px', marginBottom: '16px' }}>
            Correlation ID: <code style={{ color: 'var(--primary)' }}>{result.correlation_id}</code>
          </p>
          <Button icon={ArrowRight} onClick={() => onSubmitted(result)}>
            View Claim Decision
          </Button>
        </div>
      ) : (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '14px', padding: '20px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontWeight: 700 }}>Submit final claim for adjudication?</div>
            <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '2px' }}>
              This will send the complete bill to the payer for a final decision.
            </div>
          </div>
          <Button
            icon={submitting ? RefreshCw : Send}
            disabled={submitting}
            onClick={handleSubmit}
          >
            {submitting ? 'Submitting...' : 'Submit Final Claim'}
          </Button>
        </div>
      )}
    </motion.div>
  );
};

// ─── Step 4: Claim Decision ───────────────────────────────────────────────────
const StepDecision = ({ correlationId, onDone, onNavigateReprocess }) => {
  const [claimStatus, setClaimStatus] = useState(null);
  const [polling, setPolling] = useState(true);

  useEffect(() => {
    if (!correlationId) return;
    const interval = setInterval(async () => {
      try {
        const status = await api.getClaimStatus(correlationId);
        setClaimStatus(status);
        if (status.status === 'complete' || status.status === 'failed') {
          setPolling(false);
          clearInterval(interval);
        }
      } catch { setPolling(false); clearInterval(interval); }
    }, 4000);
    // Immediate first fetch
    api.getClaimStatus(correlationId).then(s => {
      setClaimStatus(s);
      if (s.status === 'complete' || s.status === 'failed') setPolling(false);
    }).catch(() => setPolling(false));
    return () => clearInterval(interval);
  }, [correlationId]);

  return (
    <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
      style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

      {polling && !claimStatus && (
        <div className="flex-center flex-col py-16">
          <div className="spinner mb-4" />
          <p className="text-muted">Waiting for payer adjudication...</p>
          <code style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '8px' }}>{correlationId}</code>
        </div>
      )}

      {claimStatus && (
        <>
          {/* Decision banner */}
          <div style={{
            background: claimStatus.decision === 'APPROVED' ? 'rgba(16,185,129,0.1)' : claimStatus.decision === 'QUERIED' ? 'rgba(59,130,246,0.1)' : 'rgba(245,158,11,0.1)',
            border: `1.5px solid ${claimStatus.decision === 'APPROVED' ? 'var(--success)' : claimStatus.decision === 'QUERIED' ? '#3b82f6' : 'var(--warning)'}`,
            borderRadius: '14px', padding: '20px 24px', display: 'flex', alignItems: 'center', gap: '16px'
          }}>
            {claimStatus.decision === 'APPROVED'
              ? <CheckCircle2 size={36} color="var(--success)" />
              : claimStatus.decision === 'QUERIED'
              ? <AlertTriangle size={36} color="#3b82f6" />
              : <AlertTriangle size={36} color="var(--warning)" />}
            <div>
              <div style={{ fontSize: '22px', fontWeight: 800 }}>{claimStatus.decision}</div>
              {claimStatus.approved_amount && (
                <div style={{ color: 'var(--text-muted)', fontSize: '14px', marginTop: '4px' }}>
                  Approved Amount: <strong style={{ color: 'var(--success)', fontSize: '16px' }}>₹{claimStatus.approved_amount.toLocaleString()}</strong>
                </div>
              )}
            </div>
          </div>

          {/* Adjudication totals */}
          {claimStatus.totals && (
            <Card title="Adjudication Summary">
              <div className="grid-1-to-4" style={{ gap: '16px' }}>
                {Object.entries(claimStatus.totals).map(([k, v]) => (
                  <div key={k} style={{ background: 'var(--bg-main)', borderRadius: '10px', padding: '14px', textAlign: 'center' }}>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '6px' }}>{k}</div>
                    <div style={{ fontWeight: 800, fontSize: '16px' }}>{v?.currency} {v?.value?.toLocaleString()}</div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Payer notes */}
          {claimStatus.process_notes?.length > 0 && (
            <Card title="Payer Notes">
              {claimStatus.process_notes.map((n, i) => (
                <div key={i} style={{ background: 'var(--bg-main)', borderRadius: '10px', padding: '14px', marginBottom: '8px', border: '1px solid var(--border-color)' }}>
                  <p style={{ fontSize: '14px', lineHeight: 1.6 }}>{n.text}</p>
                </div>
              ))}
            </Card>
          )}

          {/* Query response action */}
          {claimStatus.decision === 'QUERIED' && (
            <Card title="Response Required">
              <p className="text-muted mb-4" style={{ fontSize: '13px' }}>Payer has queried this claim. Respond with additional documents or initiate an appeal.</p>
              <div style={{ display: 'flex', gap: '12px' }}>
                <Button icon={MessageSquare}>Respond to Query</Button>
                <Button variant="outline" onClick={onNavigateReprocess}>Reprocess / Appeal</Button>
              </div>
            </Card>
          )}

          <Button className="w-full" icon={ArrowRight} onClick={onDone}>Back to Dashboard</Button>
        </>
      )}

      {!polling && !claimStatus && (
        <Card>
          <div className="text-center py-8">
            <Clock size={40} style={{ margin: '0 auto 12px', opacity: 0.2 }} />
            <p className="text-muted">No decision yet. Refresh to check again.</p>
            <Button variant="outline" icon={RefreshCw} className="mt-4" onClick={() => setPolling(true)}>
              Refresh
            </Button>
          </div>
        </Card>
      )}
    </motion.div>
  );
};

// ─── Main ClaimsScreen ────────────────────────────────────────────────────────
const ClaimsScreen = ({ patient, payer, policy, cashlessCase, preauthData, onBack, onDone, onNavigateReprocess }) => {
  const [currentStep, setCurrentStep] = useState('draft');
  const [completedSteps, setCompletedSteps] = useState([]);
  const [draft, setDraft] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dischargeResult, setDischargeResult] = useState(null);
  const [finalResult, setFinalResult] = useState(null);

  const claimId = cashlessCase?.claim_id || preauthData?.claim_id || 101;

  // ─── Restore stepper from localStorage on mount ─────────────────────
  useEffect(() => {
    const saved = loadClaimsStep(claimId);
    if (saved) {
      if (saved.currentStep)    setCurrentStep(saved.currentStep);
      if (saved.completedSteps) setCompletedSteps(saved.completedSteps);
      if (saved.dischargeResult) setDischargeResult(saved.dischargeResult);
      if (saved.finalResult)     setFinalResult(saved.finalResult);
    }
  }, [claimId]);

  const fetchDraft = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.prepareClaimDraft({ claim_id: claimId });
      setDraft(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [claimId]);

  useEffect(() => { fetchDraft(); }, [fetchDraft]);

  const complete = (step) => setCompletedSteps(prev => prev.includes(step) ? prev : [...prev, step]);

  // ─── Persist step state after every transition ───────────────────────
  const persistStep = (patch) => {
    saveClaimsStep(claimId, {
      currentStep:    patch.currentStep    ?? currentStep,
      completedSteps: patch.completedSteps ?? completedSteps,
      dischargeResult: patch.dischargeResult ?? dischargeResult,
      finalResult:     patch.finalResult    ?? finalResult,
    });
  };

  const handleDraftProceed = () => {
    const newCompleted = completedSteps.includes('draft') ? completedSteps : [...completedSteps, 'draft'];
    setCompletedSteps(newCompleted);
    setCurrentStep('discharge');
    persistStep({ currentStep: 'discharge', completedSteps: newCompleted });
  };

  const handleDischargeSubmitted = (result) => {
    const newCompleted = [...completedSteps.filter(s => s !== 'discharge'), 'discharge'];
    setDischargeResult(result);
    setCompletedSteps(newCompleted);
    setCurrentStep('final');
    persistStep({ currentStep: 'final', completedSteps: newCompleted, dischargeResult: result });
  };

  const handleFinalSubmitted = (result) => {
    const newCompleted = [...completedSteps.filter(s => s !== 'final'), 'final'];
    setFinalResult(result);
    setCompletedSteps(newCompleted);
    setCurrentStep('decision');
    persistStep({ currentStep: 'decision', completedSteps: newCompleted, finalResult: result });
  };

  const handleDone = () => {
    clearClaimsStep(claimId);
    onDone && onDone();
  };

  const currentStepNum = STEPS.findIndex(s => s.id === currentStep) + 1;

  if (loading) return (
    <div className="flex-center flex-col py-32">
      <div className="spinner mb-4" />
      <p className="text-muted">Loading claim draft...</p>
    </div>
  );

  return (
    <div className="claims-screen">
      <PageHeader
        title="Claim Submission"
        subtitle="Follow each step to submit and track your insurance claim."
        backAction={onBack}
      />

      {/* Case context */}
      <div className="case-context-strip mb-8">
        {patient && <div className="context-field"><span className="ctx-label">Patient</span><span className="ctx-value">{patient.name}</span></div>}
        {payer && <div className="context-field"><span className="ctx-label">Payer</span><span className="ctx-value">{payer.name}</span></div>}
        {draft?.preauth_ref && <div className="context-field"><span className="ctx-label">Preauth Ref</span><span className="ctx-value" style={{ color: 'var(--success)' }}>{draft.preauth_ref}</span></div>}
        <div className="context-field"><span className="ctx-label">Claim ID</span><span className="ctx-value">#{claimId}</span></div>
        <div className="context-field">
          <span className="ctx-label">Step</span>
          <span className="ctx-value">{currentStepNum} of {STEPS.length}</span>
        </div>
      </div>

      {/* Stepper */}
      <Stepper currentStep={currentStep} completedSteps={completedSteps} />

      {/* Step content */}
      <div style={{ marginTop: '32px' }}>
        <AnimatePresence mode="wait">
          {currentStep === 'draft' && (
            <StepDraft key="draft" draft={draft} onProceed={handleDraftProceed} />
          )}
          {currentStep === 'discharge' && (
            <StepDischarge key="discharge" draft={draft} onSubmitted={handleDischargeSubmitted} />
          )}
          {currentStep === 'final' && (
            <StepFinal
              key="final"
              draft={draft}
              dischargeCorrelationId={dischargeResult?.correlation_id}
              onSubmitted={handleFinalSubmitted}
            />
          )}
          {currentStep === 'decision' && (
            <StepDecision
              key="decision"
              correlationId={finalResult?.correlation_id}
              onDone={handleDone}
              onNavigateReprocess={onNavigateReprocess}
            />
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default ClaimsScreen;
