# STATE.md — Session Continuity Resume Point

**Last updated:** 2026-07-11 (end of Phase 2 session)

## Current phase and gate

**Phase 2 (Geography spine, provenance system, data contracts) — complete and verified. Gate 2: PASS.** Ready to begin Phase 3 (core federal/state/local data ingestion — the remaining ~11 health/social/resource/utilization source adapters) in the next session.

## Completed this session

**Phase 0 and Phase 1** (carried over from earlier in this session): see prior STATE.md history in git log (commits `439d011`, `f46526b`).

**Phase 2:**
- Verified exact live download URLs for all 6 geography sources before writing any adapter code (TIGER tract/place, cartographic county/ZCTA, Census ZCTA-tract relationship file, SCC supervisor districts ArcGIS endpoint).
- Built the source-adapter protocol (`pipelines/src/scc_health_pipeline/sources/base.py`) plus shared HTTP fetch-with-retry (`http_fetch.py`) and `DATA_MANIFEST.json` read/write (`manifest.py`) helpers.
- Implemented and **ran against live data** 6 concrete adapters: `tiger_tract.py`, `tiger_place.py`, `census_county_cartographic.py`, `census_zcta_cartographic.py`, `census_zcta_tract_relationship.py`, `scc_supervisor_districts.py`.
- Built `geography/harmonize.py` (cross-source spatial harmonization: place/ZCTA county-intersection filtering, majority-area-overlap tract-to-district assignment with explicit boundary-crossing disclosure) and `geography/warehouse_loader.py` (DuckDB `geo.*` schema loader).
- Built the geography audit suite (`audits/geography_audits.py`, 18 checks) wired into `make audit`.
- Built and ran the demo snapshot pipeline (`scripts/build_demo_geography_snapshot.py` + `run_demo_pipeline.py`), producing `data/demo/geography/*.parquet` (checked in, 3.2MB, real frozen Phase 2 data per DEC-016) and a separate `scc_health_demo.duckdb`.
- Built geography API endpoints (`/api/v1/geographies/{search,tract/{id},place/{id},supervisor_district/{n},{type}/{id}/boundary}`, `/api/v1/sources`) with live/demo/unavailable data-mode resolution (`db.py::resolve_warehouse_path`).
- Built a Phase 2 functional frontend scaffold (`apps/web/app/explore`): geography search + profile view wired to the real API, URL-persisted selection, truthful loading/error/empty states.
- **Ran the full pipeline against live official sources** — this is real data, not a dry run: 408 tracts, 30 places, 70 ZCTAs, 1 county, 5 supervisor districts, 638 crosswalk rows, 4 unassigned-land-sliver rows, all hand-verified (see `docs/methods/geography.md` and `TASKS.md` Phase 2 for evidence).
- Found and fixed 6 real bugs during implementation (not merely hypothetical edge cases): a path-derivation off-by-one that wrote staged output to the wrong directory (found in 6 files); wrong assumed field names for the ZCTA cartographic shapefile; a DuckDB VARCHAR/DECIMAL cast error in the CRS-plausibility audit (TIGER's lat/lon fields are text, not numeric); a pytest `tests`-package name collision between `apps/api/tests` and `pipelines/tests` (fixed via `--import-mode=importlib`); a second identical path-depth bug in `routes/sources.py`; and a near-miss data bug where naive substring matching would have confused ZCTA `06085` (a Connecticut ZIP) with Santa Clara County's `06085` FIPS prefix (caught before it shipped, fixed with field-based matching).
- Made and recorded 7 new decisions (DEC-011 through DEC-017) and updated/added risk entries (RISK-001, RISK-002 statuses updated to `mitigated` for Phase 2 scope; RISK-011 updated; RISK-012 added for the browser-tooling gap).
- Full local verification: `make lint`, `make typecheck` (mypy strict, zero errors across 44 Python files), `make test` (25 Python + 1 TS = 26 tests, all passing, including 11 fixture-based offline contract tests built from real-but-small data subsets), `make audit` (18/18 geography checks green), `make data` (live), `make demo` (offline), `make dev` (both servers verified together), frontend production build (`next build`) all pass.
- Attempted in-browser visual verification twice (no Chrome extension connected; Preview tool blocked by a sandbox-level `getcwd` permission error) — documented as DEC-017/RISK-012, substituted with thorough HTTP-level verification (curl against both dev servers, CORS header check, rendered-HTML inspection).

## Gate 2 evidence

All Phase 2 checklist items in `TASKS.md` are checked with evidence. Full detail there; headline: geometry/coverage audits pass (18/18), every tract has a canonical 11-digit GEOID, crosswalk weights sum within documented tolerance, demo snapshot runs fully offline.

## Blockers

None release-blocking. One open environment limitation: no browser-based visual verification tooling available this session (RISK-012, `monitoring` status) — will retry at the start of the next session; not required until Phase 5's gate.

## Last commands run

`make lint && make typecheck && make test && make audit` — all green. Dev servers (`make dev`) started, smoke-tested via curl, stopped cleanly. Commit not yet made as of this STATE.md write — see "next actions."

## Next three actions (exact resume point)

1. Commit the Phase 2 checkpoint (geography spine + API + frontend scaffold + governance docs), following the same coherent-commit pattern as Phases 0–1.
2. Report Phase 2 completion to the user with the evidence summary requested (files changed, sources used, row counts, audit results, test/command outcomes, unresolved risks, commit hash, exact Phase 3 resume point) — **do not proceed to Phase 3 without the user's go-ahead**, per this session's explicit instruction ("Do not proceed to Phase 3").
3. When authorized to continue: start Phase 3 (core federal/state/local data ingestion) per `docs/07_BUILD_PHASES.md` — build adapters for the remaining ~11 sources (CDC PLACES, ACS 5-year, CDC/ATSDR SVI, CA HPI, CalEnviroScreen, HCAI facility/ED/patient-origin ×3, HRSA health centers, HRSA HPSA/MUA, VTA GTFS, USDA SNAP), reusing the `SourceAdapter` protocol and manifest/audit infrastructure built in Phase 2. Read `PLAN.md` §5 for the adapter priority order.

## Current running processes

None. Both dev servers were stopped cleanly at the end of this session (confirmed via `lsof -i:3000 -i:8000` returning nothing and `ps aux | grep -E "uvicorn|next dev"` showing no lingering processes).

## Notes for continuation

- Toolchain remains installed from Phase 1 (node@22.23.1, pnpm 11.12.0, uv 0.11.28, Python 3.12.13). `POLARS_SKIP_CPU_CHECK=1` is now automatically exported by the Makefile (was previously a manual `export` a new session might forget).
- To run dev servers in a new session: `export PATH="/usr/local/opt/node@22/bin:$PATH"` first, then `make dev`.
- `data/raw/`, `data/staged/`, `data/curated/`, and `warehouse/*.duckdb` are gitignored (regenerable via `make data`); `data/demo/geography/*.parquet` is intentionally committed (the offline demo snapshot).
- The Phase 0 "changed from spec" findings remain relevant for Phase 3: ACS keyless-bulk-first (DEC-003), CalEnviroScreen 5.0 final-dataset re-verification at implementation time (DEC-007) — do this first thing in Phase 3 since it's now 10 days further from the July 1 finalization date.
