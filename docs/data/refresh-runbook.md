# Data refresh runbook (Phase 9)

## Source-by-source cadence

| Source | Cadence | Why |
| --- | --- | --- |
| ACS 5-year (Census) | Annual | Census releases a new 5-year estimate once a year |
| CDC PLACES | Annual | Annual model-based estimate release |
| CDC/ATSDR SVI | Annual (roughly) | Released on an irregular annual-ish cadence |
| CalEnviroScreen | Irregular (multi-year) | CalEPA releases major versions infrequently; re-check before assuming a new one exists |
| HCAI ED/utilization data | Annual | HCAI's own annual release cadence |
| HRSA HPSA/MUA, health center sites | Rolling/as-needed | HRSA updates designations continuously; a monthly re-pull catches drift without being wasteful |
| VTA GTFS (transit) | As published | Transit agencies republish GTFS on their own schedule, sometimes monthly |
| OSM network extracts | As needed | Only needs refreshing if the road/path network has materially changed |
| SNAP retailers | Rolling | USDA updates this list continuously |

Given this mix, **monthly** is the refresh cadence configured in `.github/workflows/scheduled-refresh.yml` — frequent enough to catch anything that updates monthly-or-faster, infrequent enough not to waste time/API budget re-fetching annual sources that haven't changed. Nothing here requires daily refresh.

## Expected duration

A full `make data` run (all 7 pipeline stages) takes on the order of **1–1.5 hours** end to end on the reference hardware, dominated by:
- The OSM network graph extract (a live multi-minute Overpass API call on first run; cached after).
- `run_access_metrics_pipeline` (~59 minutes, NOT cached, re-runs at full cost every time — see the `make data` target's own inline documentation).

`.github/workflows/scheduled-refresh.yml` sets a 180-minute job timeout to give this real headroom.

## Credentials

`CENSUS_API_KEY` and `HUD_USER_TOKEN` are both optional — every source they speed up has a keyless fallback path. Set them as repo secrets (see the deployment guide, step 5) if you want faster/more reliable refreshes; the scheduled workflow works without them, just slower and closer to public rate limits.

## Failure handling

The scheduled workflow follows **build → validate → publish → deliver**, never skipping a step:

1. `make data` — if any pipeline stage fails, the job stops here. No manifest, no publish, no deploy trigger. The previously published data artifact and the live deployment are both completely untouched.
2. `make audit` — every geography/data-quality/analytics-output check must pass. A real data-quality problem caught here is the audit **working correctly**, not a bug to route around.
3. `make data-manifest` — fails loudly if any required schema/table is missing (a partial pipeline run that didn't error but also didn't fully populate the warehouse).
4. A real pytest run against the freshly-built warehouse — a regression here means the new data broke something the API assumes.
5. Only after all four pass: `scripts/publish_data_artifact.py --publish` creates a new, uniquely-tagged GitHub Release. The previous release is never deleted or overwritten.
6. **Deliver:** if `RENDER_DEPLOY_HOOK_URL` is configured, the workflow triggers a Render deploy (which reruns `scripts/render_start.sh`, re-fetching whatever `DATA_ARTIFACT_RELEASE_TAG` resolves to — `latest` by default, so this picks up the just-published release automatically) and then polls `<backend-url>/api/v1/version` for up to 10 minutes until it reports the new `build_id`. If the hook isn't configured, this step is skipped with a clear warning (the release is still published; the backend will pick it up on its next deploy for any other reason).

If the workflow fails at any of steps 1–5, the job's step summary reports exactly where, and the live deployment keeps serving whatever data artifact it was already configured with — a failed refresh is invisible to end users, not a source of downtime. If step 6 (delivery) itself times out or the reported `build_id` never matches, the workflow **fails loudly** even though the release was successfully published — the release existing is not the same as production actually serving it, and this distinction matters enough to be a real failure, not a silent partial-success.

## Manually triggering an out-of-cycle refresh

GitHub → Actions → "Scheduled data refresh" → **Run workflow** (the `workflow_dispatch` trigger). Same build-validate-publish-deliver sequence, on demand.

## Confirming delivery worked

```bash
curl <backend-url>/api/v1/version
```

`data_build_id` should match the `build_id` printed in the workflow's step summary. If `RENDER_DEPLOY_HOOK_URL` wasn't configured when the refresh ran, delivery doesn't happen automatically — see `docs/deployment/production-deployment-guide.md` step 7 to configure it, or trigger a manual Render deploy to pick up the newly published `latest` release.

Note that a scheduled refresh **never** triggers a Vercel (frontend) deploy — a data-only refresh has nothing for the frontend to rebuild, and triggering one anyway would just be a wasted build.
