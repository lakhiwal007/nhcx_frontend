# Technical Reference

Config, environment variables, and every URL relevant to running or debugging this app. See `README.md` for the product/workflow overview.

## Repositories

| Repo | Path | Purpose |
|---|---|---|
| `nhcx_cli` (this repo) | `C:\PROGRAMS\Self\nhcx_cli` | React/Vite frontend |
| `nhcx-service` | `C:\PROGRAMS\Self\nhcx-service` | Rails backend — NHCX/HCX gateway wrapper |

The backend repo is the **source of truth for the API contract**:
- `nhcx-service/FRONTEND_API.yaml` — OpenAPI 3.0 spec.
- `nhcx-service/FRONTEND_IMPLEMENTATION_README.md` — screen-by-screen workflow guide, polling rules, task/action-map patterns, WRAPPER-ERROR code table.
- `nhcx-service/DATABASE_LAYOUT.md` — DB schema reference.

These are also mirrored into this repo (`FRONTEND_API.yaml`, `FRONTEND_IMPLEMENTATION_README.md` at the root) for convenience, but the copies go stale — always diff against `nhcx-service` before trusting them for exact contract details.

## Git remote

```
origin  https://github.com/docterztech/abdm_nhcx_frontend.git
```

Branches: `master`, `redesign/clay-glass` (active UI redesign), `fix/preauth-submit-and-case-chrome`, `fix/spec-compliance-action-map-abort-signal`.

## URLs

| Environment | URL |
|---|---|
| Local dev (frontend) | `http://localhost:5173/nhcx/service/` (Vite default; port shifts if 5173 is taken) |
| Local backend (Rails, sandbox) | `http://localhost:8082` — base API path `/nhcx/api/v1/insurance` |
| Local backend health check | `http://localhost:8082/nhcx/api/v1/insurance/health` |
| Staging frontend (deployed build of this repo) | `https://api-stage4.docterz.in/nhcx/service/` |
| Dev proxy target (ngrok tunnel to a shared backend) | `https://disclose-heaving-disloyal.ngrok-free.dev` — used by `vite.config.js`'s dev-server proxy for `/nhcx/api`; may be down without indicating a real contract problem |

The staging frontend is a JS-heavy SPA — fetching its URL returns an near-empty HTML shell. Use a browser/screenshot tool to inspect rendered screens, not a raw HTTP fetch.

## Environment variables

Set via `.env` / `.env.local` (Vite dev) or build args (Docker). See `.env.example`.

| Variable | Where used | Meaning |
|---|---|---|
| `VITE_USE_MOCK` | `src/api.js` | `"true"` → `src/api/mock.js` (no backend needed); `"false"` → real fetches via `src/api/real.js` |
| `VITE_BASE_URL` | `src/api.js` | Base path for real API calls. Defaults to `http://localhost:8082/nhcx/api/v1/insurance` if unset. In this repo's `.env` it's set to the relative `/nhcx/api/v1/insurance` so the Vite dev-server proxy (or nginx in prod) forwards it. |
| `BACKEND_URL` | `docker-compose.yml`, `nginx.conf` (via `envsubst`) | The upstream Rails backend nginx proxies `/nhcx/api` to, in a container deployment. Defaults to `http://app:8082` (the `nhcx-service` container on the shared `nhcx-service_nhcx_network` Docker network). |

`.env.local` overrides `.env` and is git-ignored — use it for a per-machine `VITE_USE_MOCK` toggle without touching the committed `.env`.

## Routing / base path

- App is served under base path **`/nhcx/service/`** (`vite.config.js`'s `base`, `main.jsx`'s `<BrowserRouter basename>`, and the nginx `location /nhcx/service/` SPA fallback all must agree — keep all three in sync if this path is ever renamed).
- API calls go to **`/nhcx/api/v1/insurance/...`** (proxied in dev via `vite.config.js`, in prod via `nginx.conf`'s `location /nhcx/api`).
- These two prefixes are deliberately different (`/nhcx/service/` for the app shell, `/nhcx/api` for API) so nginx can route them to different targets (static files vs. backend proxy) from the same host.

## Auth & facility context (headers sent on every request)

| Header | Source | Purpose |
|---|---|---|
| `Authorization: Bearer <token>` | `window.__NHCX_TOKEN__` (set by the parent HIS page that embeds this app), fallback `localStorage["nhcx_session_token"]` for local dev | Parent-HIS session token; backend decodes it (no signature check — trusted internal network) to resolve the acting user + facility. Required on every endpoint except `/facilities/*` and `/health`. |
| `X-Provider-Id` | `localStorage["nhcx_default_provider_id"]` | The active facility's `hcx_participant_code`. Optional — only needed to disambiguate when a user/admin has access to more than one facility. Omitted entirely when `localStorage["nhcx_all_facilities_mode"] === "true"` (polyclinic admin's read-only cross-facility view). |
| `X-Admin-Token` | `localStorage["nhcx_admin_token"]`, entered in Settings | Deployment admin secret, required in addition to the bearer token on the three facility-mutation endpoints (`POST /facilities`, `PUT /facilities/{code}`, `PUT /facilities/{code}/private_key`). |

Session bootstrap: `GET /session` (bearer token only, no facility required) returns `{ user, is_admin, facilities[] }`. The frontend auto-selects a lone facility, shows a selector for 2+, and offers a "View All Facilities" read-only mode for admins. See `src/api.js`'s `getSession` and `App.jsx`'s session-bootstrap effect.

## Deployment (Docker)

`Dockerfile` — multi-stage build:
1. `node:20-alpine` builder: `npm ci && npm run build`, with `VITE_BASE_URL`/`VITE_USE_MOCK` as build args (baked into the static bundle — not runtime-configurable after build).
2. `nginx:alpine` runtime: serves `dist/` at `/nhcx/service/`, proxies `/nhcx/api` to `${BACKEND_URL}` (templated into `nginx.conf` via `envsubst` at container start).

`docker-compose.yml` runs the built image on host port `3000`, joining the external `nhcx-service_nhcx_network` Docker network so it can reach the `nhcx-service` container by name (`http://app:8082`, the `BACKEND_URL` default).

## Design system / component sync

`.design-sync/` holds the shared component preview set synced to claude.ai/design (previews, conventions, config). It's tracked in git but should **not** be included in ordinary feature commits — treat it as tooling state, not app code.

## Key persistence keys (localStorage)

| Key | Purpose |
|---|---|
| `nhcx_workflow_<child_id>` | In-progress case route + case data (resume-on-reload) |
| `nhcx_claims_<claim_id>` | Which claim-wizard steps are complete |
| `nhcx_session_token` | Dev-only fallback for the parent-HIS bearer token |
| `nhcx_default_provider_id` / `nhcx_default_facility_name` | Active facility's participant code / display name |
| `nhcx_all_facilities_mode` | Admin's cross-facility read-only view toggle |
| `nhcx_admin_token` | Deployment admin secret for facility mutations |
| `nhcx_theme` | Light/dark preference |
| `nhcx_layout_direction` | Sidebar-rail vs. top-bar nav shell preference |

All workflow-continuity state lives on the backend (PostgreSQL, keyed by `correlation_id`) — the localStorage keys above are UX convenience only, not the source of truth.
