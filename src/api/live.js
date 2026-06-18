import { http } from "./client.js";
import { ENDPOINTS } from "./endpoints.js";

export const live = {
  healthCheck: () => http.get(ENDPOINTS.HEALTH_CHECK),

  getDashboardStats: () => http.get(ENDPOINTS.DASHBOARD_STATS),

  getDashboardClaims: (params = {}) =>
    http.get(ENDPOINTS.DASHBOARD_CLAIMS, params),

  searchChildren: (params = {}) => http.get(ENDPOINTS.CHILD_SEARCH, params),

  searchPayers: (params = {}) => http.get(ENDPOINTS.PAYER_SEARCH, params),

  fetchPolicies: (data) => http.post(ENDPOINTS.FETCH_POLICIES, data),

  prepareCashless: (data) => http.post(ENDPOINTS.PREPARE_CASHLESS, data),

  getCashlessStatus: (cashless_case_id) =>
    http.get(ENDPOINTS.CASHLESS_STATUS(cashless_case_id)),

  preparePreauth: (params = {}) =>
    http.get(ENDPOINTS.PREPARE_PREAUTH, params),

  submitPreauth: (data) => http.post(ENDPOINTS.SUBMIT_PREAUTH, data),

  preparePreauthEnhancement: (params = {}) =>
    http.get(ENDPOINTS.PREPARE_PREAUTH_ENHANCEMENT, params),

  submitPreauthEnhancement: (data) =>
    http.post(ENDPOINTS.SUBMIT_PREAUTH_ENHANCEMENT, data),

  resubmitPreauth: (data) => http.post(ENDPOINTS.RESUBMIT_PREAUTH, data),

  respondPreauthQuery: (data) =>
    http.post(ENDPOINTS.RESPOND_PREAUTH_QUERY, data),

  cancelPreauth: (data) => http.post(ENDPOINTS.CANCEL_PREAUTH, data),

  // ─── Specific Coverage Eligibility APIs ─────────────────────────────────────
  requestInsurancePlan: (data) =>
    http.post(ENDPOINTS.REQUEST_INSURANCE_PLAN, data),
  getInsurancePlanStatus: (correlation_id) =>
    http.get(ENDPOINTS.INSURANCE_PLAN_STATUS(correlation_id)),

  checkCoverage: (data) =>
    http.post(ENDPOINTS.CHECK_COVERAGE, data),
  getAuthRequirements: (data) =>
    http.post(ENDPOINTS.AUTH_REQUIREMENTS, data),

  validateCoverage: (data) =>
    http.post(ENDPOINTS.VALIDATE_COVERAGE, data),
  checkBenefits: (data) =>
    http.post(ENDPOINTS.CHECK_BENEFITS, data),
  getCoverageEligibilityStatus: (correlation_id) =>
    http.get(ENDPOINTS.COVERAGE_ELIGIBILITY_STATUS(correlation_id)),

  getPreauthStatus: (correlation_id) =>
    http.get(ENDPOINTS.PREAUTH_STATUS(correlation_id)),

  prepareClaimDraft: (params = {}) =>
    http.get(ENDPOINTS.PREPARE_CLAIM_DRAFT, params),

  patchCashlessPatientContext: (cashless_case_id, data) =>
    http.patch(ENDPOINTS.PATCH_CASHLESS_PATIENT_CONTEXT(cashless_case_id), data),

  patchPatientContext: (claim_id, data) =>
    http.patch(ENDPOINTS.PATCH_PATIENT_CONTEXT(claim_id), data),

  submitDischargeClaim: (data) => http.post(ENDPOINTS.SUBMIT_DISCHARGE_CLAIM, data),

  submitFinalClaim: (data) => http.post(ENDPOINTS.SUBMIT_FINAL_CLAIM, data),

  respondClaimQuery: (data) =>
    http.post(ENDPOINTS.RESPOND_CLAIM_QUERY, data),

  resubmitClaim: (data) => http.post(ENDPOINTS.RESUBMIT_CLAIM, data),

  getClaimStatus: (correlation_id) =>
    http.get(ENDPOINTS.CLAIM_STATUS(correlation_id)),

  submitReprocess: (data) => http.post(ENDPOINTS.SUBMIT_REPROCESS, data),

  getReprocessStatus: (correlation_id) =>
    http.get(ENDPOINTS.REPROCESS_STATUS(correlation_id)),

  searchPaymentStatus: (params = {}) =>
    http.get(ENDPOINTS.SEARCH_PAYMENT_STATUS, params),

  getPaymentStatus: (correlation_id) =>
    http.get(ENDPOINTS.GET_PAYMENT_STATUS(correlation_id)),

  acknowledgePayment: (data) =>
    http.post(ENDPOINTS.ACKNOWLEDGE_PAYMENT, data),

  listTasks: (params = {}) => http.get(ENDPOINTS.LIST_TASKS, params),

  getTask: (task_id) => http.get(ENDPOINTS.GET_TASK(task_id)),

  completeTask: (task_id, data = {}) =>
    http.patch(ENDPOINTS.COMPLETE_TASK(task_id), data),

  listCommunications: (params = {}) =>
    http.get(ENDPOINTS.LIST_COMMUNICATIONS, params),

  getCommunicationStatus: (correlation_id) =>
    http.get(ENDPOINTS.COMMUNICATION_STATUS(correlation_id)),

  markCommunicationRead: (correlation_id) =>
    http.patch(ENDPOINTS.MARK_COMMUNICATION_READ(correlation_id), {}),

  requestGatewayStatus: (data) => http.post(ENDPOINTS.REQUEST_GATEWAY_STATUS, data),

  rawPost: (fullPath, body = {}) => http.rawPost(fullPath, body),

  listFacilities: (params = {}) => http.get(ENDPOINTS.LIST_FACILITIES, params),

  createFacility: (data) => http.post(ENDPOINTS.CREATE_FACILITY, data),

  getFacility: (code) => http.get(ENDPOINTS.GET_FACILITY(code)),

  updateFacility: (code, data) => http.put(ENDPOINTS.UPDATE_FACILITY(code), data),

  uploadFacilityKey: (code, data) =>
    http.post(ENDPOINTS.UPLOAD_FACILITY_KEY(code), data),
};
