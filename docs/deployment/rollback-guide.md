# Rollback guide (Phase 9)

Two independent things can need rolling back: a **code deploy** (frontend or backend) and a **data artifact** (the warehouse). They're separate mechanisms — a bad code deploy never touches the published data artifact, and a bad data refresh never touches the deployed code.

## Rolling back a code deploy

**Vercel:** Dashboard → Project → Deployments → find the last known-good deployment → "..." menu → **Promote to Production**. Takes effect immediately, no rebuild needed (Vercel keeps prior builds).

**Render:** Dashboard → Service → Events/Deploys tab → find the last known-good deploy → **Rollback to this deploy**. Render redeploys that exact prior build.

Both are one-click dashboard actions — no CLI, no redeploying from a git revert (though a git revert + push is also valid if you'd rather fix forward).

## Rolling back a data artifact

The backend reads `DATA_ARTIFACT_RELEASE_TAG` at build time (Render's build command runs `scripts/fetch_data_artifact.py`, which downloads that specific tagged release). To roll back to a previous data build:

1. Find the previous good release tag: `https://github.com/carhanc/scc-health-intelligence/releases` (tags look like `data-prod-20260714T221846Z`).
2. In Render: Service → Environment → change `DATA_ARTIFACT_RELEASE_TAG` to that tag.
3. Trigger a manual deploy (Render → Manual Deploy → "Deploy latest commit", which re-runs the build command and re-fetches the now-changed tag).

Because `scripts/publish_data_artifact.py` never deletes or overwrites a previous release (each build gets its own uniquely-timestamped `build_id`/tag), every past data artifact remains available to roll back to indefinitely — there is no "the old one is gone" failure mode.

## When to roll back vs. fix forward

- A code deploy that fails the automated smoke test (`.github/workflows/deploy.yml`) should be rolled back immediately, then debugged separately — don't leave a known-broken deploy live while investigating.
- A data refresh that fails `make audit` never gets published in the first place (`scripts/publish_data_artifact.py` is only ever reached after a passing audit in `scheduled-refresh.yml`) — there is nothing to "roll back" in that case, since the bad artifact was never made the live one.
- If a *published* data artifact later turns out to have a real problem `make audit` didn't catch, roll back the `DATA_ARTIFACT_RELEASE_TAG` env var (above) and separately investigate/fix the audit gap that let it through — a real audit-coverage gap is worth its own `RISK_REGISTER.md` entry.

## Verifying a rollback worked

```bash
uv run python scripts/smoke_test.py --frontend-url <url> --backend-url <url>
curl <backend-url>/api/v1/version   # confirm data_build_id matches what you rolled back to
```
