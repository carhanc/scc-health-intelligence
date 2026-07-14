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

The scheduled workflow follows **build → validate → publish**, never skipping a step:

1. `make data` — if any pipeline stage fails, the job stops here. No manifest, no publish. The previously published data artifact is completely untouched.
2. `make audit` — every geography/data-quality/analytics-output check must pass. A real data-quality problem caught here is the audit **working correctly**, not a bug to route around.
3. `make data-manifest` — fails loudly if any required schema/table is missing (a partial pipeline run that didn't error but also didn't fully populate the warehouse).
4. A real pytest run against the freshly-built warehouse — a regression here means the new data broke something the API assumes.
5. Only after all four pass: `scripts/publish_data_artifact.py --publish` creates a new, uniquely-tagged GitHub Release. The previous release is never deleted or overwritten.

If the workflow fails at any of steps 1–4, the job's step summary reports exactly where, and the live deployment keeps serving whatever data artifact it was already configured with — a failed refresh is invisible to end users, not a source of downtime.

## Manually triggering an out-of-cycle refresh

GitHub → Actions → "Scheduled data refresh" → **Run workflow** (the `workflow_dispatch` trigger). Same build-validate-publish sequence, on demand.

## After a successful refresh: rolling the change out

Publishing a new data artifact does **not** automatically redeploy the backend — a Render service only re-fetches the tagged artifact on its next build. To roll a fresh refresh out:

1. Update the Render service's `DATA_ARTIFACT_RELEASE_TAG` env var to the new tag (printed in the workflow's step summary).
2. Trigger a Render manual deploy (or push any commit to `main`, which the `Deploy` workflow will pick up).

This two-step design (publish, then separately roll out) is deliberate — it means a newly published artifact can be smoke-tested against a staging environment before being promoted to production if you want that extra safety margin, rather than every scheduled refresh silently and immediately becoming what production serves.
