import { useState, useEffect, useRef } from "react";
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
  ShieldCheck,
  Settings,
  Menu,
  X,
  Sun,
  Moon,
  Bell,
  ChevronRight,
  AlertCircle,
} from "lucide-react";
import "./App.css";
import { USE_MOCK, api } from "./api";

import WorkQueue from "./components/WorkQueue";
import Dashboard from "./components/Dashboard";
import PatientProfile from "./components/PatientProfile";
import Communications from "./components/Communications";
import Payments from "./components/Payments";
import SettingsPage from "./components/Settings";
import CaseWrapper from "./components/wizard/CaseWrapper";

const TASK_POLL_MS = 60_000;

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [theme, setTheme] = useState("light");
  const [apiErrors, setApiErrors] = useState([]);
  const [pendingTaskCount, setPendingTaskCount] = useState(0);
  const [urgentTaskCount, setUrgentTaskCount] = useState(0);
  const taskPollRef = useRef(null);

  const fetchTaskCounts = async () => {
    try {
      const res = await api.listTasks({ status: "pending", limit: 50 });
      const tasks = res?.tasks ?? [];
      setPendingTaskCount(tasks.length);
      setUrgentTaskCount(tasks.filter((t) => t.priority === "urgent" || t.priority === "high").length);
    } catch (_) {}
  };

  useEffect(() => {
    fetchTaskCounts();
    taskPollRef.current = setInterval(fetchTaskCounts, TASK_POLL_MS);
    return () => clearInterval(taskPollRef.current);
  }, []);

  useEffect(() => {
    const handleApiError = (e) => {
      const id = Date.now() + Math.random();
      setApiErrors((prev) => [...prev, { id, message: e.detail }]);
      setTimeout(() => {
        setApiErrors((prev) => prev.filter((err) => err.id !== id));
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
    { to: "/work-queue", icon: ListTodo, label: "Work Queue", badge: pendingTaskCount },
    { to: "/dashboard", icon: LayoutDashboard, label: "Cashless Cases" },
    { to: "/registry", icon: Users, label: "Child Registry" },
    { to: "/communications", icon: MessageSquare, label: "Communications" },
    { to: "/payments", icon: CreditCard, label: "Payments" },
  ];

  const bottomNavItems = [
    { to: "/settings", icon: Settings, label: "Settings" },
  ];

  const getBreadcrumb = () => {
    const parts = location.pathname.split("/").filter(Boolean);
    if (parts.length === 0) return [{ label: "Work Queue" }];
    const map = {
      "work-queue": "Work Queue",
      dashboard: "Cashless Cases",
      registry: "Child Registry",
      communications: "Communications",
      payments: "Payments",
      settings: "Settings",
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
          <div className="sidebar-brand">
            <button
              className="sidebar-toggle"
              onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
              title={isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              <Menu size={18} />
            </button>
            <div className="brand-logo">
              <ShieldCheck color="white" size={22} />
            </div>
            {!isSidebarCollapsed && <h2 className="brand-name">NHCX Portal</h2>}
            <button className="mobile-close-btn" onClick={() => setIsMobileMenuOpen(false)}>
              <X size={24} />
            </button>
          </div>
        </div>

        <nav className="sidebar-nav">
          {navItems.map(({ to, icon: Icon, label, badge }) => (
            <NavLink key={to} to={to} title={label} className={({ isActive }) => (isActive ? "active" : "")}>
              <Icon className="nav-icon" size={20} />
              <span>{label}</span>
              {badge > 0 && !isSidebarCollapsed && (
                <span style={{
                  marginLeft: "auto",
                  minWidth: "20px",
                  height: "20px",
                  borderRadius: "10px",
                  background: urgentTaskCount > 0 ? "var(--error)" : "var(--warning)",
                  color: "white",
                  fontSize: "11px",
                  fontWeight: 700,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "0 5px",
                }}>
                  {badge > 99 ? "99+" : badge}
                </span>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-footer">
          <nav className="sidebar-nav" style={{ flex: "unset" }}>
            {bottomNavItems.map(({ to, icon: Icon, label }) => (
              <NavLink key={to} to={to} title={label} className="">
                <Icon className="nav-icon" size={20} />
                <span>{label}</span>
              </NavLink>
            ))}
          </nav>
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
                  <span style={{
                    color: i === getBreadcrumb().length - 1 ? "var(--text-main)" : "var(--text-muted)",
                    fontWeight: i === getBreadcrumb().length - 1 ? 600 : 400,
                    textTransform: "capitalize",
                  }}>
                    {crumb.label}
                  </span>
                </span>
              ))}
            </div>
          </div>

          <div className="top-actions">
            <span
              title={USE_MOCK ? "Using mock data" : "Live API mode"}
              style={{
                fontSize: "11px", fontWeight: 700, padding: "4px 10px",
                borderRadius: "20px", cursor: "default",
                background: USE_MOCK ? "rgba(245,158,11,0.15)" : "rgba(16,185,129,0.15)",
                color: USE_MOCK ? "#d97706" : "#059669",
                border: `1px solid ${USE_MOCK ? "#fde68a" : "#a7f3d0"}`,
              }}
            >
              {USE_MOCK ? "⚡ MOCK" : "🟢 LIVE"}
            </span>
            <button onClick={toggleTheme} className="theme-toggle">
              {theme === "light" ? <Moon size={20} /> : <Sun size={20} />}
            </button>
            <div
              style={{ position: "relative", cursor: "pointer", display: "flex", alignItems: "center" }}
              onClick={() => navigate("/work-queue")}
              title={pendingTaskCount > 0 ? `${pendingTaskCount} pending tasks` : "No pending tasks"}
            >
              <Bell size={20} className="text-muted" />
              {pendingTaskCount > 0 && (
                <span style={{
                  position: "absolute", top: "-4px", right: "-4px",
                  minWidth: "16px", height: "16px", borderRadius: "8px",
                  background: urgentTaskCount > 0 ? "var(--error)" : "var(--warning)",
                  color: "white", fontSize: "10px", fontWeight: 700,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  padding: "0 3px", border: "2px solid var(--bg-card)",
                }}>
                  {pendingTaskCount > 9 ? "9+" : pendingTaskCount}
                </span>
              )}
            </div>
          </div>
        </header>

        <div className="main-view">
          <AnimatePresence mode="wait">
            <Routes location={location} key={location.pathname.split("/")[1]}>
              <Route path="/" element={<Navigate to="/work-queue" replace />} />
              <Route path="/work-queue" element={<WorkQueue />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/registry" element={<PatientProfile />} />
              <Route path="/communications" element={<Communications />} />
              <Route path="/payments" element={<Payments />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/case/:id/*" element={<CaseWrapper />} />
            </Routes>
          </AnimatePresence>
        </div>
      </main>

      <div style={{ position: "fixed", bottom: "24px", right: "24px", zIndex: 9999, display: "flex", flexDirection: "column", gap: "10px", maxWidth: "380px" }}>
        <AnimatePresence>
          {apiErrors.map((err) => (
            <motion.div
              key={err.id}
              initial={{ opacity: 0, x: 60, scale: 0.92 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 60, scale: 0.88 }}
              transition={{ type: "spring", stiffness: 320, damping: 28 }}
              style={{
                background: "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)",
                color: "white",
                padding: "14px 18px",
                borderRadius: "12px",
                display: "flex",
                alignItems: "flex-start",
                gap: "12px",
                boxShadow: "0 8px 24px rgba(239, 68, 68, 0.35), 0 2px 8px rgba(0,0,0,0.1)",
                border: "1px solid rgba(255,255,255,0.15)",
              }}
            >
              <AlertCircle size={18} style={{ flexShrink: 0, marginTop: "1px" }} />
              <div style={{ fontSize: "13px", fontWeight: 600, lineHeight: 1.5, flex: 1 }}>{err.message}</div>
              <button
                onClick={() => setApiErrors((prev) => prev.filter((e) => e.id !== err.id))}
                style={{ background: "rgba(255,255,255,0.15)", border: "none", color: "white", cursor: "pointer", padding: "4px 6px", display: "flex", borderRadius: "6px", flexShrink: 0, marginTop: "-2px" }}
              >
                <X size={14} />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
