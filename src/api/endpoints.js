export const ENDPOINTS = {
  HEALTH_CHECK: "/health",
  
  // Dashboard
  DASHBOARD_STATS: "/cashless/dashboard/stats",
  DASHBOARD_CLAIMS: "/cashless/dashboard/claims",
  
  // Registry
  CHILD_SEARCH: "/cashless/child",
  PAYER_SEARCH: "/cashless/payers/search",
  PAYER_BY_ID: (id) => `/cashless/payers/${id}`,
  FETCH_POLICIES: "/cashless/policies/fetch",
  
  // Cashless Setup
  PREPARE_CASHLESS: "/cashless/prepare",
  CASHLESS_STATUS: (id) => `/cashless/${id}`,
  
  // Preauth
  PREPARE_PREAUTH: "/cashless/preauth/prepare",
  SUBMIT_PREAUTH: "/cashless/preauth/submit",
  PREPARE_PREAUTH_ENHANCEMENT: "/cashless/preauth/enhancement/prepare",
  SUBMIT_PREAUTH_ENHANCEMENT: "/cashless/preauth/enhancement",
  RESUBMIT_PREAUTH: "/cashless/preauth/resubmit",
  RESPOND_PREAUTH_QUERY: "/cashless/preauth/query-response",
  CANCEL_PREAUTH: "/cashless/preauth/cancel",
  PREAUTH_STATUS: (id) => `/cashless/preauth/status/${id}`,
  
  // Coverage Eligibility / Insurance Plan
  REQUEST_INSURANCE_PLAN: "/cashless/insurance_plan/request",
  INSURANCE_PLAN_STATUS: (id) => `/cashless/insurance_plan/status/${id}`,
  CHECK_COVERAGE: "/cashless/coverage_eligibility/check",
  AUTH_REQUIREMENTS: "/cashless/coverage_eligibility/auth-requirements",
  VALIDATE_COVERAGE: "/cashless/coverage_eligibility/validation",
  CHECK_BENEFITS: "/cashless/coverage_eligibility/benefits",
  COVERAGE_ELIGIBILITY_STATUS: (id) => `/cashless/coverage_eligibility/status/${id}`,
  
  // Claims
  PREPARE_CLAIM_DRAFT: "/cashless/claims/prepare",
  PATCH_CASHLESS_PATIENT_CONTEXT: (cashless_case_id) => `/cashless/${cashless_case_id}/patient-context`,
  PATCH_PATIENT_CONTEXT: (id) => `/cashless/claims/${id}/patient-context`,
  SUBMIT_DISCHARGE_CLAIM: "/cashless/claims/discharge",
  SUBMIT_FINAL_CLAIM: "/cashless/claims/submit",
  RESPOND_CLAIM_QUERY: "/cashless/claims/query-response",
  RESUBMIT_CLAIM: "/cashless/claims/resubmit",
  CLAIM_STATUS: (id) => `/cashless/claims/status/${id}`,
  
  // Reprocess
  SUBMIT_REPROCESS: "/cashless/reprocess/submit",
  REPROCESS_STATUS: (id) => `/cashless/reprocess/status/${id}`,
  
  // Payment
  SEARCH_PAYMENT_STATUS: "/cashless/payment/status",
  GET_PAYMENT_STATUS: (id) => `/cashless/payment/status/${id}`,
  ACKNOWLEDGE_PAYMENT: "/cashless/payment/acknowledge",
  
  // Tasks
  LIST_TASKS: "/cashless/tasks",
  GET_TASK: (id) => `/cashless/tasks/${id}`,
  COMPLETE_TASK: (id) => `/cashless/tasks/${id}`,
  
  // Communications
  LIST_COMMUNICATIONS: "/cashless/communications",
  COMMUNICATION_STATUS: (id) => `/cashless/communication/status/${id}`,
  MARK_COMMUNICATION_READ: (id) => `/cashless/communication/${id}/read`,
  
  // Gateway
  REQUEST_GATEWAY_STATUS: "/cashless/status/request",

  // Facility Management
  LIST_FACILITIES: "/facilities",
  CREATE_FACILITY: "/facilities",
  GET_FACILITY: (code) => `/facilities/${code}`,
  UPDATE_FACILITY: (code) => `/facilities/${code}`,
  UPLOAD_FACILITY_KEY: (code) => `/facilities/${code}/private_key`,
};
