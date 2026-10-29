// ─────────────────────────────────────────────────────────────────────────────
//  API MODE SWITCH
//  Set USE_MOCK = true  →  returns dummy data (no server needed)
//  Set USE_MOCK = false →  makes real fetch calls to BASE_URL
// ─────────────────────────────────────────────────────────────────────────────
import { enrichPayrMessage, describePayrError } from "./api/payrErrors.js";

const USE_MOCK = import.meta.env.VITE_USE_MOCK === "true";
const mockDiscoveries = [];

// Base URL for real network calls. Change this to match your backend server.
const BASE_URL =
  import.meta.env.VITE_BASE_URL || "http://localhost:8082/nhcx/api/v1/insurance";

// ─── Helpers ──────────────────────────────────────────────────────────────────
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// A read-only global admin works in the cross-facility view, sending no
// X-Provider-Id at all even if a facility is still saved in localStorage from
// a prior session - this flag suppresses it. App.jsx sets it from /session.
export const ALL_FACILITIES_MODE_KEY = "nhcx_all_facilities_mode";

// Which nav paradigm the shell renders: "A" (dark rail sidebar) or "B" (dark
// top command-bar + breadcrumb strip). Purely a presentation preference.
export const LAYOUT_DIRECTION_KEY = "nhcx_layout_direction";

// Light/dark theme preference, persisted across reloads.
export const THEME_KEY = "nhcx_theme";

// Whether the desktop sidebar is collapsed to its icon rail, persisted.
export const SIDEBAR_COLLAPSED_KEY = "nhcx_sidebar_collapsed";

const getProviderHeader = () => {
  if (localStorage.getItem(ALL_FACILITIES_MODE_KEY) === "true") return {};
  const code = localStorage.getItem("nhcx_default_provider_id");
  return code ? { "X-Provider-Id": code } : {};
};

// Parent-HIS session token. The wrapper requires `Authorization: Bearer <token>`
// on every endpoint except /facilities/* and /health (it decodes the token to
// resolve the acting NhcxFacility).
//
// The parent HIS page exposes the token on a JS global — read it from there.
// `SESSION_TOKEN_GLOBAL` is the property name on `window`; change it here if the
// parent uses a different one. sessionBootstrap.js also mirrors the deep link's
// `token` into sessionStorage (SESSION_TOKEN_KEY) so a same-tab refresh survives
// without sending the user back to the parent HIS — it's still gone the moment
// the tab closes, and the token is stripped from the URL either way, so this
// doesn't reopen the bookmark/history leak the stripping guards against. A
// localStorage fallback under the same key is kept for local dev.
export const SESSION_TOKEN_GLOBAL = "__NHCX_TOKEN__";
export const SESSION_TOKEN_KEY = "nhcx_session_token";

const getSessionToken = () =>
  (typeof window !== "undefined" && window[SESSION_TOKEN_GLOBAL]) ||
  sessionStorage.getItem(SESSION_TOKEN_KEY) ||
  localStorage.getItem(SESSION_TOKEN_KEY) ||
  null;

const getAuthHeader = () => {
  const token = getSessionToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
};

// Called once the wrapper has told us the token is dead (401 WRAPPER-ERROR:1012)
// so a later refresh in the same tab doesn't just resurrect the same rejected
// token and loop back into another "session expired".
export const clearSessionToken = () => {
  if (typeof window !== "undefined") delete window[SESSION_TOKEN_GLOBAL];
  sessionStorage.removeItem(SESSION_TOKEN_KEY);
};

// Only /health is exempt from auth. /facilities/* used to be exempt too, but
// v1.4.0 made the bearer token required there as well (facility resolution is
// just skipped, so first-time onboarding still works without a chosen facility).
const isAuthExempt = (path) => path === "/health";

// Compose request headers for a relative wrapper path.
const buildHeaders = (path) => ({
  "Content-Type": "application/json",
  ...getProviderHeader(),
  ...(isAuthExempt(path) ? {} : getAuthHeader()),
});

/** RFC-4122 v4 UUID — mandatory request_id for every API call. */
export const generateRequestId = () =>
  "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });

// The callback base NHCX should deliver to: this API's own context path, which
// is BASE_URL without its "/v1/insurance" suffix.
export const callbackBaseUrl = () =>
  new URL(BASE_URL.replace(/\/v1\/insurance\/?$/, ""), window.location.origin).toString().replace(/\/$/, "");

// A task action's path arrives as "/cashless/..." (ACTION_MAP) or as the
// backend's "/api/v1/insurance/cashless/..." (action.endpoint); both live under
// BASE_URL, which may sit on another host than this page.
const API_PATH_PREFIX = /^(\/nhcx)?\/api\/v1\/insurance(?=\/|$)/;
const resolveApiUrl = (path) =>
  /^https?:\/\//.test(path) ? path : new URL(BASE_URL + path.replace(API_PATH_PREFIX, ""), window.location.origin).toString();

/** Build a full URL with query params (undefined/null/"" values are skipped). */
const buildUrl = (path, params = {}) => {
  const url = new URL(BASE_URL + path, window.location.origin);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "")
      url.searchParams.append(k, v);
  });
  return url.toString();
};

const dispatchError = (msg, kind) =>
  window.dispatchEvent(new CustomEvent("api-error", { detail: { message: msg, kind } }));

// Thrown for any non-2xx wrapper response. `kind` is the classified auth
// failure (see authMessage) so App.jsx can react structurally — re-bootstrap
// the session, bounce to the parent HIS — instead of pattern-matching text.
class ApiError extends Error {
  constructor(message, kind = null) {
    super(message);
    this.kind = kind;
  }
}

// A global admin's session reads every facility but changes nothing. The
// wrapper refuses its writes (WRAPPER-ERROR:1015); they are refused here too,
// before anything leaves the browser.
export const READ_ONLY_MESSAGE = "This account can view only.";
let readOnlySession = false;
export const setReadOnlySession = (value) => {
  readOnlySession = !!value;
};

const refuseIfReadOnly = () => {
  if (!readOnlySession) return;
  const err = new ApiError(READ_ONLY_MESSAGE, "READ_ONLY");
  dispatchError(err.message, err.kind);
  throw err;
};

// Auth failures from the wrapper's session-token check get a plain-language
// message — the raw "WRAPPER-ERROR:1012" means nothing to a billing user.
const authMessage = (status, raw) => {
  const code = typeof raw === "string" ? raw : "";
  if (code.includes("WRAPPER-ERROR:1012") || status === 401)
    return { kind: "AUTH_EXPIRED", message: "Your session has expired. Please sign in again from the hospital system." };
  // Check the specific 403 codes before the generic 403 fallback below, which
  // would otherwise misreport them as "no facility linked".
  if (code.includes("WRAPPER-ERROR:1014"))
    return { kind: "FACILITY_ADMIN", message: "Only a clinic admin of this facility can register or change it." };
  if (code.includes("WRAPPER-ERROR:1015"))
    return { kind: "READ_ONLY", message: READ_ONLY_MESSAGE };
  if (code.includes("WRAPPER-ERROR:1013") || status === 403)
    return { kind: "NO_FACILITY", message: "No NHCX facility is linked to your account. Contact your administrator." };
  if (code.includes("WRAPPER-ERROR:1011"))
    return { kind: "FACILITY_REQUIRED", message: "Select a facility to act as before performing this action." };
  return null;
};

const unwrapNestedJsonMessage = (str) => {
  const jsonStart = str.indexOf("{");
  if (jsonStart === -1) return null;
  try {
    const inner = JSON.parse(str.slice(jsonStart));
    return inner?.error?.message || inner?.message || null;
  } catch (_) {
    return null;
  }
};

/** Extract the most human-readable message from a backend error response body. */
const extractErrorMessage = async (res) => {
  try {
    const body = await res.json();
    let msg = body?.error?.message || body?.message || body?.error;
    const auth = authMessage(res.status, msg);
    if (auth) return auth;
    const abdmError = body?.abdm_registration?.error;
    if (typeof abdmError === "string" && abdmError) {
      const innerMsg = unwrapNestedJsonMessage(abdmError);
      return { kind: null, message: enrichPayrMessage(`ABDM rejected the registration: ${innerMsg || abdmError}`) };
    }
    // A 422/gateway error may carry a PAYR code in errors[].code — surface the
    // friendly label + code so the toast isn't an opaque "422".
    const payrFromList = (body?.errors || [])
      .map((e) => describePayrError(e?.code || e?.detail || ""))
      .find(Boolean);
    if (typeof msg === "string") {
      const innerMsg = unwrapNestedJsonMessage(msg);
      return { kind: null, message: enrichPayrMessage(innerMsg || msg) };
    }
    if (payrFromList) return { kind: null, message: `${payrFromList.label} (${payrFromList.code})` };
  } catch (_) {}
  return authMessage(res.status) || { kind: null, message: `${res.status} ${res.statusText}` };
};

/** Wrapper around fetch — auto-injects request_id and X-Provider-Id; throws on non-2xx. */
const http = {
  get: async (path, params = {}, opts = {}) => {
    const merged = { request_id: generateRequestId(), ...params };
    try {
      const res = await fetch(buildUrl(path, merged), {
        headers: buildHeaders(path),
        signal: opts.signal,
      });
      if (res.status === 404 && opts.allowNotFound) {
        return await res.json().catch(() => null);
      }
      if (!res.ok) {
        const info = await extractErrorMessage(res);
        throw new ApiError(info.message, info.kind);
      }
      return await res.json();
    } catch (err) {
      // A cancelled poll (tab hidden / navigation) is not a real error.
      if (err.name === "AbortError") throw err;
      dispatchError(err.message, err.kind);
      throw err;
    }
  },
  post: async (path, body = {}, opts = {}) => {
    refuseIfReadOnly();
    const merged = { request_id: generateRequestId(), ...body };
    try {
      const res = await fetch(BASE_URL + path, {
        method: "POST",
        headers: buildHeaders(path),
        body: JSON.stringify(merged),
      });
      if (!res.ok && opts.acceptStatuses?.includes(res.status)) {
        return await res.json();
      }
      if (!res.ok) {
        const info = await extractErrorMessage(res);
        throw new ApiError(info.message, info.kind);
      }
      return await res.json();
    } catch (err) {
      dispatchError(err.message, err.kind);
      throw err;
    }
  },
  patch: async (path, body = {}) => {
    refuseIfReadOnly();
    const merged = { request_id: generateRequestId(), ...body };
    try {
      const res = await fetch(BASE_URL + path, {
        method: "PATCH",
        headers: buildHeaders(path),
        body: JSON.stringify(merged),
      });
      if (!res.ok) {
        const info = await extractErrorMessage(res);
        throw new ApiError(info.message, info.kind);
      }
      return await res.json();
    } catch (err) {
      dispatchError(err.message, err.kind);
      throw err;
    }
  },
  put: async (path, body = {}) => {
    refuseIfReadOnly();
    const merged = { request_id: generateRequestId(), ...body };
    try {
      const res = await fetch(BASE_URL + path, {
        method: "PUT",
        headers: buildHeaders(path),
        body: JSON.stringify(merged),
      });
      if (!res.ok) {
        const info = await extractErrorMessage(res);
        throw new ApiError(info.message, info.kind);
      }
      return await res.json();
    } catch (err) {
      dispatchError(err.message, err.kind);
      throw err;
    }
  },
  delete: async (path, body = {}) => {
    refuseIfReadOnly();
    const merged = { request_id: generateRequestId(), ...body };
    try {
      const res = await fetch(BASE_URL + path, {
        method: "DELETE",
        headers: buildHeaders(path),
        body: JSON.stringify(merged),
      });
      if (!res.ok) {
        const info = await extractErrorMessage(res);
        throw new ApiError(info.message, info.kind);
      }
      return await res.json();
    } catch (err) {
      dispatchError(err.message, err.kind);
      throw err;
    }
  },
  /** Fire an arbitrary POST to a task action's path (used by Work Queue task actions). */
  rawPost: async (fullPath, body = {}) => {
    refuseIfReadOnly();
    const merged = { request_id: generateRequestId(), ...body };
    const url = resolveApiUrl(fullPath);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getProviderHeader(), ...getAuthHeader() },
        body: JSON.stringify(merged),
      });
      if (!res.ok) {
        const info = await extractErrorMessage(res);
        throw new ApiError(info.message, info.kind);
      }
      return await res.json();
    } catch (err) {
      dispatchError(err.message, err.kind);
      throw err;
    }
  },
  /** Fire an arbitrary GET to a task action's path (used by GET-only Work Queue task actions). */
  rawGet: async (fullPath, params = {}) => {
    const merged = { request_id: generateRequestId(), ...params };
    const url = new URL(resolveApiUrl(fullPath));
    Object.entries(merged).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== "")
        url.searchParams.append(k, v);
    });
    try {
      const res = await fetch(url.toString(), {
        headers: { ...getProviderHeader(), ...getAuthHeader() },
      });
      if (!res.ok) {
        const info = await extractErrorMessage(res);
        throw new ApiError(info.message, info.kind);
      }
      return await res.json();
    } catch (err) {
      dispatchError(err.message, err.kind);
      throw err;
    }
  },
};

// ─── Mock Data ────────────────────────────────────────────────────────────────

// Where each mock case sits on the journey. Keyed by cashless_case_id so mock
// mode can exercise a case that has moved past eligibility (read-only prep with
// a re-run), an undecided claim, and a settled payment — not just a fresh case.
// ─── PMJAY-shaped package master mock ──────────────────────────────────────
// Mirrors the backend's plan summary (case payload) and the benefit rows of
// GET insurance_plan/{correlation_id}/benefits, as PackageMasterReader
// stores them from a PMJAY InsurancePlan bundle.
const mockDoc = (category, categoryDisplay, code, display, stage = "pre") => ({
  category, category_display: categoryDisplay, code, display, form: null, stage,
});

const mockPackage = (code, display, rate, conditions, supportingInfo = []) => ({
  code, display, rate, conditions, supporting_info: supportingInfo,
});

const MOCK_PMJAY_SPECIALTIES = [
  {
    code: "SG",
    display: "General Surgery",
    packages: [
      mockPackage("47562", "Laparoscopic cholecystectomy", 22800,
        { ProcedureType: "Surgical", ApprovalNotRequired: "N", EnhancementAllowed: "N", IsDayCare: "N" },
        [mockDoc("DIA", "Diagnostic report", "MAND0409", "USG abdomen report"), mockDoc("INF", "Clinical information", "MAND0101", "Clinical notes")]),
      mockPackage("SG045A", "Open appendicectomy", 18500,
        { ProcedureType: "Surgical", ApprovalNotRequired: "N", EnhancementAllowed: "N", IsDayCare: "N" },
        [mockDoc("DIA", "Diagnostic report", "MAND0411", "USG / CT abdomen report")]),
      mockPackage("SG062A", "Inguinal hernia repair (mesh)", 21000,
        { ProcedureType: "Surgical", ApprovalNotRequired: "N", EnhancementAllowed: "N", ImplantApplicable: "Y", IsDayCare: "N" },
        [mockDoc("INF", "Clinical information", "MAND0101", "Clinical notes")]),
      mockPackage("SG018B", "Incision and drainage of abscess", 4200,
        { ProcedureType: "Surgical", ApprovalNotRequired: "Y", EnhancementAllowed: "N", IsDayCare: "Y" }),
    ],
  },
  {
    code: "MG",
    display: "General Medicine",
    packages: [
      mockPackage("MG004A", "Acute gastroenteritis with moderate dehydration", 9000,
        { ProcedureType: "Medical", ApprovalNotRequired: "N", EnhancementAllowed: "Y", StratificationAllowed: "Y", IsDayCare: "N" },
        [mockDoc("DIA", "Diagnostic report", "MAND0301", "Serum electrolytes report")]),
      mockPackage("MG011A", "Dengue fever", 12000,
        { ProcedureType: "Medical", ApprovalNotRequired: "N", EnhancementAllowed: "Y", StratificationAllowed: "Y", IsDayCare: "N" },
        [mockDoc("DIA", "Diagnostic report", "MAND0322", "NS1 / IgM dengue report"), mockDoc("DIA", "Diagnostic report", "MAND0323", "Platelet count")]),
      mockPackage("MG067A", "Haemodialysis (per session)", 2000,
        { ProcedureType: "Medical", ApprovalNotRequired: "N", EnhancementAllowed: "N", CyclicProcedure: "Y", MaximumCyclesAllowed: "12", IsDayCare: "Y" }),
    ],
  },
  {
    code: "MP",
    display: "Paediatric Medical Management",
    packages: [
      mockPackage("MP002A", "Severe pneumonia in children", 15000,
        { ProcedureType: "Medical", ApprovalNotRequired: "N", EnhancementAllowed: "Y", StratificationAllowed: "Y", IsDayCare: "N" },
        [mockDoc("DIA", "Diagnostic report", "MAND0501", "Chest X-ray report")]),
      mockPackage("MP014A", "Febrile seizures", 8000,
        { ProcedureType: "Conservative", ApprovalNotRequired: "N", EnhancementAllowed: "N", IsDayCare: "N" }),
    ],
  },
  {
    code: "SN",
    display: "Neurosurgery",
    packages: [
      mockPackage("SN021A", "Ventriculoperitoneal shunt", 45000,
        { ProcedureType: "Surgical", ApprovalNotRequired: "N", EnhancementAllowed: "N", ImplantApplicable: "Y", IsDayCare: "N" },
        [mockDoc("DIA", "Diagnostic report", "MAND0601", "CT / MRI brain report")]),
    ],
  },
];

const MOCK_PMJAY_BENEFITS = MOCK_PMJAY_SPECIALTIES.flatMap((s) =>
  s.packages.map((p, i) => ({
    id: `${s.code}-${i + 1}`,
    seq: i + 1,
    category_code: s.code,
    category_display: s.display,
    kind: "Procedure",
    currency: "INR",
    cost_type: "Procedure",
    requirement: null,
    extras: [],
    ...p,
  })),
);

const MOCK_PLAN_FORMS = [
  {
    url: "https://nha.gov.in/fhir/Questionnaire/STG-SG039",
    form_id: "STG-SG039",
    title: "Cholecystectomy STG questionnaire",
    kind: "stg",
    stage: "pre",
    items: [
      { linkId: "1", type: "group", text: "Clinical indication", required: false, depth: 0, options: [], initial: null },
      { linkId: "1.1", type: "choice", text: "USG shows calculi", required: true, depth: 1, options: ["Yes", "No"], initial: null },
      { linkId: "1.2", type: "date", text: "Date of USG", required: true, depth: 1, options: [], initial: null },
      { linkId: "2", type: "attachment", text: "USG report", required: true, depth: 0, options: [], initial: null },
    ],
  },
  {
    url: "https://nha.gov.in/fhir/Questionnaire/DISCHARGE",
    form_id: "DISCHARGE",
    title: "Discharge information",
    kind: "form",
    stage: "post",
    items: [
      { linkId: "1", type: "choice", text: "Discharge type", required: true, depth: 0, options: ["Normal", "LAMA", "Death"], initial: "Normal" },
    ],
  },
  {
    url: "https://nha.gov.in/fhir/Questionnaire/100024",
    form_id: "100024",
    title: "Authentication Consent",
    kind: "questionnaire",
    stage: "pre",
    items: [
      { linkId: "100093", type: "attachment", text: "Medical Superintendent Declaration Form (During Admission)", required: true, depth: 0, options: [], initial: null },
      { linkId: "100095", type: "string", text: "Remarks", required: false, depth: 0, options: [], initial: null },
    ],
  },
];

// Mock answers to the payer's forms, keyed by case, form and question.
const MOCK_FORM_ANSWERS = {};

const mockPayerForm = (caseId, form) => {
  const given = MOCK_FORM_ANSWERS[`${caseId}|${form.url}`] || {};
  return {
    url: form.url,
    title: form.title,
    kind: form.kind === "stg" ? "stgquestionnaire" : form.kind,
    stage: form.stage,
    consent: /consent/i.test(form.title),
    answered: Object.keys(given).length,
    items: form.items.map((it) => ({ ...it, answer: given[it.linkId]?.answer ?? null, file: given[it.linkId]?.file ?? null })),
  };
};

const MOCK_PMJAY_PLAN = {
  plan_status: "ready",
  plan: {
    plan_identifier: "PMJAY-KA-2026-01",
    plan_title: "PMJAY - Universal Health Policy",
    plan_type: "Universal Health Policy",
    sum_insured: 500000,
    policy_code: "POL-91711234567890-2026",
    proof_of_presence_required: true,
  },
  plan_details: {
    id: "PMJAY-UHP-2026",
    name: "PMJAY - Universal Health Policy",
    status: "active",
    identifier: "POL-91711234567890-2026",
    period: { start: "2026-01-01", end: "2026-12-31" },
  },
  policy_documents: [
    mockDoc("POI", "Proof of identity", "ADN", "Aadhaar / PMJAY e-card"),
    mockDoc("ODN", "Other documents", "ODN", "Admission Details"),
    mockDoc("ODN", "Other documents", "ODN", "Authentication Consent"),
    mockDoc("ODN", "Other documents", "ODN", "Discharge Information", "post"),
  ],
  categories: MOCK_PMJAY_SPECIALTIES.map((s) => ({ code: s.code, display: s.display, count: s.packages.length })),
  benefit_count: MOCK_PMJAY_BENEFITS.length,
  form_count: 3,
  requested_at: "2026-05-04T10:40:12+05:30",
  fetched_at: "2026-05-04T10:41:00+05:30",
  error_message: null,
  reused_from: null,
  errors: [],
};

const MOCK_CASE_JOURNEYS = {
  default: {
    child_id: 12,
    claim_id: 101,
    current_step: "preauth_ready",
    next_actions: ["prepare_preauth"],
    preauth: null,
    claim: null,
  },
  4: {
    child_id: 12,
    claim_id: 101,
    current_step: "preauth_ready",
    next_actions: ["prepare_preauth"],
    preauth: null,
    claim: null,
  },
  5: {
    child_id: 19,
    claim_id: 102,
    current_step: "settled",
    next_actions: ["acknowledge_payment"],
    preauth: {
      correlation_id: "preauth-corr-102",
      preauth_ref: "PA-2026-00102",
      decision: "APPROVED",
      approved_amount: 40000,
      status: "complete",
    },
    claim: {
      correlation_id: "claim-corr-102",
      claim_id: 102,
      status: "complete",
      decision: "APPROVED",
      approved_amount: 40000,
      payment_status: "settled",
    },
    payment: {
      latest_stage: "PAYMENT_SETTLED",
      settled: true,
      utr: "UTR-2026-00102",
      net: 38000,
      total_events: 3,
      acknowledged: true,
    },
  },
  // A payer that has paid but never sent the settlement notice — the state
  // real case CASE-27 sits in. The Payment stage must stay reachable here.
  7: {
    child_id: 25,
    claim_id: 104,
    current_step: "payment_pending",
    next_actions: ["acknowledge_payment"],
    preauth: {
      correlation_id: "preauth-corr-104",
      preauth_ref: "PA-2026-00104",
      decision: "APPROVED",
      approved_amount: 6200,
      status: "complete",
    },
    claim: {
      correlation_id: "claim-corr-104",
      claim_id: 104,
      status: "complete",
      decision: "APPROVED",
      approved_amount: 6200,
      payment_status: "initiated",
    },
    payment: {
      latest_stage: "PAYMENT_INITIATED",
      settled: false,
      utr: "UTR727X0U1000",
      net: 5400,
      total_events: 2,
      acknowledged: true,
    },
  },
  6: {
    child_id: 25,
    claim_id: 103,
    current_step: "claim_submitted",
    next_actions: ["refresh"],
    preauth: {
      correlation_id: "preauth-corr-103",
      preauth_ref: "PA-2026-00103",
      decision: "APPROVED",
      approved_amount: 22000,
      status: "complete",
    },
    claim: {
      correlation_id: "claim-corr-103",
      claim_id: 103,
      status: "complete",
      decision: null,
      payment_status: null,
    },
  },
};
const MOCK_NOTES = {};
const mockNotes = (cashless_case_id) => {
  if (!MOCK_NOTES[cashless_case_id]) {
    MOCK_NOTES[cashless_case_id] = [
      {
        id: 1, cashless_case_id, category: "payer_call", pinned: true, author_id: "2", author_name: "Riya (TPA desk)",
        body: "Spoke to the payer helpdesk. Preauth is with their medical team; they want the CBC report attached to the next query reply.",
        created_at: "2026-05-01T11:20:00+05:30", updated_at: "2026-05-01T11:20:00+05:30",
      },
    ];
  }
  return MOCK_NOTES[cashless_case_id];
};

const mockPractitioners = [
  {
    doctor_id: "11", name: "Dr Asha Rao", registration_no: "KMC-1201", specialization: "Paediatrician", in_his: true,
    master: { hpr_id: "71123456789012", qualification_display: "MBBS, MD (Paediatrics)", specialty_code: "394537008", specialty_display: "Paediatric specialty", active: true, updated_at: "2026-10-29T09:00:00+05:30" },
  },
  { doctor_id: "12", name: "Dr Vikram Shah", registration_no: "KMC-2290", specialization: "General Surgeon", in_his: true, master: null },
  { doctor_id: "14", name: "Dr Meera Iyer", specialization: "Anaesthetist", in_his: true, master: null },
  {
    doctor_id: "9", name: "Dr Former Consultant", in_his: false,
    master: { hpr_id: "71000000000009", qualification_display: "MBBS, MS (Ortho)", active: false, updated_at: "2026-06-01T09:00:00+05:30" },
  },
];

const mock = {
  // ─── Health ────────────────────────────────────────────────────────────────
  healthCheck: async () => {
    await delay(200);
    return { status: "ok", service: "nhcx-service", version: "1.2.0" };
  },

  // ─── Dashboard ─────────────────────────────────────────────────────────────
  getDashboardAnalytics: async (params = {}) => {
    await delay(500);
    const all = [
      { payer_id: "1000077777@hcx", payer_name: "Star Health", claims: 9, decided: 7, approved_count: 6, rejected_count: 1, settled_count: 4,
        billed: 1240000, approved: 905000, settled_gross: 610000, settled_net: 571000, tds: 39000, disallowed: 118000,
        copay: 42000, deductible: 15000, patient_payable: 175000, outstanding: 295000, leakage: 96000, approval_rate: 85.7, realisation_rate: 86.4 },
      { payer_id: "1000099999@hcx", payer_name: "PMJAY Telangana", claims: 6, decided: 6, approved_count: 4, rejected_count: 2, settled_count: 2,
        billed: 480000, approved: 300000, settled_gross: 150000, settled_net: 150000, tds: 0, disallowed: 64000,
        copay: 0, deductible: 0, patient_payable: 64000, outstanding: 150000, leakage: 38000, approval_rate: 66.7, realisation_rate: 79.8 },
    ];
    const rows = params.payer_id ? all.filter((r) => r.payer_id === params.payer_id) : all;
    const add = (k) => rows.reduce((s, r) => s + (r[k] || 0), 0);
    const totals = Object.fromEntries(Object.keys(all[0]).filter((k) => typeof all[0][k] === "number").map((k) => [k, add(k)]));
    totals.approval_rate = totals.decided ? Math.round((totals.approved_count * 1000) / totals.decided) / 10 : null;
    totals.realisation_rate = 84.6;
    const now = Date.now();
    const ago = (m) => new Date(now - m * 60000).toISOString();
    return {
      status: "complete",
      period: { from: params.from || "2026-07-09", to: params.to || "2026-10-07" },
      generated_at: new Date(now).toISOString(),
      revenue: {
        totals,
        by_payer: rows,
        ageing: [
          { bucket: "0-30", count: 5, amount: 310000, awaiting_decision: 2, awaiting_payment: 3 },
          { bucket: "31-60", count: 3, amount: 145000, awaiting_decision: 1, awaiting_payment: 2 },
          { bucket: "61-90", count: 1, amount: 62000, awaiting_decision: 0, awaiting_payment: 1 },
          { bucket: "90+", count: 1, amount: 38000, awaiting_decision: 1, awaiting_payment: 0 },
        ],
      },
      turnaround: {
        sla_minutes: { preauth: 60, claim: 180 },
        by_workflow: [
          { workflow: "preauth", sla_minutes: 60, decided: 14, median_minutes: 48, p90_minutes: 142, breached: 4, breach_rate: 28.6, pending: 2, pending_breached: 1 },
          { workflow: "claim", sla_minutes: 180, decided: 8, median_minutes: 205, p90_minutes: 1460, breached: 5, breach_rate: 62.5, pending: 1, pending_breached: 1 },
          { workflow: "reprocess", sla_minutes: null, decided: 2, median_minutes: 2880, p90_minutes: 4100, breached: null, breach_rate: null, pending: 0, pending_breached: null },
        ],
        by_payer: [
          { workflow: "preauth", payer_id: "1000077777@hcx", payer_name: "Star Health", decided: 9, median_minutes: 38, p90_minutes: 95, breached: 2, breach_rate: 22.2, sla_minutes: 60 },
          { workflow: "preauth", payer_id: "1000099999@hcx", payer_name: "PMJAY Telangana", decided: 5, median_minutes: 74, p90_minutes: 180, breached: 2, breach_rate: 40.0, sla_minutes: 60 },
        ],
        waiting: [
          { correlation_id: "mock-wait-1", workflow: "claim", payer_id: "1000077777@hcx", payer_name: "Star Health", cashless_case_id: 5, claim_id: 12, child_id: 19, patient_name: "Aarav Kumar", sent_at: ago(310), waiting_minutes: 310, sla_minutes: 180, breached: true },
          { correlation_id: "mock-wait-2", workflow: "preauth", payer_id: "1000099999@hcx", payer_name: "PMJAY Telangana", cashless_case_id: 4, claim_id: null, child_id: 17, patient_name: "Diya Sharma", sent_at: ago(75), waiting_minutes: 75, sla_minutes: 60, breached: true },
          { correlation_id: "mock-wait-3", workflow: "preauth", payer_id: "1000077777@hcx", payer_name: "Star Health", cashless_case_id: 6, claim_id: null, child_id: 21, patient_name: "Kabir Rao", sent_at: ago(22), waiting_minutes: 22, sla_minutes: 60, breached: false },
        ],
      },
    };
  },

  getPayerForms: async (cashless_case_id, stage = "preauth") => {
    await delay(300);
    const legStage = stage === "claim" ? "post" : "pre";
    return {
      status: "complete",
      cashless_case_id,
      stage,
      read_only: false,
      forms: MOCK_PLAN_FORMS.filter((f) => f.stage === legStage && !/discharge type|lama|death/i.test(f.title)).map((f) => mockPayerForm(cashless_case_id, f)),
    };
  },
  savePayerForm: async (cashless_case_id, { form_url, answers }) => {
    await delay(300);
    const form = MOCK_PLAN_FORMS.find((f) => f.url === form_url);
    const store = (MOCK_FORM_ANSWERS[`${cashless_case_id}|${form_url}`] ||= {});
    (answers || []).forEach((a) => {
      if (a.attachment) store[a.link_id] = { answer: a.attachment.title, file: { title: a.attachment.title, content_type: a.attachment.content_type } };
      else if (a.answer !== undefined && String(a.answer).trim() === "") delete store[a.link_id];
      else if (a.answer !== undefined) store[a.link_id] = { answer: String(a.answer).trim() };
    });
    return { ...mockPayerForm(cashless_case_id, form), status: "complete" };
  },
  listCaseNotes: async (cashless_case_id) => {
    await delay(250);
    return { status: "complete", cashless_case_id, notes: [...mockNotes(cashless_case_id)].sort((a, b) => b.pinned - a.pinned || b.id - a.id) };
  },
  createCaseNote: async (cashless_case_id, data) => {
    await delay(300);
    const now = new Date().toISOString();
    const note = {
      id: Date.now(), cashless_case_id, category: data.category || "general", body: data.body, pinned: false,
      author_id: "42", author_name: "You", created_at: now, updated_at: now,
    };
    mockNotes(cashless_case_id).push(note);
    return { status: "created", note };
  },
  updateCaseNote: async (cashless_case_id, note_id, data) => {
    await delay(200);
    const note = mockNotes(cashless_case_id).find((n) => n.id === note_id);
    if (note) Object.assign(note, data, { updated_at: new Date().toISOString() });
    return { status: "complete", note };
  },
  deleteCaseNote: async (cashless_case_id, note_id) => {
    await delay(200);
    const list = mockNotes(cashless_case_id);
    const idx = list.findIndex((n) => n.id === note_id);
    if (idx >= 0) list.splice(idx, 1);
    return { status: "complete", id: note_id };
  },

  getDashboardStats: async () => {
    await delay(500);
    return {
      claims: {
        total: 18,
        pending: 6,
        partial: 2,
        complete: 9,
        failed: 1,
        preauth_pending: 4,
      },
      children: { with_claims: 13 },
    };
  },

  getDashboardClaims: async (params = {}) => {
    await delay(600);
    return {
      total_count: 6,
      limit: params.limit || 20,
      offset: params.offset || 0,
      claims: [
        {
          id: 101,
          child_id: 12,
          child_name: "Arjun Mehta",
          patient_name: "Arjun Mehta",
          use_type: "preauthorization",
          // "complete" here is the cashless case's own status — eligibility
          // checks are done and it's ready for preauth, not the (unrelated)
          // Claim#status "draft" value this endpoint never actually returns.
          status: "complete",
          current_step: "preauth_ready",
          payer_id: "1518@hcx",
          policy_number: "POL-91711234567890-2026",
          preauth_status: null,
          claim_decision: null,
          approved_amount: null,
          payment_status: null,
          latest_utr: null,
          created_at: "2026-05-11T11:30:00+05:30",
          pending_tasks: [{ id: 901, task_type: "submit_preauth", title: "Submit preauth" }],
          completed_tasks: [],
        },
        {
          id: 102,
          child_id: 19,
          child_name: "Aisha Kapoor",
          patient_name: "Aisha Kapoor",
          use_type: "claim",
          status: "complete",
          current_step: "settled",
          payer_id: "1518@hcx",
          policy_number: "POL-55210098-2026",
          preauth_status: "APPROVED",
          claim_decision: "APPROVED",
          approved_amount: 40000,
          payment_status: "PAYMENT_SETTLED",
          latest_utr: "UTR123456789",
          created_at: "2026-05-10T09:00:00+05:30",
          pending_tasks: [],
          completed_tasks: [],
        },
        {
          id: 103,
          child_id: 25,
          child_name: "Riya Sharma",
          patient_name: "Riya Sharma",
          use_type: "preauthorization",
          status: "complete",
          current_step: "claim_decided",
          payer_id: "2044@hcx",
          policy_number: "NB-4471902-2026",
          preauth_status: "APPROVED",
          claim_decision: "QUERIED",
          approved_amount: null,
          payment_status: null,
          latest_utr: null,
          created_at: "2026-05-12T14:00:00+05:30",
          pending_tasks: [
            {
              task_id: "T-301",
              task_type: "respond_query",
              title: "Payer query response required",
              priority: "high",
            },
          ],
          completed_tasks: [],
        },
        {
          id: 104,
          child_id: 31,
          child_name: "Kabir Nair",
          patient_name: "Kabir Nair",
          use_type: "preauthorization",
          status: "complete",
          current_step: "preauth_submitted",
          payer_id: "1518@hcx",
          policy_number: "POL-77120034-2026",
          preauth_status: null,
          claim_decision: null,
          approved_amount: null,
          payment_status: null,
          latest_utr: null,
          created_at: "2026-05-14T10:15:00+05:30",
          pending_tasks: [],
          completed_tasks: [],
        },
        {
          id: 105,
          child_id: 33,
          child_name: "Meera Iyer",
          patient_name: "Meera Iyer",
          use_type: "claim",
          status: "complete",
          current_step: "payment_pending",
          payer_id: "2044@hcx",
          policy_number: "NB-5530118-2026",
          preauth_status: "APPROVED",
          claim_decision: "PARTIALLY_APPROVED",
          approved_amount: 62500,
          payment_status: null,
          latest_utr: null,
          created_at: "2026-05-08T16:40:00+05:30",
          pending_tasks: [],
          completed_tasks: [],
        },
        {
          id: 106,
          child_id: 36,
          child_name: "Vihaan Rao",
          patient_name: "Vihaan Rao",
          use_type: "preauthorization",
          status: "pending",
          current_step: "insurance_and_eligibility",
          payer_id: null,
          policy_number: null,
          preauth_status: null,
          claim_decision: null,
          approved_amount: null,
          payment_status: null,
          latest_utr: null,
          created_at: "2026-05-15T09:05:00+05:30",
          pending_tasks: [],
          completed_tasks: [],
        },
      ],
    };
  },

  // ─── Child / Patient Registry ───────────────────────────────────────────────
  searchChildren: async (params = {}) => {
    await delay(800);
    const all = [
        {
          child_id: 12,
          name: "Arjun Mehta",
          gender: "male",
          dob: "2020-01-01",
          mobile: "9999999999",
          abha_number: "91-7112-3456-7890",
          created_at: "2026-05-04T10:30:00+05:30",
          cashless_cases_count: 1,
          last_activity: "2026-05-24T16:10:00+05:30",
          latest_claim: {
            cashless_case_id: 4,
            claim_id: 101,
            status: "pending",
            current_step: "insurance_and_eligibility",
            payer_id: "1518@hcx",
            policy_number: "POL-91711234567890-2026",
            preauth_status: "pending",
            created_at: "2026-05-04T10:35:00+05:30",
          },
          visits: [
            {
              visit_type: "ipd",
              admission_id: 622,
              admission_no: "ADM-622",
              started_at: "2026-05-23T10:30:00+05:30",
              status: "admitted",
              diagnosis: "Acute gastroenteritis with dehydration",
              reason: "Cashless IPD admission",
              primary_doctor: {
                doctor_id: 1,
                name: "Dr. Meera Rao",
                specialization: "Paediatrician",
              },
              invoices: [
                {
                  invoice_id: 622,
                  invoice_type: "ipd",
                  invoice_no: "IPD-INV-622",
                  invoice_date: "2026-05-23",
                  amount_billed: 16000,
                  final_amount: 15200,
                  final_discount: 800,
                  billing_status: 0,
                  payment_mode: "Split Payment",
                  sponsor: "insurance",
                  line_items: [
                    {
                      line_item_id: 1,
                      code: "ROOM-001",
                      name: "Room charges",
                      category: "room",
                      quantity: 2,
                      unit_price: 4500,
                      net_amount: 9000,
                    },
                    {
                      line_item_id: 2,
                      code: "47562",
                      name: "Laparoscopic cholecystectomy",
                      category: "procedure",
                      quantity: 1,
                      unit_price: 7000,
                      net_amount: 7000,
                    },
                  ],
                },
              ],
              procedures: [{ code: "47562", name: "Laparoscopic cholecystectomy" }],
              advance_payments: [{ advance_payment_id: 1, amount: 5000, payment_mode: "Cash", date: "2026-05-23", payment_type: "Advance" }],
              payments: [{ payment_id: 1, invoice_id: 622, amount: 2000, payment_mode: "UPI", online_txn_id: "UPI-88213", collected_at: "2026-05-24T12:00:00+05:30" }],
              claims: [
                {
                  claim_id: 101,
                  cashless_case_id: 4,
                  status: "draft",
                  use_type: "preauthorization",
                  payer_id: "1518@hcx",
                  payer_name: "Sample Payer",
                  policy_number: "POL-91711234567890-2026",
                  total_billed: 15200,
                },
              ],
            },
          ],
        },
        {
          child_id: 19,
          name: "Aisha Kapoor",
          gender: "female",
          dob: "2019-06-11",
          mobile: "8888888888",
          abha_number: null,
          created_at: "2026-05-04T11:00:00+05:30",
          cashless_cases_count: 2,
          last_activity: "2026-05-20T09:00:00+05:30",
          latest_claim: {
            cashless_case_id: 5,
            claim_id: 102,
            status: "complete",
            current_step: "preauth_ready",
            payer_id: "2044@hcx",
            policy_number: "POL-ALT-2026",
            preauth_status: "approved",
            created_at: "2026-05-04T11:05:00+05:30",
          },
          visits: [
            {
              visit_type: "ipd",
              admission_id: 540,
              admission_no: "ADM-540",
              started_at: "2026-05-02T08:00:00+05:30",
              ended_at: "2026-05-06T11:00:00+05:30",
              status: "discharged",
              diagnosis: "Lobar pneumonia",
              primary_doctor: { doctor_id: 2, name: "Dr. Kiran Shah", specialization: "Pulmonologist", registration_no: "MCI-22871" },
              invoices: [
                { invoice_id: 540, invoice_type: "ipd", invoice_no: "IPD-INV-540", invoice_date: "2026-05-06", amount_billed: 42000, final_amount: 40000, final_discount: 2000, billing_status: 1, payment_mode: "Insurance", line_items: [] },
              ],
              payments: [],
              advance_payments: [],
              claims: [],
            },
          ],
        },
        {
          child_id: 27,
          name: "Kabir Nair",
          gender: "male",
          dob: "2016-09-30",
          mobile: "7777777777",
          abha_number: "91-5555-0000-1234",
          created_at: "2026-05-14T09:00:00+05:30",
          cashless_cases_count: 0,
          last_activity: null,
          latest_claim: null,
          visits: [],
        },
    ];
    const name = params.name?.toLowerCase();
    const matched = all.filter(
      (c) =>
        (params.child_id == null || String(c.child_id) === String(params.child_id)) &&
        (!params.mobile || c.mobile === params.mobile) &&
        (!name || c.name.toLowerCase().includes(name)),
    );
    const hasCase = (c) => (c.cashless_cases_count ?? (c.latest_claim ? 1 : 0)) > 0;
    const isOpen = (c) => !!c.latest_claim && !["settled", "complete", "superseded"].includes(c.latest_claim.status) && c.latest_claim.current_step !== "settled";
    const STATES = { any: () => true, with_case: hasCase, open_case: isOpen, no_case: (c) => !hasCase(c) };
    const caseState = STATES[params.case_state] ? params.case_state : "any";
    const sort = params.sort || "newest";
    const lastActivity = (c) => (c.last_activity ? new Date(c.last_activity).getTime() : -Infinity);
    const children = matched.filter(STATES[caseState]).sort((a, b) =>
      sort === "name" ? a.name.localeCompare(b.name) : sort === "recent_activity" ? lastActivity(b) - lastActivity(a) : b.child_id - a.child_id,
    );
    const state_counts = Object.fromEntries(Object.entries(STATES).map(([k, fn]) => [k, matched.filter(fn).length]));
    return { total_count: children.length, limit: 20, offset: 0, case_state: caseState, sort, state_counts, children };
  },

  // ─── Payer Search ───────────────────────────────────────────────────────────
  searchPayers: async (params = {}) => {
    await delay(400);
    const allPayers = [
      {
        code: "1518@hcx",
        name: "Sample Payer",
        scheme_type: "PMJAY",
        status: "active",
      },
      {
        code: "2044@hcx",
        name: "Star Health & Allied",
        scheme_type: "Retail",
        status: "active",
      },
      {
        code: "3011@hcx",
        name: "HDFC ERGO",
        scheme_type: "Corporate",
        status: "active",
      },
      {
        code: "4022@hcx",
        name: "Universal Life",
        scheme_type: "Public Health",
        status: "active",
      },
    ];
    if (params.name) {
      return allPayers.filter((p) =>
        p.name.toLowerCase().includes(params.name.toLowerCase()),
      );
    }
    return allPayers;
  },

  getPayerById: async (id) => {
    await delay(300);
    const allPayers = [
      { code: "1518@hcx", name: "Sample Payer", scheme_type: "PMJAY", status: "active" },
      { code: "2044@hcx", name: "Star Health & Allied", scheme_type: "Retail", status: "active" },
      { code: "3011@hcx", name: "HDFC ERGO", scheme_type: "Corporate", status: "active" },
      { code: "4022@hcx", name: "Universal Life", scheme_type: "Public Health", status: "active" },
    ];
    const payer = allPayers.find((p) => p.code === id);
    if (!payer) throw new Error(`No payer found for ${id}`);
    return payer;
  },

  // ─── Policy Fetch ───────────────────────────────────────────────────────────
  fetchPolicies: async (data) => {
    await delay(1000);
    const MOCK_POLICIES = [
      {
        policy_number: "POL-91711234567890-2026",
        product_name: "GeneralHealth-2026",
        payer_id: "1518@hcx",
        payer_name: "Sample Payer",
        member_id: "MEMB-123456",
        status: "active",
        sum_insured: 500000,
        currency: "INR",
        effective_from: "2026-01-01",
        effective_to: "2026-12-31",
      },
      {
        policy_number: "POL-ALT-2026",
        product_name: "Family Floater Plus",
        payer_id: "2044@hcx",
        payer_name: "Star Health & Allied",
        member_id: "SHA-778812",
        status: "active",
        sum_insured: 300000,
        currency: "INR",
        effective_from: "2026-04-01",
        effective_to: "2027-03-31",
      },
    ];
    // A specific, non-ABHA identifier_type simulates the "no fallback" rule:
    // the cascade never runs, so a type this patient has no value for on file
    // comes back with an empty policies array rather than trying the others.
    if (data.identifier_type === "MobileNo") {
      return {
        status: "success",
        data: {
          child_id: data.child_id,
          payer_id: data.payer_id,
          identifier_used: { type: "MobileNo", value: null },
          policies: [],
          fetched_at: "2026-05-04T10:40:00+05:30",
        },
      };
    }
    if (data.member_id === "ERROR") throw new Error("The insurance registry did not answer in time (gateway timeout).");
    const MOCK_MEMBER_ID_ON_FILE = "MEMB-123456";
    if (data.member_id && data.member_id !== MOCK_MEMBER_ID_ON_FILE) {
      return {
        status: "success",
        data: {
          child_id: data.child_id,
          payer_id: data.payer_id,
          identifier_used: { type: "MemberId", value: data.member_id },
          policies: [],
          fetched_at: "2026-05-04T10:40:00+05:30",
        },
      };
    }
    return {
      status: "success",
      data: {
        child_id: data.child_id,
        payer_id: data.payer_id,
        identifier_used:
          data.member_id || data.identifier_type === "MemberId"
            ? { type: "MemberId", value: data.member_id || MOCK_MEMBER_ID_ON_FILE }
            : data.identifier_type
              ? { type: data.identifier_type, value: "9123456780" }
              : { type: "AbhaNumber", value: "91711234567890" },
        policies: MOCK_POLICIES.filter(
          (policy) => !data.payer_id || policy.payer_id === data.payer_id,
        ),
        fetched_at: "2026-05-04T10:40:00+05:30",
      },
    };
  },

  // ─── Cashless Preparation ───────────────────────────────────────────────────
  prepareCashless: async (data) => {
    await delay(800);
    return {
      cashless_case_id: 4,
      claim_id: data.claim_id,
      child_id: data.child_id,
      payer_id: data.payer_id || "1518@hcx",
      policy_number: data.policy_number,
      status: "pending",
      current_step: "insurance_and_eligibility",
      next_actions: ["refresh"],
      procedures: {
        source: "claim_db",
        items: [
          {
            category: "SE",
            code: "47562",
            name: "Laparoscopic cholecystectomy",
          },
        ],
      },
      insurance_plan: {
        status: "pending",
        correlation_id: "550e8400-e29b-41d4-a716-446655440000",
      },
      coverage_eligibility: {
        status: "pending",
        validation: {
          status: "pending",
          correlation_id: "9e5c60bf-4014-4b72-a2f0-1fe4f9a75e61",
          outcome: null,
          disposition: null,
          inforce: null,
          insurance_items: [],
          errors: [],
        },
        benefits: {
          status: "pending",
          correlation_id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
          outcome: null,
          insurance_items: [],
          errors: [],
        },
        auth_requirements: {
          status: "pending",
          correlation_id: "b2c3d4e5-f6a7-8901-bcde-f12345678901",
          outcome: null,
          auth_required: null,
          insurance_items: [],
          errors: [],
        },
      },
    };
  },

  getCashlessStatus: async (cashless_case_id) => {
    await delay(1000);
    const journey = MOCK_CASE_JOURNEYS[String(cashless_case_id)] || MOCK_CASE_JOURNEYS.default;
    return {
      cashless_case_id,
      claim_id: journey.claim_id,
      child_id: journey.child_id,
      payer_id: "1518@hcx",
      policy_number: "POL-91711234567890-2026",
      status: "complete",
      current_step: journey.current_step,
      next_actions: journey.next_actions,
      procedures: {
        source: "claim_db",
        items: [
          {
            category: "SE",
            code: "47562",
            name: "Laparoscopic cholecystectomy",
          },
        ],
      },
      insurance_plan: {
        status: "complete",
        correlation_id: "550e8400-e29b-41d4-a716-446655440000",
        ...MOCK_PMJAY_PLAN,
      },
      coverage_eligibility: {
        status: "complete",
        validation: {
          status: "complete",
          correlation_id: "9e5c60bf-4014-4b72-a2f0-1fe4f9a75e61",
          outcome: "complete",
          disposition: "Eligible",
          inforce: true,
          wallet: { sum_insured: 500000, used: 36270, balance: 463730, currency: "INR" },
          beneficiaries: [
            { member_id: "100217", name: "Ramesh Kumar", gender: "male", dob: "1978-03-14", relationship: "self", abha_number: "91-7112-3456-7890", policy_code: "POL-91711234567890-2026", plan_name: "ChirayuEx HR PX", checked: true },
            { member_id: "100218", name: "Sunita Devi", gender: "female", dob: "1982-07-02", relationship: "spouse", policy_code: "POL-91711234567890-2026", plan_name: "ChirayuEx HR PX", checked: false },
            { member_id: "100219", name: "Aarav Kumar", gender: "male", dob: "2012-11-20", relationship: "child", policy_code: "POL-91711234567890-2026", plan_name: "ChirayuEx HR PX", checked: false },
          ],
          requirements: [
            { kind: "document", code: "MAND0601", display: "USG abdomen report", text: "Type: pre; Procedure Code: 47562", stage: "pre", for_code: "47562", at_preauth: true, form_url: null },
            { kind: "form", code: "STG-SG039", display: "Cholecystectomy STG questionnaire", text: "fullUrl: https://nha.gov.in/fhir/Questionnaire/STG-SG039", stage: "pre", for_code: "47562", at_preauth: true, form_url: "https://nha.gov.in/fhir/Questionnaire/STG-SG039" },
            { kind: "document", code: "ODN", display: "Discharge summary", text: "Type: post", stage: "post", for_code: null, at_preauth: false, form_url: null },
          ],
          insurance_items: [
            {
              coverage: "Coverage/POL-91711234567890-2026",
              inforce: true,
              benefit_period: { start: "2026-01-01T00:00:00+05:30", end: "2026-12-31T23:59:59+05:30" },
              coverage_details: {
                status: "active",
                member_id: "100217",
                plan: "PX/HR/PX/I-ChirayuEx HR PX",
                plan_name: "ChirayuEx HR PX",
                sum_insured: "500000.00",
                classes: [
                  { id: "plan", name: "Plan", type: "plan", value: "PX/HR/PX/I-ChirayuEx HR PX" },
                  { id: "subplan", name: "Sum Insured", type: "subplan", value: "500000.00" },
                ],
              },
              items: [],
            },
          ],
          errors: [],
        },
        benefits: {
          status: "complete",
          correlation_id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
          outcome: "complete",
          insurance_items: [
            {
              coverage: "Coverage/POL-91711234567890-2026",
              inforce: true,
              items: [
                {
                  sequence: 1,
                  category: { code: "SE", display: "Surgical" },
                  product_or_service: {
                    code: "47562",
                    display: "Laparoscopic cholecystectomy",
                  },
                  excluded: false,
                  benefit: [
                    {
                      type: { code: "benefit", display: "Benefit Limit" },
                      allowed: { type: "Money", value: 22800, currency: "INR" },
                      used: { type: "Money", value: 0, currency: "INR" },
                    },
                  ],
                  authorization_required: true,
                  authorization_supporting: [
                    { code: "MEDICAL_CERTIFICATE", display: "Medical Certificate" },
                    { code: "ESTIMATE", display: "Estimated bill" },
                  ],
                },
                {
                  sequence: 2,
                  category: { code: "ROOM", display: "Room rent" },
                  product_or_service: { code: "WARD-PVT", display: "Private Ward" },
                  excluded: false,
                  benefit: [
                    {
                      type: { code: "room-rent", display: "Room Rent Limit" },
                      allowed: { type: "Money", value: 5000, currency: "INR" },
                      used: { type: "Money", value: 0, currency: "INR" },
                    },
                  ],
                  authorization_required: false,
                  authorization_supporting: [],
                },
              ],
            },
          ],
          errors: [],
        },
        auth_requirements: {
          status: "complete",
          correlation_id: "b2c3d4e5-f6a7-8901-bcde-f12345678901",
          outcome: "complete",
          auth_required: true,
          insurance_items: [
            { coverage: "Coverage/POL-91711234567890-2026", inforce: true, items: [] },
          ],
          errors: [],
        },
      },
      // Nullable — only present once a preauth/claim has actually been
      // submitted for this case. Kept here (rather than omitted) so mock mode
      // exercises the same res.preauth?.correlation_id / res.claim?.status
      // paths the real backend response takes.
      preauth: journey.preauth,
      claim: journey.claim,
      payment: journey.payment ?? null,
    };
  },

  getCaseTimeline: async (cashless_case_id, params = {}) => {
    await delay(500);
    const events = [
      {
        seq: 1, id: "case-4-prepared", ts: "2026-05-01T09:00:00+05:30", type: "case.prepared",
        title: "Cashless case prepared",
        summary: "InsurancePlan and coverage-eligibility checks initiated for policy POL-91711234567890-2026.",
        workflow: "case", stage: "prepared", direction: "internal",
        actor: { kind: "hospital", name: "NHCX Test Hospital", participant_id: "1518@hcx" },
        status: "ok", severity: "info", refs: { policy_number: "POL-91711234567890-2026" },
      },
      {
        seq: 2, id: "tx-1", ts: "2026-05-01T10:00:00+05:30", type: "preauth.submitted",
        title: "Preauth submitted", summary: "Submitted amount ₹50000.",
        workflow: "preauth", stage: "submitted", direction: "outbound",
        actor: { kind: "hospital", name: "NHCX Test Hospital", participant_id: "1518@hcx" },
        correlation_id: "5c2a6db0-b4c1-47e2-bf6d-3db2ed6e8f11", request_id: "req-1", nhcx_workflow_id: 12,
        status: "ok", severity: "info",
        money: { currency: "INR", field: "billed", value: 50000, snapshot: { billed: 50000 } },
        detail: { workflow_type: "new", counts: { procedures: 1, diagnoses: 1, items: 1 } },
      },
      {
        seq: 3, id: "auth-1", ts: "2026-05-01T12:00:00+05:30", type: "preauth.decision",
        title: "Preauth decision received", summary: "PARTIALLY_APPROVED.",
        workflow: "preauth", stage: "decided", direction: "inbound",
        actor: { kind: "payer", name: "1518@hcx", participant_id: "1518@hcx" },
        correlation_id: "5c2a6db0-b4c1-47e2-bf6d-3db2ed6e8f11", nhcx_workflow_id: 241,
        status: "ok", severity: "warning",
        decision: {
          raw_outcome: "partial", reason_codes: ["room-rent-cap"],
          derived_decision: "PARTIALLY_APPROVED", classified_by: "workflow_id", ambiguous: false,
        },
        money: {
          currency: "INR", field: "approved", value: 40000,
          snapshot: { submitted: 50000, eligible: 45000, benefit: 40000, copay: 5000 },
        },
        refs: { preauth_ref: "PA-2026-00001" },
        detail: { process_notes: ["Room rent exceeds policy sub-limit."] },
      },
      {
        seq: 4, id: "tx-2", ts: "2026-05-08T14:00:00+05:30", type: "claim.submitted",
        title: "Final claim submitted", summary: "Submitted amount ₹50000.",
        workflow: "claim", stage: "submitted", direction: "outbound",
        actor: { kind: "hospital", name: "NHCX Test Hospital", participant_id: "1518@hcx" },
        correlation_id: "b19afd0a-9cca-4e31-948e-ffda91b02e58", nhcx_workflow_id: 15,
        status: "ok", severity: "info",
        money: { currency: "INR", field: "billed", value: 50000, snapshot: { billed: 50000 } },
        detail: { workflow_type: "final" },
      },
      {
        seq: 5, id: "claim-101-decision", ts: "2026-05-09T11:00:00+05:30", type: "claim.decision",
        title: "Claim decision received", summary: "APPROVED — approved ₹40000.",
        workflow: "claim", stage: "decided", direction: "inbound",
        actor: { kind: "payer", name: "1518@hcx", participant_id: "1518@hcx" },
        status: "ok", severity: "success",
        decision: { raw_outcome: null, reason_codes: [], derived_decision: "APPROVED", classified_by: "claim_record", ambiguous: false },
        money: { currency: "INR", field: "approved", value: 40000, snapshot: { approved: 40000 } },
        refs: { claim_response_ref: "CR-2026-01", preauth_ref: "PA-2026-00001" },
      },
      {
        seq: 6, id: "pay-1", ts: "2026-05-11T09:00:00+05:30", type: "payment.settled",
        title: "Payment settled", summary: "Settled ₹39600 · UTR UTR123456789.",
        workflow: "payment", stage: "settled", direction: "inbound",
        actor: { kind: "payer", name: "1518@hcx", participant_id: "1518@hcx" },
        correlation_id: "pay-corr-1", nhcx_workflow_id: 47, status: "ok", severity: "success",
        money: { currency: "INR", field: "settled", value: 39600, snapshot: { gross: 40000, tds: 400, net: 39600 } },
        refs: { payment_reference: "PAY-REF-1", utr: "UTR123456789" },
      },
    ];
    const filtered = events.filter(
      (e) => (!params.workflow || e.workflow === params.workflow) && (!params.actor || e.actor.kind === params.actor),
    );
    return {
      cashless_case_id: Number(cashless_case_id) || 4,
      claim_id: 101,
      child_id: 12,
      generated_at: new Date().toISOString(),
      money_ledger: {
        currency: "INR",
        billed: { value: 50000 },
        eligible: { value: 45000 },
        authorized_ceiling: { value: 40000, cumulative: true, components: [{ ref: "PA-2026-00001", value: 40000 }] },
        approved: { value: 40000 },
        copay: { value: 5000 },
        deductible: { value: null },
        disallowed: { value: 5000 },
        patient_payable: { value: 10000, confidence: "final", formula: "copay + disallowed" },
        settlement: { gross: 40000, tds: 400, net: 39600, utr: "UTR123456789", settled: true, short_payment: true },
        reconciliation: { variance_vs_authorized: 10000, to_collect_from_patient: 10000 },
      },
      total_count: filtered.length,
      limit: params.limit || 200,
      offset: params.offset || 0,
      events: filtered,
    };
  },

  getCaseBundle: async (cashless_case_id, transaction_type, params = {}) => {
    await delay(400);
    const knownCorrelationIds = {
      preauth: "5c2a6db0-b4c1-47e2-bf6d-3db2ed6e8f11",
      claim: "b19afd0a-9cca-4e31-948e-ffda91b02e58",
      payment: "pay-corr-1",
    };
    const correlation_id = params.correlation_id || knownCorrelationIds[transaction_type];
    if (!correlation_id) return null;

    const sampleBundle = (direction) => ({
      resourceType: "Bundle",
      type: "collection",
      id: `${transaction_type}-${direction}-${correlation_id}`,
      entry: [
        { resource: { resourceType: "Claim", id: "claim-mock-1", status: "active" } },
        { resource: { resourceType: "Patient", id: "patient-mock-1", name: [{ text: "Arjun Mehta" }] } },
      ],
    });

    return {
      cashless_case_id: Number(cashless_case_id) || 4,
      transaction_type,
      correlation_id,
      outbound: { bundle: sampleBundle("outbound"), captured_at: "2026-05-01T10:00:00+05:30" },
      inbound: transaction_type === "communication"
        ? null
        : { bundle: sampleBundle("inbound"), captured_at: "2026-05-01T12:00:00+05:30" },
    };
  },

  // ─── Preauthorization ───────────────────────────────────────────────────────
  preparePreauth: async (params = {}) => {
    await delay(800);
    return {
      admissibility: {
        status: "checked",
        plan_fetched_at: "2026-10-27T10:00:00+05:30",
        blocking: false,
        checks: [
          { level: "ok", kind: "package_in_plan", code: "SG045A", message: "Appendicectomy (open) (SG045A) is in the payer's plan." },
          { level: "warn", kind: "package_not_in_plan", code: "XX999", message: "Wound dressing (XX999) is not in the payer's plan. The payer may refuse it (PAYR-1204)." },
          { level: "warn", kind: "document_missing", code: "USG", message: "Ultrasound report is asked for at pre-authorisation and is not attached." },
          { level: "info", kind: "enhancement_not_allowed", code: "SG045A", message: "Appendicectomy (open) allows no enhancement later (PAYR-1011)." },
        ],
        exclusions: ["Cosmetic surgery"],
      },
      claim_id: params.claim_id || 101,
      payer_id: params.payer_id || "1518@hcx",
      policy_number: params.policy_number || "POL-91711234567890-2026",
      patient: {
        id: 12,
        name: "Arjun Mehta",
        gender: "male",
        dob: "2020-01-01",
        abha: "91-7112-3456-7890",
        member_id: "MEMB-123",
      },
      admission_date: "2026-05-04",
      inpatient: true,
      urgent: false,
      diagnoses: [
        {
          code: "K80.20",
          name: "Calculus of gallbladder",
          primary: true,
          on_admission: true,
        },
      ],
      procedures: [
        {
          code: "47562",
          name: "Laparoscopic cholecystectomy",
          date: "2026-05-04",
        },
      ],
      items: [
        {
          service_code: "47562",
          service_name: "Laparoscopic cholecystectomy",
          category: "SE",
          service_start_date: "2026-05-04",
          quantity: 1,
          unit_price: 50000,
          net_amount: 50000,
          care_team_sequence: [1],
          diagnosis_sequence: [1],
          procedure_sequence: [1],
        },
      ],
      care_team: [
        {
          doc_id: "DOC-1",
          doc_name: "Dr. Meera Rao",
          speciality: "MS",
          speciality_display: "General Surgery",
          registration_no: "MCI-12345",
        },
      ],
      supporting_documents: [
        {
          category: "admission_note",
          name: "Admission Note",
          code: "ADM_NOTE",
          event_date: "2026-05-04",
          url: "https://hospital.example/records/101/admission-note.pdf",
        },
        {
          category: "investigation",
          name: "Investigation Report",
          code: "INVESTIGATION_REPORT",
          event_date: "2026-05-04",
          url: null,
        },
      ],
      total_amount: 50000,
      eligibility: {
        correlation_id: "9e5c60bf-4014-4b72-a2f0-1fe4f9a75e61",
        status: "complete",
        outcome: "complete",
        inforce: true,
        auth_required: true,
        insurance_items: [],
        errors: [],
      },
      missing_fields: [],
    };
  },

  submitPreauth: async (data) => {
    await delay(1000);
    return {
      correlation_id: "5c2a6db0-b4c1-47e2-bf6d-3db2ed6e8f11",
      preauth_ref: null,
      policy_number: data.policy_number || "POL-91711234567890-2026",
      status: "submitted",
      message: "Preauthorization request submitted",
    };
  },

  submitPreauthEnhancement: async (data) => {
    await delay(1000);
    return {
      correlation_id: "7a3b9c21-f1e2-4d5a-b6c7-8e9f0a1b2c3d",
      preauth_ref: null,
      policy_number: data.policy_number || "POL-91711234567890-2026",
      status: "submitted",
      message: "Pre-authorization enhancement submitted",
    };
  },

  preparePreauthEnhancement: async (params = {}) => {
    await delay(800);
    // An approved lap-chole case that later needed ICU care: two new line
    // items and one new procedure on top of the authorized ₹50,000.
    const authorizedItems = [
      { service_code: "47562", service_name: "Laparoscopic cholecystectomy", category: "SE", quantity: 1, unit_price: 50000, net_amount: 50000 },
    ];
    const newItems = [
      { service_code: "ICU-DAY", service_name: "ICU stay (per day)", category: "ICU", quantity: 2, unit_price: 6000, net_amount: 12000, is_new: true },
      { service_code: "43239", service_name: "Upper GI endoscopy with biopsy", category: "SE", quantity: 1, unit_price: 8500, net_amount: 8500, is_new: true },
    ];
    return {
      cashless_case_id: params.cashless_case_id || 5,
      claim_id: params.claim_id || 101,
      payer_id: "1518@hcx",
      policy_number: "POL-91711234567890-2026",
      preauth_ref: "PA-2026-00001",
      enhanceable: true,
      reason: null,
      authorized: {
        total_amount: 50000,
        approved_amount: 40000,
        procedures: [{ code: "47562", name: "Laparoscopic cholecystectomy", date: "2026-05-04" }],
        items: authorizedItems,
      },
      current: {
        total_amount: 70500,
        procedures: [
          { code: "47562", name: "Laparoscopic cholecystectomy", date: "2026-05-04" },
          { code: "43239", name: "Upper GI endoscopy with biopsy", date: "2026-05-06", is_new: true },
        ],
        items: [...authorizedItems, ...newItems],
      },
      new_procedures: [{ code: "43239", name: "Upper GI endoscopy with biopsy", date: "2026-05-06", is_new: true }],
      new_items: newItems,
      delta_amount: 20500,
      supporting_documents: [
        { category: "investigation", name: "ICU admission note", code: "ICU_NOTE", event_date: "2026-05-05", url: "https://hospital.example/records/101/icu-note.pdf" },
      ],
      missing_fields: [],
      suggested_request: { items: [...authorizedItems, ...newItems], total_amount: 70500 },
    };
  },

  resubmitPreauth: async (data) => {
    await delay(1000);
    return {
      correlation_id: "8d2fd8d9-c8a1-4f3c-9ac8-8de7bdf95c44",
      preauth_ref: null,
      policy_number: data.policy_number || "POL-91711234567890-2026",
      status: "submitted",
      message: "Preauthorization resubmission submitted",
    };
  },

  respondPreauthQuery: async (data) => {
    await delay(1000);
    return {
      correlation_id: "92718f2b-c9fb-4cfd-88de-1028f92735b2",
      preauth_ref: null,
      policy_number: data.policy_number || "POL-91711234567890-2026",
      status: "submitted",
      message: "Preauthorization query response submitted",
    };
  },

  cancelPreauth: async (data) => {
    await delay(800);
    return {
      correlation_id: "b05fd989-e852-4542-8476-e6ac99e709cb",
      preauth_ref: data.preauth_ref || "PA-2026-00001",
      policy_number: null,
      status: "submitted",
      message: "Preauthorization cancellation submitted",
    };
  },

  // ─── Specific Coverage Eligibility APIs ─────────────────────────────────────
  requestInsurancePlan: async (data) => {
    await delay(800);
    if (!data.refresh) {
      return {
        correlation_id: "mock-ins-plan-123",
        status: "complete",
        reused: true,
        reused_from: "550e8400-e29b-41d4-a716-446655440000",
        message: "Using the package master already held for this policy - Fetch again asks the payer for a new one.",
      };
    }
    return {
      correlation_id: "mock-ins-plan-123",
      status: "refused",
      pending_correlation_id: "550e8400-e29b-41d4-a716-446655440000",
      error: { code: "PAYR-1406", message: "A package master request for this policy is already being fetched." },
      message: "A package master request for this policy is already being fetched.",
    };
  },
  getInsurancePlanStatus: async (correlation_id) => {
    await delay(800);
    return { correlation_id, status: "complete" };
  },
  getInsurancePlanForms: async (correlation_id, url) => {
    await delay(300);
    const forms = MOCK_PLAN_FORMS.map(({ items, ...f }) => ({ ...f, item_count: items.length }));
    if (!url) return { correlation_id, forms };
    return MOCK_PLAN_FORMS.find((f) => f.url === url) || null;
  },
  getInsurancePlanBenefits: async (correlation_id, { category, q, limit = 50, offset = 0 } = {}) => {
    await delay(300);
    const term = String(q || "").trim().toLowerCase();
    const rows = MOCK_PMJAY_BENEFITS.filter(
      (b) =>
        (!category || b.category_code === category) &&
        (term.length < 2 || b.code.toLowerCase().includes(term) || b.display.toLowerCase().includes(term)),
    );
    return {
      correlation_id,
      plan_status: "ready",
      categories: MOCK_PMJAY_PLAN.categories,
      total: rows.length,
      limit,
      offset,
      benefits: rows.slice(offset, offset + limit),
    };
  },
  checkCoverage: async (data) => {
    await delay(800);
    return { correlation_id: "mock-cov-123", status: "submitted" };
  },
  getAuthRequirements: async (data) => {
    await delay(800);
    return { correlation_id: "mock-auth-req-123", status: "submitted" };
  },
  validateCoverage: async (data) => {
    await delay(800);
    return {
      correlation_id: "val-1234-5678",
      status: "submitted",
    };
  },

  checkBenefits: async (data) => {
    await delay(800);
    return {
      correlation_id: "ben-1234-5678",
      status: "submitted",
    };
  },

  discoverCoverage: async (data) => {
    await delay(600);
    if (!data.payer_id) throw new Error("Choose the payer to ask");
    if (!data.policy_number && !data.member_id) throw new Error("Enter the policy number or the member id to ask about");
    const correlation_id = `disc-${Date.now()}`;
    mockDiscoveries.unshift({
      correlation_id,
      payer_id: data.payer_id,
      sent_at: new Date().toISOString(),
      policy_number: data.policy_number || undefined,
      member_id: data.member_id || undefined,
      abha_number: data.abha_number || undefined,
    });
    return { correlation_id, request_id: correlation_id, payer_id: data.payer_id, status: "submitted", message: "Eligibility request queued to the payer." };
  },

  adoptDiscoveredCover: async (correlation_id, data) => {
    await delay(400);
    const discovery = mockDiscoveries.find((d) => d.correlation_id === correlation_id);
    return {
      status: "adopted",
      correlation_id,
      policy: {
        policy_number: data.policy_code,
        product_name: "PMJAY for Himachal",
        payer_id: discovery?.payer_id,
        payer_name: discovery?.payer_id,
        member_id: data.member_id,
        status: "active",
        sum_insured: 500000,
        currency: "INR",
        effective_to: "2027-03-31",
        source: "discovery",
      },
    };
  },

  getCoverageEligibilityStatus: async (correlation_id) => {
    const discovery = mockDiscoveries.find((d) => d.correlation_id === correlation_id);
    if (discovery) {
      await delay(300);
      const base = { correlation_id, purpose: "discovery", payer_id: discovery.payer_id, submitted_at: discovery.sent_at };
      if (Date.now() - new Date(discovery.sent_at).getTime() < 3000) return { ...base, status: "pending", covers: [] };
      if (discovery.policy_number === "NOCOVER") return { ...base, status: "complete", covers: [] };
      if (discovery.policy_number === "REFUSE") {
        return { ...base, status: "failed", covers: [], errors: [{ code: "PAYR-1008", message: "Beneficiary not found for the given policy" }] };
      }
      const shared = {
        policy_code: discovery.policy_number || "PMJAY/HP/S/G",
        plan_name: "PMJAY for Himachal",
        status: "active",
        sum_insured: 500000,
        balance: 450000,
        currency: "INR",
        valid_until: "2027-03-31",
        members_on_cover: 2,
      };
      return {
        ...base,
        status: "complete",
        covers: [
          { ...shared, member_id: discovery.member_id || "MD5SLS4X5", name: "Asha Devi", gender: "female", dob: "1984-02-11", relationship: "Self", abha_number: discovery.abha_number },
          { ...shared, member_id: "MD5SLS4X6", name: "Ravi Devi", gender: "male", dob: "2012-07-04", relationship: "Son" },
        ],
      };
    }
    await delay(1500);
    return {
      correlation_id,
      status: "complete",
      outcome: "complete",
      disposition: "Eligible",
      inforce: true,
      auth_required: true,
      insurance_items: [],
    };
  },

  getPreauthStatus: async (correlation_id) => {
    await delay(1500);
    return {
      correlation_id,
      claim_id: 101,
      workflow: "preauth",
      status: "complete",
      decision: "APPROVED",
      preauth_ref: "PA-2026-00001",
      items: [
        {
          sequence: 1,
          detail_sequence: 1,
          adjudication: {
            submitted: { value: 50000, currency: "INR" },
            eligible: { value: 45000, currency: "INR" },
            benefit: { value: 40000, currency: "INR" },
            copay: { value: 5000, currency: "INR" },
            deductible: null,
          },
          notes: [1],
        },
      ],
      totals: {
        submitted: { value: 50000, currency: "INR" },
        eligible: { value: 45000, currency: "INR" },
        benefit: { value: 40000, currency: "INR" },
        copay: { value: 5000, currency: "INR" },
      },
      errors: [],
      process_notes: [
        {
          number: 1,
          type: "display",
          text: "Preauth approved for package amount. Proceed to claim submission after discharge.",
          language: "en",
        },
      ],
    };
  },

  // ─── Claims ─────────────────────────────────────────────────────────────────
  prepareClaimDraft: async (params = {}) => {
    await delay(800);
    return {
      claim_id: params.claim_id || 101,
      payer_id: "1518@hcx",
      policy_number: "POL-91711234567890-2026",
      preauth_ref: "PA-2026-00001",
      preauth_status: "APPROVED",
      status: "submitted",
      admission_date: "2026-05-04",
      discharge_date: "2026-05-07",
      total_amount: 50000,
      patient: {
        id: 12,
        name: "Arjun Mehta",
        gender: "male",
        dob: "2020-01-01",
      },
      diagnoses: [
        {
          code: "K80.20",
          name: "Calculus of gallbladder",
          primary: true,
          on_admission: true,
        },
      ],
      procedures: [{ code: "47562", name: "Laparoscopic cholecystectomy" }],
      items: [
        {
          service_code: "PKG-LAP-CHOLE",
          service_name: "Laparoscopic cholecystectomy package",
          category: "SE",
          quantity: 1,
          unit_price: 50000,
          net_amount: 50000,
        },
      ],
      care_team: [
        {
          doc_id: 501,
          doc_name: "Dr. Meera Rao",
          speciality: "MS",
          registration_no: "MCI-12345",
          role: "primary",
        },
      ],
      supporting_documents: [
        {
          category: "discharge_summary",
          name: "Discharge Summary",
          code: "DISCHARGE_SUMMARY",
          event_date: "2026-05-07",
          url: "https://hospital.example/records/101/discharge.pdf",
        },
        {
          category: "final_bill",
          name: "Final Bill",
          code: "FINAL_BILL",
          event_date: "2026-05-07",
          url: "https://hospital.example/records/101/final-bill.pdf",
        },
      ],
      missing_fields: [],
    };
  },

  patchPatientContext: async (claim_id, data) => {
    await delay(800);
    return {
      status: "success",
      message: "Patient context updated",
      missing_fields: [],
    };
  },

  patchCashlessPatientContext: async (cashless_case_id, data) => {
    await delay(800);
    return {
      status: "success",
      message: "Patient context updated",
      missing_fields: [],
    };
  },

  submitDischargeClaim: async () => {
    await delay(1000);
    return {
      correlation_id: "f3be6a19-f3f4-4624-8f1d-384a37cead9d",
      status: "submitted",
      message: "Discharge claim submitted (wf=14)",
    };
  },

  submitFinalClaim: async () => {
    await delay(1000);
    return {
      correlation_id: "0e20b352-c4b7-49fa-9246-a8357d236f48",
      status: "submitted",
      message: "Claim submitted for adjudication",
    };
  },

  respondClaimQuery: async () => {
    await delay(800);
    return {
      correlation_id: "abc123-claim-query-response",
      status: "submitted",
      message: "Claim query response submitted",
    };
  },

  requestClaimRelease: async () => {
    await delay(800);
    return {
      correlation_id: "abc123-claim-release",
      status: "submitted",
      message: "Balance release request sent to the payer.",
    };
  },

  // Corrects a rejected *discharge* (interim, wf=14) claim under NHCX
  // workflow DC01 — distinct from resubmitClaim, which is for a rejected
  // *final* claim (workflow 16). No reprocess option applies here since no
  // final claim has been submitted yet to appeal.
  resubmitDischargeClaim: async () => {
    await delay(800);
    return {
      correlation_id: "abc123-discharge-resubmit",
      status: "submitted",
      message: "Discharge claim submitted (wf=14)",
    };
  },

  getClaimStatus: async (correlation_id) => {
    await delay(1200);
    return {
      correlation_id,
      claim_id: 101,
      workflow: "claim",
      submitted_at: "2026-05-11T11:30:00+05:30",
      status: "complete",
      decision: "APPROVED",
      approved_amount: 40000,
      payment_status: null,
      items: [
        {
          sequence: 1,
          adjudication: {
            submitted: { value: 50000, currency: "INR" },
            benefit: { value: 40000, currency: "INR" },
          },
        },
      ],
      totals: {
        submitted: { value: 50000, currency: "INR" },
        benefit: { value: 40000, currency: "INR" },
      },
      errors: [],
      process_notes: [],
    };
  },

  // ─── Reprocess ──────────────────────────────────────────────────────────────
  submitReprocess: async () => {
    await delay(1000);
    return {
      correlation_id: "6928d2cd-81f6-48b0-9c62-bf8f5a311847",
      status: "submitted",
      message: "Reprocess request submitted",
    };
  },

  getReprocessStatus: async (correlation_id) => {
    await delay(1200);
    if (String(correlation_id).startsWith("mock-enquiry-")) {
      return {
        correlation_id,
        workflow: "status_enquiry",
        status: "complete",
        answer: "queued",
        detail: "Under medical review; stage: preauth; outcome: queued",
        answered_at: new Date().toISOString(),
      };
    }
    return {
      correlation_id,
      claim_id: 101,
      status: "complete",
      decision: "APPROVED",
      errors: [],
      process_notes: [
        {
          number: 1,
          type: "display",
          text: "Appeal accepted. Approved amount revised to ₹45,000.",
          language: "en",
        },
      ],
    };
  },

  // ─── Payment ────────────────────────────────────────────────────────────────
  searchPaymentStatus: async (params = {}) => {
    await delay(700);
    // Only case 5's claim has been paid. Every other claim gets the backend's
    // real "no notices yet" shape so the empty state is exercised.
    if (params.claim_id != null && String(params.claim_id) !== "102") {
      return { status: "not_found", filters: { claim_id: params.claim_id }, settled: false, total_events: 0, events: [] };
    }
    return {
      status: "found",
      latest_stage: "PAYMENT_SETTLED",
      settled: true,
      total_events: 2,
      events: [
        {
          correlation_id: "c9a1e6b0-1111-4a2e-9c3a-000000000001",
          claim_id: 102,
          payer_id: "1518@hcx",
          provider_id: "1@hcx",
          payment_reference: "PAY-2026-00001",
          claim_reference: "CLM-101",
          event_key: "c9a1e6b0-1111-4a2e-9c3a-000000000001:30:PAY-2026-00001:CLM-101:",
          payment_stage: "PAYMENT_INITIATED",
          workflow_id: 30,
          notice_identifier: "NOTICE-2026-00001",
          notice_status: "active",
          notice_amount: 40000,
          notice_created_at: "2026-05-14T10:00:00+05:30",
          gross_amount: 40000,
          tds_amount: 400,
          net_payment_amount: 39600,
          payment_date: "2026-05-14",
          utr: null,
          currency: "INR",
          acknowledgement_status: "submitted",
          acknowledgement_error: null,
          received_at: "2026-05-14T10:05:00+05:30",
        },
        {
          correlation_id: "c9a1e6b0-1111-4a2e-9c3a-000000000002",
          claim_id: 102,
          payer_id: "1518@hcx",
          provider_id: "1@hcx",
          payment_reference: "PAY-2026-00001",
          claim_reference: "CLM-101",
          event_key: "c9a1e6b0-1111-4a2e-9c3a-000000000002:33:PAY-2026-00001:CLM-101:UTR123456789",
          payment_stage: "PAYMENT_SETTLED",
          workflow_id: 33,
          recon_identifier: "RECON-2026-00001",
          notice_amount: 40000,
          gross_amount: 40000,
          tds_amount: 400,
          net_payment_amount: 39600,
          payment_date: "2026-05-15",
          utr: "UTR123456789",
          utr_type: "NEFT",
          currency: "INR",
          acknowledgement_status: "submitted",
          acknowledgement_error: null,
          received_at: "2026-05-15T09:30:00+05:30",
        },
      ],
    };
  },

  getPaymentStatus: async (correlation_id) => {
    await delay(600);
    return {
      status: "found",
      latest_stage: "PAYMENT_SETTLED",
      settled: true,
      total_events: 1,
      events: [
        {
          payment_reference: "PAY-2026-00001",
          claim_reference: "CLM-101",
          payment_stage: "PAYMENT_SETTLED",
          notice_amount: 40000,
          gross_amount: 40000,
          tds_amount: 400,
          net_payment_amount: 39600,
          payment_date: "2026-05-15",
          utr: "UTR123456789",
          acknowledgement_status: "submitted",
          acknowledgement_error: null,
        },
      ],
    };
  },

  acknowledgePayment: async () => {
    await delay(800);
    return {
      correlation_id: "ack-" + Date.now(),
      status: "submitted",
      message: "Payment acknowledgement submitted",
    };
  },

  // ─── Tasks ──────────────────────────────────────────────────────────────────
  listTasks: async (params = {}) => {
    await delay(600);
    const allTasks = [
      {
        id: "T-204",
        task_id: "T-204",
        claim_id: null,
        cashless_case_id: 18,
        child_id: 31,
        patient_name: "Kabir Nair",
        payer_id: "1518@hcx",
        payer_name: "Star Health",
        case_stage: "APPROVED",
        correlation_id: "53e76ac2-8aea-4296-8f50-4cb4449440b4",
        workflow: "claim",
        task_type: "review_callback_failure",
        title: "Payer response could not be processed",
        description:
          "The payer replied but we could not read the response, so this case's outcome is still unknown. Retry once the cause is fixed, or confirm the outcome with the payer directly.",
        priority: "high",
        status: params.status || "pending",
        required_documents: [],
        action: {
          label: "Retry payer response",
          code: "review_callback_failure",
          method: "POST",
          endpoint:
            "/api/v1/insurance/cashless/callbacks/53e76ac2-8aea-4296-8f50-4cb4449440b4/reprocess",
        },
        metadata: {
          error_class: "TypeError",
          error_message: "no implicit conversion of String into Integer",
          workflow_id: "20",
          sender_code: "1518@hcx",
          retryable: true,
        },
        created_at: "2026-06-04T10:59:00+05:30",
        completed_at: null,
      },
      {
        id: "T-205",
        task_id: "T-205",
        claim_id: null,
        cashless_case_id: 22,
        child_id: 31,
        patient_name: "Kabir Nair",
        payer_id: "1518@hcx",
        payer_name: "Star Health",
        case_stage: "APPROVED",
        correlation_id: "a91f0c33-1f2e-4a77-9d21-77c1e0aa4410",
        workflow: "preauth",
        task_type: "cancel_superseded_preauth",
        title: "Withdraw preauthorization with the previous payer",
        description:
          "This case moved to a different payer after a preauthorization had already been sent. Withdraw the request with the previous payer so they do not hold an open authorization. The case continues as #24.",
        priority: "high",
        status: params.status || "pending",
        required_documents: [],
        action: {
          label: "Cancel preauth",
          code: "cancel_superseded_preauth",
          method: "POST",
          endpoint: "/api/v1/insurance/cashless/preauth/cancel",
          payload_hint: { cashless_case_id: 22 },
        },
        metadata: { superseded_by: 24, payer_id: "1518@hcx" },
        created_at: "2026-06-04T09:15:00+05:30",
        completed_at: null,
      },
      {
        id: "T-201",
        task_id: "T-201",
        claim_id: 101,
        cashless_case_id: 4,
        child_id: 12,
        patient_name: "Arjun Mehta",
        payer_id: "1518@hcx",
        payer_name: "Star Health",
        case_stage: "QUERIED",
        correlation_id: "5c2a6db0-b4c1-47e2-bf6d-3db2ed6e8f11",
        workflow: "preauth",
        task_type: "respond_preauth_query",
        title: "Respond to preauth query from Sample Payer",
        description:
          "Payer has raised a query requesting investigation report and clinical justification.",
        priority: "urgent",
        status: params.status || "pending",
        required_documents: [
          {
            code: "INVESTIGATION_REPORT",
            display: "Investigation Report",
            name: "Investigation Report",
          },
          {
            code: "MEDICAL_CERTIFICATE",
            display: "Medical Certificate",
            name: "Medical Certificate",
          },
        ],
        action: {
          label: "Respond to Query",
          code: "respond_preauth_query",
          method: "POST",
          endpoint: "/nhcx/api/v1/insurance/cashless/preauth/query-response",
          payload_hint: { claim_id: 101 },
        },
        metadata: {
          decision: "QUERIED",
          payer_notes:
            "Clinical justification required for procedure code 47562.",
        },
        created_at: "2026-06-04T10:00:00+05:30",
        completed_at: null,
      },
      {
        id: "T-202",
        task_id: "T-202",
        claim_id: 102,
        cashless_case_id: 5,
        patient_name: "Aisha Kapoor",
        payer_name: "Star Health",
        case_stage: "APPROVED",
        child_id: 19,
        correlation_id: "ack-corr-102",
        workflow: "payment",
        task_type: "review_payment_ack_failure",
        title: "Retry payment acknowledgement for Claim #102",
        description: "Auto-acknowledgement failed. Manual retry required.",
        priority: "high",
        status: params.status || "pending",
        required_documents: [],
        action: {
          label: "Retry Acknowledgement",
          code: "acknowledge_payment",
          method: "POST",
          endpoint: "/nhcx/api/v1/insurance/cashless/payment/acknowledge",
          payload_hint: { payment_reference: "PAY-2026-00001" },
        },
        metadata: { acknowledgement_error: "Timeout reaching NHCX gateway" },
        created_at: "2026-06-03T08:30:00+05:30",
        completed_at: null,
      },
      {
        id: "T-203",
        task_id: "T-203",
        claim_id: 103,
        cashless_case_id: 6,
        patient_name: "Riya Sharma",
        payer_name: "Niva Bupa",
        case_stage: "APPROVED",
        child_id: 25,
        correlation_id: null,
        workflow: "claim",
        task_type: "submit_final_claim",
        title: "Submit final bill for Riya Sharma",
        description:
          "Final invoice is ready. Submit the final claim for adjudication.",
        priority: "normal",
        status: params.status || "pending",
        required_documents: [
          { code: "FINAL_BILL", display: "Final Bill", name: "Final Bill" },
          {
            code: "DISCHARGE_SUMMARY",
            display: "Discharge Summary",
            name: "Discharge Summary",
          },
        ],
        action: {
          label: "Submit Final Claim",
          code: "submit_final_claim",
          method: "POST",
          endpoint: "/nhcx/api/v1/insurance/cashless/claims/submit",
          payload_hint: { claim_id: 103 },
        },
        metadata: {},
        created_at: "2026-06-02T12:00:00+05:30",
        completed_at: null,
      },
    ];
    const filtered = params.status
      ? allTasks.filter((t) => t.status === params.status)
      : allTasks;
    const byChild = params.child_id
      ? filtered.filter((t) => t.child_id === Number(params.child_id))
      : filtered;
    return {
      total_count: byChild.length,
      limit: params.limit || 20,
      offset: params.offset || 0,
      tasks: byChild,
    };
  },

  getTask: async (task_id) => {
    await delay(400);
    return {
      id: task_id,
      task_id,
      claim_id: 101,
      cashless_case_id: 4,
      child_id: 12,
      correlation_id: "5c2a6db0-b4c1-47e2-bf6d-3db2ed6e8f11",
      workflow: "preauth",
      task_type: "respond_preauth_query",
      title: "Respond to preauth query from Sample Payer",
      description:
        "Payer has raised a query requesting investigation report and clinical justification.",
      priority: "urgent",
      status: "pending",
      required_documents: [
        {
          code: "INVESTIGATION_REPORT",
          display: "Investigation Report",
          name: "Investigation Report",
        },
        {
          code: "MEDICAL_CERTIFICATE",
          display: "Medical Certificate",
          name: "Medical Certificate",
        },
      ],
      action: {
        label: "Respond to Query",
        code: "respond_preauth_query",
        method: "POST",
        endpoint: "/nhcx/api/v1/insurance/cashless/preauth/query-response",
        payload_hint: { claim_id: 101 },
      },
      metadata: {
        decision: "QUERIED",
        errors: [],
        payer_notes:
          "Clinical justification required for procedure code 47562.",
      },
      created_at: "2026-06-04T10:00:00+05:30",
      completed_at: null,
    };
  },

  completeTask: async (task_id, data = {}) => {
    await delay(500);
    return {
      id: task_id,
      task_id,
      status: "completed",
      note: data.note || "",
      completed_at: new Date().toISOString(),
    };
  },

  reprocessCallback: async (correlation_id) => {
    await delay(900);
    return {
      status: "reprocessed",
      correlation_id,
      message: "Callback replayed",
    };
  },

  // ─── Communications ─────────────────────────────────────────────────────────
  listCommunications: async (params = {}) => {
    await delay(600);
    const all = [
        {
          correlation_id: "comm-abc-000",
          workflow: "communication",
          status: "complete",
          payer_id: "1518@hcx",
          payer_name: "Sample Payer",
          reason_code: "additionalinfo",
          reason_display: "Additional Information",
          topic_display: "Clinical notes required",
          priority: "urgent",
          claim_reference: "CASE-4",
          cashless_case_id: 4,
          claim_id: 101,
          child_id: 12,
          subject: "Case CASE-4 / Arjun Mehta",
          sent_at: "2026-06-05T08:15:00+05:30",
          received_at: "2026-06-05T08:15:03+05:30",
          acknowledged: true,
          acknowledged_at: "2026-06-05T08:15:04+05:30",
          provider_read: false,
          provider_read_at: null,
          ack_correlation_id: "ack-addinfo-000",
          comm_status: "in-progress",
          task_requester: "Sample Payer",
          authored_on: "2026-06-05T08:15:00+05:30",
          task_inputs: { claimNumber: "CASE-4", CLINICAL_NOTES: "Clinical Notes" },
          payload: [
            {
              content_string:
                "Please attach the treating doctor's clinical notes for the current admission before we can proceed with the pre-authorisation.",
            },
          ],
          pending_tasks: [],
          completed_tasks: [],
        },
        {
          correlation_id: "comm-abc-001",
          workflow: "communication",
          status: "complete",
          payer_id: "1518@hcx",
          reason_code: "tatquery",
          reason_display: "TAT Query",
          topic_display: "Pre-authorization TAT Exceeded",
          priority: "urgent",
          claim_reference: "CLM-101",
          cashless_case_id: 4,
          claim_id: 101,
          child_id: 12,
          subject: "Claim CLM-101 / Arjun Mehta",
          sent_at: "2026-06-03T09:00:00+05:30",
          received_at: "2026-06-03T09:00:05+05:30",
          acknowledged: true,
          acknowledged_at: "2026-06-03T09:00:06+05:30",
          provider_read: true,
          provider_read_at: "2026-06-03T09:05:00+05:30",
          ack_correlation_id: "ack-tatq-001",
          comm_status: "completed",
          task_requester: "Sample Payer",
          authored_on: "2026-06-03T09:00:00+05:30",
          task_inputs: { claimNumber: "CLM-101", claimId: "101" },
          payload: [
            {
              content_string:
                "The pre-authorization for claim CLM-101 has exceeded the standard TAT of 2 hours. Please update the clinical status and confirm the estimated discharge date.",
            },
          ],
          pending_tasks: [],
          completed_tasks: [],
        },
        {
          correlation_id: "comm-abc-002",
          workflow: "communication",
          status: "complete",
          payer_id: "2044@hcx",
          reason_code: "additionalinfo",
          reason_display: "Additional Information",
          topic_display: "Additional Documents Required",
          priority: "asap",
          claim_reference: "CLM-102",
          cashless_case_id: 5,
          claim_id: 102,
          child_id: 19,
          subject: "Claim CLM-102 / Aisha Kapoor",
          sent_at: "2026-06-04T11:30:00+05:30",
          received_at: "2026-06-04T11:30:04+05:30",
          acknowledged: true,
          acknowledged_at: "2026-06-04T11:30:05+05:30",
          provider_read: false,
          provider_read_at: null,
          ack_correlation_id: "ack-addinfo-002",
          comm_status: "completed",
          task_requester: "Star Health & Allied",
          authored_on: "2026-06-04T11:30:00+05:30",
          task_inputs: {
            claimNumber: "CLM-102",
            claimId: "102",
            INVESTIGATION_REPORT: "Investigation Report",
            DISCHARGE_SUMMARY: "Discharge Summary",
          },
          payload: [
            {
              content_string:
                "Please submit the investigation report and discharge summary for claim CLM-102 to proceed with adjudication.",
            },
            {
              content_attachment: "https://payer.example/query-letter-102.pdf",
            },
          ],
          pending_tasks: [
            {
              id: "T-301",
              task_id: "T-301",
              task_type: "review_communication",
              title: "Submit documents for Aisha Kapoor — Claim #102",
              description:
                "Payer has requested investigation report and discharge summary.",
              priority: "urgent",
              workflow: "communication",
              status: "pending",
              required_documents: [
                {
                  code: "INVESTIGATION_REPORT",
                  name: "Investigation Report",
                  display: "Investigation Report",
                },
                {
                  code: "DISCHARGE_SUMMARY",
                  name: "Discharge Summary",
                  display: "Discharge Summary",
                },
              ],
              action: {
                label: "Submit Documents",
                code: "respond_claim_query",
                method: "POST",
                endpoint: "/nhcx/api/v1/insurance/cashless/claims/query-response",
                payload_hint: { claim_id: 102 },
              },
              metadata: {
                reason_code: "additionalinfo",
                claim_reference: "CLM-102",
                claim_id: 102,
                claim_decision: "QUERIED",
              },
              created_at: "2026-06-04T11:30:06+05:30",
            },
          ],
          completed_tasks: [],
        },
        {
          correlation_id: "comm-abc-003",
          workflow: "communication",
          status: "complete",
          payer_id: "1000004566@hcx",
          task_code: "poll",
          task_requester: null,
          reason_code: null,
          reason_display: null,
          category: "alert",
          category_display: null,
          priority: "routine",
          topic: null,
          topic_display: null,
          identifier: "CASE-25",
          claim_reference: "CASE-25",
          cashless_case_id: null,
          claim_id: null,
          child_id: null,
          subject: null,
          sent_at: "2026-06-04T14:45:20+05:30",
          received_at: "2026-06-04T14:45:22+05:30",
          acknowledged: false,
          acknowledged_at: null,
          ack_correlation_id: null,
          provider_read: true,
          provider_read_at: "2026-06-04T14:45:38+05:30",
          comm_status: "in-progress",
          authored_on: "2026-06-04T14:45:20+05:30",
          task_inputs: { include: "urn:uuid:08f1bb6f-c3f5-4578-b5e8-c042764e2477" },
          payload: [{ content_string: "Hello World" }],
          facility_name: "City General Hospital",
          payer_name: "Mediprobe",
          pending_tasks: [],
          completed_tasks: [],
        },
    ];

    const scoped = params.cashless_case_id != null
      ? all.filter((c) => String(c.cashless_case_id) === String(params.cashless_case_id))
      : all;

    return {
      total_count: scoped.length,
      limit: params.limit || 20,
      offset: params.offset || 0,
      communications: scoped,
    };
  },

  markCommunicationRead: async (correlation_id) => {
    await delay(300);
    return {
      correlation_id,
      provider_read: true,
      provider_read_at: new Date().toISOString(),
    };
  },

  getCommunicationStatus: async (correlation_id) => {
    await delay(500);
    const all = {
      "comm-abc-000": {
        correlation_id: "comm-abc-000",
        workflow: "communication",
        status: "complete",
        payer_id: "1518@hcx",
        payer_name: "Sample Payer",
        reason_code: "additionalinfo",
        reason_display: "Additional Information",
        topic_display: "Clinical notes required",
        priority: "urgent",
        claim_reference: "CASE-4",
        cashless_case_id: 4,
        claim_id: 101,
        child_id: 12,
        subject: "Case CASE-4 / Arjun Mehta",
        sent_at: "2026-06-05T08:15:00+05:30",
        received_at: "2026-06-05T08:15:03+05:30",
        acknowledged: true,
        acknowledged_at: "2026-06-05T08:15:04+05:30",
        provider_read: false,
        provider_read_at: null,
        ack_correlation_id: "ack-addinfo-000",
        comm_status: "in-progress",
        task_requester: "Sample Payer",
        authored_on: "2026-06-05T08:15:00+05:30",
        task_inputs: { claimNumber: "CASE-4", CLINICAL_NOTES: "Clinical Notes" },
        payload: [
          {
            content_string:
              "Please attach the treating doctor's clinical notes for the current admission before we can proceed with the pre-authorisation.",
          },
        ],
        pending_tasks: [],
        completed_tasks: [],
      },
      "comm-abc-001": {
        correlation_id: "comm-abc-001",
        workflow: "communication",
        status: "complete",
        payer_id: "1518@hcx",
        reason_code: "tatquery",
        reason_display: "TAT Query",
        topic_display: "Pre-authorization TAT Exceeded",
        priority: "urgent",
        claim_reference: "CLM-101",
        cashless_case_id: 4,
        claim_id: 101,
        child_id: 12,
        subject: "Claim CLM-101 / Arjun Mehta",
        sent_at: "2026-06-03T09:00:00+05:30",
        received_at: "2026-06-03T09:00:05+05:30",
        acknowledged: true,
        acknowledged_at: "2026-06-03T09:00:06+05:30",
        provider_read: true,
        provider_read_at: "2026-06-03T09:05:00+05:30",
        ack_correlation_id: "ack-tatq-001",
        comm_status: "completed",
        task_requester: "Sample Payer",
        authored_on: "2026-06-03T09:00:00+05:30",
        task_inputs: { claimNumber: "CLM-101", claimId: "101" },
        payload: [
          {
            content_string:
              "The pre-authorization for claim CLM-101 has exceeded the standard TAT of 2 hours. Please update the clinical status and confirm the estimated discharge date.",
          },
        ],
        pending_tasks: [],
        completed_tasks: [],
      },
      "comm-abc-002": {
        correlation_id: "comm-abc-002",
        workflow: "communication",
        status: "complete",
        payer_id: "2044@hcx",
        reason_code: "additionalinfo",
        reason_display: "Additional Information",
        topic_display: "Additional Documents Required",
        priority: "asap",
        claim_reference: "CLM-102",
        cashless_case_id: 5,
        claim_id: 102,
        child_id: 19,
        subject: "Claim CLM-102 / Aisha Kapoor",
        sent_at: "2026-06-04T11:30:00+05:30",
        received_at: "2026-06-04T11:30:04+05:30",
        acknowledged: true,
        acknowledged_at: "2026-06-04T11:30:05+05:30",
        provider_read: false,
        provider_read_at: null,
        ack_correlation_id: "ack-addinfo-002",
        comm_status: "completed",
        task_requester: "Star Health & Allied",
        authored_on: "2026-06-04T11:30:00+05:30",
        task_inputs: {
          claimNumber: "CLM-102",
          claimId: "102",
          INVESTIGATION_REPORT: "Investigation Report",
          DISCHARGE_SUMMARY: "Discharge Summary",
        },
        payload: [
          {
            content_string:
              "Please submit the investigation report and discharge summary for claim CLM-102 to proceed with adjudication.",
          },
          { content_attachment: "https://payer.example/query-letter-102.pdf" },
        ],
        pending_tasks: [
          {
            id: "T-301",
            task_id: "T-301",
            task_type: "review_communication",
            title: "Submit documents for Aisha Kapoor — Claim #102",
            description:
              "Payer has requested investigation report and discharge summary.",
            priority: "urgent",
            workflow: "communication",
            status: "pending",
            required_documents: [
              {
                code: "INVESTIGATION_REPORT",
                name: "Investigation Report",
                display: "Investigation Report",
              },
              {
                code: "DISCHARGE_SUMMARY",
                name: "Discharge Summary",
                display: "Discharge Summary",
              },
            ],
            action: {
              label: "Submit Documents",
              method: "POST",
              endpoint: "/nhcx/api/v1/insurance/cashless/claims/query-response",
              payload_hint: { claim_id: 102 },
            },
            metadata: {
              reason_code: "additionalinfo",
              claim_reference: "CLM-102",
              claim_id: 102,
              claim_decision: "QUERIED",
            },
            created_at: "2026-06-04T11:30:06+05:30",
          },
        ],
        completed_tasks: [],
      },
    };
    return all[correlation_id] ?? all["comm-abc-001"];
  },

  sendCommunication: async (data) => {
    await delay(700);
    return {
      correlation_id: `comm-out-${generateRequestId().slice(0, 8)}`,
      status: "submitted",
      message: `${(data.reason_code || "message").replace(/_/g, " ")} sent to ${data.payer_id}.`,
    };
  },

  respondToCommunication: async (correlation_id, data = {}) => {
    await delay(800);
    const count = (data.documents || []).length;
    return {
      correlation_id,
      status: "submitted",
      message: count > 0
        ? `Response sent with ${count} document${count === 1 ? "" : "s"}.`
        : "Response sent to the payer.",
    };
  },

  acknowledgeCommunication: async (correlation_id) => {
    await delay(800);
    return {
      correlation_id,
      kind: "notification",
      direction: "inbound",
      acknowledged: true,
      ack_error: null,
      acknowledged_at: new Date().toISOString(),
      ack_correlation_id: correlation_id,
      status: "complete",
      message: "Communication acknowledged",
    };
  },

  // ─── Escape hatch for Work Queue task actions ────────────────────────────────
  rawPost: async (fullPath, body = {}) => {
    await delay(800);
    return {
      correlation_id: generateRequestId(),
      status: "submitted",
      message: "Action submitted (mock)",
    };
  },
  rawGet: async (fullPath, params = {}) => {
    await delay(500);
    return {
      status: "complete",
      message: "Status fetched (mock)",
    };
  },

  // ─── Gateway Status Recovery ─────────────────────────────────────────────────
  requestGatewayStatus: async (data) => {
    await delay(500);
    return {
      correlation_id: data.correlation_id,
      enquiry_correlation_id: `mock-enquiry-${Date.now()}`,
      status: "submitted",
      message: "Status enquiry sent to the payer.",
    };
  },

  // ─── Session ─────────────────────────────────────────────────────────────────
  getSession: async () => {
    await delay(300);
    return {
      user: { id: 42, name: "Dr Admin", is_admin: true },
      is_admin: true,
      read_only: false,
      manageable_facility_codes: [],
      manages_any_facility: true,
      nhcx_environment: "sandbox",
      facilities: [
        { facility_code: "HOSP-001", hcx_participant_code: "1000099999@hcx", name: "City General Hospital", environment: "production" },
        { facility_code: "HOSP-002", hcx_participant_code: "1000088888@hcx", name: "District Paediatric Centre", environment: "sandbox" },
      ],
    };
  },

  // ─── Facilities Admin ───────────────────────────────────────────────────────
  listFacilities: async () => {
    await delay(600);
    return {
      facilities: [
        {
          facility_code: "HOSP-001",
          name: "City General Hospital",
          hcx_participant_code: "1000099999@hcx",
          active: true,
          private_key_set: true,
          environment: "production",
          registry_id: "HFR-12345",
          scheme_code: "PMJAY",
          state: "AndhraPradesh",
          district: "Krishna",
          roles: ["10001"],
          linked_registry_codes: ["10001"],
          endpoint_url: "https://city-general.example/hcx/callback",
          primary_email: "hcx@citygeneral.example",
          primary_mobile: "9876543210",
          abdm_registration: { success: true },
        },
        {
          facility_code: "HOSP-002",
          name: "District Paediatric Centre",
          hcx_participant_code: "1000088888@hcx",
          active: true,
          private_key_set: false,
          environment: "sandbox",
          registry_id: "DEMO_CLIENT",
          scheme_code: null,
          state: "Telangana",
          district: "Hyderabad",
          roles: ["10001"],
          linked_registry_codes: [],
          endpoint_url: null,
          primary_email: "admin@dpc.example",
          primary_mobile: null,
          abdm_registration: {
            success: false,
            error: "Signing cert path not provided",
          },
        },
      ],
    };
  },
  getFacility: async (facility_code) => {
    await delay(400);
    return {
      facility_code,
      name: "Mock Facility",
      hcx_participant_code: `${facility_code}@hcx`,
      active: true,
      private_key_set: false,
      environment: "sandbox",
    };
  },
  createFacility: async (data) => {
    await delay(900);
    // ABDM's participant/create assigns the code when none is supplied.
    const participant_code =
      data.hcx_participant_code || `${data.facility_code}@hcx`;
    return {
      facility_code: data.facility_code,
      name: data.name,
      hcx_participant_code: participant_code,
      active: data.active ?? true,
      private_key_set: !!data.private_key_pem,
      environment: data.environment || "sandbox",
      registry_id: data.registry_id || null,
      hfr_id: data.hfr_id || null,
      abdm_registration: {
        success: true,
        response: { participant_code },
      },
    };
  },
  updateFacility: async (facility_code, data) => {
    await delay(900);
    return {
      facility_code,
      ...data,
      private_key_set: !!data.private_key_pem,
      abdm_registration: { success: true },
    };
  },
  uploadFacilityKey: async (facility_code) => {
    await delay(700);
    return { facility_code, private_key_set: true };
  },
  rotateFacilityCertificate: async (facility_code, data) => {
    await delay(700);
    if (!data.private_key_pem?.includes("PRIVATE KEY")) throw new Error("Invalid PEM: PEM is not a private key");
    return { facility_code, private_key_set: true, abdm_registered: true, registry_matches: true };
  },
  startFacilityOnboarding: async (data) => {
    await delay(700);
    return { facility_code: data.facility_code, participant_code: `${data.facility_code}@hcx`, transaction_id: "mock-txn-create", facility_name: data.name || null };
  },
  confirmFacilityOnboarding: async (data) => {
    await delay(700);
    if (data.passcode === "000000") throw new Error("NHCX Gateway error: Invalid passcode");
    return { facility_code: data.facility_code, name: data.name, hcx_participant_code: data.participant_code, registry_id: data.registry_id, abdm_registered: false };
  },
  registerFacilityOnboarding: async (facility_code) => {
    await delay(700);
    return { facility_code, hcx_participant_code: `${facility_code}@hcx`, transaction_id: "mock-txn-update", status: "PENDING" };
  },
  listPractitioners: async (facility_code) => {
    await delay(500);
    return { facility_code, practitioners: mockPractitioners };
  },
  savePractitioner: async (facility_code, doctor_id, data) => {
    await delay(500);
    const hpr_id = String(data.hpr_id || "").replace(/[\s-]/g, "");
    if (!/^\d{14}$/.test(hpr_id)) throw new Error("The HPR id must be the doctor's 14-digit HPR id");
    const doctor = mockPractitioners.find((d) => d.doctor_id === String(doctor_id));
    const master = { ...(doctor.master || { active: true }), ...data, hpr_id, updated_at: new Date().toISOString() };
    doctor.master = master;
    return { ...doctor };
  },
  activateFacilityOnboarding: async (facility_code, data) => {
    await delay(700);
    if (data.passcode === "000000") throw new Error("NHCX Gateway error: Invalid passcode");
    return { facility_code, hcx_participant_code: `${facility_code}@hcx`, abdm_registered: true, private_key_set: true };
  },
};

// ─── Real (Network) Implementations ──────────────────────────────────────────
const real = {
  healthCheck: () => http.get("/health"),

  getDashboardStats: () => http.get("/cashless/dashboard/stats"),

  getDashboardAnalytics: (params = {}) => http.get("/cashless/dashboard/analytics", params),

  getPayerForms: (cashless_case_id, stage = "preauth") => http.get(`/cashless/${cashless_case_id}/forms`, { stage }),
  savePayerForm: (cashless_case_id, data) => http.post(`/cashless/${cashless_case_id}/forms`, data),
  listCaseNotes: (cashless_case_id) => http.get(`/cashless/${cashless_case_id}/notes`),
  createCaseNote: (cashless_case_id, data) => http.post(`/cashless/${cashless_case_id}/notes`, data),
  updateCaseNote: (cashless_case_id, note_id, data) =>
    http.patch(`/cashless/${cashless_case_id}/notes/${note_id}`, data),
  deleteCaseNote: (cashless_case_id, note_id) =>
    http.delete(`/cashless/${cashless_case_id}/notes/${note_id}`),

  getDashboardClaims: (params = {}) =>
    http.get("/cashless/dashboard/claims", params),

  searchChildren: (params = {}) => http.get("/cashless/child", params),

  searchPayers: (params = {}) => http.get("/cashless/payers/search", params),

  getPayerById: (id, params = {}) =>
    http.get(`/cashless/payers/${encodeURIComponent(id)}`, params),

  fetchPolicies: (data) => http.post("/cashless/policies/fetch", data),

  prepareCashless: (data) => http.post("/cashless/prepare", data),

  getCashlessStatus: (cashless_case_id, signal, forceRefresh = false) =>
    http.get(
      `/cashless/${cashless_case_id}`,
      forceRefresh ? { force_refresh: true } : {},
      { signal },
    ),

  // Per-case audit trail: an ordered, timestamped, actor-attributed event log
  // plus the rolled-up money ledger. `params` accepts { workflow, actor, since,
  // limit, offset }.
  getCaseTimeline: (cashless_case_id, params = {}, signal) =>
    http.get(`/cashless/${cashless_case_id}/timeline`, params, { signal }),

  // Raw FHIR bundle(s) actually exchanged for one transaction (preauth/claim/
  // communication/payment). Defaults to the latest of that type; pass
  // { correlation_id } to pick a specific historical one. 404 -> null (no
  // transaction of that type recorded yet), not an error.
  getCaseBundle: (cashless_case_id, transaction_type, params = {}, signal) =>
    http.get(`/cashless/${cashless_case_id}/bundles/${transaction_type}`, params, { signal, allowNotFound: true }),

  preparePreauth: (params = {}) =>
    http.get("/cashless/preauth/prepare", params),

  submitPreauth: (data) => http.post("/cashless/preauth/submit", data),

  preparePreauthEnhancement: (params = {}) =>
    http.get("/cashless/preauth/enhancement/prepare", params),

  submitPreauthEnhancement: (data) =>
    http.post("/cashless/preauth/enhancement", data),

  resubmitPreauth: (data) => http.post("/cashless/preauth/resubmit", data),

  respondPreauthQuery: (data) =>
    http.post("/cashless/preauth/query-response", data),

  cancelPreauth: (data) => http.post("/cashless/preauth/cancel", data),

  // ─── Specific Coverage Eligibility APIs ─────────────────────────────────────
  requestInsurancePlan: (data) =>
    http.post("/cashless/insurance_plan/request", data, { acceptStatuses: [409] }),

  getInsurancePlanForms: (correlation_id, url) =>
    http.get(`/cashless/insurance_plan/${correlation_id}/forms`, url ? { url } : {}),
  getInsurancePlanStatus: (correlation_id) =>
    http.get(`/cashless/insurance_plan/status/${correlation_id}`),
  getInsurancePlanBenefits: (correlation_id, params = {}, signal) =>
    http.get(`/cashless/insurance_plan/${correlation_id}/benefits`, params, { signal }),

  checkCoverage: (data) =>
    http.post("/cashless/coverage_eligibility/check", data),
  getAuthRequirements: (data) =>
    http.post("/cashless/coverage_eligibility/auth-requirements", data),

  validateCoverage: (data) =>
    http.post("/cashless/coverage_eligibility/validation", data),
  checkBenefits: (data) =>
    http.post("/cashless/coverage_eligibility/benefits", data),
  getCoverageEligibilityStatus: (correlation_id) =>
    http.get(`/cashless/coverage_eligibility/status/${correlation_id}`),
  discoverCoverage: (data) =>
    http.post("/cashless/coverage_eligibility/check", { ...data, purpose: "discovery" }),
  adoptDiscoveredCover: (correlation_id, data) =>
    http.post(`/cashless/coverage_eligibility/discoveries/${encodeURIComponent(correlation_id)}/adopt`, data),

  getPreauthStatus: (correlation_id, signal) =>
    http.get(`/cashless/preauth/status/${correlation_id}`, {}, { signal }),

  prepareClaimDraft: (params = {}) =>
    http.get("/cashless/claims/prepare", params),

  patchPatientContext: (claim_id, data) =>
    http.patch(`/cashless/claims/${claim_id}/patient-context`, data),

  patchCashlessPatientContext: (cashless_case_id, data) =>
    http.patch(`/cashless/${cashless_case_id}/patient-context`, data),

  submitDischargeClaim: (data) => http.post("/cashless/claims/discharge", data),

  submitFinalClaim: (data) => http.post("/cashless/claims/submit", data),

  respondClaimQuery: (data) =>
    http.post("/cashless/claims/query-response", data),

  requestClaimRelease: (data) => http.post("/cashless/claims/release", data),
  resubmitDischargeClaim: (data) => http.post("/cashless/claims/discharge/resubmit", data),

  getClaimStatus: (correlation_id, signal) =>
    http.get(`/cashless/claims/status/${correlation_id}`, {}, { signal }),

  submitReprocess: (data) => http.post("/cashless/reprocess/submit", data),

  getReprocessStatus: (correlation_id, signal) =>
    http.get(`/cashless/reprocess/status/${correlation_id}`, {}, { signal }),

  searchPaymentStatus: (params = {}) =>
    http.get("/cashless/payment/status", params, { allowNotFound: true }),

  getPaymentStatus: (correlation_id) =>
    http.get(`/cashless/payment/status/${correlation_id}`, {}, { allowNotFound: true }),

  acknowledgePayment: (data) =>
    http.post("/cashless/payment/acknowledge", data),

  listTasks: (params = {}) => http.get("/cashless/tasks", params),

  getTask: (task_id) => http.get(`/cashless/tasks/${task_id}`),

  completeTask: (task_id, data = {}) =>
    http.patch(`/cashless/tasks/${task_id}/complete`, data),

  reprocessCallback: (correlation_id) =>
    http.post(`/cashless/callbacks/${correlation_id}/reprocess`, {}),

  listCommunications: (params = {}) =>
    http.get("/cashless/communications", params),

  getCommunicationStatus: (correlation_id) =>
    http.get(`/cashless/communication/status/${correlation_id}`),

  markCommunicationRead: (correlation_id) =>
    http.patch(`/cashless/communication/${correlation_id}/read`, {}),

  sendCommunication: (data) => http.post("/cashless/communications", data),

  respondToCommunication: (correlation_id, data) =>
    http.post(`/cashless/communication/${correlation_id}/respond`, data),

  acknowledgeCommunication: (correlation_id) =>
    http.post(`/cashless/communication/${correlation_id}/acknowledge`, {}, { acceptStatuses: [422] }),

  requestGatewayStatus: (data) => http.post("/cashless/status/request", data),

  // ─── Session ─────────────────────────────────────────────────────────────────
  getSession: () => http.get("/session"),

  // ─── Facilities Admin ───────────────────────────────────────────────────────
  listFacilities: () => http.get("/facilities"),
  getFacility: (facility_code) => http.get(`/facilities/${facility_code}`),
  createFacility: (data) => http.post("/facilities", data),
  updateFacility: (facility_code, data) =>
    http.put(`/facilities/${facility_code}`, data),
  uploadFacilityKey: (facility_code, data) =>
    http.put(`/facilities/${facility_code}/private_key`, data),
  rotateFacilityCertificate: (facility_code, data) =>
    http.post(`/facilities/${facility_code}/certificate/rotate`, data),
  // NHCX production onboarding: create + passcode, then certificate + passcode.
  startFacilityOnboarding: (data) => http.post("/facilities/onboarding/start", data),
  confirmFacilityOnboarding: (data) => http.post("/facilities/onboarding/confirm", data),
  registerFacilityOnboarding: (facility_code, data) =>
    http.post(`/facilities/${facility_code}/onboarding/register`, data),
  activateFacilityOnboarding: (facility_code, data) =>
    http.post(`/facilities/${facility_code}/onboarding/activate`, data),
  listPractitioners: (facility_code) => http.get(`/facilities/${facility_code}/practitioners`),
  savePractitioner: (facility_code, doctor_id, data) =>
    http.put(`/facilities/${facility_code}/practitioners/${doctor_id}`, data),

  // ─── Escape hatch for Work Queue task actions ────────────────────────────────
  rawPost: (fullPath, body = {}) => http.rawPost(fullPath, body),
  rawGet: (fullPath, params = {}) => http.rawGet(fullPath, params),
};

// ─── Exported API  ────────────────────────────────────────────────────────────
//  Automatically picks mock or real based on the USE_MOCK flag above.
export const api = USE_MOCK ? mock : real;

// Also export the flag so UI can display a "MOCK MODE" banner if needed.
export { USE_MOCK };
