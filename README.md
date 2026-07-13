# NHCX Service — Hospital Cashless Portal

A React SPA for hospitals to manage the end-to-end cashless insurance workflow on the NHCX network (ABDM / National Health Claims Exchange).

## 🚀 Key Features
- **End-to-End Workflow**: patient/child selection → payer & policy → eligibility → preauthorization → claim submission → payment reconciliation.
- **Dual API Mode**: toggle between static mock data (`VITE_USE_MOCK=true`, no backend needed) and real calls to the NHCX backend service.
- **Session-driven facility context**: bootstraps via `GET /session` against the parent HIS bearer token; auto-selects a single facility, offers a selector for multi-facility users, and a read-only cross-facility view for polyclinic admins.
- **Workflow Persistence**: in-progress case state is persisted to `localStorage` so a closed tab can resume exactly where it left off.
- **Case Timeline**: a per-case audit trail (`/case/:id/timeline`) with a rolled-up money ledger (billed → authorized ceiling → approved → settled → collect-from-patient).
- **Modern UI**: React 19 + Framer Motion + Lucide icons, a claymorphism/glassmorphism design system (see `src/design-system.css`), Geist fonts.

See **[technical.md](./technical.md)** for environment config, backend/API locations, and deployment URLs.

---

## 🔄 The Cashless Workflow

The app is mounted under the `/nhcx/service/` base path (see `vite.config.js` / `main.jsx`). Top-level routes:

| Route | Screen |
|---|---|
| `/work-queue` | Task inbox — action items born from payer callbacks |
| `/dashboard` | Cashless case list + stats (Recent Claims table) |
| `/registry` | Child/patient registry and profile |
| `/communications` | Inbound/outbound payer communications |
| `/payments` | Payment reconciliation across cases |
| `/case/:id/*` | The per-case wizard (below) |

### The Case Wizard (`/case/:id/...`)

A sticky vertical "Case lifecycle" rail drives navigation through nested routes:

1. **`payer`** — Payer & Policy Selection. Search the patient's linked active policies; select payer + policy for this admission.
2. **`prep`** — Eligibility & Preparation. Confirm coverage, enter admission details, ICD-10 diagnoses, procedure codes, and bill items.
3. **`review`** — Preauthorization Draft. Map clinical/financial details to the NHCX format, attach required documents, submit to the payer. *Redirects to `status` automatically once a preauth already exists for the case* — this screen is pre-submission only.
4. **`status`** — Preauthorization Decision. Polls for the payer's outcome (`APPROVED` / `PARTIALLY_APPROVED` / `QUERIED` / `REJECTED` / `CANCELLED`) and exposes the next action: **Request Enhancement**, **Respond to Query**, **Resubmit**, or **Proceed to Claim**.
5. **`enhancement`** — Request an increase to an already-approved preauth (add procedures/documents).
6. **`claim`** — Claim submission: discharge claim → final claim → decision.
7. **`reprocess`** — Appeal/resubmit after a rejection or short payment.
8. **`payment`** — Payment reconciliation (UTR, settlement, acknowledgement).
9. **`timeline`** — Full audit trail / money ledger for the case, reachable from any stage.

---

## 🛠 Technical Details (quick reference)

Full details — env vars, backend URLs, auth model, deployment — live in **[technical.md](./technical.md)**. Summary:

### API Layer (`src/api.js`)
- `VITE_USE_MOCK` env var picks mock data (`src/api/mock.js`) or real HTTP calls (`src/api/real.js` via `VITE_BASE_URL`) — no code edit required.
- Every call carries a generated `request_id`, an `Authorization: Bearer <session_token>` header (read from `window.__NHCX_TOKEN__`, set by the parent HIS page), and an optional `X-Provider-Id` header for the active facility.

### Workflow State & Storage (`src/workflowStorage.js`)
- `nhcx_workflow_<child_id>` — current case route + case data, so a closed tab resumes where it left off.
- `nhcx_claims_<claim_id>` — which steps of the claim wizard are complete.
- This is a UX convenience only; the backend (PostgreSQL) is the source of truth via `correlation_id`.

### Styling
- Design system in `src/design-system.css` + `App.css` (claymorphism/glassmorphism, Geist fonts). No Tailwind/Bootstrap.

## 📦 Running Locally

```bash
# Install dependencies
npm install

# Start the Vite dev server (reads .env / .env.local for VITE_USE_MOCK, VITE_BASE_URL)
npm run dev
```

App serves at `http://localhost:5173/nhcx/service/`.
