# STATE.md — Session Continuity Resume Point

**Last updated:** 2026-07-13 (Phase 6 complete — Access Lab: pipeline, analytics, API, frontend, tests, and documentation)

## Current phase and gate

**Phase 5 — CLOSED. Gate 5: PASS.** (Unchanged; see git history for detail.)

**Phase 6 (Access Lab, real-world accessibility modeling, resource intelligence, mobile-service optimization) — CLOSED. Gate 6: PASS.** Resumed from commit `76c1aee`, built across this session's full arc: architecture decisions → population-weighted origins → resource canonicalization/dedup → OSM network routing → scheduled-transit access → descriptive access metrics → E2SFCA → resource-gap analysis → optimizer extension → full-county batch computation → Access Lab API → Access Lab frontend → tests → documentation → final verification.

## What was built this phase

1. **Population-weighted origins** (`sources/census_population_origins.py`): 1,173 real Santa Clara County block-group origins, Census Bureau's own 2020 Mean Center of Population file (DEC-044).
2. **Canonical resource inventory + dedup** (`resources/{name_match,canonicalize}.py`): 4,207 deduplicated facilities across 4 categories, cross-source-matched (277 raw clinical-care records → 170 canonical, 72 real multi-source matches). Proximity alone never merges (tested + audited).
3. **Real OSM network routing** (`routing/network_osm.py`, `run_build_network_graphs.py`): live-downloaded, cached Santa Clara County walk (277,444 nodes) and drive (45,836 nodes) graphs. A real speed-imputation bug found and fixed (DEC-046).
4. **Scheduled-transit access** (`routing/transit_access.py`): real GTFS weekday-daytime headway per stop, walk-linked via the real network. A real performance defect found and fixed (DEC-047).
5. **E2SFCA** (`analytics/e2sfca.py`): Gaussian-decay catchment accessibility, real HCAI capacity for hospitals, disclosed count-proxy for clinics, never mixed (DEC-048).
6. **Resource-gap analysis** (`analytics/resource_gap.py`): county-relative need/access overlap classification + cross-variant stability assessment (DEC-050).
7. **Optimizer extension** (`optimization/location_allocation.py`): population-weighted demand, layered/disclosed distance methods, labeled candidate-site types, fully backward-compatible (DEC-049).
8. **Full-county batch computation** (`run_access_metrics_pipeline.py`): 58.6 minutes live, producing `analytics.{network_access_metrics,transit_access_metrics,e2sfca_accessibility}` (4,692 + 1,173 + 4,692 rows).
9. **Access Lab API** (`apps/api/.../routes/access.py`, `/api/v1/access/*`): 8 endpoints. Deliberately preserves DEC-022's dependency boundary — no live OR-Tools solve, a dependency-free local resource-gap classifier (DEC-051).
10. **Access Lab frontend** (`/access-lab`): tract search, walk/drive mode selector, 4 tabs (summary, resource browser, resource gaps, mobile-service scenarios).
11. **26 new audit checks** across 3 new audit modules, all wired into `make audit`.
12. **~150 new automated tests** (unit, contract, integration, e2e, accessibility) across pipelines, API, and frontend.
13. **Documentation**: 5 new `docs/methods/*.md`, 1 new `docs/user-guide/access-lab.md`, `DATA_DICTIONARY.md`/`MODEL_CARD.md`/`docs/data/source-verification.md` updated.

## Final verification (all live-run this session, all green)

- `make lint` — clean (ruff + eslint, backend and frontend).
- `make typecheck` — clean (mypy 105 files, tsc backend+frontend).
- `make test` — 301 backend (pytest) + 39 frontend (vitest), all passing.
- `make audit` — 0 `[FAIL]` lines, exit 0, including clean-room check (one false-positive fixed: `STATE.md`'s own boundary-reminder text was rephrased to avoid literally containing the forbidden string, rather than weakening the audit's file coverage).
- `make build` — Next.js production build succeeds, `/access-lab` in the route list.
- Full e2e suite (`npx playwright test`, both desktop and mobile projects): 146 passed, 2 honest pre-existing skips, 0 failures.
- Real hygiene fix: `cache/` (a 209MB untracked checksum-cache directory, `sources/http_fetch.py`'s raw-download cache) was found not gitignored and added to `.gitignore` before this commit — a real near-miss, not a cosmetic fix.

## Blockers

**RISK-012, status `accepted`** (unchanged): Claude Preview MCP tool remains blocked by a macOS TCC permission gap (`getcwd: cannot access parent directories: Operation not permitted` when the tool tries to run `.claude/dev_web_local_preview.sh`, confirmed again this session). Playwright (driven directly via Bash, independent of the Preview MCP tool) is the primary automated browser-verification path and was used for all Phase 6 UI verification, including real screenshots reviewed inline.

No other release-blocking issues. RISK-021 through RISK-025 are open-by-design scope/limitation disclosures (schedule-based transit, missing facility categories, anchor-based dedup, free-flow driving, no map layer), not defects.

## Last commands run

Full sequence: `make lint && make typecheck && make test && make audit && make build`, plus a full `npx playwright test` run (both projects) and a standalone `pytest apps/api/tests` pass — all green. `git status --short` reviewed in full; no secrets, no oversized untracked files after the `cache/` gitignore fix.

## Next three actions (exact Phase 7 resume point)

**Do not proceed to Phase 7 without the user's review of the Phase 6 closeout report.**

1. When authorized to continue: start Phase 7 (Utilization Lab and independent validation) per `docs/07_BUILD_PHASES.md` and `TASKS.md`'s Phase 7 section — HCAI ED-encounter/facility-profile/patient-origin normalization, native-geography display with crosswalk-uncertainty disclosure, pre-registered validation hypotheses against independent HCAI/external outcomes (never a score's own input, per the existing tautology guard), Spearman/Pearson with bootstrap CIs, spatial autocorrelation diagnostics (Moran's I / Getis-Ord Gi*), and the Validation Lab UI.
2. RISK-015 (no tract-level ED-utilization domain, deferred from Phase 4) is the natural Phase 7 starting point — HCAI's ED patient-county data needs a genuine tract-level crosswalk (via ZIP-level patient-origin data through the ZCTA-tract relationship) to become usable as an independent validation outcome.
3. A visual facility-marker map layer for the Access Lab resource browser (RISK-025) remains a legitimate, disclosed future enhancement — not blocking, and not Phase 7 scope unless the user asks for it explicitly.

## Current running processes

None. All dev/API servers started during this session were stopped cleanly.

## Notes for continuation

- Toolchain: node@22 is installed via Homebrew (`/usr/local/opt/node@22`) but not on the default PATH this session — `export PATH="/usr/local/opt/node@22/bin:$PATH"` before any pnpm/node command, or use `.claude/dev_web_local_preview.sh`'s pattern. `corepack enable` then resolves `pnpm@11.12.0` correctly once node@22 is on PATH.
- `resources.canonical_facilities` is the authoritative facility table for all Phase 6+ work — join through `resources.facility_source_crosswalk` for per-source provenance.
- `geo.block_group_population_origins` is the authoritative demand-origin table.
- `analytics.{network_access_metrics,transit_access_metrics,e2sfca_accessibility}` are precomputed batch tables (~59 minutes to regenerate) — the API reads them, never recomputes live.
- `data/raw/osm_network/*.graphml` (walk graph ~410MB, drive graph ~72MB) are cached, checksummed, gitignored (`data/raw/**`) — do not delete casually; re-downloading costs ~2-4 minutes live.
- Clean-room boundary reminder (unchanged all sessions, DEC-001): never inspect/reference the sibling project directory this repository's spec calls out, or any other sibling repository outside this project root.
