import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  CreditCard, CheckCircle2, AlertCircle, RefreshCw, RotateCcw,
  Clock, ArrowRight, ChevronDown, ChevronUp
} from 'lucide-react';
import { api } from '../api';
import { Card, Button, StatusBadge, PageHeader } from './Common';

const stageBadge = {
  PAYMENT_INITIATED: { cls: 'badge-warning', label: 'Initiated' },
  PAYMENT_PROCESSED: { cls: 'badge-info', label: 'Processed' },
  PAYMENT_SETTLED: { cls: 'badge-success', label: 'Settled' }
};

const PaymentEventCard = ({ event, expanded, onToggle }) => {
  const stage = stageBadge[event.payment_stage] || { cls: 'badge-info', label: event.payment_stage };
  const ackFailed = event.acknowledgement_status === 'failed';

  return (
    <div className="payment-event-card">
      <div className="pec-header" onClick={onToggle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <CreditCard size={18} color="var(--primary)" />
          <div>
            <div style={{ fontWeight: 700 }}>{event.payment_reference}</div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{event.claim_reference} · {event.payment_date}</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span className={`badge-modern ${stage.cls}`}>{stage.label}</span>
          {ackFailed && <span className="badge-modern badge-error" style={{ fontSize: '10px' }}>Ack Failed</span>}
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </div>
      </div>

      {expanded && (
        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="pec-body">
          <div className="grid-1-to-3 mt-4" style={{ gap: '16px' }}>
            {[
              { label: 'Notice Amount', value: `₹${event.notice_amount?.toLocaleString()}` },
              { label: 'Gross Amount', value: `₹${event.gross_amount?.toLocaleString()}` },
              { label: 'TDS', value: `₹${event.tds_amount?.toLocaleString()}` },
              { label: 'Net Paid', value: <strong style={{ color: 'var(--success)', fontSize: '16px' }}>₹{event.net_payment_amount?.toLocaleString()}</strong> },
              { label: 'UTR', value: event.utr ? <code style={{ color: 'var(--success)' }}>{event.utr}</code> : <span className="text-muted">—</span> },
              { label: 'Ack Status', value: <StatusBadge status={event.acknowledgement_status} /> }
            ].map(({ label, value }) => (
              <div key={label}>
                <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '4px', textTransform: 'uppercase' }}>{label}</div>
                <div>{value}</div>
              </div>
            ))}
          </div>

          {event.acknowledgement_error && (
            <div className="warning-banner mt-4" style={{ background: 'rgba(239,68,68,0.08)' }}>
              <AlertCircle size={16} color="var(--error)" />
              <span style={{ color: 'var(--error)' }}>Ack Error: {event.acknowledgement_error}</span>
            </div>
          )}
        </motion.div>
      )}
    </div>
  );
};

const PaymentScreen = ({ patient, payer, policy, cashlessCase, onBack, onDone }) => {
  const [paymentData, setPaymentData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expandedEvent, setExpandedEvent] = useState(null);
  const [acknowledging, setAcknowledging] = useState(false);
  const [ackResult, setAckResult] = useState(null);
  const [showOverride, setShowOverride] = useState(false);
  const [overrideForm, setOverrideForm] = useState({ claim_number: '', amount_received: '', utr: '' });

  const claimId = cashlessCase?.claim_id || 101;

  const fetchPayment = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.searchPaymentStatus({ claim_id: claimId });
      setPaymentData(data);
      if (data?.events?.length > 0) setExpandedEvent(0);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [claimId]);

  useEffect(() => { fetchPayment(); }, [fetchPayment]);

  const handleRetryAck = async () => {
    const latestFailed = paymentData?.events?.find(e => e.acknowledgement_status === 'failed');
    if (!latestFailed) return;
    setAcknowledging(true);
    try {
      const payload = { payment_reference: latestFailed.payment_reference };
      if (showOverride) {
        if (overrideForm.claim_number) payload.claim_number = overrideForm.claim_number;
        if (overrideForm.amount_received) payload.amount_received = parseFloat(overrideForm.amount_received);
        if (overrideForm.utr) payload.utr = overrideForm.utr;
      }
      const res = await api.acknowledgePayment(payload);
      setAckResult(res);
    } catch (err) { console.error(err); }
    finally { setAcknowledging(false); }
  };

  const hasFailedAck = paymentData?.events?.some(e => e.acknowledgement_status === 'failed');

  if (loading) return (
    <div className="flex-center py-32 flex-col">
      <div className="spinner mb-4" /><p className="text-muted">Loading payment status...</p>
    </div>
  );

  return (
    <div className="payment-screen">
      <PageHeader title="Payment Reconciliation" subtitle="Track payment notices and acknowledge settlements." backAction={onBack} />

      {/* Case context */}
      <div className="case-context-strip mb-6">
        {patient && <div className="context-field"><span className="ctx-label">Patient</span><span className="ctx-value">{patient.name}</span></div>}
        {payer && <div className="context-field"><span className="ctx-label">Payer</span><span className="ctx-value">{payer.name}</span></div>}
        <div className="context-field"><span className="ctx-label">Claim ID</span><span className="ctx-value">#{claimId}</span></div>
      </div>

      {/* Summary */}
      {paymentData && paymentData.status !== 'not_found' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div className="grid-1-to-3" style={{ gap: '16px' }}>
            {[
              { label: 'Latest Stage', value: <StatusBadge status={paymentData.latest_stage} /> },
              { label: 'Settled', value: paymentData.settled ? <span className="badge-modern badge-success"><CheckCircle2 size={12} />Yes</span> : <span className="badge-modern badge-warning"><Clock size={12} />No</span> },
              { label: 'Total Events', value: paymentData.total_events }
            ].map(({ label, value }) => (
              <Card key={label}>
                <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '8px', textTransform: 'uppercase' }}>{label}</div>
                <div style={{ fontWeight: 700, fontSize: '18px' }}>{value}</div>
              </Card>
            ))}
          </div>

          {/* Events */}
          <Card title="Payment Events">
            {paymentData.events?.map((event, i) => (
              <PaymentEventCard
                key={i}
                event={event}
                expanded={expandedEvent === i}
                onToggle={() => setExpandedEvent(expandedEvent === i ? null : i)}
              />
            ))}
          </Card>

          {/* Retry Ack — only shown when ack failed */}
          {hasFailedAck && (
            <Card title="Retry Acknowledgement">
              {ackResult ? (
                <div className="text-center py-6">
                  <CheckCircle2 size={40} color="var(--success)" style={{ margin: '0 auto 12px' }} />
                  <p>Acknowledgement submitted. Correlation: <code>{ackResult.correlation_id}</code></p>
                </div>
              ) : (
                <>
                  <div className="warning-banner mb-4">
                    <AlertCircle size={16} /><span>Auto-acknowledgement failed. Manual retry required.</span>
                  </div>

                  <button
                    onClick={() => setShowOverride(!showOverride)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--primary)', fontSize: '13px', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}
                  >
                    {showOverride ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    {showOverride ? 'Hide' : 'Show'} advanced override values
                  </button>

                  {showOverride && (
                    <div className="grid-1-to-3" style={{ gap: '12px', marginBottom: '16px' }}>
                      {[
                        { key: 'claim_number', label: 'Claim Number', placeholder: 'CLM-101' },
                        { key: 'amount_received', label: 'Amount Received', placeholder: '40000' },
                        { key: 'utr', label: 'UTR', placeholder: 'UTR123456789' }
                      ].map(f => (
                        <div key={f.key}>
                          <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>{f.label}</label>
                          <input
                            className="input-modern"
                            placeholder={f.placeholder}
                            value={overrideForm[f.key]}
                            onChange={e => setOverrideForm({ ...overrideForm, [f.key]: e.target.value })}
                          />
                        </div>
                      ))}
                    </div>
                  )}

                  <Button
                    icon={acknowledging ? RefreshCw : RotateCcw}
                    disabled={acknowledging}
                    onClick={handleRetryAck}
                  >
                    {acknowledging ? 'Retrying...' : 'Retry Acknowledgement'}
                  </Button>
                </>
              )}
            </Card>
          )}

          <div style={{ display: 'flex', gap: '12px' }}>
            <Button variant="outline" icon={RefreshCw} onClick={fetchPayment}>Refresh</Button>
            <Button icon={ArrowRight} onClick={onDone}>Back to Dashboard</Button>
          </div>
        </div>
      ) : (
        <Card>
          <div className="text-center py-16">
            <CreditCard size={48} style={{ margin: '0 auto 16px', opacity: 0.2 }} />
            <h3>No Payment Notice Received</h3>
            <p className="text-muted">The payer has not sent a payment notification yet.</p>
            <Button variant="outline" className="mt-6" icon={RefreshCw} onClick={fetchPayment}>Refresh</Button>
          </div>
        </Card>
      )}
    </div>
  );
};

export default PaymentScreen;
