import { useState, useEffect, useCallback } from 'react';
import { Clock, ShieldCheck, Activity, FileCheck, ArrowRight, RefreshCw, AlertCircle } from 'lucide-react';
import { api } from '../api';
import { Card, Button, StatusBadge, PageHeader } from './Common';

const CashlessPreparation = ({ patient, payer, policy, onReadyForPreauth, onBack }) => {
  const [caseData, setCaseData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [polling, setPolling] = useState(false);

  const startPreparation = useCallback(async () => {
    setLoading(true);
    try {
      const claim_id = patient?.latest_claim?.claim_id || 101; 
      const response = await api.prepareCashless({
        claim_id: claim_id,
        child_id: patient?.child_id || 12,
        policyNumber: policy.policyNumber
      });
      setCaseData(response);
      if (response.status === 'pending' || response.status === 'partial') {
        setPolling(true);
      }
    } catch (error) {
      console.error('Error starting preparation:', error);
    } finally {
      setLoading(false);
    }
  }, [patient, policy]);

  useEffect(() => {
    const timer = setTimeout(() => startPreparation(), 0);
    return () => clearTimeout(timer);
  }, [startPreparation]);

  useEffect(() => {
    let interval;
    if (polling && caseData?.case_id) {
      interval = setInterval(async () => {
        try {
          const updatedData = await api.getCashlessStatus(caseData.case_id);
          setCaseData(updatedData);
          if (updatedData.status === 'complete' || updatedData.status === 'failed') {
            setPolling(false);
          }
        } catch (error) {
          console.error('Polling error:', error);
          setPolling(false);
        }
      }, 3000); 
    }
    return () => clearInterval(interval);
  }, [polling, caseData?.case_id]);

  if (loading) return (
    <div className="flex-center py-40 flex-col">
      <div className="spinner mb-6" style={{ width: '60px', height: '60px', borderWidth: '6px' }}></div>
      <h2 className="brand-name" style={{ color: 'var(--primary)' }}>Initializing Workflow...</h2>
      <p className="text-muted">Setting up NHCX gateway context</p>
    </div>
  );

  return (
    <div className="prep-screen-modern">
      <PageHeader 
        title="Cashless Preparation" 
        subtitle={`Verifying eligibility for ${patient?.name || 'Patient'}`}
        backAction={onBack}
      />

      <div className="selection-grid-modern">
        <div className="prep-main-modern">
          <Card title="Case Overview">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '24px' }}>
              <div className="info-block">
                <label style={{ fontSize: '11px', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>Patient</label>
                <div style={{ fontWeight: '600' }}>{patient?.name || 'Rahul Sharma'}</div>
                <small className="text-muted">ID: {patient?.child_id || '10029'}</small>
              </div>
              <div className="info-block">
                <label style={{ fontSize: '11px', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>Insurance Payer</label>
                <div style={{ fontWeight: '600' }}>{payer.name}</div>
                <small className="text-muted">{payer.participant_code}</small>
              </div>
              <div className="info-block">
                <label style={{ fontSize: '11px', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>Policy Context</label>
                <div style={{ fontWeight: '600' }}>{policy.productName}</div>
                <small className="text-muted">#{policy.policyNumber}</small>
              </div>
              <div className="info-block">
                <label style={{ fontSize: '11px', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>Current Step</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: '600', color: 'var(--primary)' }}>
                   <Activity size={14} />
                   {caseData?.current_step?.replace('_', ' ') || 'Validation'}
                </div>
              </div>
            </div>
          </Card>

          <Card title="Clinical Procedures" className="mt-8">
            <div className="table-container-modern">
              <table className="table-modern">
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Procedure Name</th>
                    <th>Category</th>
                    <th>Source</th>
                  </tr>
                </thead>
                <tbody>
                  {caseData?.procedures?.items?.map((proc, i) => (
                    <tr key={i}>
                      <td><code style={{ background: '#f1f5f9', padding: '2px 6px', borderRadius: '4px' }}>{proc.code}</code></td>
                      <td><strong>{proc.name}</strong></td>
                      <td>{proc.category}</td>
                      <td><span className="badge-modern badge-info" style={{ fontSize: '10px' }}>Claim DB</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {caseData?.insurance_plan?.plan_details && (
            <Card title="Insurance Plan Details" className="mt-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '32px' }}>
                <div className="plan-info">
                  <div className="flex-between mb-6">
                    <h4 className="text-primary" style={{ fontSize: '18px', fontWeight: '700' }}>{caseData.insurance_plan.plan_details.name}</h4>
                    <StatusBadge status={caseData.insurance_plan.plan_details.status} />
                  </div>
                  
                  <div className="pricing-box mt-8" style={{ background: '#f8fafc', padding: '20px', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
                    <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px', fontWeight: '600', textTransform: 'uppercase' }}>Available Sum Insured</div>
                    <div style={{ fontSize: '28px', fontWeight: '800', color: '#0f172a' }}>
                      {caseData.insurance_plan.pricing?.currency} {caseData.insurance_plan.pricing?.sum_insured?.toLocaleString()}
                    </div>
                  </div>

                  <div className="doc-requirements mt-8">
                    <h5 style={{ fontSize: '13px', fontWeight: '700', marginBottom: '12px', color: '#475569' }}>DOCUMENT REQUIREMENTS</h5>
                    <div className="flex flex-col gap-3">
                      {caseData.insurance_plan.document_requirements?.map((doc, i) => (
                        <div key={i} className="flex items-center gap-2" style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '14px', color: '#1e293b', marginBottom: '8px' }}>
                          <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--primary)' }}></div>
                          {doc.name}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="policy-scope">
                  <div className="tabs-mini" style={{ display: 'flex', gap: '4px', background: '#f1f5f9', padding: '4px', borderRadius: '10px', marginBottom: '20px' }}>
                    <button style={{ flex: 1, padding: '8px', borderRadius: '8px', border: 'none', background: 'white', fontWeight: '600', fontSize: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>Coverage & Scope</button>
                  </div>

                  <div className="scope-lists" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                    <div>
                      <h5 style={{ fontSize: '11px', fontWeight: '700', color: '#059669', marginBottom: '12px' }}>INCLUSIONS</h5>
                      {caseData.insurance_plan.inclusions?.map((item, i) => (
                        <div key={i} style={{ fontSize: '13px', padding: '8px 12px', background: '#ecfdf5', borderRadius: '8px', marginBottom: '8px', border: '1px solid #d1fae5', color: '#065f46' }}>
                          {item.name}
                        </div>
                      ))}
                    </div>
                    <div>
                      <h5 style={{ fontSize: '11px', fontWeight: '700', color: '#dc2626', marginBottom: '12px' }}>EXCLUSIONS</h5>
                      {caseData.insurance_plan.exclusions?.map((item, i) => (
                        <div key={i} style={{ fontSize: '13px', padding: '8px 12px', background: '#fef2f2', borderRadius: '8px', marginBottom: '8px', border: '1px solid #fee2e2', color: '#991b1b' }}>
                          {item.name}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          )}

          {caseData?.coverage_eligibility?.disposition && (
            <Card title="Coverage Eligibility" className="mt-8">
              <div className="eligibility-outcome mb-8 p-6" style={{ background: '#f0fdf4', borderRadius: '16px', border: '1px solid #d1fae5', display: 'flex', alignItems: 'center', gap: '20px' }}>
                <div style={{ padding: '10px', background: '#22c55e', borderRadius: '10%', color: 'white' }}>
                   <ShieldCheck size={24} />
                </div>
                <div>
                  <div style={{ fontSize: '12px', color: '#166534', fontWeight: '700', textTransform: 'uppercase' }}>Gateway Disposition</div>
                  <div style={{ fontSize: '20px', fontWeight: '700', color: '#14532d' }}>{caseData.coverage_eligibility.disposition}</div>
                </div>
                <div style={{ marginLeft: 'auto', display: 'flex', gap: '12px' }}>
                  <div className="badge-modern" style={{ background: caseData.coverage_eligibility.inforce ? '#ecfdf5' : '#fef2f2', color: caseData.coverage_eligibility.inforce ? '#059669' : '#dc2626' }}>
                    {caseData.coverage_eligibility.inforce ? 'Policy In-Force' : 'Policy Expired'}
                  </div>
                  <div className="badge-modern" style={{ background: '#eff6ff', color: '#2563eb' }}>
                    {caseData.coverage_eligibility.auth_required ? 'Auth Required' : 'No Auth Needed'}
                  </div>
                </div>
              </div>

              <div className="table-container-modern mt-8">
                <h5 style={{ fontSize: '13px', fontWeight: '700', marginBottom: '16px', color: '#475569' }}>BENEFIT ADJUDICATION</h5>
                <table className="table-modern">
                  <thead>
                    <tr>
                      <th>Service Category</th>
                      <th>Product / Service</th>
                      <th>Limit / Allowed</th>
                      <th>Used</th>
                      <th>Requirement</th>
                    </tr>
                  </thead>
                  <tbody>
                    {caseData.coverage_eligibility.insurance_items?.map((bundle) => 
                      bundle.items?.map((item, idx) => (
                        <tr key={`${bundle.coverage}-${idx}`}>
                          <td><span style={{ fontWeight: '600' }}>{item.category?.display}</span></td>
                          <td>{item.productOrService?.display}</td>
                          <td>
                            {item.benefit?.[0]?.allowed?.value ? (
                              <span style={{ fontWeight: '700' }}>{item.benefit[0].allowed.currency} {item.benefit[0].allowed.value.toLocaleString()}</span>
                            ) : '-'}
                          </td>
                          <td>{item.benefit?.[0]?.used?.value || '0'}</td>
                          <td>
                            {item.authorizationRequired ? (
                              <span className="badge-modern badge-warning" style={{ fontSize: '10px' }}>Preauth Req</span>
                            ) : (
                              <span className="badge-modern badge-success" style={{ fontSize: '10px' }}>Direct Claim</span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {caseData.coverage_eligibility.errors?.length > 0 && (
                <div className="mt-6 p-4" style={{ background: '#fffbeb', borderRadius: '12px', border: '1px solid #fef3c7' }}>
                  <div style={{ display: 'flex', gap: '10px', color: '#92400e' }}>
                    <AlertCircle size={18} />
                    <div>
                      <div style={{ fontSize: '14px', fontWeight: '700' }}>Gateway Warnings</div>
                      {caseData.coverage_eligibility.errors.map((err, i) => (
                        <div key={i} style={{ fontSize: '13px' }}>{err.detail}</div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </Card>
          )}
        </div>

        <div className="prep-sidebar-modern">
          <Card title="Gateway Status">
            <div className="status-flow">
              <div className={`status-step ${caseData?.insurance_plan?.status === 'complete' ? 'done' : 'waiting'}`} style={{ borderLeft: '2px solid', paddingLeft: '24px', paddingBottom: '32px', position: 'relative' }}>
                <div style={{ position: 'absolute', left: '-11px', top: '0', width: '20px', height: '20px', borderRadius: '50%', background: caseData?.insurance_plan?.status === 'complete' ? 'var(--success)' : '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>
                  {caseData?.insurance_plan?.status === 'complete' ? <ShieldCheck size={12} /> : <Clock size={12} />}
                </div>
                <div className="flex-between mb-2">
                   <h4 style={{ fontSize: '14px', fontWeight: '600' }}>Insurance Plan</h4>
                   <StatusBadge status={caseData?.insurance_plan?.status} />
                </div>
                <p className="text-muted" style={{ fontSize: '12px' }}>Validating subscriber group policy details...</p>
              </div>

              <div className={`status-step ${caseData?.coverage_eligibility?.status === 'complete' ? 'done' : 'waiting'}`} style={{ borderLeft: '2px solid transparent', paddingLeft: '24px', position: 'relative' }}>
                 <div style={{ position: 'absolute', left: '-11px', top: '0', width: '20px', height: '20px', borderRadius: '50%', background: caseData?.coverage_eligibility?.status === 'complete' ? 'var(--success)' : '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>
                  {caseData?.coverage_eligibility?.status === 'complete' ? <FileCheck size={12} /> : <Clock size={12} />}
                </div>
                <div className="flex-between mb-2">
                   <h4 style={{ fontSize: '14px', fontWeight: '600' }}>Coverage Eligibility</h4>
                   <StatusBadge status={caseData?.coverage_eligibility?.status} />
                </div>
                <p className="text-muted" style={{ fontSize: '12px' }}>Awaiting real-time gateway response.</p>
              </div>
            </div>

            <div className="actions-modern mt-8">
              <Button 
                className="w-full" 
                disabled={caseData?.status !== 'complete'}
                icon={polling ? RefreshCw : ArrowRight}
                onClick={() => onReadyForPreauth(caseData)}
              >
                {polling ? 'Polling Gateway...' : 'Prepare Preauth'}
              </Button>
              {caseData?.status === 'failed' && (
                <Button variant="outline" className="w-full mt-4" icon={AlertCircle} onClick={startPreparation}>
                  Retry Verification
                </Button>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default CashlessPreparation;
