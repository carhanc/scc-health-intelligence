# Production deployment guide (Phase 9)

This is the exact, numbered runbook for deploying Santa Clara Health Intelligence to production. It targets **Vercel** (frontend) + **Render** (backend) + **GitHub Releases** (data artifact) — see `DECISIONS.md` DEC-066 for why this architecture was chosen over the alternatives evaluated.

**Read this whole document before starting.** Steps 1–4 create real cloud resources and cost real (small) amounts of money on paid tiers; a free tier is available on both Render and Vercel and is sufficient for an initial public release. Nothing in this guide can be executed by an AI assistant on your behalf — every step below requires your own account and your own credentials.

## 0. Prerequisites

- A GitHub account with push access to this repository (already configured: `origin` points to `https://github.com/carhanc/scc-health-intelligence.git`).
- A Render account (https://render.com) — free tier is fine to start.
- A Vercel account (https://vercel.com) — free (Hobby) tier is fine to start.
- The `gh` CLI installed and authenticated (`gh auth login`) on whatever machine will run `make publish-data` — needed to publish the data artifact as a GitHub Release.
- A local warehouse built via `make data` (real, live data — takes real time and hits real external APIs; see `docs/data/refresh-runbook.md`).

## 1. Push the repository to GitHub

```bash
git status                       # confirm a clean tree, only the intended Phase 9 commit
git push origin main
```

Do not force-push. Do not rewrite history. If `origin` isn't already set (it is, in this repo, but for a fork):

```bash
git remote add origin https://github.com/<you>/<your-fork>.git
git push -u origin main
```

## 2. Publish the first data artifact

The backend needs a real warehouse to serve; it refuses to start in production without one (`Settings.environment == "production"` startup check, `apps/api/src/scc_health_api/main.py`).

```bash
make data            # builds the full warehouse from live sources (real time, real API calls)
make audit            # must pass before publishing anything
make publish-data     # builds the local artifact directory and prints the `gh release create` command
uv run python scripts/publish_data_artifact.py --publish   # actually publishes it (requires `gh auth login`)
```

Note the release tag it prints, e.g. `data-prod-20260714T221846Z` — you'll need it in step 4.

## 3. Deploy the frontend (Vercel)

1. In the Vercel dashboard: **Add New → Project**, import this GitHub repository.
2. **Root Directory:** `apps/web`
3. **Framework Preset:** Next.js (auto-detected)
4. **Build Command:** `pnpm build` (default)
5. **Install Command:** `pnpm install --frozen-lockfile`
6. **Environment Variables** (Project Settings → Environment Variables, all in the "Production" scope):

   | Name | Value |
   | --- | --- |
   | `NEXT_PUBLIC_API_BASE_URL` | the Render backend URL from step 4 below (e.g. `https://scc-health-api.onrender.com`) — you'll need to circle back and set this after step 4 |
   | `NEXT_PUBLIC_SENTRY_DSN` | (optional) your Sentry project DSN, if you want frontend error monitoring |
   | `NEXT_PUBLIC_SENTRY_ENVIRONMENT` | `production` |

7. Deploy. Note the resulting URL (e.g. `https://scc-health-intelligence.vercel.app`).
8. **Custom domain (optional):** Project Settings → Domains → add your domain, follow Vercel's DNS instructions.

## 4. Deploy the backend (Render)

1. In the Render dashboard: **New → Web Service**, connect this GitHub repository.
2. **Root Directory:** leave blank (repo root — the build command below `cd`s where needed).
3. **Runtime:** Python 3
4. **Build Command:**
   ```bash
   pip install uv && uv sync --package scc-health-api && uv run python scripts/fetch_data_artifact.py
   ```
   (`--package scc-health-api`, not `--all-packages` — the API never imports the pipeline package at runtime, DEC-022/DEC-030, so the heavy pipeline dependencies (ortools, geopandas, osmnx, ...) don't need to be installed on the serving instance at all.)
5. **Start Command:**
   ```bash
   uv run --package scc-health-api uvicorn scc_health_api.main:app --host 0.0.0.0 --port $PORT
   ```
6. **Health Check Path:** `/api/v1/ready` (not `/api/v1/health` — readiness confirms the warehouse actually connects, per `apps/api/src/scc_health_api/routes/system.py`).
7. **Persistent Disk:** Add a disk (1 GB is more than enough — the warehouse is ~50 MB), mount path e.g. `/data`.
8. **Environment Variables:**

   | Name | Value |
   | --- | --- |
   | `SCC_HEALTH_ENVIRONMENT` | `production` |
   | `SCC_HEALTH_WAREHOUSE_PATH` | `/data/scc_health.duckdb` (matches the persistent disk mount from step 7) |
   | `SCC_HEALTH_DATA_DIR` | `/data` |
   | `DATA_ARTIFACT_RELEASE_TAG` | the tag from step 2, e.g. `data-prod-20260714T221846Z` |
   | `CORS_ALLOWED_ORIGINS` | the Vercel URL from step 3, e.g. `https://scc-health-intelligence.vercel.app` (comma-separate multiple origins if you have a custom domain too) |
   | `TRUSTED_HOSTS` | the Render service's own hostname, e.g. `scc-health-api.onrender.com` |
   | `GITHUB_REPOSITORY` | `carhanc/scc-health-intelligence` (or your fork) — used by `fetch_data_artifact.py` to find the release |
   | `ANTHROPIC_API_KEY` | **leave unset** for this release (DEC-066: deterministic-only in production) |
   | `SENTRY_DSN` | (optional) your Sentry project DSN |
   | `SENTRY_ENVIRONMENT` | `production` |

9. Deploy. Note the resulting URL (e.g. `https://scc-health-api.onrender.com`).
10. **Go back to step 3** and set `NEXT_PUBLIC_API_BASE_URL` on Vercel to this URL, then redeploy the frontend.

## 5. Configure GitHub Actions for automated deploys and refresh

In the repo's **Settings → Secrets and variables → Actions**:

**Secrets:**

| Name | Value |
| --- | --- |
| `RENDER_DEPLOY_HOOK_URL` | Render service Settings → "Deploy Hook" URL |
| `VERCEL_DEPLOY_HOOK_URL` | Vercel project Settings → Git → "Deploy Hooks" — create one for `main` |
| `CENSUS_API_KEY` | (optional) speeds up ACS refresh; keyless fallback works without it |
| `HUD_USER_TOKEN` | (optional) same, for the ZIP-to-tract crosswalk source |

**Variables:**

| Name | Value |
| --- | --- |
| `PRODUCTION_FRONTEND_URL` | your Vercel URL |
| `PRODUCTION_BACKEND_URL` | your Render URL |

Once these are set, `.github/workflows/deploy.yml` automatically triggers both deploy hooks after `CI` passes on `main`, waits for rollout, then runs the real smoke-test suite (`scripts/smoke_test.py` + `e2e/production-smoke.spec.ts`) against the live URLs — failing loudly (not silently green) if anything is actually broken. `.github/workflows/scheduled-refresh.yml` runs monthly (or on manual dispatch) to rebuild the warehouse from live sources and publish a new data artifact, using `CENSUS_API_KEY`/`HUD_USER_TOKEN` if provided.

## 6. Validate the live deployment end to end

```bash
uv run python scripts/smoke_test.py \
  --frontend-url https://scc-health-intelligence.vercel.app \
  --backend-url https://scc-health-api.onrender.com

SMOKE_TEST_BASE_URL=https://scc-health-intelligence.vercel.app \
  pnpm --filter @scc-health/web exec playwright test e2e/production-smoke.spec.ts --project=desktop-chromium
```

Both must report all checks passing. If either fails, see `docs/deployment/rollback-guide.md`.

## 7. Ongoing operations

- **Scheduled refresh:** automatic (step 5), monthly. See `docs/data/refresh-runbook.md`.
- **Rollback:** see `docs/deployment/rollback-guide.md`.
- **Monitoring:** see `docs/observability/runbook.md`.
- **Incident response:** see `docs/security/incident-response.md`.

## What this guide deliberately does not cover

- **Authentication / accounts:** not part of this release (DEC-066) — every Advocate workspace is anonymous and browser-local. See `docs/architecture/phase9-production-requirements.md` if that changes in a future phase.
- **AI-assisted Copilot mode in production:** deliberately left unconfigured (no `ANTHROPIC_API_KEY` on the Render service) — see `RISK_REGISTER.md` RISK-032 for why, and `scripts/copilot_golden_eval.py` for the tool to run before ever changing that decision.
- **A managed database:** the DuckDB warehouse file is the entire production data layer; there is no separate Postgres/PostGIS instance to provision for this release.
