import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, User, Calendar, Phone, Activity, ArrowRight, UserPlus, FileText } from 'lucide-react';
import { api } from '../api';
import { Card, Button, Input, StatusBadge, PageHeader } from './Common';
import PatientModal from './PatientModal';

const ChildRegistry = ({ startNewWorkflow }) => {
  const [children, setChildren] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [modalPatient, setModalPatient] = useState(null);

  const fetchChildren = useCallback(async (name = '') => {
    setLoading(true);
    try {
      const response = await api.searchChildren({ name });
      setChildren(response?.children || []);
    } catch (error) {
      console.error('Error fetching children:', error);
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

  const calculateAge = (dob) => {
    if (!dob) return 'N/A';
    const diff = new Date() - new Date(dob);
    const ageDate = new Date(diff);
    return Math.abs(ageDate.getUTCFullYear() - 1970);
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.1 }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0 }
  };

  return (
    <div className="registry-screen">
      <PageHeader 
        title="Child Registry" 
        subtitle="Search and view patient records, or initiate new cashless workflows."
      />

      <Card className="mb-6">
        <div style={{ maxWidth: '600px' }}>
          <Input
            icon={Search}
            placeholder="Search patients by name or ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </Card>

      {loading ? (
        <div className="flex-center py-20 flex-col">
          <div className="spinner mb-4" />
          <p className="text-muted">Searching registry...</p>
        </div>
      ) : children.length === 0 ? (
        <div className="empty-view py-20">
          <User size={48} className="text-muted mb-4" style={{ opacity: 0.5 }} />
          <h3>No Patients Found</h3>
          <p className="text-muted text-center mt-2" style={{ maxWidth: '400px' }}>
            Try adjusting your search criteria. You can search by patient name or child ID.
          </p>
        </div>
      ) : (
        <motion.div 
          className="grid-1-to-3"
          variants={containerVariants}
          initial="hidden"
          animate="show"
        >
          {children.map(child => (
            <motion.div key={child.child_id} variants={itemVariants} style={{ height: '100%' }}>
              <Card style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                <div className="flex-between mb-4">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ 
                      width: '40px', height: '40px', borderRadius: '50%', 
                      background: 'var(--primary-light)', color: 'var(--primary)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontWeight: 700, fontSize: '16px'
                    }}>
                      {child.name?.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: 'var(--text-main)' }}>
                        {child.name}
                      </h4>
                      <code style={{ fontSize: '11px', color: 'var(--text-muted)' }}>ID: #{child.child_id}</code>
                    </div>
                  </div>
                  {child.gender && (
                    <span className="badge-modern badge-info" style={{ fontSize: '10px' }}>
                      {child.gender}
                    </span>
                  )}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px', color: 'var(--text-muted)', marginBottom: '20px' }}>
                  {child.dob && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Calendar size={14} />
                      <span>{child.dob} ({calculateAge(child.dob)} yrs)</span>
                    </div>
                  )}
                  {child.mobile && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Phone size={14} />
                      <span>{child.mobile}</span>
                    </div>
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <FileText size={14} />
                    <span>{child.cashless_cases_count || 0} Cashless Cases</span>
                  </div>
                </div>

                <div style={{ marginTop: 'auto', paddingTop: '16px', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  {child.latest_claim ? (
                     <div style={{ fontSize: '11px' }}>
                       <span className="text-muted">Latest: </span>
                       <StatusBadge status={child.latest_claim.status} />
                     </div>
                  ) : (
                     <span className="text-muted" style={{ fontSize: '11px' }}>No prior claims</span>
                  )}
                  
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <Button 
                      variant="outline" 
                      size="small" 
                      onClick={() => setModalPatient(child)}
                    >
                      View Details
                    </Button>
                    <Button 
                      variant="primary" 
                      size="small" 
                      onClick={() => startNewWorkflow(child)}
                    >
                      Start Workflow
                    </Button>
                  </div>
                </div>
              </Card>
            </motion.div>
          ))}
        </motion.div>
      )}

      {/* Patient Detail Modal */}
      <AnimatePresence>
        {modalPatient && (
          <PatientModal
            patient={modalPatient}
            onClose={() => setModalPatient(null)}
            onStartWorkflow={startNewWorkflow}
          />
        )}
      </AnimatePresence>
    </div>
  );
};

export default ChildRegistry;
