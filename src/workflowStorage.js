// ─── Workflow Persistence ─────────────────────────────────────────────────────
// Each in-progress workflow is saved to localStorage under:
//   nhcx_workflow_<child_id>
// The claims-screen stepper state is saved under:
//   nhcx_claims_<claim_id>
// ─────────────────────────────────────────────────────────────────────────────

const WORKFLOW_PREFIX = 'nhcx_workflow_';
const CLAIMS_PREFIX   = 'nhcx_claims_';

// ─── Workflow (App-level) state ───────────────────────────────────────────────

export const saveWorkflow = (childId, state) => {
  if (!childId) return;
  try {
    localStorage.setItem(
      WORKFLOW_PREFIX + childId,
      JSON.stringify({ ...state, savedAt: Date.now() })
    );
  } catch (e) {
    console.warn('Could not save workflow:', e);
  }
};

export const loadWorkflow = (childId) => {
  if (!childId) return null;
  try {
    const raw = localStorage.getItem(WORKFLOW_PREFIX + childId);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

export const clearWorkflow = (childId) => {
  if (!childId) return;
  try {
    localStorage.removeItem(WORKFLOW_PREFIX + childId);
  } catch (e) {
    console.warn('Could not clear workflow:', e);
  }
};

/** Returns all in-progress workflows, sorted newest first. */
export const listActiveWorkflows = () => {
  const result = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(WORKFLOW_PREFIX)) {
        const raw = localStorage.getItem(key);
        if (raw) result.push(JSON.parse(raw));
      }
    }
  } catch {}
  return result.sort((a, b) => b.savedAt - a.savedAt);
};

// ─── Claims stepper state ─────────────────────────────────────────────────────

export const saveClaimsStep = (claimId, state) => {
  if (!claimId) return;
  try {
    localStorage.setItem(
      CLAIMS_PREFIX + claimId,
      JSON.stringify({ ...state, savedAt: Date.now() })
    );
  } catch {}
};

export const loadClaimsStep = (claimId) => {
  if (!claimId) return null;
  try {
    const raw = localStorage.getItem(CLAIMS_PREFIX + claimId);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

export const clearClaimsStep = (claimId) => {
  if (!claimId) return;
  try {
    localStorage.removeItem(CLAIMS_PREFIX + claimId);
  } catch {}
};

// ─── Step label helpers ───────────────────────────────────────────────────────

const ROUTE_LABELS = {
  payer:     'Payer & Policy selection',
  prep:      'Eligibility & Preparation',
  review:    'Preauth Draft Review',
  status:    'Preauth Status',
  claim:     'Claim Submission',
  reprocess: 'Reprocess / Appeal',
  payment:   'Payment Reconciliation',
};

export const routeLabel = (route) => ROUTE_LABELS[route] || route;

/** Map a saved resumeRoute → display step number (out of 7) */
const ROUTE_ORDER = ['payer','prep','review','status','claim','reprocess','payment'];
export const routeStepNumber = (route) => (ROUTE_ORDER.indexOf(route) + 1) || 1;

/** True when `route` sits at or after `reference` in the case lifecycle. */
export const routeAtOrAfter = (route, reference) => {
  const a = ROUTE_ORDER.indexOf(route);
  const b = ROUTE_ORDER.indexOf(reference);
  if (a === -1 || b === -1) return true;
  return a >= b;
};
