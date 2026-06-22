// Stable task-action code → API path mapping.
//
// Tasks from the backend carry an `action` object with a `code` (stable
// semantic id) and an `endpoint` (the URL stored in the DB at task-creation
// time). Always resolve the URL from `action.code` via this map — never call
// `action.endpoint` directly: if a backend route is renamed, only this map
// needs updating, not every pending task row already written to the DB.
// `action.endpoint` is kept only as a forwards-compatibility fallback for a
// code this frontend does not yet know.
export const ACTION_MAP = {
  respond_preauth_query:           "/cashless/preauth/query-response",
  resubmit_preauth:                "/cashless/preauth/resubmit",
  submit_preauth:                  "/cashless/preauth/submit",
  respond_claim_query:             "/cashless/claims/query-response",
  resubmit_claim:                  "/cashless/claims/resubmit",
  submit_discharge_claim:          "/cashless/claims/discharge",
  submit_final_claim:              "/cashless/claims/submit",
  submit_reprocess:                "/cashless/reprocess/submit",
  acknowledge_payment:             "/cashless/payment/acknowledge",
  review_communication:            "/cashless/communication/status",
  attach_eligibility_documents:    "/cashless/coverage_eligibility/check",
  fix_eligibility_error:           "/cashless/coverage_eligibility/check",
  review_insurance_plan_documents: "/cashless/insurance_plan/status",
};

/**
 * Resolve a task `action` to the URL to call. Prefers the stable `action.code`
 * via ACTION_MAP; falls back to the DB-stored `action.endpoint` only when the
 * code is unknown to this frontend build.
 * @param {{ code?: string, endpoint?: string } | null | undefined} action
 * @returns {string | undefined}
 */
export const resolveActionUrl = (action) => {
  if (!action) return undefined;
  const mapped = action.code ? ACTION_MAP[action.code] : undefined;
  return mapped ?? action.endpoint;
};
