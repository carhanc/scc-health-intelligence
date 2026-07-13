# STATE.md — Session Continuity Resume Point

**Last updated:** 2026-07-13 (Phase 6 complete; Phase 6.5 geography-search UX complete; Phase 7 not yet started)

## Current phase and gate

**Phase 5 — CLOSED. Gate 5: PASS.** (Unchanged; see git history for detail.)

**Phase 6 (Access Lab, real-world accessibility modeling, resource intelligence, mobile-service optimization) — CLOSED. Gate 6: PASS.** Full detail in `TASKS.md`'s Phase 6 section and commit `4c782bc`.

**Phase 6.5 (geography search UX: city/ZIP/district-first search, city drill-down) — CLOSED. Gate 6.5: PASS.** A UX improvement completed before starting Phase 7. Full detail in `TASKS.md`'s Phase 6.5 section, `DECISIONS.md` DEC-052 through DEC-054, `RISK_REGISTER.md` RISK-026.

## What Phase 6.5 built

1. **Ranked, widened geography search** (`apps/api/src/scc_health_api/repositories/geography.py::search_geographies`): every native geography type (place, ZCTA, supervisor district, tract) is searchable; tracts are deprioritized (never removed) so a city/ZIP/district query is never crowded out; a query shaped like a tract GEOID promotes tracts back to the front. New ZCTA search support. Real bug found and fixed: an early draft's SQL pre-filter silently dropped queries matching only a Python-synthesized candidate string. DEC-052.
2. **Tract-to-place spatial assignment** (`geo.tract_place_assignment`, `pipelines/.../geography/harmonize.py`): the same audited majority-land-area-overlap method already used for tract-to-supervisor-district assignment, not a lighter-weight point-in-polygon check that was live-verified to disagree for 35 of 408 tracts. 4 new geography audits, all passing. DEC-053.
3. **City/district highest-concern-tract drill-down**: `GET /api/v1/geographies/place/{id}/top-concern-tracts` and the equivalent for supervisor districts, surfaced in Explore's `PlaceDetail`/`DistrictDetail` and (via a new `city-drill-down.tsx` component) in Access Lab's non-tract-selection guidance.
4. **A real, systematic display-name bug found and fixed** (DEC-054): `SelectedGeography.displayName` is only accurate for the render immediately after an in-app search click; every selection is actually re-derived from URL params, which have no name, so a raw place GEOID (e.g. "0668000") was showing in place of "San Jose city" on essentially every selection, not just shared links. Fixed by resolving the real name from the same profile endpoints the detail panels already call. Verified live across reload, browser back, and browser forward.
5. Demo warehouse snapshot updated (`data/demo/geography/`, `scripts/build_demo_geography_snapshot.py`, `run_demo_pipeline.py`) to include the new `tract_place_assignment` table.

## Final verification (all live-run this session, all green)

- `make lint` / `make typecheck` / `make audit` / `make build` — all clean.
- `make test` — 314 backend (pytest, up from 301) + 39 frontend (vitest) unit/integration tests, 0 failures.
- Full e2e suite (`npx playwright test`, both desktop and mobile projects): 77 passed, 1 honest pre-existing skip, 0 failures (up from 74 -- 2 new Phase 6.5 regression tests, plus fixes to 2 pre-existing tests whose selectors became ambiguous due to genuinely new UI content).
- Accessibility: 16 axe scans (up from 14), zero serious/critical violations, including the new city-drill-down states in both Explore and Access Lab.
- Live browser verification: Sunnyvale/San Jose in Explore, Sunnyvale in Access Lab (drill-down click through to a real 11-character tract GEOID), District 3, ZIP 94086, a full tract GEOID, page reload, browser back, browser forward -- resolved names persisted correctly in every case.
- `make demo` re-run clean with the new table included.

## Blockers

**RISK-012, status `accepted`** (unchanged): Claude Preview MCP tool remains blocked by a macOS TCC permission gap (`getcwd: cannot access parent directories: Operation not permitted`). Playwright (driven directly via Bash) remains the primary automated browser-verification path and was used for all Phase 6.5 UI verification.

No other release-blocking issues. RISK-021 through RISK-026 are open-by-design scope/limitation disclosures, not defects.

## Last commands run

Full sequence: `make lint && make typecheck && make test && make audit && make build`, a full `npx playwright test` run (both projects), and a standalone `pytest apps/api/tests` pass -- all green. `git status --short` reviewed in full; `cache/` confirmed still gitignored; no stray scratch files left in the working tree.

## Next action (exact Phase 7 resume point)

Phase 7 (Utilization Lab and independent validation) has **not been started**. Per `TASKS.md`'s Phase 7 section and `docs/07_BUILD_PHASES.md`:

1. HCAI ED-encounter/facility-profile/patient-origin normalization at native geography, with crosswalk-uncertainty disclosure where allocated to tract level.
2. Pre-registered validation hypotheses against independent HCAI/external outcomes (never a score's own input -- the existing tautology guard, `validation/tautology_guard.py`, already blocks this) — Spearman/Pearson with bootstrap CIs, spatial autocorrelation diagnostics (Moran's I / Getis-Ord Gi*).
3. RISK-015 (no tract-level ED-utilization domain, deferred since Phase 4) is the natural starting point: HCAI's ED patient-county data needs a genuine tract-level crosswalk (via ZIP-level patient-origin data through the ZCTA-tract relationship, `geo.crosswalk_zip_tract`, already built) to become usable as an independent validation outcome.
4. Validation Lab UI: hypothesis, outcome, method, result+uncertainty, spatial check, "what this does not prove," downloadable table, null/weak findings shown with equal weight.

**Do not begin Phase 7 without confirming with the user first**, since the immediately-preceding instruction set explicitly separated Phase 6.5 closure from Phase 7 start.

## Current running processes

None. All dev/API servers started during this session were stopped cleanly.

## Notes for continuation

- Toolchain: node@22 is installed via Homebrew (`/usr/local/opt/node@22`) but not on the default PATH -- `export PATH="/usr/local/opt/node@22/bin:$PATH"` before any pnpm/node command.
- `geo.tract_place_assignment` is now the authoritative tract-to-city relationship table (majority land-area overlap, matching `geo.tract_supervisor_district_assignment`'s method exactly) -- any future feature needing "which tracts are in this city" should join against it, not reinvent a point-in-polygon check.
- `SelectedGeography.displayName` is reliable only for the one render immediately following a fresh in-app selection (e.g. `aria-current` highlighting in `SearchPanel`) -- any component needing a durable, reload-safe display name must resolve it from the relevant profile endpoint itself (see `explore-map.tsx`'s `placeNameQuery` and `city-drill-down.tsx`'s `nameQuery` for the established pattern).
- `resources.canonical_facilities`, `geo.block_group_population_origins`, and `analytics.{network_access_metrics,transit_access_metrics,e2sfca_accessibility}` (Phase 6) remain the authoritative Access Lab tables — unaffected by Phase 6.5.
- Clean-room boundary reminder (unchanged all sessions, DEC-001): never inspect/reference the sibling project directory this repository's spec calls out, or any other sibling repository outside this project root.
