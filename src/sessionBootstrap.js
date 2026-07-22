import { SESSION_TOKEN_GLOBAL, ALL_FACILITIES_MODE_KEY } from "./api";

const CONSUMED = ["auth_token", "token", "clinic_id"];

let deepLinkClinicId = null;

export function getDeepLinkClinicId() {
  return deepLinkClinicId;
}

export function bootstrapSessionFromUrl() {
  if (typeof window === "undefined") return;

  const params = new URLSearchParams(window.location.search);
  const authToken = params.get("token");
  const clinicId = params.get("clinic_id");

  if (authToken) {
    window[SESSION_TOKEN_GLOBAL] = authToken;
    localStorage.removeItem("nhcx_default_provider_id");
    localStorage.removeItem("nhcx_default_facility_name");
    localStorage.removeItem(ALL_FACILITIES_MODE_KEY);
  }

  if (clinicId) deepLinkClinicId = clinicId;

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
