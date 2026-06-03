import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, User, Calendar, Phone, Activity, FileText, ChevronDown, ChevronRight, Stethoscope, Receipt, BadgeIndianRupee, Building2, PlayCircle, Plus } from "lucide-react";
import { api } from "../api";
import { PageHeader, Card, StatusBadge, Button, Input, TaskCard } from "./Common";
import { useNavigate } from "react-router-dom";

export default function PatientProfile() {
  const navigate = useNavigate();
  const [children, setChildren] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPatient, setSelectedPatient] = useState(null);
  
  // Extra data for selected patient
  const [tasks, setTasks] = useState([]);
  const [communications, setCommunications] = useState([]);
  const [loadingExtra, setLoadingExtra] = useState(false);
  
  const [expandedVisit, setExpandedVisit] = useState(0);

  const fetchChildren = useCallback(async (name = "") => {
    setLoading(true);
    try {
      const response = await api.searchChildren({ name });
      setChildren(response?.children || []);
    } catch (error) {
      console.error("Error fetching children:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchChildren(searchQuery);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchQuery, fetchChildren]);

  useEffect(() => {
    if (!selectedPatient) return;
    const fetchExtra = async () => {
      setLoadingExtra(true);
      try {
        const [tasksRes, commsRes] = await Promise.all([
          api.listTasks({ child_id: selectedPatient.child_id }),
          api.listCommunications({ child_id: selectedPatient.child_id })
        ]);
        setTasks(tasksRes?.tasks || []);
        setCommunications(commsRes?.communications || []);
      } catch (err) {
        console.error(err);
      } finally {
        setLoadingExtra(false);
      }
    };
    fetchExtra();
  }, [selectedPatient]);

  const calculateAge = (dob) => {
    if (!dob) return "N/A";
    const diff = new Date() - new Date(dob);
    return Math.abs(new Date(diff).getUTCFullYear() - 1970);
  };

  const startNewWorkflow = (patient, visit) => {
    // Navigate to wizard for this patient, passing admission_id
    navigate(`/case/${patient.child_id}/payer`, { state: { admission_id: visit?.admission_no } });
  };

  return (
    <div className="patient-profile-screen" style={{ display: 'flex', flexDirection: 'column', gap: '24px', height: 'calc(100vh - 120px)', overflowY: 'auto' }}>
      
      {/* Top Search Area */}
      <div style={{ margin: '0 auto', width: '100%', maxWidth: '700px', display: 'flex', flexDirection: 'column', gap: '16px', alignItems: 'center', paddingTop: selectedPatient ? '20px' : '10vh', transition: 'padding-top 0.4s ease' }}>
        <h2 style={{ fontSize: '32px', fontWeight: 800 }}>Child Registry</h2>
        <p className="text-muted" style={{ fontSize: '15px', marginBottom: '8px', textAlign: 'center' }}>Search for a pediatric patient to view their 360° profile or start a new cashless case.</p>
        
        <div style={{ width: '100%', position: 'relative' }}>
          <Input
            icon={Search}
            placeholder="Search by patient name or ID..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              if (selectedPatient) setSelectedPatient(null);
            }}
          />
          
          {/* Dropdown Results */}
          {searchQuery && !selectedPatient && (
            <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '12px', marginTop: '8px', zIndex: 10, boxShadow: 'var(--shadow-lg)', maxHeight: '400px', overflowY: 'auto' }}>
              {loading ? (
                <div className="flex-center py-6"><div className="spinner" /></div>
              ) : children.length === 0 ? (
                <div className="text-center py-6 text-muted">No patients found matching "{searchQuery}"</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {children.map((child, idx) => (
                    <div 
                      key={child.child_id}
                      onClick={() => setSelectedPatient(child)}
                      style={{
                        padding: '16px 20px',
                        cursor: 'pointer',
                        borderBottom: idx !== children.length - 1 ? '1px solid var(--border-color)' : 'none',
                        transition: 'background 0.2s'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.background = 'var(--primary-light)'}
                      onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                        <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'rgba(79, 70, 229, 0.1)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '16px' }}>
                          {child.name?.charAt(0).toUpperCase()}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 700, fontSize: '15px', color: 'var(--text-main)' }}>{child.name}</div>
                          <div style={{ display: 'flex', gap: '12px', fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                            <span>ID: #{child.child_id}</span>
                            <span>{child.gender}</span>
                            <span>{calculateAge(child.dob)} yrs</span>
                          </div>
                        </div>
                        <ChevronRight size={18} color="var(--text-muted)" />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Initial Empty State */}
      {!selectedPatient && !searchQuery && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex-center flex-col h-full" style={{ opacity: 0.5, marginTop: '20px' }}>
          <User size={64} className="text-muted mb-4" />
          <h3 style={{ fontSize: '20px', fontWeight: 600 }}>Registry Search</h3>
          <p className="text-muted mt-2">Start typing above to find patients in the registry.</p>
        </motion.div>
      )}

      {/* Patient Profile Content */}
      {selectedPatient && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} style={{ paddingBottom: '40px', width: '100%', maxWidth: '1200px', margin: '0 auto', marginTop: '20px' }}>
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px', background: 'var(--bg-card)', padding: '24px', borderRadius: '16px', border: '1px solid var(--border-color)', boxShadow: 'var(--shadow-sm)' }}>
            <div style={{ display: "flex", alignItems: "center", gap: "24px" }}>
              <div style={{ width: '72px', height: '72px', borderRadius: '50%', background: 'var(--primary)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '28px' }}>
                {selectedPatient.name?.[0]?.toUpperCase()}
              </div>
              <div>
                <h2 style={{ fontSize: "28px", fontWeight: 800, marginBottom: "8px" }}>{selectedPatient.name}</h2>
                <div style={{ display: "flex", gap: "16px", flexWrap: "wrap", fontSize: '14px', color: 'var(--text-muted)' }}>
                  <span className="badge-modern badge-info" style={{ fontSize: "12px" }}>#{selectedPatient.child_id}</span>
                  <span style={{ textTransform: "capitalize", display: 'flex', alignItems: 'center', gap: '4px' }}><User size={14} /> {selectedPatient.gender}</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Calendar size={14} /> {selectedPatient.dob} ({calculateAge(selectedPatient.dob)} yrs)</span>
                  {selectedPatient.mobile && <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Phone size={14} /> {selectedPatient.mobile}</span>}
                </div>
              </div>
            </div>
          </div>

          <div className="grid-1-to-3" style={{ gap: '24px' }}>
            {/* Left Column: Visits & Claims */}
            <div style={{ gridColumn: 'span 2', display: 'flex', flexDirection: 'column', gap: '24px' }}>
              <Card title="Visits & Admissions">
                {selectedPatient.visits?.length === 0 ? (
                  <div className="text-muted py-8 text-center" style={{ background: 'var(--bg-main)', borderRadius: '12px' }}>No previous visits found.</div>
                ) : (
                  selectedPatient.visits?.map((visit, vi) => (
                    <div key={vi} style={{ marginBottom: '16px', border: '1px solid var(--border-color)', borderRadius: '12px', overflow: 'hidden' }}>
                      <div onClick={() => setExpandedVisit(expandedVisit === vi ? null : vi)} style={{ padding: '16px', background: 'var(--bg-main)', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <span className="badge-modern badge-info" style={{ textTransform: 'uppercase' }}>{visit.visit_type}</span>
                          <strong style={{ fontSize: '14px' }}>{visit.admission_no || `Visit ${vi+1}`}</strong>
                          <StatusBadge status={visit.status} />
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', color: 'var(--text-muted)', fontSize: '13px' }}>
                          <span>{new Date(visit.started_at).toLocaleDateString()}</span>
                          {expandedVisit === vi ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                        </div>
                      </div>
                      
                      <AnimatePresence>
                        {expandedVisit === vi && (
                          <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} style={{ overflow: 'hidden' }}>
                            <div style={{ padding: '16px', borderTop: '1px solid var(--border-color)' }}>
                              {/* Diagnoses */}
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
                                <div>
                                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', marginBottom: '4px' }}>Diagnosis</div>
                                  <div>{visit.diagnosis || '—'}</div>
                                </div>
                                <div>
                                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', marginBottom: '4px' }}>Primary Doctor</div>
                                  <div>{visit.primary_doctor?.name || '—'}</div>
                                </div>
                              </div>

                              {/* Claims */}
                              {visit.claims?.length > 0 && (
                                <div>
                                  <div style={{ fontSize: '12px', fontWeight: 700, marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <BadgeIndianRupee size={14} /> Associated Claims
                                  </div>
                                  {visit.claims.map((claim, ci) => (
                                    <div key={ci} style={{ background: 'var(--bg-main)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                      <div>
                                        <div style={{ fontWeight: 700, fontSize: '13px' }}>Claim #{claim.claim_id}</div>
                                        <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>{claim.payer_name} • {claim.policy_number}</div>
                                      </div>
                                      <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                                        <div style={{ textAlign: 'right' }}>
                                          <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Billed</div>
                                          <div style={{ fontWeight: 700, color: 'var(--primary)' }}>₹{claim.total_billed?.toLocaleString()}</div>
                                        </div>
                                        <StatusBadge status={claim.status} />
                                        <Button variant="outline" size="small" onClick={() => navigate(`/case/${selectedPatient.child_id}/`)}>Open</Button>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}

                              {/* Start Workflow for this admission */}
                              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--border-color)' }}>
                                <Button variant="primary" icon={Plus} onClick={() => startNewWorkflow(selectedPatient, visit)}>
                                  Start Cashless Case
                                </Button>
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  ))
                )}
              </Card>
            </div>

            {/* Right Column: Tasks & Comms */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              <Card title="Tasks for this patient">
                {loadingExtra ? <div className="flex-center py-8"><div className="spinner" /></div> : tasks.length === 0 ? (
                  <p className="text-muted text-center py-8" style={{ fontSize: '13px', background: 'var(--bg-main)', borderRadius: '8px' }}>No pending tasks.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {tasks.map(task => (
                      <div key={task.task_id} style={{ borderLeft: '3px solid var(--primary)', padding: '12px', background: 'var(--bg-main)', borderRadius: '8px', borderRight: '1px solid var(--border-color)', borderTop: '1px solid var(--border-color)', borderBottom: '1px solid var(--border-color)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                          <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--primary)' }}>{task.task_type?.replace(/_/g, ' ')}</span>
                          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{new Date(task.created_at).toLocaleDateString()}</span>
                        </div>
                        <div style={{ fontSize: '13px', fontWeight: 600 }}>{task.title}</div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>

              <Card title="Communications">
                {loadingExtra ? <div className="flex-center py-8"><div className="spinner" /></div> : communications.length === 0 ? (
                  <p className="text-muted text-center py-8" style={{ fontSize: '13px', background: 'var(--bg-main)', borderRadius: '8px' }}>No communications.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {communications.map(comm => (
                      <div key={comm.correlation_id} style={{ padding: '12px', background: 'var(--bg-main)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                          <span style={{ fontSize: '12px', fontWeight: 600 }}>{comm.topic_display}</span>
                          <span className={`badge-modern badge-${comm.priority === 'high' ? 'warning' : 'info'}`} style={{ fontSize: '10px' }}>{comm.priority}</span>
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>From: {comm.payer_code}</div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
}
