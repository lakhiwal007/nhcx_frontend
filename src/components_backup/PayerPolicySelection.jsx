import { useState, useEffect, useCallback } from 'react';
import { Search, Shield, ArrowRight, Filter, CalendarDays, CheckCircle2, Banknote, X } from 'lucide-react';
import { api } from '../api';
import { Card, Button, Input, StatusBadge, PageHeader } from './Common';

const PayerPolicySelection = ({ patient, onPolicySelected, onBack }) => {
  const [payers, setPayers] = useState([]);
  const [selectedPayer, setSelectedPayer] = useState(null);
  const [policies, setPolicies] = useState([]);
  const [selectedPolicy, setSelectedPolicy] = useState(null);
  const [loadingPayers, setLoadingPayers] = useState(false);
  const [loadingPolicies, setLoadingPolicies] = useState(false);
  const [policyError, setPolicyError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [validating, setValidating] = useState(false);
  const [validationResult, setValidationResult] = useState(null);

  const searchPayers = useCallback(async (name = '') => {
    setLoadingPayers(true);
    try {
      const data = await api.searchPayers({ name });
      setPayers(data || []);
    } catch (error) {
      console.error('Error searching payers:', error);
    } finally {
      setLoadingPayers(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      searchPayers(searchQuery);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchQuery, searchPayers]);

  const handlePayerSelect = async (payer) => {
    setSelectedPayer(payer);
    setSelectedPolicy(null);
    setPolicies([]);
    setPolicyError(null);
    setValidationResult(null);
    if (!payer) return;
    setLoadingPolicies(true);
    try {
      const response = await api.fetchPolicies({
        child_id: patient?.child_id || 12,
        admission_id: patient?.visits?.[0]?.admission_id?.toString() || '622',
        payer_code: payer.participant_code,
        force_refresh: false
      });
      setPolicies(response?.data?.policies || []);
      if (!response?.data?.policies?.length) {
        setPolicyError('No active policies found for this payer.');
      }
    } catch (error) {
      console.error('Error fetching policies:', error);
      setPolicyError('Failed to fetch policies. Please retry.');
    } finally {
      setLoadingPolicies(false);
    }
  };

  const handlePolicySelect = (policy) => {
    setSelectedPolicy(policy);
    setValidationResult(null); // Reset validation if they pick a different policy
  };

  const handleVerifyPolicy = async () => {
    setValidating(true);
    try {
      // 1. Submit validation request
      const res = await api.validateCoverage({
        child_id: patient?.child_id,
        payer_code: selectedPayer.participant_code,
        policy_number: selectedPolicy.policy_number,
      });

      // 2. Poll for status
      const checkStatus = async () => {
        const statusRes = await api.getCoverageEligibilityStatus(res.correlation_id);
        if (statusRes.status === 'complete' || statusRes.status === 'failed') {
          setValidationResult(statusRes);
          setValidating(false);
        } else {
          setTimeout(checkStatus, 2000);
        }
      };
      setTimeout(checkStatus, 2000);

    } catch (err) {
      console.error(err);
      setValidating(false);
    }
  };

  const canProceed = selectedPayer && selectedPolicy && validationResult?.outcome === 'complete';

  return (
    <div className="selection-screen-modern">
      <PageHeader
        title="Payer & Policy Selection"
        subtitle="Identify the insurance payer and verify policy coverage for the selected patient."
        backAction={onBack}
      />

      {/* Patient context strip */}
      {patient && (
        <div className="case-context-strip mb-6">
          <div className="context-field"><span className="ctx-label">Patient</span><span className="ctx-value">{patient.name}</span></div>
          <div className="context-field"><span className="ctx-label">Child ID</span><span className="ctx-value">#{patient.child_id}</span></div>
          {patient.visits?.[0] && (
            <div className="context-field"><span className="ctx-label">Admission</span><span className="ctx-value">{patient.visits[0].admission_no}</span></div>
          )}
        </div>
      )}

      <div className={`selection-grid-modern ${selectedPayer ? 'has-selected' : ''}`}>
        {/* Payer Search */}
        <Card title="Insurance Payers" headerAction={<Filter size={18} className="text-muted" />}>
          <div className="mb-6">
            <Input
              icon={Search}
              placeholder="Search payers by name or scheme..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="list-container-modern">
            {loadingPayers ? (
              <div className="loading py-12 text-center">
                <div className="spinner mx-auto mb-4" style={{ width: '32px', height: '32px' }} />
                <p className="text-muted" style={{ fontSize: '13px' }}>Searching NHCX network...</p>
              </div>
            ) : payers.length === 0 ? (
              <div className="text-center py-12 text-muted">
                <Shield size={40} style={{ opacity: 0.2, margin: '0 auto 12px' }} />
                <p>No payers found. Try a different name.</p>
              </div>
            ) : (
              payers.map((payer) => (
                <div
                  key={payer.participant_code}
                  className={`list-item-modern ${selectedPayer?.participant_code === payer.participant_code ? 'selected' : ''}`}
                  onClick={() => handlePayerSelect(payer)}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'var(--primary-light)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Shield size={20} />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <span style={{ fontWeight: 700, fontSize: '14px', color: 'var(--text-main)' }}>{payer.name}</span>
                      <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{payer.scheme_type} · {payer.participant_code}</span>
                    </div>
                  </div>
                  <StatusBadge status={payer.status} />
                </div>
              ))
            )}
          </div>
        </Card>

        {/* Policy Cards */}
        <Card 
          title={selectedPayer ? `Policies — ${selectedPayer.name}` : 'Available Policies'}
          headerAction={selectedPayer && (
            <button onClick={() => handlePayerSelect(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }} aria-label="Clear Payer">
              <X size={18} />
            </button>
          )}
        >
          <div className="list-container-modern">
            {loadingPolicies ? (
              <div className="loading py-12 text-center">
                <div className="spinner mx-auto mb-4" />
                <p className="text-muted">Fetching coverage details from NHCX...</p>
              </div>
            ) : !selectedPayer ? (
              <div className="empty-state text-center py-20">
                <Shield size={48} className="mx-auto mb-4 text-muted" style={{ opacity: 0.2 }} />
                <p className="text-muted">Select a payer from the left to view active policies.</p>
              </div>
            ) : policyError ? (
              <div className="empty-state text-center py-12">
                <p className="text-muted mb-4">{policyError}</p>
                <Button variant="outline" onClick={() => handlePayerSelect(selectedPayer)}>Retry</Button>
              </div>
            ) : policies.length === 0 ? (
              <div className="text-center py-12 text-muted">No active policies found for this payer.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {policies.map((policy) => (
                  <div
                    key={policy.policy_number}
                    className={`policy-card-modern ${selectedPolicy?.policy_number === policy.policy_number ? 'selected' : ''}`}
                    onClick={() => handlePolicySelect(policy)}
                  >
                    <div className="policy-card-header">
                      <div>
                        <span className="policy-title">{policy.product_name}</span>
                        <span className="policy-id">Policy #{policy.policy_number}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <StatusBadge status={policy.status} />
                        {selectedPolicy?.policy_number === policy.policy_number && (
                          <CheckCircle2 size={20} color="var(--success)" />
                        )}
                      </div>
                    </div>
                    <div className="policy-card-details">
                      <div className="policy-detail-item">
                        <Banknote size={14} />
                        <span className="detail-label">Sum Insured</span>
                        <span className="detail-value">{policy.currency} {policy.sum_insured?.toLocaleString()}</span>
                      </div>
                      <div className="policy-detail-item">
                        <CalendarDays size={14} />
                        <span className="detail-label">Valid</span>
                        <span className="detail-value">{policy.effective_from} → {policy.effective_to}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {selectedPayer && selectedPolicy && !validationResult && (
            <div className="mt-6 pt-4" style={{ borderTop: '1px solid var(--border-color)' }}>
              <Button 
                className="w-full" 
                variant="secondary"
                disabled={validating}
                onClick={handleVerifyPolicy}
              >
                {validating ? 'Verifying with Payer...' : 'Verify Policy Status'}
              </Button>
            </div>
          )}

          {validationResult && (
            <div className="mt-6 pt-4" style={{ borderTop: '1px solid var(--border-color)' }}>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '16px', background: 'rgba(16,185,129,0.08)', padding: '12px', borderRadius: '10px' }}>
                <CheckCircle2 size={20} color="var(--success)" />
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--success)' }}>Policy Verified Active</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Payer confirmed eligibility.</div>
                </div>
              </div>
              <Button className="w-full" icon={ArrowRight} onClick={() => onPolicySelected(selectedPayer, selectedPolicy)}>
                Start Cashless Preparation
              </Button>
              <p className="text-center mt-3" style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                Payer: {selectedPayer.name} · Policy: {selectedPolicy.policy_number}
              </p>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
};

export default PayerPolicySelection;
