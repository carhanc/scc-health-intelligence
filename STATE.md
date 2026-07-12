# STATE.md — Session Continuity Resume Point

**Last updated:** 2026-07-12 (Phase 5 build + Phase 5 hotfix session)

## Current phase and gate

**Phase 5 (design system + first complete vertical slice: Overview + Explore) — built, then a release-blocking defect was reported and fixed (hotfix). Gate 5: NOT yet formally closed.** Overview and Explore are both functionally complete against real live data, with the map-selection hotfix verified end to end. What remains before Gate 5 can be marked PASS: a true in-browser visual/keyboard/screen-reader walkthrough (still blocked by environment tooling, see Blockers), responsive-viewport verification, the remaining usability-task walkthroughs (Tasks 1, 3-8), and `docs/design/design-system.md` / `component-inventory.md` / `content-style-guide.md`.

## Completed this session

**Phase 5 build:**

- **Design tokens** (`apps/web/app/globals.css`, `packages/ui/src/tokens.ts`): full surface/text/border/interactive/caution/alert/success/neutral CSS custom-property system, Okabe-Ito colorblind-safe chart palette, single-hue sequential map scale (never red/green), radius/shadow/layout tokens, reduced-motion support.
- **`packages/ui` component library** (was an empty placeholder): `Button`, `Badge`/`StabilityBadge`/`FreshnessBadge`/`DataModeBadge`, `Skeleton`/`SkeletonText`/`LoadingRegion`, `EmptyState`/`ErrorState`, `Card`, `Tabs` (WAI-ARIA roving-tabindex pattern), `SegmentedControl`, `Breadcrumbs`, `PercentileBar`, `Dialog` (native `<dialog>`-based), `DataTable` (`@tanstack/react-table`-based, keyboard-sortable), `Tooltip` (hover+focus, never hover-only). Consumed via `transpilePackages` (DEC-039).
- **App shell/navigation** (`app-shell.tsx`, `nav-items.ts`): persistent desktop sidebar + mobile off-canvas drawer, exactly 9 nav items per DEC-036 (Overview, Explore, Prioritize, Access Lab, Utilization, Validate, Advocate, Copilot, Data); only Overview/Explore/Data are functionally complete, the other 6 are truthful "coming in a later phase" shells (DEC-037), never broken links.
- **Overview page** (`app/page.tsx`, `overview-snapshot.tsx`): full replacement of the Phase 1-2 developer scaffold — hero, 3 real task-entry cards, countywide snapshot (live scenario-score counts), priority snapshot (live top-3 recommendations), data-freshness summary (live source status), trust section, footer.
- **Explore page** (`app/explore/*`): full replacement of the Phase 2 scaffold. `explore-client.tsx` orchestrates URL state (`geography`, `id`, `scenario`, `tab`, `compare`); `explore-map.tsx` (MapLibre, keyless, own-tract-choropleth-only per DEC-040, dynamically imported client-only); `explore-table.tsx` (accessible sortable alternative to the map, same data source); `search-panel.tsx`; `geography-detail.tsx` (plain-language summary, scenario score with uncertainty/rank/stability, expandable domain/driver decomposition, evidence drawer); `comparison-panel.tsx` (tract-vs-tract comparison).
- **New backend endpoint**: `GET /api/v1/geographies/tracts/boundaries?scenario_id=` (DEC-038) — bulk tract geometry + scores for the map choropleth, joins `analytics.scenario_scores`/`stability_labels` only when present (demo-mode graceful degradation).
- **Frontend API client** extended with the full Phase 4 analytics type surface (scenarios, domains, scenario scores, score explanation, recommendations, optimization runs, correlation diagnostics) and the new boundaries endpoint.
- **Test infrastructure**: `vitest` reconfigured for `jsdom` + `@testing-library/react` (was `node`-only with one trivial test); 34 frontend tests across component tests (Badge/PercentileBar/SegmentedControl/Tabs), integration tests (CountywideSnapshot loading/error/null-score states), and selection-pipeline regression tests (added during the hotfix, see below).
- Made and recorded decisions DEC-036 through DEC-040 (nav IA, shell pages, boundaries endpoint, `packages/ui` build approach, keyless map).

**Phase 5 hotfix (after the user reported a release-blocking defect):**

- **Defect:** clicking a tract on the Explore map showed a correct hover popup but the detail panel failed with "Tract tract not found."
- **Root cause:** `ExploreMap`'s `onSelect` prop was typed as a two-argument callback; the function actually passed to it took only one argument. TypeScript's parameter-count bivariance allowed this to typecheck cleanly. At runtime, the map's two-argument call (`onSelect("tract", geoid)`) bound its callee's single parameter to the *first* argument — the literal string `"tract"` — silently discarding the real GEOID.
- **Fix:** introduced one canonical `SelectedGeography` model (`apps/web/app/explore/selection.ts`) used by the map, table, search, comparison, and URL state alike — every selection callback now takes exactly one argument, making this bug class structurally impossible. Added `isValidGeographyId`/`parseSelectedGeographyFromParams` as boundary guards (reject a malformed or missing identifier before it can reach an API call). Gave FastAPI's geography-lookup 404s a structured body (`error_code`/`geography_type`/`requested_id`/`message`) instead of an interpolated string. Gave the frontend detail panels a truthful primary error message with Retry and Clear-selection actions, technical detail behind a disclosure. Widened `packages/ui`'s `ErrorState`/`EmptyState` `secondaryAction` to support `onClick` (not just `href`).
- Full writeup: DEC-041. New risk entry: RISK-020 (the general TS-parameter-bivariance pattern, `monitoring` status).
- Regression tests added: `apps/web/test/selection.test.ts` (12 tests), `apps/web/test/explore-table.test.tsx` (2 tests), `apps/api/tests/test_geography_routes.py` (+4 tests: structured 404, literal-type-as-id, short display label, leading-zero preservation).
- `docs/design/usability-testing.md` created (new file), documenting the Task 2 (map-click → tract explanation) walkthrough, the defect, the fix, and verification performed; explicitly notes Tasks 1/3-8 are still outstanding.

## Gate 5 evidence (partial — not yet a PASS)

Done: Overview and Explore both work end-to-end against live data; real analytics (scenarios, domains, scores, explainability, recommendations, uncertainty, stability) are integrated with no scoring logic duplicated client-side; loading/error/empty/no-score states exist and never display a missing value as zero; the map-selection hotfix is fully verified (`make lint`/`typecheck`/`test` — 199 backend + 34 frontend — /`audit`/`build` all pass; live low/mid/high-scoring-tract verification through the exact map-selection request path; the original-bug request now returns a clean structured error).

Not yet done: true in-browser visual/keyboard/screen-reader walkthrough (RISK-012 still blocking — see below); responsive-viewport verification at the required breakpoints; usability Tasks 1, 3-8; `docs/design/design-system.md`, `component-inventory.md`, `content-style-guide.md`; `UX_REVIEW.md`.

## Blockers

**RISK-012 (`monitoring`), now with a more precise diagnosis this session:** the Preview tool (`mcp__Claude_Preview__*`) appeared in this environment for the first time this session but fails with `shell-init: error retrieving current directory: getcwd: cannot access parent directories: Operation not permitted` when launching the dev server — consistent with a macOS TCC (Files and Folders) permission gap for the project's `~/Desktop` location, specific to whatever process hosts the Preview tool (the Bash tool's own shell has no such restriction on the same path). This is a one-time OS-level permission grant the assistant cannot make itself. Escalated to the user this session; user chose to proceed with HTTP-level/component-test verification rather than pause to adjust macOS Privacy & Security settings. Retry at the start of the next session, or sooner if the user grants the permission mid-project.

No other release-blocking issues. The map-selection defect that prompted this session's hotfix is resolved and verified (see above).

## Last commands run

`make lint && make typecheck && make test && make audit && make build` — all green (199 backend tests, 34 frontend tests, all 4 audit suites, production build). Manually started API + web dev servers, verified via curl: search-by-GEOID, tract profile + explain-score for 3 real tracts spanning low/mid/high scores, the exact original-bug request now returning a structured 404, and page-shell loads (including with an invalid URL identifier, which now safely renders "no place selected" rather than crashing). Servers stopped cleanly. Commit not yet made as of this `STATE.md` write — see "next actions."

## Next three actions (exact resume point)

1. Commit this session's work as a single coherent commit (Phase 5 build: design system, Overview, Explore, new boundaries endpoint, test infrastructure, DEC-036 through DEC-040; plus the Phase 5 hotfix: canonical selection model, structured errors, regression tests, DEC-041/RISK-020), following the same commit pattern as Phases 0-4.
2. Report the hotfix completion to the user with the requested 10-item summary (root cause, files changed, canonical selected-geography structure, before/after API examples, tests added, commands/outcomes, manual verification results, commit hash, confirmation the map now loads correctly, whether Phase 5 passes its gate) — **the answer to "does Phase 5 pass its gate" is not yet fully yes**: the hotfix itself is verified, but Phase 5's own remaining gate items (browser/visual review, responsive verification, remaining usability tasks, design-system docs) were not in scope for this hotfix and are still outstanding.
3. When the user is ready to resume full Phase 5 completion (or a fresh session picks this up): re-attempt `mcp__Claude_Preview__preview_start` first (the permission gap may be resolved by then); if still blocked, proceed with the same HTTP-level/component-test substitution pattern to close out responsive verification, the remaining usability tasks (1, 3-8), and the three missing design-system docs, then do the final Phase 5 verification + single clean commit per the original Phase 5 instruction's 17-item completion report format.

## Current running processes

None. All dev servers started during this session (API on 8000, web on 3000) were stopped cleanly (confirmed via `lsof -ti:3000,8000` returning nothing).

## Notes for continuation

- Toolchain unchanged from Phases 1-4 (node@22.23.1, pnpm 11.12.0, uv 0.11.28, Python 3.12.13).
- New frontend devDependencies this session: `jsdom`/`@testing-library/react`/`@testing-library/jest-dom` were already present but unwired (vitest was `environment: "node"` with no React rendering support) — now wired via `apps/web/vitest.config.ts` (jsdom + `@vitejs/plugin-react` + a `@` path alias, since Vite does not read `tsconfig.json` path mappings automatically) and `apps/web/vitest.setup.ts` (jest-dom matchers + explicit `afterEach(cleanup)`, since RTL's auto-cleanup needs `test.globals: true`, which this project does not set). `vitest-axe`/`axe-core` were also added but not yet wired into a real accessibility test suite — that's part of the still-outstanding accessibility pass.
- `maplibre-gl` was already a pinned dependency (added in an earlier phase) but unused until this session's `explore-map.tsx`.
- The Explore page's URL param names (`geography`, `id`, `scenario`, `tab`, `compare`) are a public contract now — the Overview page's task cards and priority-snapshot links depend on them (`/explore?tab=table`, `/explore?compare=1`, `/explore?geography=tract&id=...&scenario=...`). Any future param rename must update both places together.
- `SelectedGeography` (`apps/web/app/explore/selection.ts`) is now the canonical selection model for Explore — any new selection entry point (e.g. a future Prioritize-page "jump to this tract" link) should construct one of these and validate it with `isValidGeographyId`, not invent a new ad hoc shape.
