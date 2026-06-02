import { useState, useEffect } from "react";
import {
  Routes,
  Route,
  NavLink,
  useNavigate,
  useLocation,
} from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard,
  ClipboardList,
  ListTodo,
  MessageSquare,
  CreditCard,
  ShieldCheck,
  ChevronRight,
  LogOut,
  Menu,
  X,
  Sun,
  Moon,
  Bell,
  Users,
} from "lucide-react";
import "./App.css";
import Dashboard from "./components/Dashboard";
import ChildRegistry from "./components/ChildRegistry";
import PayerPolicySelection from "./components/PayerPolicySelection";
import CashlessPreparation from "./components/CashlessPreparation";
import PreauthReview from "./components/PreauthReview";
import PreauthStatus from "./components/PreauthStatus";
import WorkQueue from "./components/WorkQueue";
import ClaimsScreen from "./components/ClaimsScreen";
import ReprocessScreen from "./components/ReprocessScreen";
import PaymentScreen from "./components/PaymentScreen";
import CommunicationsScreen from "./components/CommunicationsScreen";
import { api, USE_MOCK } from "./api";
import { Button } from "./components/Common";
import {
  saveWorkflow, loadWorkflow, clearWorkflow, listActiveWorkflows
} from "./workflowStorage";

function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [theme, setTheme] = useState("light");

  const toggleTheme = () => {
    const newTheme = theme === "light" ? "dark" : "light";
    setTheme(newTheme);
    document.documentElement.setAttribute("data-theme", newTheme);
  };

  useEffect(() => {
    const timer = setTimeout(() => setIsMobileMenuOpen(false), 0);
    return () => clearTimeout(timer);
  }, [location.pathname]);

  // Shared workflow state — all snake_case per API spec
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [selectedPayer, setSelectedPayer] = useState(null);
  const [selectedPolicy, setSelectedPolicy] = useState(null);
  const [cashlessCase, setCashlessCase] = useState(null);
  const [preauthResponse, setPreauthResponse] = useState(null);
  const [preauthDraft, setPreauthDraft] = useState(null);

  // ─── Restore from localStorage on direct URL load / page refresh ──────────
  useEffect(() => {
    const pathParts = location.pathname.split("/");
    if (pathParts[1] === "claims" && pathParts[2] && !selectedPatient) {
      const patientId = Number(pathParts[2]);
      const saved = loadWorkflow(patientId);
      if (saved) {
        if (saved.patient)  setSelectedPatient(saved.patient);
        if (saved.payer)    setSelectedPayer(saved.payer);
        if (saved.policy)   setSelectedPolicy(saved.policy);
        if (saved.cashlessCase)    setCashlessCase(saved.cashlessCase);
        if (saved.preauthResponse) setPreauthResponse(saved.preauthResponse);
        if (saved.preauthDraft)    setPreauthDraft(saved.preauthDraft);
        // Don't re-navigate — user is already on the right route
      }
    }
  }, [location.pathname]); // eslint-disable-line

  // ─── Navigation handlers ──────────────────────────────────────────────────

  // ─── Helper: persist current state after every step ──────────────────────
  const persist = (patch = {}) => {
    const childId = patch.patient?.child_id || selectedPatient?.child_id;
    if (!childId) return;
    saveWorkflow(childId, {
      patient:         patch.patient         ?? selectedPatient,
      payer:           patch.payer           ?? selectedPayer,
      policy:          patch.policy          ?? selectedPolicy,
      cashlessCase:    patch.cashlessCase    ?? cashlessCase,
      preauthResponse: patch.preauthResponse ?? preauthResponse,
      preauthDraft:    patch.preauthDraft    ?? preauthDraft,
      resumeRoute:     patch.resumeRoute     ?? location.pathname.split("/")[3]
    });
  };

  // ─── Resume a saved workflow ───────────────────────────────────────────────
  const resumeWorkflow = (childId) => {
    const saved = loadWorkflow(childId);
    if (!saved) return;
    if (saved.patient)         setSelectedPatient(saved.patient);
    if (saved.payer)           setSelectedPayer(saved.payer);
    if (saved.policy)          setSelectedPolicy(saved.policy);
    if (saved.cashlessCase)    setCashlessCase(saved.cashlessCase);
    if (saved.preauthResponse) setPreauthResponse(saved.preauthResponse);
    if (saved.preauthDraft)    setPreauthDraft(saved.preauthDraft);
    const route = saved.resumeRoute || 'payer';
    navigate(`/claims/${childId}/${route}`);
  };

  // ─── Navigation handlers (each one calls persist) ─────────────────────────

  const startNewWorkflow = (patient, targetRoute = 'payer') => {
    setSelectedPatient(patient);
    persist({ patient, resumeRoute: targetRoute });
    navigate(`/claims/${patient.child_id}/${targetRoute}`);
  };

  const handlePolicySelected = (payer, policy) => {
    setSelectedPayer(payer);
    setSelectedPolicy(policy);
    const patientId = selectedPatient?.child_id || location.pathname.split("/")[2];
    persist({ payer, policy, resumeRoute: 'prep' });
    navigate(`/claims/${patientId}/prep`);
  };

  const handleReadyForPreauth = (prepData) => {
    setCashlessCase(prepData);
    const patientId = selectedPatient?.child_id || location.pathname.split("/")[2];
    persist({ cashlessCase: prepData, resumeRoute: 'review' });
    navigate(`/claims/${patientId}/review`);
  };

  const handlePreauthSubmitted = (response, draft) => {
    setPreauthResponse(response);
    if (draft) setPreauthDraft(draft);
    const patientId = selectedPatient?.child_id || location.pathname.split("/")[2];
    persist({ preauthResponse: response, preauthDraft: draft ?? preauthDraft, resumeRoute: 'status' });
    navigate(`/claims/${patientId}/status`);
  };

  const handleNavigateClaims = () => {
    const patientId = selectedPatient?.child_id || location.pathname.split("/")[2];
    persist({ resumeRoute: 'claim' });
    navigate(`/claims/${patientId}/claim`);
  };

  const handleNavigateReprocess = () => {
    const patientId = selectedPatient?.child_id || location.pathname.split("/")[2];
    persist({ resumeRoute: 'reprocess' });
    navigate(`/claims/${patientId}/reprocess`);
  };

  const handleNavigatePayment = () => {
    const patientId = selectedPatient?.child_id || location.pathname.split("/")[2];
    persist({ resumeRoute: 'payment' });
    navigate(`/claims/${patientId}/payment`);
  };

  const resetWorkflow = () => {
    const childId = selectedPatient?.child_id;
    setSelectedPatient(null);
    setSelectedPayer(null);
    setSelectedPolicy(null);
    setCashlessCase(null);
    setPreauthResponse(null);
    setPreauthDraft(null);
    if (childId) clearWorkflow(childId);
    navigate("/");
  };

  // ─── Nav items ────────────────────────────────────────────────────────────
  const navItems = [
    { to: "/work-queue", icon: ListTodo, label: "Work Queue", exact: true },
    {
      to: "/",
      icon: LayoutDashboard,
      label: "Cashless Cases",
      match: (p) => p === "/" || p.startsWith("/claims"),
    },
    { to: "/registry", icon: Users, label: "Child Registry" },
    { to: "/communications", icon: MessageSquare, label: "Communications" },
    { to: "/payments", icon: CreditCard, label: "Payments" },
  ];

  const getBreadcrumb = () => {
    const parts = location.pathname.split("/").filter(Boolean);
    if (parts.length === 0) return [{ label: "Cashless Cases" }];
    const map = {
      "work-queue": "Work Queue",
      registry: "Child Registry",
      communications: "Communications",
      payments: "Payments",
      "new-cashless": "New Cashless",
      claims: "Claims",
      payer: "Payer & Policy",
      prep: "Eligibility",
      review: "Preauth Draft",
      status: "Preauth Status",
      claim: "Claim Submission",
      reprocess: "Reprocess",
      payment: "Payment",
    };
    return parts.map((p) => ({
      label: isNaN(p) ? map[p] || p : `Patient #${p}`,
    }));
  };

  return (
    <div
      className={`app-container ${isSidebarCollapsed ? "sidebar-collapsed" : ""} ${isMobileMenuOpen ? "mobile-menu-open" : ""}`}
      data-theme={theme}
    >
      {/* Mobile overlay */}
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

      {/* Sidebar */}
      <aside
        className={`sidebar ${isSidebarCollapsed ? "collapsed" : ""} ${isMobileMenuOpen ? "mobile-show" : ""}`}
      >
        <div className="sidebar-header-wrapper">
          <div className="sidebar-actions-desktop">
            <button
              className="sidebar-toggle"
              onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
              style={{
                background: "transparent",
                border: "none",
                color: "#94a3b8",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                padding: "8px",
                marginBottom: "16px",
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
            <button
              className="mobile-close-btn"
              onClick={() => setIsMobileMenuOpen(false)}
            >
              <X size={24} />
            </button>
          </div>
        </div>

        <nav className="sidebar-nav">
          {navItems.map(({ to, icon: Icon, label, match }) => (
            <NavLink
              key={to}
              to={to}
              title={label}
              className={({ isActive }) => {
                const active = match ? match(location.pathname) : isActive;
                return active ? "active" : "";
              }}
            >
              <Icon className="nav-icon" size={20} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-footer">
          <a
            href="#"
            className="logout-link"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              color: "#94a3b8",
              fontSize: "13px",
              textDecoration: "none",
              padding: "8px 12px",
            }}
          >
            <LogOut size={16} /> {!isSidebarCollapsed && <span>Sign Out</span>}
          </a>
        </div>
      </aside>

      {/* Main */}
      <main className="content">
        <header className="top-bar">
          <div className="top-bar-left">
            <button
              className="mobile-menu-btn"
              onClick={() => setIsMobileMenuOpen(true)}
            >
              <Menu size={24} />
            </button>
            <div className="breadcrumb-modern">
              Portal
              {getBreadcrumb().map((crumb, i) => (
                <span
                  key={i}
                  style={{ display: "flex", alignItems: "center", gap: "6px" }}
                >
                  <ChevronRight size={14} />
                  <span
                    style={{
                      color:
                        i === getBreadcrumb().length - 1
                          ? "var(--text-main)"
                          : "var(--text-muted)",
                      fontWeight: i === getBreadcrumb().length - 1 ? 600 : 400,
                    }}
                  >
                    {crumb.label}
                  </span>
                </span>
              ))}
            </div>
          </div>
          <div className="top-actions">
            {/* Mode badge */}
            <span
              title={USE_MOCK ? 'Using dummy data — set USE_MOCK=false in src/api.js for real calls' : `Live: ${import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api/v1/insurance'}`}
              style={{
                fontSize: '11px', fontWeight: 700, letterSpacing: '0.5px', padding: '4px 10px',
                borderRadius: '20px', cursor: 'default',
                background: USE_MOCK ? 'rgba(245,158,11,0.15)' : 'rgba(16,185,129,0.15)',
                color: USE_MOCK ? '#d97706' : '#059669',
                border: `1px solid ${USE_MOCK ? '#fde68a' : '#a7f3d0'}`
              }}
            >
              {USE_MOCK ? '⚡ MOCK' : '🟢 LIVE'}
            </span>
            <button
              onClick={toggleTheme}
              style={{
                background: "transparent",
                border: "none",
                cursor: "pointer",
                color: "var(--text-muted)",
                padding: "8px",
                display: "flex",
                alignItems: "center",
              }}
            >
              {theme === "light" ? <Moon size={20} /> : <Sun size={20} />}
            </button>
            <div style={{ position: "relative", cursor: "pointer" }}>
              <Bell size={20} className="text-muted" />
              <span
                style={{
                  position: "absolute",
                  top: "-4px",
                  right: "-4px",
                  width: "8px",
                  height: "8px",
                  background: "var(--error)",
                  borderRadius: "50%",
                  border: "2px solid white",
                }}
              />
            </div>
          </div>
        </header>

        <div className="main-view">
          <AnimatePresence mode="wait">
            <Routes location={location} key={location.pathname}>
              {/* Work Queue — default landing */}
              <Route path="/work-queue" element={<WorkQueue />} />

              {/* Dashboard / Cashless Cases */}
              <Route
                path="/"
                element={
                  <Dashboard
                    onSelectPatient={startNewWorkflow}
                    onResume={resumeWorkflow}
                    onNavigate={(path) => navigate(path)}
                  />
                }
              />
              <Route
                path="/registry"
                element={<ChildRegistry startNewWorkflow={startNewWorkflow} />}
              />

              {/* New Cashless — starts patient search at root */}
              <Route
                path="/new-cashless"
                element={
                  <Dashboard
                    onSelectPatient={startNewWorkflow}
                    onResume={resumeWorkflow}
                    onNavigate={(path) => navigate(path)}
                  />
                }
              />

              {/* Fallback for /claims with no patient */}
              <Route
                path="/claims"
                element={
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                  >
                    <div className="empty-view">
                      <ClipboardList
                        size={48}
                        className="text-muted mb-6 mx-auto"
                        style={{ opacity: 0.2 }}
                      />
                      <h2>No Active Claim</h2>
                      <p className="text-muted">
                        Select a patient from the dashboard to begin.
                      </p>
                      <Button
                        onClick={() => navigate("/")}
                        className="mt-8"
                        variant="primary"
                      >
                        Go to Dashboard
                      </Button>
                    </div>
                  </motion.div>
                }
              />

              {/* Step 2: Payer & Policy */}
              <Route
                path="/claims/:patientId/payer"
                element={
                  <PayerPolicySelection
                    patient={selectedPatient}
                    onPolicySelected={handlePolicySelected}
                    onBack={() => navigate("/")}
                  />
                }
              />

              {/* Step 3: Eligibility Preparation */}
              <Route
                path="/claims/:patientId/prep"
                element={
                  <CashlessPreparation
                    patient={selectedPatient}
                    payer={selectedPayer}
                    policy={selectedPolicy}
                    onReadyForPreauth={handleReadyForPreauth}
                    onBack={() =>
                      navigate(`/claims/${selectedPatient?.child_id}/payer`)
                    }
                  />
                }
              />

              {/* Step 4: Preauth Draft Review */}
              <Route
                path="/claims/:patientId/review"
                element={
                  <PreauthReview
                    patient={selectedPatient}
                    payer={selectedPayer}
                    policy={selectedPolicy}
                    cashlessCase={cashlessCase}
                    onSubmit={(response, draft) =>
                      handlePreauthSubmitted(response, draft)
                    }
                    onBack={() =>
                      navigate(`/claims/${selectedPatient?.child_id}/prep`)
                    }
                  />
                }
              />

              {/* Step 5: Preauth Status */}
              <Route
                path="/claims/:patientId/status"
                element={
                  <PreauthStatus
                    correlationId={preauthResponse?.correlation_id}
                    preauthData={preauthDraft || cashlessCase}
                    patient={selectedPatient}
                    payer={selectedPayer}
                    policy={selectedPolicy}
                    onDone={resetWorkflow}
                    onNavigateClaims={handleNavigateClaims}
                    onNavigateReprocess={handleNavigateReprocess}
                  />
                }
              />

              {/* Step 6: Claim Submission */}
              <Route
                path="/claims/:patientId/claim"
                element={
                  <ClaimsScreen
                    patient={selectedPatient}
                    payer={selectedPayer}
                    policy={selectedPolicy}
                    cashlessCase={cashlessCase}
                    preauthData={preauthDraft}
                    onBack={() =>
                      navigate(`/claims/${selectedPatient?.child_id}/status`)
                    }
                    onDone={resetWorkflow}
                  />
                }
              />

              {/* Step 7: Reprocess / Appeal */}
              <Route
                path="/claims/:patientId/reprocess"
                element={
                  <ReprocessScreen
                    patient={selectedPatient}
                    payer={selectedPayer}
                    policy={selectedPolicy}
                    cashlessCase={cashlessCase}
                    preauthData={preauthDraft}
                    onBack={() => navigate(-1)}
                    onDone={handleNavigatePayment}
                  />
                }
              />

              {/* Step 8: Payment */}
              <Route
                path="/claims/:patientId/payment"
                element={
                  <PaymentScreen
                    patient={selectedPatient}
                    payer={selectedPayer}
                    policy={selectedPolicy}
                    cashlessCase={cashlessCase}
                    onBack={() => navigate(-1)}
                    onDone={resetWorkflow}
                  />
                }
              />

              {/* Standalone screens */}
              <Route
                path="/communications"
                element={<CommunicationsScreen />}
              />
              <Route
                path="/payments"
                element={
                  <PaymentScreen
                    patient={selectedPatient}
                    payer={selectedPayer}
                    policy={selectedPolicy}
                    cashlessCase={cashlessCase}
                    onBack={() => navigate("/")}
                    onDone={resetWorkflow}
                  />
                }
              />
            </Routes>
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}

export default App;
