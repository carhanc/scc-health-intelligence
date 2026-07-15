# Production deployment guide (Phase 9, pre-deployment correction pass)

This is the exact, numbered runbook for deploying Santa Clara Health Intelligence to production. It targets **Vercel** (frontend) + **Render** (backend, paid tier, persistent disk) + **GitHub Releases** (versioned data artifact, downloaded via authenticated API calls since **the repository is private**). See `DECISIONS.md` DEC-066 for the architecture decision and DEC-070/DEC-071 for the corrections this document reflects.

**Read this whole document before starting.** Every step below requires your own account and credentials — nothing here can be executed by an AI assistant on your behalf. **The repository stays private** — nothing in this guide requires making it public, and every download path below is designed around that.

## 0. Prerequisites

- A GitHub account with admin access to the private repository `carhanc/scc-health-intelligence`.
- A Render account (https://render.com) — **a paid plan is required** (Render's free tier does not support persistent disks at all — verified against Render's own documentation; "Starter" is the minimum tier this architecture runs on).
- A Vercel account (https://vercel.com) — the free (Hobby) tier is sufficient.
- The `gh` CLI installed and authenticated (`gh auth login`) on whatever machine will run `make publish-data`.
- A local warehouse built via `make data` (real, live data — takes real time and hits real external APIs).

## 1. Create a fine-grained GitHub token for Render

Render needs to download release assets from this **private** repository at every backend start. Create a token scoped as narrowly as possible:

1. GitHub → Settings → Developer settings → Personal access tokens → **Fine-grained tokens** → **Generate new token**.
2. **Repository access:** "Only select repositories" → `carhanc/scc-health-intelligence` (this one repository only, never "All repositories").
3. **Permissions → Repository permissions → Contents:** **Read-only**. This is the only permission required — it covers both listing releases and downloading release assets (verified against GitHub's REST API permissions reference). Leave every other permission at "No access."
4. Set an expiration (GitHub recommends 90 days or less; you will need to rotate this and update the Render env var when it expires — note the expiration date somewhere you'll see it).
5. Generate the token and **copy it immediately** — GitHub shows it only once. You will paste it into Render's dashboard in step 4. **Never paste it into a commit, a script, a chat message, or anywhere it could be logged.**

## 2. Push the repository to GitHub

```bash
git status                       # confirm a clean tree, only the intended commit(s)
git push origin main
```

Do not force-push. Do not rewrite history. Confirm in the GitHub UI that the repository is still **Private** (Settings → General → Danger Zone shows "Change visibility," not a public badge).

## 3. Publish the first data artifact

```bash
make data            # builds the full warehouse from live sources (real time, real API calls)
make audit            # must pass before publishing anything
make data-manifest    # builds DATA_MANIFEST.production.json, fails loudly on any missing schema
uv run python scripts/publish_data_artifact.py --publish   # publishes as a GitHub Release (requires `gh auth login`)
```

Note the release tag it prints (e.g. `data-prod-20260714T221846Z`) — you can reference it directly for a rollback later, though production will default to always fetching whatever is newest (see step 4).

## 4. Deploy the backend (Render)

**Persistent disks require a paid Render plan** — the free tier cannot attach one at all. Choose at least the "Starter" plan.

Two ways to configure the service — pick one:

### Option A: Render Blueprint (recommended — reduces manual-entry risk)

1. Render dashboard → **New → Blueprint** → connect this repository. Render reads `render.yaml` from the repo root automatically.
2. Render prompts you for every value marked `sync: false` in `render.yaml`: `DATA_ARTIFACT_GITHUB_TOKEN` (the token from step 1), `CORS_ALLOWED_ORIGINS` (leave blank for now — you'll set it after step 5), `TRUSTED_HOSTS` (leave blank for now), `ANTHROPIC_API_KEY` (**leave blank — deterministic-only Copilot in production, DEC-066**), `SENTRY_DSN` (optional, leave blank to disable).
3. Deploy. Note the resulting URL (e.g. `https://scc-health-api.onrender.com`).

### Option B: Manual dashboard configuration

1. Render dashboard → **New → Web Service** → connect this repository.
2. **Root Directory:** leave blank (repo root).
3. **Runtime:** Python 3. **Plan:** Starter or higher (required for the disk).
4. **Build Command** (installs only the serving package's dependencies — the persistent disk is not mounted yet at this point, so nothing data-related happens here):
   ```bash
   pip install uv && uv sync --package scc-health-api
   ```
5. **Start Command** (fetches/verifies the data artifact onto the now-mounted disk, then execs uvicorn — see `scripts/render_start.sh`'s own comments for exactly why this must happen at start, not build, time):
   ```bash
   bash scripts/render_start.sh
   ```
6. **Health Check Path:** `/api/v1/ready` (not `/api/v1/health` — readiness confirms the warehouse actually connects).
7. **Disk:** Add a disk, mount path `/data`, size 1 GB (the warehouse is ~50 MB; 1 GB leaves comfortable headroom).
8. **Environment Variables** — see the full table in `docs/deployment/environment-variables.md`; at minimum:

   | Name | Value |
   | --- | --- |
   | `SCC_HEALTH_ENVIRONMENT` | `production` |
   | `SCC_HEALTH_WAREHOUSE_PATH` | `/data/scc_health.duckdb` |
   | `SCC_HEALTH_DATA_DIR` | `/data` |
   | `DATA_ARTIFACT_RELEASE_TAG` | `latest` (always fetches the newest published `data-*` release; see the rollback guide to pin an exact tag instead) |
   | `DATA_ARTIFACT_GITHUB_TOKEN` | the token from step 1 — paste directly into Render's dashboard field, never into a file |
   | `GITHUB_REPOSITORY` | `carhanc/scc-health-intelligence` |
   | `CORS_ALLOWED_ORIGINS` | leave blank for now — set after step 5 |
   | `TRUSTED_HOSTS` | leave blank for now — set after step 5 |
   | `ANTHROPIC_API_KEY` | **leave blank** — deterministic-only Copilot in production (DEC-066) |
   | `SENTRY_DSN`, `SENTRY_ENVIRONMENT` | optional |

9. Deploy. Note the resulting URL.

### After either option

Watch the first deploy's logs. `scripts/render_start.sh` should print "Fetching production data artifact..." then either "Data artifact ready" or a clear, actionable error (see `docs/deployment/environment-variables.md`'s troubleshooting notes for what 401/403/404 mean here). **If the first deploy fails because no data release exists yet, go back and complete step 3 first.**

## 5. Deploy the frontend (Vercel)

1. Vercel dashboard → **Add New → Project** → import this GitHub repository.
2. **Root Directory:** `apps/web`.
3. **Include source files outside of the Root Directory in the Build Step:** confirm this is **enabled** (Project Settings → Build and Deployment → Root Directory section). It is on by default for projects created after August 2020, but verify it explicitly — without it, the build cannot see `packages/ui`, which `apps/web` depends on via `workspace:*`. This was verified this session: a real, clean `git clone` + `pnpm install --frozen-lockfile` from the repo root + `next build` from `apps/web` produces a working build of all 14 routes, confirming the workspace-package resolution this setting depends on.
4. **Framework Preset:** Next.js (auto-detected). **Install Command** and **Build Command:** leave as the framework defaults (`pnpm install` / `next build`, auto-detected from the root `pnpm-lock.yaml` and `apps/web/package.json`'s own `build` script) — no custom override is needed or was found necessary in this session's verification.
5. **Environment Variables** (Production scope):

   | Name | Value |
   | --- | --- |
   | `NEXT_PUBLIC_API_BASE_URL` | the Render backend URL from step 4, e.g. `https://scc-health-api.onrender.com` — **the only required frontend variable**, confirmed by grepping every `process.env` reference in `apps/web` this session |
   | `NEXT_PUBLIC_SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_ENVIRONMENT` | optional |

   **Never place backend secrets here** (`DATA_ARTIFACT_GITHUB_TOKEN`, `ANTHROPIC_API_KEY`, `CENSUS_API_KEY`, `HUD_USER_TOKEN`) — Vercel only needs the one public API-base-URL value above.
6. No `vercel.json` is included in this repository, and none was found necessary — every required setting (Root Directory, install/build commands, environment variables) is configurable through the dashboard alone; a `vercel.json` would only be needed for custom rewrites/redirects/headers or Related Projects, none of which this deployment uses.
7. Deploy. Note the resulting URL (e.g. `https://scc-health-intelligence.vercel.app`).
8. **Custom domain (optional):** Project Settings → Domains → add your domain, follow Vercel's DNS instructions.

## 6. Go back and lock down CORS/trusted hosts

Now that both URLs exist:

1. Render → Environment → set `CORS_ALLOWED_ORIGINS` to the Vercel URL from step 5 (comma-separate multiple origins if you add a custom domain later).
2. Render → Environment → set `TRUSTED_HOSTS` to this Render service's own hostname.
3. Save — Render redeploys automatically on an env var change.

## 7. Configure GitHub Actions for automated deploys and refresh

In the repo's **Settings → Secrets and variables → Actions**:

**Secrets:**

| Name | Value |
| --- | --- |
| `RENDER_DEPLOY_HOOK_URL` | Render service Settings → "Deploy Hook" URL |
| `VERCEL_DEPLOY_HOOK_URL` | Vercel project Settings → Git → "Deploy Hooks" — create one for `main` |
| `CENSUS_API_KEY`, `HUD_USER_TOKEN` | (optional) speeds up `scheduled-refresh.yml`'s `make data` step; both sources have a keyless fallback |

**Variables:**

| Name | Value |
| --- | --- |
| `PRODUCTION_FRONTEND_URL` | your Vercel URL |
| `PRODUCTION_BACKEND_URL` | your Render URL |

Once these are set:
- `.github/workflows/deploy.yml` automatically triggers both deploy hooks after `CI` passes on `main` (or on a manual `workflow_dispatch` — useful for triggering the very first real deployment before any push-triggered CI run exists to react to), polls both services until they're actually responding (bounded, ~5-minute timeout each — never a blind fixed sleep), then runs the real smoke-test suite against the live URLs. A hook configured with no matching production-URL variable is treated as a configuration error and fails the job loudly, not silently.
- `.github/workflows/scheduled-refresh.yml` runs monthly (or on manual dispatch) to rebuild the warehouse from live sources, publish a new data artifact, trigger the Render deploy hook, and poll `/api/v1/version` until production reports the new `build_id` — genuine end-to-end delivery, not just publishing a release nobody's told to fetch.

**Triggering the first real deployment manually:** GitHub → Actions → "Deploy" workflow → **Run workflow** button (the `workflow_dispatch` trigger added this session specifically for this purpose).

## 8. Validate the live deployment end to end

```bash
uv run python scripts/smoke_test.py \
  --frontend-url https://scc-health-intelligence.vercel.app \
  --backend-url https://scc-health-api.onrender.com

SMOKE_TEST_BASE_URL=https://scc-health-intelligence.vercel.app \
  pnpm --filter @scc-health/web exec playwright test e2e/production-smoke.spec.ts --project=desktop-chromium
```

Both must report all checks passing. If either fails, see `docs/deployment/rollback-guide.md`.

## 9. Ongoing operations

- **Scheduled refresh:** automatic (step 7), monthly. See `docs/data/refresh-runbook.md` for the full build-validate-publish-**deliver** sequence.
- **Rollback:** see `docs/deployment/rollback-guide.md` (covers both a code rollback and pinning `DATA_ARTIFACT_RELEASE_TAG` to a specific historical tag instead of `latest`).
- **Monitoring:** see `docs/observability/runbook.md`.
- **Incident response:** see `docs/security/incident-response.md`.
- **Token rotation:** `DATA_ARTIFACT_GITHUB_TOKEN` expires per its configured lifetime (step 1) — generate a new one before it expires and update the Render env var; the old token stops working immediately once revoked/expired, so do this proactively, not reactively.

## What this guide deliberately does not cover

- **Authentication / accounts:** not part of this release (DEC-066) — every Advocate workspace is anonymous and browser-local.
- **AI-assisted Copilot mode in production:** deliberately left unconfigured — see `RISK_REGISTER.md` RISK-032 and `docs/security/ai-production-readiness.md`.
- **A managed database:** the DuckDB warehouse file is the entire production data layer.
- **Making the repository public:** it stays private; every download path in this guide (Render's authenticated fetch, CI's authenticated fetch) is built around that, not worked around.
