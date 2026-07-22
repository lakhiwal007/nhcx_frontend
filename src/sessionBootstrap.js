import { SESSION_TOKEN_GLOBAL, SESSION_TOKEN_KEY, ALL_FACILITIES_MODE_KEY } from "./api";

const CONSUMED = ["auth_token", "token", "clinic_id"];

// Tab-scoped, not the URL - the URL itself still gets stripped below either
// way, so this doesn't reopen the bookmark/history leak that stripping guards
// against. It just lets the clinic_id-driven auto-select/prefill survive a
// same-tab refresh instead of resetting to null every time.
const CLINIC_ID_KEY = "nhcx_deep_link_clinic_id";

export function getDeepLinkClinicId() {
  return sessionStorage.getItem(CLINIC_ID_KEY);
}

export function bootstrapSessionFromUrl() {
  if (typeof window === "undefined") return;

  const params = new URLSearchParams(window.location.search);
  const authToken = params.get("token");
  const clinicId = params.get("clinic_id");

  if (authToken) {
    sessionStorage.setItem(SESSION_TOKEN_KEY, authToken);
    window[SESSION_TOKEN_GLOBAL] = authToken;
    localStorage.removeItem("nhcx_default_provider_id");
    localStorage.removeItem("nhcx_default_facility_name");
    localStorage.removeItem(ALL_FACILITIES_MODE_KEY);
  }

  if (clinicId) sessionStorage.setItem(CLINIC_ID_KEY, clinicId);

  if (CONSUMED.some((k) => params.has(k))) {
    CONSUMED.forEach((k) => params.delete(k));
    const query = params.toString();
    window.history.replaceState(
      window.history.state,
      "",
      window.location.pathname + (query ? `?${query}` : "") + window.location.hash
    );
  }
}
