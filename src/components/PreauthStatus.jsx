import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2, Clock, XCircle, Printer, Download, ArrowRight, ShieldCheck } from 'lucide-react';
import { api } from '../api';
import { Card, Button, StatusBadge, PageHeader } from './Common';

const PreauthStatus = ({ correlationId, onDone }) => {
  const [statusData, setStatusData] = useState(null);
  const [polling, setPolling] = useState(true);

  useEffect(() => {
    let interval;
    if (correlationId && polling) {
      interval = setInterval(async () => {
        try {
          const response = await api.getPreauthStatus(correlationId);
          setStatusData(response);
          if (response.status === 'complete' || response.status === 'failed') {
            setPolling(false);
          }
        } catch (error) {
          console.error('Status check error:', error);
          setPolling(false);
        }
      }, 3000);
    }
    return () => clearInterval(interval);
  }, [correlationId, polling]);

  const renderDecisionIcon = () => {
    if (!statusData) return <Clock size={64} className="text-warning" />;
    switch (statusData.decision) {
      case 'APPROVED':
        return <CheckCircle2 size={80} className="text-success" style={{ color: '#10b981' }} />;
      case 'REJECTED':
        return <XCircle size={80} className="text-error" style={{ color: '#ef4444' }} />;
      default:
        return <Clock size={80} className="text-warning" style={{ color: '#f59e0b' }} />;
    }
  };

  return (
    <div className="status-screen-modern">
      <PageHeader 
        title="Pre-authorization Status" 
        subtitle="Real-time adjudication results from the insurance payer."
      />

      <div className="flex-center" style={{ minHeight: '60vh' }}>
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="status-card-full" 
          style={{ width: '100%', maxWidth: '600px' }}
        >
          <Card className="text-center p-12">
            <motion.div 
              initial={{ rotate: -20, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              transition={{ delay: 0.2, type: 'spring' }}
              className="decision-icon mb-8 flex-center"
            >
              {renderDecisionIcon()}
            </motion.div>

            <h2 style={{ fontSize: '32px', marginBottom: '8px' }}>
              {statusData?.decision || 'Adjudication in Progress'}
            </h2>
            <p className="text-muted mb-8">
              {statusData?.decision === 'APPROVED' 
                ? 'Your pre-authorization request has been adjudicated and approved.' 
                : 'The payer is currently reviewing your clinical submission.'}
            </p>

            <div className="status-details-box mb-8" style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '24px' }}>
              <div className="flex-between mb-4 pb-4" style={{ borderBottom: '1px solid #e2e8f0' }}>
                <span className="text-muted" style={{ fontSize: '13px' }}>Correlation ID</span>
                <code style={{ fontSize: '12px', fontWeight: '700' }}>{correlationId}</code>
              </div>
              
              {statusData?.preauth_ref && (
                <div className="flex-between mb-4 pb-4" style={{ borderBottom: '1px solid #e2e8f0' }}>
                  <span className="text-muted" style={{ fontSize: '13px' }}>Preauth Reference</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <ShieldCheck size={16} className="text-success" />
                    <strong style={{ fontSize: '16px', color: 'var(--primary)' }}>{statusData.preauth_ref}</strong>
                  </div>
                </div>
              )}

              <div className="flex-between">
                <span className="text-muted" style={{ fontSize: '13px' }}>Gateway Status</span>
                <StatusBadge status={statusData?.status || 'Processing'} />
              </div>
            </div>

            {statusData?.decision === 'APPROVED' && (
              <div className="action-buttons-group flex-center gap-4 mb-8">
                 <Button variant="outline" icon={Printer}>Print Voucher</Button>
                 <Button variant="outline" icon={Download}>Letter</Button>
              </div>
            )}

            <Button className="w-full" onClick={onDone} icon={ArrowRight}>
              Back to Dashboard
            </Button>
          </Card>
        </motion.div>
      </div>
    </div>
  );
};

export default PreauthStatus;
