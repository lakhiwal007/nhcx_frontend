// ─── Workflow Persistence ─────────────────────────────────────────────────────
// Each in-progress workflow is saved to localStorage under:
//   nhcx_workflow_<child_id>
// ─────────────────────────────────────────────────────────────────────────────

const WORKFLOW_PREFIX = 'nhcx_workflow_';
const MIGRATION_KEY   = 'nhcx_workflow_schema';
const MIGRATION_VERSION = '2';

const SERVER_OWNED_KEYS = ['claim_id', 'preauthRef', 'preauthDecision', 'approvedAmount'];

const stripServerOwned = (state) => {
  const out = { ...state };
  SERVER_OWNED_KEYS.forEach((k) => delete out[k]);
  return out;
};

// ─── Workflow (App-level) state ───────────────────────────────────────────────

export const saveWorkflow = (childId, state) => {
  if (!childId) return;
  try {
    localStorage.setItem(
      WORKFLOW_PREFIX + childId,
      JSON.stringify({ ...stripServerOwned(state), savedAt: Date.now() })
    );
  } catch (e) {
    console.warn('Could not save workflow:', e);
  }
};

export const migrateWorkflows = () => {
  try {
    if (localStorage.getItem(MIGRATION_KEY) === MIGRATION_VERSION) return;
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(WORKFLOW_PREFIX)) keys.push(key);
    }
    keys.forEach((key) => {
      const raw = localStorage.getItem(key);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!SERVER_OWNED_KEYS.some((k) => k in parsed)) return;
      localStorage.setItem(key, JSON.stringify(stripServerOwned(parsed)));
    });
    localStorage.setItem(MIGRATION_KEY, MIGRATION_VERSION);
  } catch (e) {
    console.warn('Could not migrate workflow storage:', e);
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

// ─── Route order ──────────────────────────────────────────────────────────────

const ROUTE_ORDER = ['payer','prep','review','status','claim','reprocess','payment'];

/** True when `route` sits at or after `reference` in the case lifecycle. */
export const routeAtOrAfter = (route, reference) => {
  const a = ROUTE_ORDER.indexOf(route);
  const b = ROUTE_ORDER.indexOf(reference);
  if (a === -1 || b === -1) return true;
  return a >= b;
};
