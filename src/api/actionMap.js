// Stable task-action code → API method + path mapping.
//
// Tasks from the backend carry an `action` object with a `code` (stable
// semantic id) and an `endpoint` (the URL stored in the DB at task-creation
// time). Always resolve the method/URL from `action.code` via this map —
// never call `action.endpoint` directly: if a backend route is renamed, only
// this map needs updating, not every pending task row already written to the
// DB. `action.endpoint` is kept only as a forwards-compatibility fallback for
// a code this frontend does not yet know (assumed POST in that case).
export const ACTION_MAP = {
  respond_preauth_query:           { method: "POST", path: "/cashless/preauth/query-response" },
  resubmit_preauth:                { method: "POST", path: "/cashless/preauth/resubmit" },
  submit_preauth:                  { method: "POST", path: "/cashless/preauth/submit" },
  respond_claim_query:             { method: "POST", path: "/cashless/claims/query-response" },
  resubmit_claim:                  { method: "POST", path: "/cashless/claims/resubmit" },
  submit_discharge_claim:          { method: "POST", path: "/cashless/claims/discharge" },
  submit_final_claim:              { method: "POST", path: "/cashless/claims/submit" },
  submit_reprocess:                { method: "POST", path: "/cashless/reprocess/submit" },
  acknowledge_payment:             { method: "POST", path: "/cashless/payment/acknowledge" },
  review_communication:            { method: "GET",  path: "/cashless/communication/status" },
  attach_eligibility_documents:    { method: "POST", path: "/cashless/coverage_eligibility/check" },
  fix_eligibility_error:           { method: "POST", path: "/cashless/coverage_eligibility/check" },
  review_insurance_plan_documents: { method: "GET",  path: "/cashless/insurance_plan/status" },
};

/**
 * Resolve a task `action` to the {method, url} to call. Prefers the stable
 * `action.code` via ACTION_MAP; falls back to the DB-stored `action.endpoint`
 * (assumed POST) only when the code is unknown to this frontend build.
 * @param {{ code?: string, endpoint?: string } | null | undefined} action
 * @returns {{ method: "GET" | "POST", url: string } | undefined}
 */
export const resolveAction = (action) => {
  if (!action) return undefined;
  const mapped = action.code ? ACTION_MAP[action.code] : undefined;
  if (mapped) return { method: mapped.method, url: mapped.path };
  return action.endpoint ? { method: "POST", url: action.endpoint } : undefined;
};
