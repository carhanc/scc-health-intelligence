#!/usr/bin/env bash
# Render backend Start Command (Phase 9 correction pass).
#
# Render's persistent disk is mounted only at RUNTIME, not during the
# build step -- so the data artifact must be fetched here, not in the
# build command. This script:
#
#   1. Fetches/verifies the production data artifact onto the persistent
#      disk (scripts/fetch_data_artifact.py -- SHA-256 verified, never
#      replaces a known-good warehouse with a corrupted download).
#   2. Refuses to start if that fetch fails AND no existing warehouse is
#      already present at SCC_HEALTH_WAREHOUSE_PATH (nothing to serve).
#      If a fetch fails but a warehouse from a previous successful
#      fetch/deploy is already on disk, starts with that (possibly
#      stale, but real) warehouse rather than refusing to run at all --
#      the API's own startup validation (main.py's production readiness
#      check) is the final, authoritative gate on whether that warehouse
#      is actually usable.
#   3. execs uvicorn (replacing this shell process, not spawning a
#      child) only after step 1/2 complete, so Render's process
#      supervision and signal handling target uvicorn directly.
set -euo pipefail

WAREHOUSE_PATH="${SCC_HEALTH_WAREHOUSE_PATH:-warehouse/scc_health.duckdb}"

echo "Fetching production data artifact (DATA_ARTIFACT_RELEASE_TAG=${DATA_ARTIFACT_RELEASE_TAG:-<unset>})..."
if uv run python scripts/fetch_data_artifact.py; then
    echo "Data artifact ready at ${WAREHOUSE_PATH}."
elif [ -f "${WAREHOUSE_PATH}" ]; then
    echo "WARNING: fetching the data artifact failed, but an existing warehouse is already" >&2
    echo "present at ${WAREHOUSE_PATH} (from a previous successful fetch). Starting with it --" >&2
    echo "the API's own startup readiness check will refuse to serve if it isn't actually usable." >&2
else
    echo "ERROR: fetching the data artifact failed and no existing warehouse is present at" >&2
    echo "${WAREHOUSE_PATH}. Refusing to start -- there is nothing to serve." >&2
    exit 1
fi

exec uv run --package scc-health-api uvicorn scc_health_api.main:app --host 0.0.0.0 --port "${PORT}"
