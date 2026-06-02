import { useState } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2, XCircle, RefreshCw, Send, ArrowRight, FileText } from 'lucide-react';
import { api } from '../api';
import { Card, Button, PageHeader } from './Common';

const REASON_CODES = [
  { value: 'claimrejected', label: 'Claim Rejected' },
  { value: 'partialpayment', label: 'Partial Payment Dispute' },
  { value: 'rejectiondisputed', label: 'Rejection Disputed' },
  { value: 'improvedoc', label: 'Improved Documentation' },
  { value: 'clinicaleva', label: 'Clinical Evaluation' },
  { value: 'pricingquery', label: 'Pricing Query' },
  { value: 'adminappeal', label: 'Administrative Appeal' },
  { value: 'other', label: 'Other' }
];

const ReprocessScreen = ({ patient, payer, policy, cashlessCase, preauthData, onBack, onDone }) => {
  const [form, setForm] = useState({ reason_code: '', description: '' });
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [statusData, setStatusData] = useState(null);
  const [polling, setPolling] = useState(false);

  const claimId = cashlessCase?.claim_id || preauthData?.claim_id || 101;

  const handleSubmit = async () => {
    if (!form.reason_code) return;
    setSubmitting(true);
    try {
      const res = await api.submitReprocess({
        claim_id: claimId,
        reason_code: form.reason_code,
        description: form.description
      });
      setResult(res);
      setPolling(true);
      // Start polling
      pollStatus(res.correlation_id);
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  const pollStatus = async (correlationId) => {
    let count = 0;
    const interval = setInterval(async () => {
      count++;
      try {
        const status = await api.getReprocessStatus(correlationId);
        setStatusData(status);
        if (status.status === 'complete' || status.status === 'failed' || count > 10) {
          setPolling(false);
          clearInterval(interval);
        }
      } catch (err) {
        setPolling(false);
        clearInterval(interval);
      }
    }, 4000);
  };

  return (
    <div className="reprocess-screen">
      <PageHeader
        title="Reprocess & Appeal"
        subtitle="Appeal a rejection, partial approval, or disputed query outcome."
        backAction={onBack}
      />

      {/* Case context */}
      <div className="case-context-strip mb-6">
        {patient && <div className="context-field"><span className="ctx-label">Patient</span><span className="ctx-value">{patient.name}</span></div>}
        {payer && <div className="context-field"><span className="ctx-label">Payer</span><span className="ctx-value">{payer.name}</span></div>}
        <div className="context-field"><span className="ctx-label">Claim ID</span><span className="ctx-value">#{claimId}</span></div>
      </div>

      <div className="layout-sidebar-right">
        <div>
          {!result ? (
            <Card title="Appeal Details">
              <div className="mb-6">
                <label style={{ fontSize: '13px', fontWeight: 600, display: 'block', marginBottom: '8px' }}>
                  Reason Code <span style={{ color: 'var(--error)' }}>*</span>
                </label>
                <select
                  className="input-modern"
                  style={{ width: '100%' }}
                  value={form.reason_code}
                  onChange={e => setForm({ ...form, reason_code: e.target.value })}
                >
                  <option value="">Select a reason...</option>
                  {REASON_CODES.map(r => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
              </div>

              <div className="mb-6">
                <label style={{ fontSize: '13px', fontWeight: 600, display: 'block', marginBottom: '8px' }}>Description</label>
                <textarea
                  className="input-modern"
                  rows={5}
                  placeholder="Describe the grounds for appeal. Include clinical justification and reference to supporting documents."
                  value={form.description}
                  onChange={e => setForm({ ...form, description: e.target.value })}
                  style={{ width: '100%', resize: 'vertical' }}
                />
              </div>

              <div className="mb-6">
                <label style={{ fontSize: '13px', fontWeight: 600, display: 'block', marginBottom: '8px' }}>Supporting Documents</label>
                <div style={{ border: '2px dashed var(--border-color)', borderRadius: '12px', padding: '24px', textAlign: 'center' }}>
                  <FileText size={24} style={{ margin: '0 auto 8px', opacity: 0.3 }} />
                  <p className="text-muted" style={{ fontSize: '13px' }}>Attach supporting documents to strengthen the appeal</p>
                  <Button variant="outline" className="mt-4" style={{ fontSize: '12px' }}>Attach Documents</Button>
                </div>
              </div>

              <Button
                className="w-full"
                icon={submitting ? RefreshCw : Send}
                disabled={submitting || !form.reason_code}
                onClick={handleSubmit}
              >
                {submitting ? 'Submitting Appeal...' : 'Submit Reprocess Request'}
              </Button>
            </Card>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <Card>
                <div className="text-center py-6">
                  <CheckCircle2 size={48} color="var(--success)" style={{ margin: '0 auto 16px' }} />
                  <h3 style={{ marginBottom: '8px' }}>Appeal Submitted</h3>
                  <p className="text-muted">Correlation ID: <code>{result.correlation_id}</code></p>
                </div>
              </Card>

              {polling && (
                <div className="flex-center flex-col py-10">
                  <div className="spinner mb-4" />
                  <p className="text-muted">Waiting for payer decision...</p>
                </div>
              )}

              {statusData && (
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
                  <Card title="Appeal Decision">
                    <div style={{
                      background: statusData.decision === 'APPROVED' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
                      border: `1.5px solid ${statusData.decision === 'APPROVED' ? 'var(--success)' : 'var(--error)'}`,
                      borderRadius: '12px', padding: '20px', display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '16px'
                    }}>
                      {statusData.decision === 'APPROVED'
                        ? <CheckCircle2 size={32} color="var(--success)" />
                        : <XCircle size={32} color="var(--error)" />}
                      <div>
                        <div style={{ fontWeight: 800, fontSize: '18px' }}>{statusData.decision}</div>
                        <div className="text-muted" style={{ fontSize: '13px' }}>
                          {statusData.decision === 'APPROVED' ? 'Appeal succeeded. Proceed to payment.' : 'No further appeal path via NHCX.'}
                        </div>
                      </div>
                    </div>

                    {statusData.process_notes?.map((note, i) => (
                      <div key={i} style={{ background: 'var(--bg-main)', borderRadius: '10px', padding: '14px', border: '1px solid var(--border-color)' }}>
                        <p style={{ fontSize: '14px' }}>{note.text}</p>
                      </div>
                    ))}

                    <div style={{ display: 'flex', gap: '12px', marginTop: '16px' }}>
                      {statusData.decision === 'APPROVED' && (
                        <Button icon={ArrowRight} onClick={onDone}>View Payment Status</Button>
                      )}
                      <Button variant="outline" onClick={onDone}>Back to Dashboard</Button>
                    </div>
                  </Card>
                </motion.div>
              )}
            </div>
          )}
        </div>

        {/* Sidebar guidance */}
        <Card title="When to Use Reprocess">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {[
              { code: 'partialpayment', desc: 'Payer approved less than billed amount' },
              { code: 'claimrejected', desc: 'Outright rejection that can be challenged' },
              { code: 'clinicaleva', desc: 'Dispute clinical evaluation reasoning' },
              { code: 'improvedoc', desc: 'Submit additional documents not available earlier' }
            ].map(item => (
              <div key={item.code} style={{ padding: '12px', background: 'var(--bg-main)', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                <div style={{ fontWeight: 700, fontSize: '13px', color: 'var(--primary)', marginBottom: '4px' }}>
                  {REASON_CODES.find(r => r.value === item.code)?.label}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{item.desc}</div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
};

export default ReprocessScreen;
