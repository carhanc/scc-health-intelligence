# Environment variable reference (Phase 9)

Names only, no values, in `.env.example`. This document adds what's genuinely useful there wouldn't fit as an inline comment: **which service actually needs each variable**, since this project spans three separate deployment surfaces (Render backend, Vercel frontend, GitHub Actions) that each read a different subset.

## Read by the backend (Render / local `apps/api`)

| Variable | Required? | Purpose |
| --- | --- | --- |
| `SCC_HEALTH_ENVIRONMENT` | Recommended in production | `local` (default) or `production`. `production` additionally requires the live warehouse to exist at startup — the process refuses to start otherwise. |
| `SCC_HEALTH_WAREHOUSE_PATH` | Recommended in production | Where the DuckDB warehouse file lives. On Render, point this at the persistent disk mount. |
| `SCC_HEALTH_DATA_DIR` | No | Base data directory; only relevant if pipeline code paths are ever exercised on the same instance (they aren't, in this deployment topology). |
| `CORS_ALLOWED_ORIGINS` | **Required in production** | Comma-separated frontend origin(s) allowed to call the API. Defaults to the local dev server only — a hosted deployment that doesn't set this will reject every real browser request. |
| `TRUSTED_HOSTS` | Recommended in production | Comma-separated Host header allowlist. Defaults to `*` (fine for local dev, not for a hosted deployment). |
| `DATA_ARTIFACT_RELEASE_TAG` | **Required in production** | Which published GitHub Release to fetch the warehouse from at build time. |
| `GITHUB_REPOSITORY` | No | Defaults to this project's own repo; only needed if deploying from a fork. |
| `ANTHROPIC_API_KEY` | No (intentionally unset this release) | Enables AI-assisted Copilot mode. See `docs/security/ai-production-readiness.md` before ever setting this in production. |
| `ANTHROPIC_MODEL` | No | Overrides the default model when `ANTHROPIC_API_KEY` is set. |
| `CENSUS_API_KEY`, `HUD_USER_TOKEN` | No | Speed up/improve reliability of two data-pipeline sources; both have a keyless fallback. Only relevant to `make data`, never to serving the API. |
| `SENTRY_DSN`, `SENTRY_ENVIRONMENT` | No | Backend error monitoring. No-ops cleanly if unset. |

## Read by the frontend (Vercel / local `apps/web`)

| Variable | Required? | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_API_BASE_URL` | **Required in production** | The backend's URL. Defaults to `http://localhost:8000` for local dev. Browser-visible (by design — it's not a secret, just the API's public address). |
| `NEXT_PUBLIC_SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_ENVIRONMENT` | No | Frontend error monitoring. Browser-visible (a Sentry DSN is a project identifier, not a secret — safe to ship in the client bundle by design). No-ops cleanly if unset. |
| `SENTRY_DSN`, `SENTRY_ENVIRONMENT` | No | Server-side (Next.js `instrumentation.ts`) error monitoring for the frontend's own server-rendering path — separate from the browser-side one above, and separate from the backend's own `SENTRY_DSN` (different Vercel/Render environments). |

## Read only by GitHub Actions (repo Secrets/Variables, never in `.env.local`)

| Name | Type | Purpose |
| --- | --- | --- |
| `RENDER_DEPLOY_HOOK_URL` | Secret | Triggers a Render deploy from `.github/workflows/deploy.yml`. |
| `VERCEL_DEPLOY_HOOK_URL` | Secret | Triggers a Vercel deploy from the same workflow. |
| `CENSUS_API_KEY`, `HUD_USER_TOKEN` | Secret | Used by `.github/workflows/scheduled-refresh.yml`'s `make data` step (optional — keyless fallback works). |
| `PRODUCTION_FRONTEND_URL`, `PRODUCTION_BACKEND_URL` | Variable (not secret — these are public URLs) | Used by `deploy.yml` to know what to smoke-test after a deploy. |

## Never set anywhere except `.env.local` (local dev) or the relevant service's own secret store

`ANTHROPIC_API_KEY`, `CENSUS_API_KEY`, `HUD_USER_TOKEN`, `SENTRY_DSN`. None of these should ever appear in a commit, a log line, or a client-visible (`NEXT_PUBLIC_`-prefixed) variable. Verified this phase: a grep of the built `.next/static/` client bundle output confirms zero occurrences of any of these variable names.
