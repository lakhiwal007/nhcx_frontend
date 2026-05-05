import { useState, useEffect, useCallback } from 'react';
import { Search, Shield, ArrowRight, Filter } from 'lucide-react';
import { api } from '../api';
import { Card, Button, Input, StatusBadge, PageHeader } from './Common';

const PayerPolicySelection = ({ patient, onPolicySelected, onBack }) => {
  const [payers, setPayers] = useState([]);
  const [selectedPayer, setSelectedPayer] = useState(null);
  const [policies, setPolicies] = useState([]);
  const [loadingPayers, setLoadingPayers] = useState(false);
  const [loadingPolicies, setLoadingPolicies] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

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
    const timer = setTimeout(() => searchPayers(), 0);
    return () => clearTimeout(timer);
  }, [searchPayers]);

  const handlePayerSelect = async (payer) => {
    setSelectedPayer(payer);
    setLoadingPolicies(true);
    try {
      const response = await api.fetchPolicies({
        patientId: patient?.child_id?.toString() || '12',
        payerCode: payer.participant_code
      });
      setPolicies(response.data.policies || []);
    } catch (error) {
      console.error('Error fetching policies:', error);
    } finally {
      setLoadingPolicies(false);
    }
  };

  return (
    <div className="selection-screen-modern">
      <PageHeader 
        title="Payer & Policy Selection" 
        subtitle="Identify the insurance payer and verify policy coverage."
        backAction={onBack}
      />

      <div className="selection-grid-modern">
        <Card title="Insurance Payers" headerAction={<Filter size={18} className="text-muted" />}>
          <div className="mb-6">
            <Input 
              icon={Search}
              placeholder="Search payers..." 
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                searchPayers(e.target.value);
              }}
            />
          </div>
          <div className="list-container-modern">
            {loadingPayers ? (
              <div className="loading py-12 text-center">
                <div className="spinner mx-auto mb-4" style={{ width: '32px', height: '32px' }}></div>
                <p className="text-muted" style={{ fontSize: '13px' }}>Searching NHCX network...</p>
              </div>
            ) : (
              payers.map((payer) => (
                <div 
                  key={payer.participant_code} 
                  className={`list-item-modern ${selectedPayer?.participant_code === payer.participant_code ? 'selected' : ''}`}
                  onClick={() => handlePayerSelect(payer)}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <div className="avatar-sm" style={{ width: '40px', height: '40px', borderRadius: '10px', background: '#eef2ff', color: '#4f46e5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Shield size={20} />
                    </div>
                    <div className="item-info">
                      <span className="item-title">{payer.name}</span>
                      <span className="item-subtitle">{payer.scheme_type}</span>
                    </div>
                  </div>
                  <StatusBadge status={payer.status} />
                </div>
              ))
            )}
          </div>
        </Card>

        <Card title={selectedPayer ? `Policies for ${selectedPayer.name}` : 'Available Policies'}>
          <div className="list-container-modern">
            {loadingPolicies ? (
              <div className="loading py-12 text-center">
                <div className="spinner mx-auto mb-4"></div>
                <p className="text-muted">Fetching coverage details...</p>
              </div>
            ) : !selectedPayer ? (
              <div className="empty-state text-center py-20">
                <Shield size={48} className="mx-auto mb-4 text-muted" style={{ opacity: 0.2 }} />
                <p className="text-muted">Select a payer from the left to view active policies.</p>
              </div>
            ) : (
              policies.map((policy) => (
                <div key={policy.policyNumber} className="card-modern mb-4 p-6" style={{ border: '1px solid var(--border-color)', background: '#fcfcfd' }}>
                  <div className="policy-header mb-4 flex-between">
                    <div>
                      <span className="policy-title" style={{ fontSize: '18px', fontWeight: '700', color: 'var(--primary)', display: 'block' }}>{policy.productName}</span>
                      <span className="policy-id text-muted" style={{ fontSize: '13px' }}>ID: {policy.policyNumber}</span>
                    </div>
                    <StatusBadge status={policy.status} />
                  </div>
                  
                  <div className="policy-details-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
                    <div className="detail">
                      <label style={{ fontSize: '11px', textTransform: 'uppercase', color: '#64748b', fontWeight: '600' }}>Coverage Limit</label>
                      <div style={{ fontWeight: '700', fontSize: '16px' }}>{policy.currency} {policy.sumInsured.toLocaleString()}</div>
                    </div>
                    <div className="detail">
                      <label style={{ fontSize: '11px', textTransform: 'uppercase', color: '#64748b', fontWeight: '600' }}>Effective Until</label>
                      <div style={{ fontWeight: '700', fontSize: '16px' }}>{policy.effectiveTo}</div>
                    </div>
                  </div>
                  
                  <Button className="w-full" icon={ArrowRight} onClick={() => onPolicySelected(selectedPayer, policy)}>
                    Start Cashless Prep
                  </Button>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>
    </div>
  );
};

export default PayerPolicySelection;
