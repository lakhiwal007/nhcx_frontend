import React, { useState, useEffect } from 'react';
import { Routes, Route, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  LayoutDashboard, 
  ClipboardList, 
  Building2, 
  Bell, 
  ShieldCheck,
  ChevronRight,
  LogOut,
  Menu,
  X,
} from 'lucide-react';
import './App.css';
import Dashboard from './components/Dashboard';
import PayerPolicySelection from './components/PayerPolicySelection';
import CashlessPreparation from './components/CashlessPreparation';
import PreauthReview from './components/PreauthReview';
import PreauthStatus from './components/PreauthStatus';
import PayerNetwork from './components/PayerNetwork';
import { Button } from './components/Common';

function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  
  // Close mobile menu on route change
  useEffect(() => {
    const timer = setTimeout(() => setIsMobileMenuOpen(false), 0);
    return () => clearTimeout(timer);
  }, [location.pathname]);

  // Shared Workflow State
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [selectedPayer, setSelectedPayer] = useState(null);
  const [selectedPolicy, setSelectedPolicy] = useState(null);
  const [cashlessCase, setCashlessCase] = useState(null);
  const [preauthResponse, setPreauthResponse] = useState(null);

  const startNewWorkflow = (patient) => {
    setSelectedPatient(patient);
    navigate(`/claims/${patient.child_id}/payer`);
  };

  const handlePolicySelected = (payer, policy) => {
    setSelectedPayer(payer);
    setSelectedPolicy(policy);
    const patientId = selectedPatient?.child_id || location.pathname.split('/')[2];
    navigate(`/claims/${patientId}/prep`);
  };

  const handleReadyForPreauth = (prepData) => {
    setCashlessCase(prepData);
    const patientId = selectedPatient?.child_id || location.pathname.split('/')[2];
    navigate(`/claims/${patientId}/review`);
  };

  const handlePreauthSubmitted = (response) => {
    setPreauthResponse(response);
    const patientId = selectedPatient?.child_id || location.pathname.split('/')[2];
    navigate(`/claims/${patientId}/status`);
  };

  const resetWorkflow = () => {
    setSelectedPatient(null);
    setSelectedPayer(null);
    setSelectedPolicy(null);
    setCashlessCase(null);
    setPreauthResponse(null);
    navigate('/');
  };

  return (
    <div className={`app-container ${isSidebarCollapsed ? 'sidebar-collapsed' : ''} ${isMobileMenuOpen ? 'mobile-menu-open' : ''}`}>
      {/* Mobile Overlay */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="mobile-overlay"
            onClick={() => setIsMobileMenuOpen(false)}
          />
        )}
      </AnimatePresence>

      <aside className={`sidebar ${isSidebarCollapsed ? 'collapsed' : ''} ${isMobileMenuOpen ? 'mobile-show' : ''}`}>
        <div className="sidebar-header-wrapper">
          <div className="sidebar-actions-desktop">
            <button 
              className="sidebar-toggle" 
              onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
              style={{ 
                background: 'transparent',
                border: 'none',
                color: '#94a3b8',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                padding: '8px',
                marginBottom: '16px'
              }}
            >
              <Menu size={24} />
            </button>
          </div>

          <div className="sidebar-brand">
            <div className="brand-logo">
              <ShieldCheck color="white" size={24} />
            </div>
            {!isSidebarCollapsed && <h2 className="brand-name">NHCX Portal</h2>}
            
            <button className="mobile-close-btn" onClick={() => setIsMobileMenuOpen(false)}>
              <X size={24} />
            </button>
          </div>
        </div>
        
        <nav className="sidebar-nav">
          <NavLink 
            to="/" 
            className={({ isActive }) => (isActive || location.pathname.startsWith('/claims')) ? 'active' : ''} 
            title="Claims Management"
          >
            <LayoutDashboard className="nav-icon" size={20} /> 
            <span>Claims Management</span>
          </NavLink>
          
          <NavLink to="/payers" className={({ isActive }) => isActive ? 'active' : ''} title="Payer Network">
            <Building2 className="nav-icon" size={20} /> 
            <span>Payer Network</span>
          </NavLink>
        </nav>

        <div className="sidebar-footer">
          
          <a href="#" className="mt-4 logout-link" style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#94a3b8', fontSize: '13px', textDecoration: 'none', padding: '8px 12px' }}>
            <LogOut size={16} /> <span>Sign Out</span>
          </a>
        </div>
      </aside>
      
      <main className="content">
        <header className="top-bar">
          <div className="top-bar-left">
            <button className="mobile-menu-btn" onClick={() => setIsMobileMenuOpen(true)}>
              <Menu size={24} />
            </button>
            <div className="breadcrumb-modern">
              Portal {location.pathname.split('/').map((p, i) => p && (
                <React.Fragment key={i}>
                  <ChevronRight size={14} />
                  <span className={i === location.pathname.split('/').length - 1 ? 'active' : ''}>
                    {p.charAt(0).toUpperCase() + p.slice(1).replace(/-/g, ' ')}
                  </span>
                </React.Fragment>
              ))}
            </div>
          </div>
          
          <div className="top-actions">
            
            <div style={{ position: 'relative', cursor: 'pointer' }}>
              <Bell size={20} className="text-muted" />
              <span style={{ position: 'absolute', top: '-4px', right: '-4px', width: '8px', height: '8px', background: 'var(--error)', borderRadius: '50%', border: '2px solid white' }}></span>
            </div>
          </div>
        </header>
        
        <div className="main-view">
          <AnimatePresence mode="wait">
            <Routes location={location} key={location.pathname}>
              <Route path="/" element={<Dashboard onSelectPatient={startNewWorkflow} />} />
              
              <Route path="/claims" element={
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <div className="empty-view">
                    <ClipboardList size={48} className="text-muted mb-6 mx-auto" style={{ opacity: 0.2 }} />
                    <h2>No Active Claim</h2>
                    <p className="text-muted">Select a patient from the Dashboard to begin the NHCX cashless journey.</p>
                    <Button onClick={() => navigate('/')} className="mt-8" variant="primary">Go to Dashboard</Button>
                  </div>
                </motion.div>
              } />
              
              <Route path="/claims/:patientId/payer" element={
                <PayerPolicySelection 
                  patient={selectedPatient} 
                  onPolicySelected={handlePolicySelected}
                  onBack={() => navigate('/')}
      
                />
              } />
              
              <Route path="/claims/:patientId/prep" element={
                <CashlessPreparation 
                  patient={selectedPatient}
                  payer={selectedPayer}
                  policy={selectedPolicy}
                  onReadyForPreauth={handleReadyForPreauth}
                  onBack={() => navigate(`/claims/${selectedPatient?.child_id}/payer`)}
                />
              } />
              
              <Route path="/claims/:patientId/review" element={
                <PreauthReview 
                  patient={selectedPatient}
                  payer={selectedPayer}
                  policy={selectedPolicy}
                  cashlessCase={cashlessCase}
                  onSubmit={handlePreauthSubmitted}
                  onBack={() => navigate(`/claims/${selectedPatient?.child_id}/prep`)}
                />
              } />
              
              <Route path="/claims/:patientId/status" element={
                <PreauthStatus 
                  correlationId={preauthResponse?.correlation_id}
                  onDone={resetWorkflow}
                />
              } />

              <Route path="/payers" element={<PayerNetwork />} />
              
            </Routes>
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}

export default App;
