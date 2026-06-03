import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MessageSquare, AlertCircle, CheckCircle2, Clock, X,
  RefreshCw, Filter, ExternalLink
} from 'lucide-react';
import { api } from '../api';
import { Card, Button, StatusBadge, PageHeader } from './Common';

const priorityBadge = {
  urgent: 'badge-error',
  high: 'badge-warning',
  normal: 'badge-info'
};

const CommunicationsScreen = () => {
  const [comms, setComms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const fetchComms = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.listCommunications({ limit: 20 });
      setComms(data.communications || []);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchComms(); }, [fetchComms]);

  const openDetail = async (comm) => {
    setSelected(comm);
    setDetail(null);
    setDetailLoading(true);
    try {
      const d = await api.getCommunicationStatus(comm.correlation_id);
      setDetail(d);
    } catch (err) { console.error(err); }
    finally { setDetailLoading(false); }
  };

  return (
    <div className="comms-screen">
      <PageHeader title="Payer Communications" subtitle="Review payer-initiated messages, TAT queries, and information requests." />

      <div className={`comms-layout ${selected ? 'has-selected' : ''}`}>
        {/* List */}
        <div>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', alignItems: 'center' }}>
            <Button variant="outline" icon={Filter} style={{ fontSize: '13px' }}>Filter</Button>
            <Button variant="outline" icon={RefreshCw} onClick={fetchComms} style={{ fontSize: '13px' }}>Refresh</Button>
          </div>

          {loading ? (
            <div className="flex-center flex-col py-16"><div className="spinner mb-4" /><p className="text-muted">Loading communications...</p></div>
          ) : comms.length === 0 ? (
            <Card>
              <div className="text-center py-16">
                <MessageSquare size={48} style={{ margin: '0 auto 16px', opacity: 0.2 }} />
                <h3>No Communications</h3>
                <p className="text-muted">No payer messages received yet.</p>
              </div>
            </Card>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {comms.map((comm) => (
                <motion.div
                  key={comm.correlation_id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`comm-card ${selected?.correlation_id === comm.correlation_id ? 'active' : ''}`}
                  onClick={() => openDetail(comm)}
                >
                  <div className="comm-card-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <MessageSquare size={16} color="var(--primary)" />
                      <span style={{ fontWeight: 700, fontSize: '14px' }}>{comm.topic_display}</span>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <span className={`badge-modern ${priorityBadge[comm.priority] || 'badge-info'}`} style={{ fontSize: '10px' }}>{comm.priority}</span>
                      {comm.acknowledged
                        ? <CheckCircle2 size={14} color="var(--success)" />
                        : <Clock size={14} color="var(--warning)" />}
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginTop: '8px' }}>
                    <span className="text-muted" style={{ fontSize: '12px' }}>Payer: <strong style={{ color: 'var(--text-main)' }}>{comm.payer_code}</strong></span>
                    <span className="text-muted" style={{ fontSize: '12px' }}>Reason: <strong style={{ color: 'var(--text-main)' }}>{comm.reason_display}</strong></span>
                    {comm.claim_reference && (
                      <span className="text-muted" style={{ fontSize: '12px' }}>Claim: <strong style={{ color: 'var(--text-main)' }}>{comm.claim_reference}</strong></span>
                    )}
                    <span className="text-muted" style={{ fontSize: '12px' }}>Sent: {new Date(comm.sent_at).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}</span>
                  </div>

                  {comm.pending_tasks?.length > 0 && (
                    <div style={{ marginTop: '8px', display: 'flex', gap: '6px' }}>
                      <AlertCircle size={13} color="var(--warning)" />
                      <span style={{ fontSize: '12px', color: 'var(--warning)', fontWeight: 600 }}>
                        {comm.pending_tasks.length} pending task{comm.pending_tasks.length > 1 ? 's' : ''}
                      </span>
                    </div>
                  )}
                </motion.div>
              ))}
            </div>
          )}
        </div>

        {/* Detail panel */}
        <AnimatePresence>
          {selected && (
            <motion.div initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 40 }}>
              <Card title={selected.topic_display} headerAction={
                <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                  <X size={18} />
                </button>
              }>
                {detailLoading ? (
                  <div className="flex-center flex-col py-8"><div className="spinner" /></div>
                ) : detail && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div className="drawer-meta">
                      <div className="meta-row"><span className="meta-label">Payer</span><span>{detail.payer_code}</span></div>
                      <div className="meta-row"><span className="meta-label">Reason</span><span>{detail.reason_display}</span></div>
                      <div className="meta-row"><span className="meta-label">Priority</span><StatusBadge status={detail.priority} /></div>
                      <div className="meta-row"><span className="meta-label">Acknowledged</span><span>{detail.acknowledged ? `Yes — ${new Date(detail.acknowledged_at).toLocaleString('en-IN')}` : 'No'}</span></div>
                      {detail.claim_reference && <div className="meta-row"><span className="meta-label">Claim</span><span>{detail.claim_reference}</span></div>}
                    </div>

                    {/* Payload content */}
                    {detail.payload?.map((item, i) => (
                      <div key={i} style={{ background: 'var(--bg-main)', borderRadius: '8px', padding: '12px', border: '1px solid var(--border-color)' }}>
                        <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '6px', textTransform: 'uppercase' }}>
                          {item.content_type === 'text' ? 'Message' : item.content_type}
                        </div>
                        {item.content_type === 'text' ? (
                          <p style={{ fontSize: '14px', lineHeight: 1.6, color: 'var(--text-main)' }}>{item.content}</p>
                        ) : (
                          <a href={item.url || '#'} target="_blank" rel="noreferrer" style={{ color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}>
                            <ExternalLink size={14} />Open Attachment
                          </a>
                        )}
                      </div>
                    ))}

                    {/* Pending task link */}
                    {detail.pending_tasks?.length > 0 && (
                      <div style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid var(--warning)', borderRadius: '8px', padding: '12px' }}>
                        <div style={{ fontWeight: 700, fontSize: '12px', marginBottom: '6px', color: 'var(--warning)' }}>Pending Tasks</div>
                        {detail.pending_tasks.map(t => (
                          <div key={t.task_id} style={{ fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <AlertCircle size={13} color="var(--warning)" />
                            {t.title}
                            <span className="badge-modern badge-warning" style={{ fontSize: '10px', marginLeft: 'auto' }}>{t.task_type?.replace(/_/g, ' ')}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </Card>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default CommunicationsScreen;
