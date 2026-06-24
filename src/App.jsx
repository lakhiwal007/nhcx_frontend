import { useState, useEffect, useRef } from "react";
import {
  Routes,
  Route,
  Outlet,
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
  Building2,
} from "lucide-react";
import "./App.css";
import { api } from "./api";

import WorkQueue from "./components/WorkQueue";
import Dashboard from "./components/Dashboard";
import PatientProfile from "./components/PatientProfile";
import Communications from "./components/Communications";
import Payments from "./components/Payments";
import SettingsPage from "./components/Settings";
import CaseWrapper from "./components/wizard/CaseWrapper";

const TASK_POLL_MS = 60_000;

function RequireProvider({ hasProvider }) {
  return hasProvider ? <Outlet /> : <Navigate to="/settings" replace />;
}

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [theme, setTheme] = useState("light");
  const [apiErrors, setApiErrors] = useState([]);
  const [pendingTaskCount, setPendingTaskCount] = useState(0);
  const [urgentTaskCount, setUrgentTaskCount] = useState(0);
  const [hasProvider, setHasProvider] = useState(
    () => !!localStorage.getItem("nhcx_default_provider_id"),
  );
  const [facilityName, setFacilityName] = useState(
    () => localStorage.getItem("nhcx_default_facility_name") || "",
  );
  const [providerId, setProviderId] = useState(
    () => localStorage.getItem("nhcx_default_provider_id") || "",
  );
  const taskPollRef = useRef(null);

  useEffect(() => {
    const sync = () => {
      setHasProvider(!!localStorage.getItem("nhcx_default_provider_id"));
      setFacilityName(localStorage.getItem("nhcx_default_facility_name") || "");
      setProviderId(localStorage.getItem("nhcx_default_provider_id") || "");
    };
    window.addEventListener("provider-changed", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("provider-changed", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const fetchTaskCounts = async () => {
    try {
      const res = await api.listTasks({ status: "pending", limit: 50 });
      const tasks = res?.tasks ?? [];
      setPendingTaskCount(tasks.length);
      setUrgentTaskCount(tasks.filter((t) => t.priority === "urgent" || t.priority === "high").length);
    } catch (_) {}
  };

  useEffect(() => {
    if (!hasProvider) {
      clearInterval(taskPollRef.current);
      setPendingTaskCount(0);
      setUrgentTaskCount(0);
      return;
    }
    fetchTaskCounts();
    taskPollRef.current = setInterval(fetchTaskCounts, TASK_POLL_MS);
    return () => clearInterval(taskPollRef.current);
  }, [hasProvider]);

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
    if (parts.length === 0) return [{ label: "Work Queue", to: "/work-queue" }];
    const map = {
      "work-queue": "Work Queue",
      dashboard: "Cashless Cases",
      registry: "Child Registry",
      communications: "Communications",
      payments: "Payments",
      settings: "Settings",
      case: "Cashless Case",
    };
    return parts.map((p, i) => ({
      label: isNaN(Number(p)) ? map[p] || p : `#${p}`,
      // The "Cashless Case" crumb has no standalone route — send it to the
      // Cashless Cases list instead of the dead /case path.
      to: p === "case" ? "/dashboard" : "/" + parts.slice(0, i + 1).join("/"),
    }));
  };

  // The facility whose context (X-Provider-Id) every API call is scoped to.
  // Prefer the saved name; fall back to the participant code.
  const facilityLabel = facilityName || providerId;

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

        {hasProvider && (
          <button
            onClick={() => navigate("/settings")}
            title={`Active facility: ${facilityLabel} — click to switch`}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              width: "100%",
              textAlign: "left",
              cursor: "pointer",
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: "10px",
              padding: isSidebarCollapsed ? "9px 0" : "9px 11px",
              justifyContent: isSidebarCollapsed ? "center" : "flex-start",
              marginBottom: "16px",
              color: "#fff",
            }}
          >
            <Building2 size={16} style={{ flexShrink: 0, color: "var(--primary)" }} />
            {!isSidebarCollapsed && (
              <span style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                <span style={{ fontSize: "9.5px", letterSpacing: "0.08em", textTransform: "uppercase", color: "rgba(255,255,255,0.5)" }}>
                  Active facility
                </span>
                <span style={{ fontSize: "12.5px", fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: "#fff" }}>
                  {facilityLabel}
                </span>
              </span>
            )}
          </button>
        )}

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
              <span
                onClick={() => navigate("/work-queue")}
                style={{ cursor: "pointer" }}
                className="breadcrumb-link"
              >
                Portal
              </span>
              {getBreadcrumb().map((crumb, i, arr) => {
                const isLast = i === arr.length - 1;
                return (
                  <span key={i} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <ChevronRight size={14} />
                    {isLast ? (
                      <span style={{
                        color: "var(--text-main)",
                        fontWeight: 600,
                        textTransform: "capitalize",
                      }}>
                        {crumb.label}
                      </span>
                    ) : (
                      <span
                        onClick={() => navigate(crumb.to)}
                        className="breadcrumb-link"
                        style={{
                          color: "var(--text-muted)",
                          fontWeight: 400,
                          textTransform: "capitalize",
                          cursor: "pointer",
                        }}
                      >
                        {crumb.label}
                      </span>
                    )}
                  </span>
                );
              })}
            </div>
          </div>

          <div className="top-actions">
            {!hasProvider && (
              <button
                onClick={() => navigate("/settings")}
                style={{
                  display: "flex", alignItems: "center", gap: "6px",
                  fontSize: "12px", fontWeight: 600, padding: "5px 12px",
                  borderRadius: "20px", cursor: "pointer",
                  background: "rgba(239,68,68,0.12)",
                  color: "var(--error)",
                  border: "1px solid rgba(239,68,68,0.3)",
                }}
              >
                <Building2 size={13} />
                No facility selected
              </button>
            )}
            {hasProvider && (
              <button
                onClick={() => navigate("/settings")}
                title={`Active facility: ${facilityLabel}${facilityName && providerId ? ` · ${providerId}` : ""} — click to switch`}
                style={{
                  display: "flex", alignItems: "center", gap: "7px",
                  maxWidth: "260px",
                  fontSize: "12px", fontWeight: 600, padding: "5px 12px",
                  borderRadius: "20px", cursor: "pointer",
                  background: "var(--primary-light)",
                  color: "var(--primary)",
                  border: "1px solid var(--primary-light)",
                }}
              >
                <Building2 size={13} style={{ flexShrink: 0 }} />
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {facilityLabel}
                </span>
              </button>
            )}
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
              <Route path="/settings" element={<SettingsPage />} />
              <Route element={<RequireProvider hasProvider={hasProvider} />}>
                <Route path="/work-queue" element={<WorkQueue />} />
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/registry" element={<PatientProfile />} />
                <Route path="/communications" element={<Communications />} />
                <Route path="/payments" element={<Payments />} />
                <Route path="/case/:id/*" element={<CaseWrapper />} />
              </Route>
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
