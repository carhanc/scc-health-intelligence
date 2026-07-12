# Usability testing — Explore page

Tracks the usability-task walkthroughs required by Phase 5 (`docs/07_BUILD_PHASES.md`, `docs/06_ACCEPTANCE_TESTS.md`). Each task must be completable by a first-time, non-technical user without instructions. This document is updated as tasks are exercised; it is not yet a complete Phase 5 usability pass (see "Status" at the bottom).

For each task: steps taken, expected result, friction found, fix implemented (if any), and how it was verified in this environment (real browser interaction was not available -- see RISK-012 in `RISK_REGISTER.md` -- so verification here is end-to-end API/HTTP-level plus automated component/regression tests, documented explicitly wherever it substitutes for a literal click).

---

## Task 2 — Find a census tract by clicking it on the map, and understand why it ranks the way it does

**Steps a user takes:**
1. Open Explore.
2. Click any shaded tract on the map.
3. Read the detail panel that appears: the plain-language summary, the score, and the domain breakdown.

**Expected result:** The detail panel loads that exact tract's real profile -- name, score, stability, and driver breakdown -- matching the tract that was clicked.

**Friction found (Phase 5 hotfix, reported by the user after an earlier Phase 5 build):** Clicking a tract showed a correct hover popup (e.g. "Census Tract 5033.21 -- Score: 53/100"), but the detail panel then showed "Couldn't load this tract" / "Tract tract not found." The map's click handler and the panel it fed disagreed about what had been selected.

**Root cause:** A parameter-count mismatch between the map's two-argument selection callback type and the one-argument function actually wired to it. The map called the handler with `("tract", geoid)`; the handler's single parameter bound to the first argument, so the literal string `"tract"` silently replaced the real GEOID. Full technical writeup: `DECISIONS.md` DEC-041.

**Fix implemented:** One canonical `SelectedGeography` object (`geographyType`, `geoid`, `displayName`, `source`) is now used by the map, table, search, comparison, and URL state alike (`apps/web/app/explore/selection.ts`), with boundary-level GEOID validation before any selection reaches an API call, and a truthful, non-jargon error message (with Retry and Clear-selection actions) if a lookup still fails for some other reason.

**Verification performed:**
- Live end-to-end check of the exact request path a map click now produces (`GET /api/v1/geographies/tract/{geoid}` and `GET /api/v1/scenarios/{scenario}/tracts/{geoid}/explain`) for one low-scoring tract (06085509901, score 18.6), one middle-scoring tract (06085500500, score 48.8), and one high-scoring tract (06085503112, score 77.5, Robust) -- all three resolved correctly with real data.
- Confirmed the exact original-bug request (`GET /api/v1/geographies/tract/tract`) now returns a clean, structured 404 (`error_code: geography_not_found`) instead of a confusing profile-shaped failure.
- `apps/web/test/explore-table.test.tsx`: a real component test confirms table-row selection (click and keyboard Enter) produces the correct `SelectedGeography` shape with the row's real GEOID -- the same shape and the same handler the map now uses, so this stands in for map-click verification given real map canvas interaction (WebGL) is not renderable in the automated test environment.
- `apps/web/test/selection.test.ts`: 12 tests covering GEOID validation (leading zeros, in-county prefix, rejection of the literal type string and of short display labels) and URL round-trip parsing.
- `apps/api/tests/test_geography_routes.py`: structured-404 regression tests for the literal-type-as-id case, a short display label, and leading-zero preservation.
- Note on browser-click verification specifically: the Preview tool present this session failed with a macOS TCC (Files and Folders) permission error before it could launch a dev server (see `RISK_REGISTER.md` RISK-012, Phase 5 update) -- a literal mouse click on the map canvas was not performed. The API-path and component-test verification above cover the same code path the click ultimately drives (selection object construction → URL update → detail-panel fetch), but a true click-through pass is still owed once browser tooling is available.

---

## Status

Only Task 2 (map-selection regression) has been exercised as part of this Phase 5 hotfix. Tasks 1, 3-8 from the original Phase 5 usability requirement (find Sunnyvale and identify top concerns; compare San Jose with Sunnyvale; switch scenarios; identify score stability; find a metric's source/vintage; understand what the platform cannot conclude; full keyboard-only navigation) remain outstanding and are not claimed as done here.
