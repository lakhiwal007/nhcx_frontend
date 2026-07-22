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
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
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
  Globe,
} from "lucide-react";
import "./App.css";
import { api, ALL_FACILITIES_MODE_KEY, LAYOUT_DIRECTION_KEY, THEME_KEY } from "./api";
import { getDeepLinkClinicId } from "./sessionBootstrap";

import WorkQueue from "./components/WorkQueue";
import Dashboard from "./components/Dashboard";
import PatientProfile from "./components/PatientProfile";
import Communications from "./components/Communications";
import Payments from "./components/Payments";
import SettingsPage from "./components/Settings";
import CaseWrapper from "./components/wizard/CaseWrapper";
import { LoadingBlock } from "./components/Common";

const TASK_POLL_MS = 60_000;

function RequireProvider({ hasProvider, sessionReady }) {
  if (!sessionReady) return <LoadingBlock text="Loading…" />;
  return hasProvider ? <Outlet /> : <Navigate to="/settings" replace />;
}

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [theme, setTheme] = useState(
    () => localStorage.getItem(THEME_KEY) || "light",
  );
  const [apiErrors, setApiErrors] = useState([]);
  const apiErrorTimers = useRef({});
  const [pendingTaskCount, setPendingTaskCount] = useState(0);
  const [urgentTaskCount, setUrgentTaskCount] = useState(0);
  const [allFacilitiesMode, setAllFacilitiesMode] = useState(
    () => localStorage.getItem(ALL_FACILITIES_MODE_KEY) === "true",
  );
  // Which nav paradigm to render: "A" (dark rail sidebar, default) or "B"
  // (dark top command-bar + breadcrumb strip). A pure presentation choice,
  // toggled from Settings > Appearance.
  const [layoutDirection, setLayoutDirection] = useState(
    () => localStorage.getItem(LAYOUT_DIRECTION_KEY) || "A",
  );
  const [hasProvider, setHasProvider] = useState(
    () => !!localStorage.getItem("nhcx_default_provider_id") || localStorage.getItem(ALL_FACILITIES_MODE_KEY) === "true",
  );
  const [facilityName, setFacilityName] = useState(
    () => localStorage.getItem("nhcx_default_facility_name") || "",
  );
  const [providerId, setProviderId] = useState(
    () => localStorage.getItem("nhcx_default_provider_id") || "",
  );
  const [isAdmin, setIsAdmin] = useState(false);
  const [sessionFacilities, setSessionFacilities] = useState(null);
  const [sessionUserId, setSessionUserId] = useState(null);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [clinicAccessError, setClinicAccessError] = useState(null);
  const [sessionReady, setSessionReady] = useState(false);
  const facilityRecoveryAttempted = useRef(false);
  const taskPollRef = useRef(null);
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    const sync = () => {
      setHasProvider(!!localStorage.getItem("nhcx_default_provider_id") || localStorage.getItem(ALL_FACILITIES_MODE_KEY) === "true");
      setFacilityName(localStorage.getItem("nhcx_default_facility_name") || "");
      setProviderId(localStorage.getItem("nhcx_default_provider_id") || "");
      setAllFacilitiesMode(localStorage.getItem(ALL_FACILITIES_MODE_KEY) === "true");
      // A facility is now resolved (or the user picked one manually), so the
      // next 1011 is a fresh problem, not the one we already tried to fix.
      facilityRecoveryAttempted.current = false;
    };
    window.addEventListener("provider-changed", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("provider-changed", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  // Session bootstrap: learn the user + which facilities they may act as.
  // A `clinic_id` carried on the deep link takes priority over everything
  // else — it's the facility_code the backend itself matches on, so honoring
  // it can never disagree with what the backend will accept, and a mismatch
  // is an access error rather than something to silently fall back from. A
  // lone facility auto-selects; a polyclinic admin who hasn't chosen
  // anything yet is left to pick (or explicitly enter all-facilities view)
  // in Settings, so nothing here forces a default onto them.
  // Shared by the initial bootstrap and by a manual re-fetch after a
  // self-serve facility registration succeeds (see Settings' onSessionRefresh)
  // - both need the same is_admin/facilities/auto-select handling.
  const applySessionResult = (res) => {
    setIsAdmin(!!res?.is_admin);
    setSessionUserId(res?.user?.id ?? null);
    const facilities = res?.facilities || [];
    setSessionFacilities(facilities);
    const hasChosen = !!localStorage.getItem("nhcx_default_provider_id");
    const inAllMode = localStorage.getItem(ALL_FACILITIES_MODE_KEY) === "true";
    if (hasChosen || inAllMode) return;

    const clinicId = getDeepLinkClinicId();
    if (clinicId) {
      const match = facilities.find((f) => String(f.facility_code) === String(clinicId));
      if (match) {
        localStorage.setItem("nhcx_default_provider_id", match.hcx_participant_code);
        localStorage.setItem("nhcx_default_facility_name", match.name || "");
        window.dispatchEvent(new Event("provider-changed"));
      } else if (facilities.length > 0 && !res?.is_admin) {
        // A real access error only when this user has *some* facilities but
        // none match - and they have no self-service way to fix it. Two
        // cases fall through instead of hard-blocking: `facilities: []`
        // (same underlying problem as the Request Access flow in Settings,
        // regardless of `clinic_id`), and admins, who need to reach
        // Settings to onboard the facility or resolve a pending request
        // rather than being stuck on a dead end.
        setClinicAccessError(clinicId);
      }
      return;
    }

    if (facilities.length === 1) {
      const f = facilities[0];
      localStorage.setItem("nhcx_default_provider_id", f.hcx_participant_code);
      localStorage.setItem("nhcx_default_facility_name", f.name || "");
      window.dispatchEvent(new Event("provider-changed"));
    }
  };

  const refreshSession = () => api.getSession().then(applySessionResult);

  useEffect(() => {
    let cancelled = false;
    refreshSession().catch(() => {}).finally(() => {
      if (!cancelled) setSessionReady(true);
    });
    return () => { cancelled = true; };
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
    const MAX_TOASTS = 4;
    const scheduleDismiss = (id) => {
      clearTimeout(apiErrorTimers.current[id]);
      apiErrorTimers.current[id] = setTimeout(() => {
        setApiErrors((prev) => prev.filter((err) => err.id !== id));
        delete apiErrorTimers.current[id];
      }, 5000);
    };
    const handleApiError = (e) => {
      const { message, kind } = e.detail || {};

      // No refresh endpoint exists — a token with no exp claim never expires
      // as far as the wrapper is concerned, so a 401 here means the deep
      // link itself is bad. Retrying gets nowhere; block instead of toasting.
      if (kind === "AUTH_EXPIRED") {
        setSessionExpired(true);
        return;
      }

      // A stale/missing X-Provider-Id after a facility was already resolved
      // (e.g. a race on first load). Re-bootstrap once; if it recurs, the
      // resolution will fail to find a facility and RequireProvider's
      // redirect to /settings surfaces the selector, per doc.
      if (kind === "FACILITY_REQUIRED" && !facilityRecoveryAttempted.current) {
        facilityRecoveryAttempted.current = true;
        api.getSession().then((res) => {
          const facilities = res?.facilities || [];
          const clinicId = getDeepLinkClinicId();
          const match = clinicId
            ? facilities.find((f) => String(f.facility_code) === String(clinicId))
            : facilities.length === 1
              ? facilities[0]
              : null;
          if (match) {
            localStorage.setItem("nhcx_default_provider_id", match.hcx_participant_code);
            localStorage.setItem("nhcx_default_facility_name", match.name || "");
          } else {
            localStorage.removeItem("nhcx_default_provider_id");
            localStorage.removeItem("nhcx_default_facility_name");
          }
          window.dispatchEvent(new Event("provider-changed"));
        }).catch(() => {});
      }

      setApiErrors((prev) => {
        const existing = prev.find((err) => err.message === message);
        if (existing) {
          scheduleDismiss(existing.id);
          return prev.map((err) =>
            err.id === existing.id ? { ...err, count: err.count + 1 } : err,
          );
        }
        const id = Date.now() + Math.random();
        scheduleDismiss(id);
        return [...prev, { id, message, count: 1 }].slice(-MAX_TOASTS);
      });
    };
    window.addEventListener("api-error", handleApiError);
    return () => {
      window.removeEventListener("api-error", handleApiError);
      Object.values(apiErrorTimers.current).forEach(clearTimeout);
      apiErrorTimers.current = {};
    };
  }, []);

  const toggleTheme = () => {
    const newTheme = theme === "light" ? "dark" : "light";
    localStorage.setItem(THEME_KEY, newTheme);
    setTheme(newTheme);
  };

  const toggleLayoutDirection = () => {
    const next = layoutDirection === "B" ? "A" : "B";
    localStorage.setItem(LAYOUT_DIRECTION_KEY, next);
    setLayoutDirection(next);
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
  // Prefer the saved name; fall back to the participant code. In
  // all-facilities mode there is no single facility - every read spans all
  // of them, and no X-Provider-Id is sent at all.
  const facilityLabel = allFacilitiesMode ? "All Facilities" : facilityName || providerId;

  if (sessionExpired || clinicAccessError) {
    return (
      <div data-theme={theme} className="session-block-screen">
        <div className="session-block-card">
          <AlertCircle size={28} color="var(--error)" />
          {sessionExpired ? (
            <>
              <h2>Session expired</h2>
              <p>
                Your session has ended and this app has no way to refresh it on its own.
                Please return to the hospital system and open this patient again.
              </p>
            </>
          ) : (
            <>
              <h2>No access to this clinic</h2>
              <p>
                Your account isn't linked to clinic <strong>{clinicAccessError}</strong>.
                Contact your administrator, or return to the hospital system and try again.
              </p>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      className={`app-container ${isSidebarCollapsed ? "sidebar-collapsed" : ""} ${isMobileMenuOpen ? "mobile-menu-open" : ""} dir-${layoutDirection.toLowerCase()}`}
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

      {layoutDirection === "B" && (
        <>
          <header className="command-bar">
            <div className="command-bar-left">
              <div className="command-brand" onClick={() => navigate("/work-queue")}>
                <div className="command-brand-logo">
                  <ShieldCheck color="white" size={16} />
                </div>
                <span className="command-brand-name">NHCX Service</span>
              </div>
              <nav className="command-nav">
                {navItems.map(({ to, icon: Icon, label, badge }) => (
                  <NavLink
                    key={to}
                    to={to}
                    title={label}
                    className={({ isActive }) => `command-nav-pill${isActive ? " active" : ""}`}
                  >
                    {({ isActive }) => (
                      <>
                        {isActive && (
                          <motion.span
                            className="command-nav-active"
                            layoutId={prefersReducedMotion ? undefined : "command-active-pill"}
                            transition={{ type: "spring", stiffness: 500, damping: 42 }}
                          />
                        )}
                        <Icon size={16} />
                        <span className="command-nav-label">{label}</span>
                        {badge > 0 && (
                          <span
                            className="command-nav-badge"
                            style={{ background: urgentTaskCount > 0 ? "var(--error)" : "var(--warning)" }}
                          >
                            {badge > 99 ? "99+" : badge}
                          </span>
                        )}
                      </>
                    )}
                  </NavLink>
                ))}
                <NavLink
                  to="/settings"
                  title="Settings"
                  className={({ isActive }) => `command-nav-pill command-nav-pill--icon${isActive ? " active" : ""}`}
                >
                  {({ isActive }) => (
                    <>
                      {isActive && (
                        <motion.span
                          className="command-nav-active"
                          layoutId={prefersReducedMotion ? undefined : "command-active-pill"}
                          transition={{ type: "spring", stiffness: 500, damping: 42 }}
                        />
                      )}
                      <Settings size={16} />
                    </>
                  )}
                </NavLink>
              </nav>
            </div>

            <div className="command-bar-right">
              <button
                onClick={() => navigate("/settings")}
                className={`command-facility-btn${allFacilitiesMode ? " is-all" : ""}${!hasProvider ? " is-missing" : ""}`}
                title={
                  !hasProvider
                    ? "No facility selected"
                    : allFacilitiesMode
                      ? "Viewing all facilities (read-only) - click to select one"
                      : `Active facility: ${facilityLabel} - click to switch`
                }
              >
                {!hasProvider ? <Building2 size={13} /> : allFacilitiesMode ? <Globe size={13} /> : <Building2 size={13} />}
                <span className="command-facility-label">{hasProvider ? facilityLabel : "No facility"}</span>
              </button>
              <button onClick={toggleTheme} className="command-icon-btn" title="Toggle theme">
                <AnimatePresence mode="wait" initial={false}>
                  <motion.span
                    key={theme}
                    style={{ display: "flex" }}
                    initial={prefersReducedMotion ? false : { rotate: -90, opacity: 0 }}
                    animate={{ rotate: 0, opacity: 1 }}
                    exit={prefersReducedMotion ? { opacity: 0 } : { rotate: 90, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    {theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
                  </motion.span>
                </AnimatePresence>
              </button>
              <button
                className="command-icon-btn"
                onClick={() => navigate("/work-queue")}
                title={pendingTaskCount > 0 ? `${pendingTaskCount} pending tasks` : "No pending tasks"}
              >
                <Bell size={18} />
                <AnimatePresence>
                  {pendingTaskCount > 0 && (
                    <motion.span
                      key={pendingTaskCount}
                      className="notif-badge"
                      style={{ background: urgentTaskCount > 0 ? "var(--error)" : "var(--warning)" }}
                      initial={prefersReducedMotion ? false : { scale: 0.4, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0.4, opacity: 0 }}
                      transition={{ type: "spring", stiffness: 500, damping: 20 }}
                    >
                      {pendingTaskCount > 9 ? "9+" : pendingTaskCount}
                    </motion.span>
                  )}
                </AnimatePresence>
              </button>
            </div>
          </header>

          <div className="breadcrumb-strip">
            <div className="breadcrumb-modern">
              <span onClick={() => navigate("/work-queue")} style={{ cursor: "pointer" }} className="breadcrumb-link">
                Home
              </span>
              {getBreadcrumb().map((crumb, i, arr) => {
                const isLast = i === arr.length - 1;
                return (
                  <span key={i} className="crumb-step">
                    <ChevronRight size={14} />
                    {isLast ? (
                      <span className="crumb-current">{crumb.label}</span>
                    ) : (
                      <span onClick={() => navigate(crumb.to)} className="breadcrumb-link crumb-link">
                        {crumb.label}
                      </span>
                    )}
                  </span>
                );
              })}
            </div>
          </div>
        </>
      )}

      <div className="app-body">
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
            {!isSidebarCollapsed && <h2 className="brand-name">NHCX Service</h2>}
            <button className="mobile-close-btn" onClick={() => setIsMobileMenuOpen(false)}>
              <X size={24} />
            </button>
          </div>
        </div>

        {hasProvider && (
          <button
            onClick={() => navigate("/settings")}
            title={allFacilitiesMode ? "Viewing all facilities (read-only) - click to select one" : `Active facility: ${facilityLabel} - click to switch`}
            className="sidebar-facility"
            style={{
              padding: isSidebarCollapsed ? "9px 0" : "9px 11px",
              justifyContent: isSidebarCollapsed ? "center" : "flex-start",
            }}
          >
            {allFacilitiesMode
              ? <Globe size={16} style={{ flexShrink: 0, color: "var(--info)" }} />
              : <Building2 size={16} style={{ flexShrink: 0, color: "var(--primary)" }} />}
            {!isSidebarCollapsed && (
              <span className="sidebar-facility-text">
                <span className="sidebar-facility-label">{allFacilitiesMode ? "Viewing" : "Active facility"}</span>
                <span className="sidebar-facility-name">{facilityLabel}</span>
              </span>
            )}
          </button>
        )}

        {!isSidebarCollapsed && <div className="sidebar-nav-label">Workspace</div>}
        <nav className="sidebar-nav">
          {navItems.map(({ to, icon: Icon, label, badge }) => (
            <NavLink key={to} to={to} title={label} className={({ isActive }) => (isActive ? "active" : "")}>
              {({ isActive }) => (
                <>
                  {isActive && (
                    <motion.span
                      className="nav-active-pill"
                      layoutId={prefersReducedMotion ? undefined : "sidebar-active-pill"}
                      transition={{ type: "spring", stiffness: 500, damping: 42 }}
                    />
                  )}
                  <Icon className="nav-icon" size={20} />
                  <span className="nav-label">{label}</span>
                  {badge > 0 && !isSidebarCollapsed && (
                    <span
                      className="nav-badge"
                      style={{ background: urgentTaskCount > 0 ? "var(--error)" : "var(--warning)" }}
                    >
                      {badge > 99 ? "99+" : badge}
                    </span>
                  )}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-footer">
          <nav className="sidebar-nav" style={{ flex: "unset" }}>
            {bottomNavItems.map(({ to, icon: Icon, label }) => (
              <NavLink key={to} to={to} title={label} className="">
                <Icon className="nav-icon" size={20} />
                <span className="nav-label">{label}</span>
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
                Home
              </span>
              {getBreadcrumb().map((crumb, i, arr) => {
                const isLast = i === arr.length - 1;
                return (
                  <span key={i} className="crumb-step">
                    <ChevronRight size={14} />
                    {isLast ? (
                      <span className="crumb-current">{crumb.label}</span>
                    ) : (
                      <span onClick={() => navigate(crumb.to)} className="breadcrumb-link crumb-link">
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
                  borderRadius: "var(--radius-pill)", cursor: "pointer",
                  background: "color-mix(in srgb, var(--error) 12%, transparent)",
                  color: "var(--error)",
                  border: "1px solid color-mix(in srgb, var(--error) 30%, transparent)",
                }}
              >
                <Building2 size={13} />
                No facility selected
              </button>
            )}
            {hasProvider && (
              <button
                onClick={() => navigate("/settings")}
                title={allFacilitiesMode ? "Viewing all facilities (read-only) - click to select one" : `Active facility: ${facilityLabel}${facilityName && providerId ? ` · ${providerId}` : ""} - click to switch`}
                style={{
                  display: "flex", alignItems: "center", gap: "7px",
                  maxWidth: "260px",
                  fontSize: "12px", fontWeight: 600, padding: "5px 12px",
                  borderRadius: "var(--radius-pill)", cursor: "pointer",
                  background: allFacilitiesMode ? "color-mix(in srgb, var(--info) 12%, transparent)" : "var(--primary-light)",
                  color: allFacilitiesMode ? "var(--info)" : "var(--primary)",
                  border: allFacilitiesMode ? "1px solid color-mix(in srgb, var(--info) 30%, transparent)" : "1px solid var(--primary-light)",
                }}
              >
                {allFacilitiesMode
                  ? <Globe size={13} style={{ flexShrink: 0 }} />
                  : <Building2 size={13} style={{ flexShrink: 0 }} />}
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {facilityLabel}
                </span>
              </button>
            )}
            <button onClick={toggleTheme} className="theme-toggle" style={{ overflow: "hidden" }}>
              <AnimatePresence mode="wait" initial={false}>
                <motion.span
                  key={theme}
                  style={{ display: "flex" }}
                  initial={prefersReducedMotion ? false : { rotate: -90, opacity: 0 }}
                  animate={{ rotate: 0, opacity: 1 }}
                  exit={prefersReducedMotion ? { opacity: 0 } : { rotate: 90, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  {theme === "light" ? <Moon size={20} /> : <Sun size={20} />}
                </motion.span>
              </AnimatePresence>
            </button>
            <div
              style={{ position: "relative", cursor: "pointer", display: "flex", alignItems: "center" }}
              onClick={() => navigate("/work-queue")}
              title={pendingTaskCount > 0 ? `${pendingTaskCount} pending tasks` : "No pending tasks"}
            >
              <Bell size={20} className="text-muted" />
              <AnimatePresence>
                {pendingTaskCount > 0 && (
                  <motion.span
                    key={pendingTaskCount}
                    className="notif-badge"
                    style={{ background: urgentTaskCount > 0 ? "var(--error)" : "var(--warning)" }}
                    initial={prefersReducedMotion ? false : { scale: 0.4, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.4, opacity: 0 }}
                    transition={{ type: "spring", stiffness: 500, damping: 20 }}
                  >
                    {pendingTaskCount > 9 ? "9+" : pendingTaskCount}
                  </motion.span>
                )}
              </AnimatePresence>
            </div>
          </div>
        </header>

        <div className="main-view">
          <AnimatePresence mode="wait">
            <Routes location={location} key={location.pathname.split("/")[1]}>
              <Route path="/" element={<Navigate to="/work-queue" replace />} />
              <Route
                path="/settings"
                element={
                  <SettingsPage
                    isAdmin={isAdmin}
                    sessionFacilities={sessionFacilities}
                    sessionUserId={sessionUserId}
                    onSessionRefresh={refreshSession}
                    allFacilitiesMode={allFacilitiesMode}
                    theme={theme}
                    onToggleTheme={toggleTheme}
                    layoutDirection={layoutDirection}
                    onToggleLayoutDirection={toggleLayoutDirection}
                  />
                }
              />
              <Route element={<RequireProvider hasProvider={hasProvider} sessionReady={sessionReady} />}>
                <Route path="/work-queue" element={<WorkQueue allFacilitiesMode={allFacilitiesMode} />} />
                <Route path="/dashboard" element={<Dashboard allFacilitiesMode={allFacilitiesMode} />} />
                <Route path="/registry" element={<PatientProfile />} />
                <Route path="/communications" element={<Communications allFacilitiesMode={allFacilitiesMode} />} />
                <Route path="/payments" element={<Payments />} />
                <Route path="/case/:id/*" element={<CaseWrapper />} />
              </Route>
            </Routes>
          </AnimatePresence>
        </div>
      </main>
      </div>

      <div style={{ position: "fixed", bottom: "24px", right: "24px", zIndex: "var(--z-toast)", display: "flex", flexDirection: "column", gap: "10px", maxWidth: "380px" }}>
        <AnimatePresence>
          {apiErrors.map((err) => (
            <motion.div
              key={err.id}
              initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, x: 60, scale: 0.92 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, x: 60, scale: 0.88 }}
              transition={{ type: "spring", stiffness: 320, damping: 28 }}
              style={{
                background: "linear-gradient(135deg, var(--error) 0%, color-mix(in srgb, var(--error) 70%, black) 100%)",
                color: "white",
                padding: "14px 18px",
                borderRadius: "var(--radius-md)",
                display: "flex",
                alignItems: "flex-start",
                gap: "12px",
                boxShadow: "0 8px 24px color-mix(in srgb, var(--error) 40%, transparent), inset 0 1px 0 rgba(255,255,255,0.25)",
                border: "1px solid rgba(255,255,255,0.15)",
              }}
            >
              <AlertCircle size={18} style={{ flexShrink: 0, marginTop: "1px" }} />
              <div style={{ fontSize: "13px", fontWeight: 600, lineHeight: 1.5, flex: 1 }}>
                {err.message}
                {err.count > 1 && ` (×${err.count})`}
              </div>
              <button
                onClick={() => setApiErrors((prev) => prev.filter((e) => e.id !== err.id))}
                style={{ background: "rgba(255,255,255,0.15)", border: "none", color: "white", cursor: "pointer", padding: "4px 6px", display: "flex", borderRadius: "var(--radius-xs)", flexShrink: 0, marginTop: "-2px" }}
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
