// ─────────────────────────────────────────────────────────────────────────────
//  API MODE SWITCH
//  Set USE_MOCK = true  →  returns dummy data (no server needed)
//  Set USE_MOCK = false →  makes real fetch calls to BASE_URL
// ─────────────────────────────────────────────────────────────────────────────
import { enrichPayrMessage, describePayrError } from "./api/payrErrors.js";

const USE_MOCK = import.meta.env.VITE_USE_MOCK === "true";

// Base URL for real network calls. Change this to match your backend server.
const BASE_URL =
  import.meta.env.VITE_BASE_URL || "http://localhost:8082/nhcx/backend/api/v1/insurance";

// ─── Helpers ──────────────────────────────────────────────────────────────────
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const getProviderHeader = () => {
  const code = localStorage.getItem("nhcx_default_provider_id");
  return code ? { "X-Provider-Id": code } : {};
};

// Parent-HIS session token. The wrapper requires `Authorization: Bearer <token>`
// on every endpoint except /facilities/* and /health (it decodes the token to
// resolve the acting NhcxFacility).
//
// The parent HIS page exposes the token on a JS global — read it from there.
// `SESSION_TOKEN_GLOBAL` is the property name on `window`; change it here if the
// parent uses a different one. A localStorage fallback is kept for local dev.
export const SESSION_TOKEN_GLOBAL = "__NHCX_TOKEN__";
export const SESSION_TOKEN_KEY = "nhcx_session_token";

const getSessionToken = () =>
  (typeof window !== "undefined" && window[SESSION_TOKEN_GLOBAL]) ||
  localStorage.getItem(SESSION_TOKEN_KEY) ||
  null;

const getAuthHeader = () => {
  const token = getSessionToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
};

// Endpoints the contract exempts from auth (facility admin + health).
const isAuthExempt = (path) =>
  /^\/facilities(\/|$)/.test(path) || path === "/health";

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

/** Build a full URL with query params (undefined/null/"" values are skipped). */
const buildUrl = (path, params = {}) => {
  const url = new URL(BASE_URL + path, window.location.origin);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "")
      url.searchParams.append(k, v);
  });
  return url.toString();
};

const dispatchError = (msg) =>
  window.dispatchEvent(new CustomEvent("api-error", { detail: msg }));

// Auth failures from the wrapper's session-token check get a plain-language
// message — the raw "WRAPPER-ERROR:1012" means nothing to a billing user.
const authMessage = (status, raw) => {
  const code = typeof raw === "string" ? raw : "";
  if (status === 401 || code.includes("WRAPPER-ERROR:1012"))
    return "Your session has expired. Please sign in again from the hospital system.";
  if (status === 403 || code.includes("WRAPPER-ERROR:1013"))
    return "No NHCX facility is linked to your account. Contact your administrator.";
  return null;
};

/** Extract the most human-readable message from a backend error response body. */
const extractErrorMessage = async (res) => {
  try {
    const body = await res.json();
    let msg = body?.error?.message || body?.message || body?.error;
    const auth = authMessage(res.status, msg);
    if (auth) return auth;
    // A 422/gateway error may carry a PAYR code in errors[].code — surface the
    // friendly label + code so the toast isn't an opaque "422".
    const payrFromList = (body?.errors || [])
      .map((e) => describePayrError(e?.code || e?.detail || ""))
      .find(Boolean);
    if (typeof msg === "string") {
      // Backend sometimes wraps a nested JSON string — unwrap it
      const jsonStart = msg.indexOf("{");
      if (jsonStart !== -1) {
        try {
          const inner = JSON.parse(msg.slice(jsonStart));
          const innerMsg = inner?.error?.message || inner?.message;
          if (innerMsg) return enrichPayrMessage(innerMsg);
        } catch (_) {}
      }
      return enrichPayrMessage(msg);
    }
    if (payrFromList) return `${payrFromList.label} (${payrFromList.code})`;
  } catch (_) {}
  return authMessage(res.status) || `${res.status} ${res.statusText}`;
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
      if (!res.ok) throw new Error(await extractErrorMessage(res));
      return await res.json();
    } catch (err) {
      // A cancelled poll (tab hidden / navigation) is not a real error.
      if (err.name === "AbortError") throw err;
      dispatchError(err.message);
      throw err;
    }
  },
  post: async (path, body = {}) => {
    const merged = { request_id: generateRequestId(), ...body };
    try {
      const res = await fetch(BASE_URL + path, {
        method: "POST",
        headers: buildHeaders(path),
        body: JSON.stringify(merged),
      });
      if (!res.ok) throw new Error(await extractErrorMessage(res));
      return await res.json();
    } catch (err) {
      dispatchError(err.message);
      throw err;
    }
  },
  patch: async (path, body = {}) => {
    const merged = { request_id: generateRequestId(), ...body };
    try {
      const res = await fetch(BASE_URL + path, {
        method: "PATCH",
        headers: buildHeaders(path),
        body: JSON.stringify(merged),
      });
      if (!res.ok) throw new Error(await extractErrorMessage(res));
      return await res.json();
    } catch (err) {
      dispatchError(err.message);
      throw err;
    }
  },
  put: async (path, body = {}) => {
    const merged = { request_id: generateRequestId(), ...body };
    try {
      const res = await fetch(BASE_URL + path, {
        method: "PUT",
        headers: buildHeaders(path),
        body: JSON.stringify(merged),
      });
      if (!res.ok) throw new Error(await extractErrorMessage(res));
      return await res.json();
    } catch (err) {
      dispatchError(err.message);
      throw err;
    }
  },
  /** Fire an arbitrary POST to a full path (used by Work Queue task actions). */
  rawPost: async (fullPath, body = {}) => {
    const merged = { request_id: generateRequestId(), ...body };
    const url = fullPath.startsWith("http")
      ? fullPath
      : window.location.origin + fullPath;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getProviderHeader(), ...getAuthHeader() },
        body: JSON.stringify(merged),
      });
      if (!res.ok) throw new Error(await extractErrorMessage(res));
      return await res.json();
    } catch (err) {
      dispatchError(err.message);
      throw err;
    }
  },
};

// ─── Mock Data ────────────────────────────────────────────────────────────────
const mock = {
  // ─── Health ────────────────────────────────────────────────────────────────
  healthCheck: async () => {
    await delay(200);
    return { status: "ok", service: "nhcx-service", version: "1.2.0" };
  },

  // ─── Dashboard ─────────────────────────────────────────────────────────────
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
      total_count: 3,
      limit: params.limit || 20,
      offset: params.offset || 0,
      claims: [
        {
          id: 101,
          child_id: 12,
          child_name: "Arjun Mehta",
          patient_name: "Arjun Mehta",
          use_type: "preauthorization",
          status: "draft",
          claim_decision: null,
          approved_amount: null,
          payment_status: null,
          latest_utr: null,
          created_at: "2026-05-11T11:30:00+05:30",
          pending_tasks: [],
          completed_tasks: [],
        },
        {
          id: 102,
          child_id: 19,
          child_name: "Aisha Kapoor",
          patient_name: "Aisha Kapoor",
          use_type: "claim",
          status: "complete",
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
          status: "pending",
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
      ],
    };
  },

  // ─── Child / Patient Registry ───────────────────────────────────────────────
  searchChildren: async (params = {}) => {
    await delay(800);
    return {
      total_count: 2,
      limit: 20,
      offset: 0,
      children: [
        {
          child_id: 12,
          name: "Arjun Mehta",
          gender: "male",
          dob: "2020-01-01",
          mobile: "9999999999",
          created_at: "2026-05-04T10:30:00+05:30",
          cashless_cases_count: 1,
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
                  billing_status: "pending",
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
                  ],
                },
              ],
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
          created_at: "2026-05-04T11:00:00+05:30",
          cashless_cases_count: 2,
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
          visits: [],
        },
      ],
    };
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

  // ─── Policy Fetch ───────────────────────────────────────────────────────────
  fetchPolicies: async (data) => {
    await delay(1000);
    return {
      status: "success",
      data: {
        child_id: data.child_id,
        payer_id: data.payer_id,
        identifier_used: { type: "AbhaNumber", value: "91711234567890" },
        policies: [
          {
            policy_number: "POL-91711234567890-2026",
            product_name: "GeneralHealth-2026",
            payer_id: data.payer_id,
            payer_name: "Sample Payer",
            status: "active",
            sum_insured: 500000,
            currency: "INR",
            effective_from: "2026-01-01",
            effective_to: "2026-12-31",
          },
          {
            policy_number: "POL-ALT-2026",
            product_name: "Family Floater Plus",
            payer_id: data.payer_id,
            payer_name: "Sample Payer",
            status: "active",
            sum_insured: 300000,
            currency: "INR",
            effective_from: "2026-01-01",
            effective_to: "2026-12-31",
          },
        ],
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
    return {
      cashless_case_id,
      claim_id: 101,
      child_id: 12,
      payer_id: "1518@hcx",
      policy_number: "POL-91711234567890-2026",
      status: "complete",
      current_step: "preauth_ready",
      next_actions: ["prepare_preauth"],
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
        plan_details: { name: "GeneralHealth-2026", status: "active" },
        inclusions: [
          { code: "ROOM", name: "Room rent" },
          { code: "ICU", name: "ICU Charges" },
        ],
        exclusions: [
          { code: "COSMETIC", name: "Cosmetic surgery" },
          { code: "DENTAL", name: "Routine Dental" },
        ],
        pricing: { sum_insured: 500000, currency: "INR" },
        document_requirements: [
          { name: "Admission note" },
          { name: "Doctor prescription" },
        ],
        raw_payload: { resourceType: "InsurancePlan" },
        stored_record: {
          id: 7,
          request_id: "550e8400-e29b-41d4-a716-446655440000",
          child_id: 12,
          payer_id: "1518@hcx",
          updated_at: "2026-05-04T10:41:00+05:30",
        },
      },
      coverage_eligibility: {
        status: "complete",
        validation: {
          status: "complete",
          correlation_id: "9e5c60bf-4014-4b72-a2f0-1fe4f9a75e61",
          outcome: "complete",
          disposition: "Eligible",
          inforce: true,
          insurance_items: [
            { coverage: "Coverage/POL-91711234567890-2026", inforce: true, items: [] },
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
                      allowed: { type: "Money", value: 75000, currency: "INR" },
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
    };
  },

  // ─── Preauthorization ───────────────────────────────────────────────────────
  preparePreauth: async (params = {}) => {
    await delay(800);
    return {
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
    return {
      claim_id: params.claim_id || 101,
      preauth_ref: "PA-2026-00001",
      missing_fields: [],
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
    return { correlation_id: "mock-ins-plan-123", status: "submitted" };
  },
  getInsurancePlanStatus: async (correlation_id) => {
    await delay(800);
    return { correlation_id, status: "complete" };
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

  getCoverageEligibilityStatus: async (correlation_id) => {
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

  resubmitClaim: async () => {
    await delay(800);
    return {
      correlation_id: "abc123-claim-resubmit",
      status: "submitted",
      message: "Claim resubmitted",
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
  searchPaymentStatus: async () => {
    await delay(700);
    return {
      status: "found",
      latest_stage: "PAYMENT_SETTLED",
      settled: true,
      total_events: 2,
      events: [
        {
          payment_reference: "PAY-2026-00001",
          claim_reference: "CLM-101",
          payment_stage: "PAYMENT_INITIATED",
          notice_amount: 40000,
          gross_amount: 40000,
          tds_amount: 400,
          net_payment_amount: 39600,
          payment_date: "2026-05-14",
          utr: null,
          acknowledgement_status: "submitted",
          acknowledgement_error: null,
        },
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
        id: "T-201",
        task_id: "T-201",
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
          endpoint: "/nhcx/backend/api/v1/insurance/cashless/preauth/query-response",
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
          endpoint: "/nhcx/backend/api/v1/insurance/cashless/payment/acknowledge",
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
          endpoint: "/nhcx/backend/api/v1/insurance/cashless/claims/submit",
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
        endpoint: "/nhcx/backend/api/v1/insurance/cashless/preauth/query-response",
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

  // ─── Communications ─────────────────────────────────────────────────────────
  listCommunications: async (params = {}) => {
    await delay(600);
    return {
      total_count: 2,
      limit: params.limit || 20,
      offset: params.offset || 0,
      communications: [
        {
          correlation_id: "comm-abc-001",
          workflow: "communication",
          status: "complete",
          payer_code: "1518@hcx",
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
          payer_code: "2044@hcx",
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
                endpoint: "/nhcx/backend/api/v1/insurance/cashless/claims/query-response",
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
      ],
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
      "comm-abc-001": {
        correlation_id: "comm-abc-001",
        workflow: "communication",
        status: "complete",
        payer_code: "1518@hcx",
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
        payer_code: "2044@hcx",
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
              endpoint: "/api/v1/insurance/cashless/claims/query-response",
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

  // ─── Escape hatch for Work Queue task actions ────────────────────────────────
  rawPost: async (fullPath, body = {}) => {
    await delay(800);
    return {
      correlation_id: generateRequestId(),
      status: "submitted",
      message: "Action submitted (mock)",
    };
  },

  // ─── Gateway Status Recovery ─────────────────────────────────────────────────
  requestGatewayStatus: async (data) => {
    await delay(500);
    return {
      correlation_id: data.correlation_id,
      status: "submitted",
      message: "NHCX gateway status request submitted",
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
    return {
      facility_code: data.facility_code,
      name: data.name,
      hcx_participant_code: data.hcx_participant_code,
      active: data.active ?? true,
      private_key_set: !!data.private_key_pem,
      environment: data.environment || "sandbox",
      registry_id: data.registry_id || null,
      abdm_registration: { success: true },
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
};

// ─── Real (Network) Implementations ──────────────────────────────────────────
const real = {
  healthCheck: () => http.get("/health"),

  getDashboardStats: () => http.get("/cashless/dashboard/stats"),

  getDashboardClaims: (params = {}) =>
    http.get("/cashless/dashboard/claims", params),

  searchChildren: (params = {}) => http.get("/cashless/child", params),

  searchPayers: (params = {}) => http.get("/cashless/payers/search", params),

  fetchPolicies: (data) => http.post("/cashless/policies/fetch", data),

  prepareCashless: (data) => http.post("/cashless/prepare", data),

  getCashlessStatus: (cashless_case_id, signal) =>
    http.get(`/cashless/${cashless_case_id}`, {}, { signal }),

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
    http.post("/cashless/insurance_plan/request", data),
  getInsurancePlanStatus: (correlation_id) =>
    http.get(`/cashless/insurance_plan/status/${correlation_id}`),

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

  getPreauthStatus: (correlation_id, signal) =>
    http.get(`/cashless/preauth/status/${correlation_id}`, {}, { signal }),

  prepareClaimDraft: (params = {}) =>
    http.get("/cashless/claims/prepare", params),

  patchPatientContext: (claim_id, data) =>
    http.patch(`/cashless/claims/${claim_id}/patient-context`, data),

  submitDischargeClaim: (data) => http.post("/cashless/claims/discharge", data),

  submitFinalClaim: (data) => http.post("/cashless/claims/submit", data),

  respondClaimQuery: (data) =>
    http.post("/cashless/claims/query-response", data),

  resubmitClaim: (data) => http.post("/cashless/claims/resubmit", data),

  getClaimStatus: (correlation_id, signal) =>
    http.get(`/cashless/claims/status/${correlation_id}`, {}, { signal }),

  submitReprocess: (data) => http.post("/cashless/reprocess/submit", data),

  getReprocessStatus: (correlation_id, signal) =>
    http.get(`/cashless/reprocess/status/${correlation_id}`, {}, { signal }),

  searchPaymentStatus: (params = {}) =>
    http.get("/cashless/payment/status", params),

  getPaymentStatus: (correlation_id) =>
    http.get(`/cashless/payment/status/${correlation_id}`),

  acknowledgePayment: (data) =>
    http.post("/cashless/payment/acknowledge", data),

  listTasks: (params = {}) => http.get("/cashless/tasks", params),

  getTask: (task_id) => http.get(`/cashless/tasks/${task_id}`),

  completeTask: (task_id, data = {}) =>
    http.patch(`/cashless/tasks/${task_id}`, data),

  listCommunications: (params = {}) =>
    http.get("/cashless/communications", params),

  getCommunicationStatus: (correlation_id) =>
    http.get(`/cashless/communication/status/${correlation_id}`),

  markCommunicationRead: (correlation_id) =>
    http.patch(`/cashless/communication/${correlation_id}/read`, {}),

  requestGatewayStatus: (data) => http.post("/cashless/status/request", data),

  // ─── Facilities Admin ───────────────────────────────────────────────────────
  listFacilities: () => http.get("/facilities"),
  getFacility: (facility_code) => http.get(`/facilities/${facility_code}`),
  createFacility: (data) => http.post("/facilities", data),
  updateFacility: (facility_code, data) =>
    http.put(`/facilities/${facility_code}`, data),
  uploadFacilityKey: (facility_code, data) =>
    http.put(`/facilities/${facility_code}/private_key`, data),

  // ─── Escape hatch for Work Queue task actions ────────────────────────────────
  rawPost: (fullPath, body = {}) => http.rawPost(fullPath, body),
};

// ─── Exported API  ────────────────────────────────────────────────────────────
//  Automatically picks mock or real based on the USE_MOCK flag above.
export const api = USE_MOCK ? mock : real;

// Also export the flag so UI can display a "MOCK MODE" banner if needed.
export { USE_MOCK };
