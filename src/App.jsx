import { useState, useEffect, useRef } from "react";
import { Routes, Route, Outlet, useLocation, Navigate } from "react-router-dom";
import { useReducedMotion } from "framer-motion";
import { AlertCircle } from "lucide-react";
import "./App.css";
import { api, ALL_FACILITIES_MODE_KEY, LAYOUT_DIRECTION_KEY, THEME_KEY, SIDEBAR_COLLAPSED_KEY, clearSessionToken, setReadOnlySession } from "./api";
import { ReadOnlyContext } from "./lib/readOnly";
import { getDeepLinkClinicId } from "./lib/sessionBootstrap";
import { PageActionsSlot } from "./lib/pageActions";
import { navItemsFor, crumbsFor, pageTitleFor, badgeText } from "./shell/shellNav";

import WorkQueue from "./components/workqueue/WorkQueue";
import Dashboard from "./components/dashboard/Dashboard";
import PatientProfile from "./components/registry/PatientProfile";
import Communications from "./components/communications/Communications";
import Payments from "./components/payments/Payments";
import Analytics from "./components/analytics/Analytics";
import SettingsPage from "./components/settings/Settings";
import CaseWrapper from "./components/wizard/CaseWrapper";
import Sidebar from "./components/shell/Sidebar";
import TopBar from "./components/shell/TopBar";
import CommandBar from "./components/shell/CommandBar";
import { LoadingBlock } from "./components/ui/Common";
import ErrorBoundary from "./components/ui/ErrorBoundary";
import Toasts from "./components/ui/Toasts";
import { useMediaQuery } from "./hooks/util/useMediaQuery";
import { TipsProvider } from "./help/TipsContext.jsx";
import { loadPayerGuide } from "./api/payrErrors.js";

const TASK_POLL_MS = 60_000;
const TASK_LIMIT = 50;
const COMMS_LIMIT = 100;

function LegacyBasePath() {
  const location = useLocation();
  const rest = location.pathname.replace(/^\/nhcx\/service/, "") || "/";
  return <Navigate to={`${rest}${location.search}${location.hash}`} replace />;
}

function RequireProvider({ hasProvider, sessionReady }) {
  const location = useLocation();
  if (!sessionReady) return <LoadingBlock text="Loading…" />;
  return hasProvider ? <Outlet /> : <Navigate to="/settings" replace state={{ from: `${location.pathname}${location.search}` }} />;
}

const readProvider = () => ({
  hasProvider: !!localStorage.getItem("nhcx_default_provider_id") || localStorage.getItem(ALL_FACILITIES_MODE_KEY) === "true",
  facilityName: localStorage.getItem("nhcx_default_facility_name") || "",
  providerId: localStorage.getItem("nhcx_default_provider_id") || "",
  allFacilitiesMode: localStorage.getItem(ALL_FACILITIES_MODE_KEY) === "true",
});

const chooseFacility = (facility) => {
  if (facility) {
    localStorage.setItem("nhcx_default_provider_id", facility.hcx_participant_code);
    localStorage.setItem("nhcx_default_facility_name", facility.name || "");
  } else {
    localStorage.removeItem("nhcx_default_provider_id");
    localStorage.removeItem("nhcx_default_facility_name");
  }
  window.dispatchEvent(new Event("provider-changed"));
};

export default function App() {
  const location = useLocation();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "true");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [theme, setTheme] = useState(() => localStorage.getItem(THEME_KEY) || "light");
  const [layoutDirection, setLayoutDirection] = useState(() => localStorage.getItem(LAYOUT_DIRECTION_KEY) || "B");
  const [counts, setCounts] = useState({ pending: 0, pendingTotal: null, urgent: 0, unread: 0, unreadTotal: null });
  const [provider, setProvider] = useState(readProvider);
  const [session, setSession] = useState({ ready: false, readOnly: false, manageableFacilityCodes: [], managesAnyFacility: false, nhcxEnvironment: "sandbox", facilities: null, userId: null });
  const [blocked, setBlocked] = useState(null);
  const [pageActionsEl, setPageActionsEl] = useState(null);
  const facilityRecoveryAttempted = useRef(false);
  const prefersReducedMotion = useReducedMotion();
  const narrow = useMediaQuery("(max-width: 768px)");

  const { hasProvider, facilityName, providerId, allFacilitiesMode } = provider;

  useEffect(() => {
    const sync = () => {
      setProvider(readProvider());
      facilityRecoveryAttempted.current = false;
    };
    window.addEventListener("provider-changed", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("provider-changed", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const applySessionResult = (res) => {
    const isReadOnly = !!res?.read_only;
    setReadOnlySession(isReadOnly);
    const facilities = res?.facilities || [];
    const manageable = (res?.manageable_facility_codes || []).map(String);
    setSession({
      ready: true,
      readOnly: isReadOnly,
      manageableFacilityCodes: manageable,
      managesAnyFacility: !!res?.manages_any_facility,
      nhcxEnvironment: res?.nhcx_environment === "production" ? "production" : "sandbox",
      facilities,
      userId: res?.user?.id ?? null,
    });
    const inAllMode = localStorage.getItem(ALL_FACILITIES_MODE_KEY) === "true";
    if (isReadOnly) {
      if (!inAllMode) {
        localStorage.setItem(ALL_FACILITIES_MODE_KEY, "true");
        chooseFacility(null);
      }
      return;
    }
    if (inAllMode) {
      localStorage.removeItem(ALL_FACILITIES_MODE_KEY);
      window.dispatchEvent(new Event("provider-changed"));
    }
    if (localStorage.getItem("nhcx_default_provider_id")) return;
    const clinicId = getDeepLinkClinicId();
    if (clinicId) {
      const match = facilities.find((f) => String(f.facility_code) === String(clinicId));
      if (match) chooseFacility(match);
      else if (facilities.length > 0 && !res?.manages_any_facility && !manageable.includes(String(clinicId))) setBlocked({ kind: "clinic", clinicId });
      return;
    }
    if (facilities.length === 1) chooseFacility(facilities[0]);
  };

  const refreshSession = () => api.getSession().then(applySessionResult);

  useEffect(() => {
    const timer = setTimeout(loadPayerGuide, 1500);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;
    api
      .getSession()
      .then((res) => {
        if (!cancelled) applySessionResult(res);
      })
      .catch(() => {
        if (!cancelled) setSession((prev) => ({ ...prev, ready: true }));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hasProvider) return undefined;
    let live = true;
    const fetchCounts = async () => {
      const next = {};
      try {
        const res = await api.listTasks({ status: "pending", limit: TASK_LIMIT });
        const tasks = res?.tasks ?? [];
        next.pending = tasks.length;
        next.pendingTotal = res?.total_count ?? null;
        next.urgent = tasks.filter((t) => t.priority === "urgent" || t.priority === "high").length;
      } catch {
        next.pending = 0;
      }
      try {
        const res = await api.listCommunications({ limit: COMMS_LIMIT });
        const comms = res?.communications ?? [];
        next.unread = comms.filter((c) => !c.provider_read).length;
        next.unreadTotal = res?.unread_count ?? null;
      } catch {
        next.unread = 0;
      }
      if (live) setCounts((prev) => ({ ...prev, ...next }));
    };
    const first = setTimeout(fetchCounts, 0);
    const timer = setInterval(fetchCounts, TASK_POLL_MS);
    return () => {
      live = false;
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [hasProvider]);

  useEffect(() => {
    const handleApiError = (e) => {
      const { kind } = e.detail || {};
      if (kind === "AUTH_EXPIRED") {
        clearSessionToken();
        setBlocked({ kind: "expired" });
        return;
      }
      if (kind === "FACILITY_REQUIRED" && !facilityRecoveryAttempted.current) {
        facilityRecoveryAttempted.current = true;
        api
          .getSession()
          .then((res) => {
            const facilities = res?.facilities || [];
            const clinicId = getDeepLinkClinicId();
            const match = clinicId ? facilities.find((f) => String(f.facility_code) === String(clinicId)) : facilities.length === 1 ? facilities[0] : null;
            chooseFacility(match || null);
          })
          .catch(() => {});
      }
    };
    window.addEventListener("api-error", handleApiError);
    return () => window.removeEventListener("api-error", handleApiError);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const pageTitle = pageTitleFor(location.pathname);
  useEffect(() => {
    document.title = pageTitle ? `${pageTitle} · NHCX` : "NHCX";
  }, [pageTitle]);

  const toggleTheme = () => {
    const next = theme === "light" ? "dark" : "light";
    localStorage.setItem(THEME_KEY, next);
    setTheme(next);
  };
  const toggleSidebar = () => {
    const next = !sidebarCollapsed;
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next));
    setSidebarCollapsed(next);
  };
  const toggleLayoutDirection = () => {
    const next = layoutDirection === "B" ? "A" : "B";
    localStorage.setItem(LAYOUT_DIRECTION_KEY, next);
    setLayoutDirection(next);
  };

  const shownPending = hasProvider ? counts.pending : 0;
  const shownUnread = hasProvider ? counts.unread : 0;
  const navItems = navItemsFor({ pendingTasks: shownPending, unreadMessages: shownUnread }).map((item) => ({
    ...item,
    badgeLabel: item.to === "/work-queue" ? badgeText(shownPending, { total: counts.pendingTotal, limit: TASK_LIMIT }) : item.to === "/communications" ? badgeText(shownUnread, { total: counts.unreadTotal, limit: COMMS_LIMIT }) : null,
  }));
  const urgent = hasProvider && counts.urgent > 0;
  const facility = { hasProvider, allMode: allFacilitiesMode, label: allFacilitiesMode ? "All facilities" : facilityName || providerId };
  const crumbs = crumbsFor(location.pathname);
  const inCase = location.pathname.startsWith("/case/");
  const commandShell = layoutDirection === "B" && !narrow;

  if (blocked) {
    return (
      <div className="session-block-screen">
        <div className="session-block-card" role="alert">
          <AlertCircle size={28} color="var(--error)" aria-hidden="true" />
          {blocked.kind === "expired" ? (
            <>
              <h2>Session expired</h2>
              <p>Your session has ended and this app has no way to refresh it on its own. Return to the hospital system and open the patient again.</p>
            </>
          ) : (
            <>
              <h2>No access to this clinic</h2>
              <p>
                Your account is not linked to clinic <strong>{blocked.clinicId}</strong>. Contact your administrator, or return to the hospital system and try again.
              </p>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <TipsProvider>
      <div className={`app-container${sidebarCollapsed ? " sidebar-collapsed" : ""}${mobileMenuOpen ? " mobile-menu-open" : ""} dir-${layoutDirection.toLowerCase()}`}>
        {mobileMenuOpen && <div className="mobile-overlay" onClick={() => setMobileMenuOpen(false)} />}

        {commandShell && <CommandBar items={navItems} urgent={urgent} reduceMotion={prefersReducedMotion} facility={facility} theme={theme} onToggleTheme={toggleTheme} crumbs={crumbs} pathname={location.pathname} showCrumbs={!inCase} pageActionsRef={setPageActionsEl} />}

        <div className="app-body">
          {!commandShell && <Sidebar items={navItems} collapsed={sidebarCollapsed} onToggleCollapse={toggleSidebar} mobileOpen={mobileMenuOpen} onCloseMobile={() => setMobileMenuOpen(false)} facility={facility} urgent={urgent} reduceMotion={prefersReducedMotion} />}

          <main className="content">
            {!commandShell && <TopBar crumbs={crumbs} pathname={location.pathname} onOpenMenu={() => setMobileMenuOpen(true)} facility={facility} theme={theme} onToggleTheme={toggleTheme} pageActionsRef={setPageActionsEl} />}

            <div className="main-view">
              <ReadOnlyContext.Provider value={session.readOnly}>
                <PageActionsSlot.Provider value={pageActionsEl}>
                  <ErrorBoundary key={location.pathname.split("/").slice(0, inCase ? 3 : 2).join("/")}>
                    <Routes>
                      <Route path="/" element={<Navigate to="/work-queue" replace />} />
                      <Route path="/nhcx/service/*" element={<LegacyBasePath />} />
                      <Route
                        path="/settings"
                        element={
                          <SettingsPage
                            readOnly={session.readOnly}
                            manageableFacilityCodes={session.manageableFacilityCodes}
                            managesAnyFacility={session.managesAnyFacility}
                            nhcxEnvironment={session.nhcxEnvironment}
                            sessionFacilities={session.facilities}
                            sessionUserId={session.userId}
                            onSessionRefresh={refreshSession}
                            allFacilitiesMode={allFacilitiesMode}
                            theme={theme}
                            onToggleTheme={toggleTheme}
                            layoutDirection={layoutDirection}
                            onToggleLayoutDirection={toggleLayoutDirection}
                          />
                        }
                      />
                      <Route element={<RequireProvider hasProvider={hasProvider} sessionReady={session.ready} />}>
                        <Route path="/work-queue" element={<WorkQueue allFacilitiesMode={allFacilitiesMode} />} />
                        <Route path="/dashboard" element={<Dashboard allFacilitiesMode={allFacilitiesMode} />} />
                        <Route path="/registry" element={<PatientProfile />} />
                        <Route path="/communications" element={<Communications allFacilitiesMode={allFacilitiesMode} />} />
                        <Route path="/payments" element={<Payments />} />
                        <Route path="/analytics" element={<Analytics />} />
                        <Route path="/case/:id/*" element={<CaseWrapper />} />
                      </Route>
                      <Route path="*" element={<Navigate to="/work-queue" replace />} />
                    </Routes>
                  </ErrorBoundary>
                </PageActionsSlot.Provider>
              </ReadOnlyContext.Provider>
            </div>
          </main>
        </div>

        <Toasts />
      </div>
    </TipsProvider>
  );
}
