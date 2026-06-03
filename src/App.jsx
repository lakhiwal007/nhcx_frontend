import { useState, useEffect } from "react";
import {
  Routes,
  Route,
  NavLink,
  useNavigate,
  useLocation,
  Navigate,
} from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  ListTodo,
  LayoutDashboard,
  Users,
  MessageSquare,
  CreditCard,
  Building2,
  ShieldCheck,
  Menu,
  X,
  Sun,
  Moon,
  Bell,
  LogOut,
  ChevronRight,
  AlertCircle,
} from "lucide-react";
import "./App.css";
import { USE_MOCK } from "./api";

import WorkQueue from "./components/WorkQueue";
import Dashboard from "./components/Dashboard";
import PatientProfile from "./components/PatientProfile";
import Communications from "./components/Communications";
import Payments from "./components/Payments";
import CaseWrapper from "./components/wizard/CaseWrapper";

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [theme, setTheme] = useState("light");
  const [apiErrors, setApiErrors] = useState([]);

  useEffect(() => {
    const handleApiError = (e) => {
      const id = Date.now() + Math.random();
      setApiErrors(prev => [...prev, { id, message: e.detail }]);
      setTimeout(() => {
        setApiErrors(prev => prev.filter(err => err.id !== id));
      }, 5000);
    };
    window.addEventListener("api-error", handleApiError);
    return () => window.removeEventListener("api-error", handleApiError);
  }, []);

  const toggleTheme = () => {
    const newTheme = theme === "light" ? "dark" : "light";
    setTheme(newTheme);
    document.documentElement.setAttribute("data-theme", newTheme);
  };

  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [location.pathname]);

  const navItems = [
    { to: "/work-queue", icon: ListTodo, label: "Work Queue" },
    { to: "/dashboard", icon: LayoutDashboard, label: "Cashless Cases" },
    { to: "/registry", icon: Users, label: "Child Registry" },
    { to: "/communications", icon: MessageSquare, label: "Communications" },
    { to: "/payments", icon: CreditCard, label: "Payments" },
  ];

  const getBreadcrumb = () => {
    const parts = location.pathname.split("/").filter(Boolean);
    if (parts.length === 0) return [{ label: "Work Queue" }];
    
    // Customize breadcrumb based on path
    const map = {
      "work-queue": "Work Queue",
      dashboard: "Cashless Cases",
      registry: "Child Registry",
      communications: "Communications",
      payments: "Payments",
      case: "Cashless Case",
    };

    return parts.map((p) => ({
      label: isNaN(Number(p)) ? map[p] || p : `#${p}`,
    }));
  };

  return (
    <div
      className={`app-container ${isSidebarCollapsed ? "sidebar-collapsed" : ""} ${isMobileMenuOpen ? "mobile-menu-open" : ""}`}
      data-theme={theme}
    >
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

      <aside className={`sidebar ${isSidebarCollapsed ? "collapsed" : ""} ${isMobileMenuOpen ? "mobile-show" : ""}`}>
        <div className="sidebar-header-wrapper">
          <div className="sidebar-actions-desktop">
            <button
              className="sidebar-toggle"
              onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
            >
              <Menu size={20} />
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
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink key={to} to={to} title={label} className={({ isActive }) => (isActive ? "active" : "")}>
              <Icon className="nav-icon" size={20} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-footer">
          <a href="#" className="logout-link">
            <LogOut size={16} /> {!isSidebarCollapsed && <span>Sign Out</span>}
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
              Portal
              {getBreadcrumb().map((crumb, i) => (
                <span key={i} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <ChevronRight size={14} />
                  <span
                    style={{
                      color: i === getBreadcrumb().length - 1 ? "var(--text-main)" : "var(--text-muted)",
                      fontWeight: i === getBreadcrumb().length - 1 ? 600 : 400,
                      textTransform: 'capitalize'
                    }}
                  >
                    {crumb.label}
                  </span>
                </span>
              ))}
            </div>
          </div>
          
          <div className="top-actions">
            <span
              title={USE_MOCK ? 'Using mock data' : 'Live API mode'}
              style={{
                fontSize: '11px', fontWeight: 700, padding: '4px 10px',
                borderRadius: '20px', cursor: 'default',
                background: USE_MOCK ? 'rgba(245,158,11,0.15)' : 'rgba(16,185,129,0.15)',
                color: USE_MOCK ? '#d97706' : '#059669',
                border: `1px solid ${USE_MOCK ? '#fde68a' : '#a7f3d0'}`
              }}
            >
              {USE_MOCK ? '⚡ MOCK' : '🟢 LIVE'}
            </span>
            <button onClick={toggleTheme} className="theme-toggle">
              {theme === "light" ? <Moon size={20} /> : <Sun size={20} />}
            </button>
            <div style={{ position: "relative", cursor: "pointer", display: 'flex', alignItems: 'center' }}>
              <Bell size={20} className="text-muted" />
              <span style={{
                position: "absolute", top: "-2px", right: "-2px", width: "8px", height: "8px",
                background: "var(--error)", borderRadius: "50%", border: "2px solid var(--bg-card)"
              }} />
            </div>
          </div>
        </header>

        <div className="main-view">
          <AnimatePresence mode="wait">
            <Routes location={location} key={location.pathname.split('/')[1]}>
              <Route path="/" element={<Navigate to="/work-queue" replace />} />
              <Route path="/work-queue" element={<WorkQueue />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/registry" element={<PatientProfile />} />
              <Route path="/communications" element={<Communications />} />
              <Route path="/payments" element={<Payments />} />
              <Route path="/case/:id/*" element={<CaseWrapper />} />
            </Routes>
          </AnimatePresence>
        </div>
      </main>

      {/* Global API Error Toasts */}
      <div style={{ position: 'fixed', bottom: '24px', right: '24px', zIndex: 9999, display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <AnimatePresence>
          {apiErrors.map(err => (
            <motion.div
              key={err.id}
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, scale: 0.9 }}
              style={{ background: 'var(--error)', color: 'white', padding: '12px 16px', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '12px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}
            >
              <AlertCircle size={20} />
              <div style={{ fontSize: '14px', fontWeight: 600 }}>{err.message}</div>
              <button 
                onClick={() => setApiErrors(prev => prev.filter(e => e.id !== err.id))}
                style={{ background: 'transparent', border: 'none', color: 'white', cursor: 'pointer', padding: '4px', display: 'flex' }}
              >
                <X size={16} />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
