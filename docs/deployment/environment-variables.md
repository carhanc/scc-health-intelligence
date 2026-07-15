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
| `DATA_ARTIFACT_RELEASE_TAG` | **Required in production** | An exact release tag (e.g. `data-prod-20260714T221846Z`, for a rollback) or the literal string `latest` (resolves to the newest published `data-*` release). Fetched by `scripts/render_start.sh` at **runtime start**, not at build time — Render's persistent disk isn't mounted yet during the build step. |
| `DATA_ARTIFACT_GITHUB_TOKEN` | **Required** (this repository is private) | A GitHub fine-grained personal access token, scoped to read-only "Contents" access on `carhanc/scc-health-intelligence` only. See `docs/deployment/production-deployment-guide.md` step 1 for exact creation steps. Only ever required unauthenticated downloads work for a genuinely public repository — this one is private, so this is not optional. **Never logged or printed** — `fetch_data_artifact.py` never includes it in any message, and GitHub Actions automatically masks it in workflow logs when sourced from `secrets`/`github.token`. |
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
| `RENDER_DEPLOY_HOOK_URL` | Secret | Triggers a Render deploy from `.github/workflows/deploy.yml` and `.github/workflows/scheduled-refresh.yml`. |
| `VERCEL_DEPLOY_HOOK_URL` | Secret | Triggers a Vercel deploy from `deploy.yml` only — a data-only scheduled refresh deliberately never triggers a frontend deploy (there's nothing for it to rebuild). |
| `CENSUS_API_KEY`, `HUD_USER_TOKEN` | Secret | Used by `scheduled-refresh.yml`'s `make data` step (optional — keyless fallback works). |
| `PRODUCTION_FRONTEND_URL`, `PRODUCTION_BACKEND_URL` | Variable (not secret — these are public URLs) | Used by `deploy.yml` and `scheduled-refresh.yml` to know what to poll/smoke-test after a deploy. A deploy-hook secret configured with no matching URL variable is treated as a configuration error and fails the workflow loudly, not silently. |

CI's `e2e` job and `scheduled-refresh.yml`'s publish step also use the **built-in** `github.token` (no configuration needed) to authenticate against this private repository — never a separately-created secret for those two cases specifically.

## Troubleshooting `DATA_ARTIFACT_GITHUB_TOKEN` failures

`fetch_data_artifact.py` gives a specific, actionable message for each real failure mode — never a generic "something went wrong":

| Error | Meaning | Fix |
| --- | --- | --- |
| `401 Unauthorized` | The token is invalid, malformed, or expired. | Generate a new fine-grained token (production-deployment-guide.md step 1) and update it in Render/GitHub Actions. |
| `403 Forbidden` | The token exists but lacks the "Contents: Read" permission on this repository, or the GitHub API rate limit was hit. | Re-check the token's repository access and permission scope; regenerate if needed. |
| `404 Not Found` | Either the release tag genuinely doesn't exist, **or** no token was provided at all against this private repository (GitHub returns 404, not 403, for an unauthenticated request to a private resource, to avoid confirming it exists). | Confirm `DATA_ARTIFACT_GITHUB_TOKEN` is actually set in this environment; confirm the tag was really published (`gh release list`). |
| `SHA-256 mismatch` | The downloaded warehouse file doesn't match the manifest's declared hash (corrupted/truncated download). | Usually transient — the script already refused to install the bad file and left any previous warehouse untouched; retry. If persistent, re-run `scripts/publish_data_artifact.py --publish` to produce a fresh release. |

## Never set anywhere except `.env.local` (local dev) or the relevant service's own secret store

`ANTHROPIC_API_KEY`, `CENSUS_API_KEY`, `HUD_USER_TOKEN`, `SENTRY_DSN`, `DATA_ARTIFACT_GITHUB_TOKEN`. None of these should ever appear in a commit, a log line, or a client-visible (`NEXT_PUBLIC_`-prefixed) variable. Verified this phase: a grep of the built `.next/static/` client bundle output confirms zero occurrences of any of these variable names, and `scripts/fetch_data_artifact.py`'s test suite includes a dedicated test proving the token is never present in any printed output.
