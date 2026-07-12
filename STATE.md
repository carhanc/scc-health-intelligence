# STATE.md — Session Continuity Resume Point

**Last updated:** 2026-07-12 (Phase 5 build + hotfix + closeout, spanning three sessions)

## Current phase and gate

**Phase 5 (design system + first complete vertical slice: Overview + Explore) — CLOSED. Gate 5: PASS.** Overview and Explore are both functionally complete against real live data. The map-selection hotfix is fixed and verified. The full closeout pass (content audit, accessibility, responsive, usability tasks, documentation, final verification) is complete. See `TASKS.md`'s Phase 5 section for the full checklist (all items checked) and `DECISIONS.md` DEC-041/DEC-042 for the hotfix and closeout writeups.

## Completed across the three Phase 5 sessions

**Session 1 — Phase 5 build:** design tokens, `packages/ui` component library (Button, Badge family, Skeleton family, EmptyState/ErrorState, Card, Tabs, SegmentedControl, Breadcrumbs, PercentileBar, Dialog, DataTable, Tooltip), app shell/navigation (9 nav items per DEC-036, 6 truthful "coming soon" shells per DEC-037), Overview page (task cards, countywide/priority snapshots, freshness summary, trust section), Explore page (MapLibre map, accessible table, search, scenario selector, tract detail with domain decomposition and evidence drawer, comparison), new `GET /api/v1/geographies/tracts/boundaries` endpoint (DEC-038), vitest reconfigured for jsdom + React Testing Library (34 tests). Committed as `c3e5eda`.

**Session 2 — Phase 5 hotfix:** fixed a release-blocking defect where clicking a tract on the map produced "Tract tract not found" due to a parameter-count mismatch silently substituting the literal string `"tract"` for the real GEOID. Introduced the canonical `SelectedGeography` model (`apps/web/app/explore/selection.ts`) used by every selection entry point, plus structured API error bodies. DEC-041, RISK-020.

**Session 3 — Phase 5 closeout (this session):**
- **Content/plain-language audit:** removed internal build-phase numbers and file/schema references from all user-facing text; `domainLabel()` (`apps/web/lib/labels.ts`) converts raw domain keys to plain language; fixed a scenario description that had leaked an implementation instruction ("the UI must still show these weights"); relabeled `default_integrated_screen_v1` to "Balanced overview"; stripped `DATA_MANIFEST.json source_id=...` and internal `schema.table` references from all 25 metrics' citations/limitations in `config/metrics.yml` (required re-running the analytics pipeline, since citations are precomputed into the warehouse, not read live — all audits re-verified green afterward).
- **Playwright adopted** as the primary automated browser-verification path (`apps/web/playwright.config.ts`, `apps/web/e2e/*.spec.ts`, `make test-e2e`) — independent of the still-blocked Claude Preview MCP tool, since Playwright drives its own Chromium via the unrestricted Bash tool. 63 test cases × 2 projects (desktop + touch-emulated mobile) = 126 runs, 124 passing, 2 honest skips, 0 failures.
- **Nine real defects found and fixed** via this real-browser testing (full detail in DEC-042): CORS origin mismatch blocking every API call in tests; selecting a place did nothing to the map (would have failed usability Task 1 outright) — fixed by fetching the place's real boundary and panning/outlining it; `--color-text-tertiary` failed WCAG AA contrast (4.29:1, needed 4.5:1) — darkened to ≥4.88:1 everywhere; evidence drawer's scrollable region wasn't keyboard-focusable; duplicate `id="geo-search"` broke the second `SearchPanel` instance's label association — fixed with `useId()`; a `<details>` nested inside a `<p>` caused a real hydration error (jsdom didn't catch this); `SegmentedControl` violated its own `role="radiogroup"` contract (no roving tabindex, no arrow keys) — rebuilt correctly; Explore's 3-column grid genuinely overflowed at exactly 1024px (a required breakpoint) — moved the 3-column threshold from `lg` to `xl`.
- **All 8 usability tasks** verified live with real browser interaction, documented in `docs/design/usability-testing.md` with starting route/steps/expected/friction/fix/status for each.
- **Full design-system documentation written**, describing the actual implementation: `docs/design/design-system.md`, `component-inventory.md`, `content-style-guide.md`, `manual-visual-review-checklist.md`; user guides `docs/user-guide/overview.md`, `explore.md`.
- **Final verification:** `make lint`/`typecheck`/`test` (199 backend + 39 frontend)/`audit`/`build` all pass; `make test-e2e` 124/126 (2 honest skips, 0 failures); no console errors, hydration warnings, or broken routes.

## Gate 5 evidence

All automated gates pass (see above). The one item genuinely outside automated-tool reach — final visual/aesthetic polish judgment — is documented honestly as not yet human-confirmed, with a concise checklist (`docs/design/manual-visual-review-checklist.md`) handed to the user rather than claimed as passed.

## Blockers

**RISK-012, status downgraded to `accepted`:** the Claude Preview MCP tool remains blocked by a macOS TCC (Files and Folders) permission gap under `~/Desktop` that the assistant cannot grant itself. This is no longer a practical blocker to verification quality — Playwright substitutes for everything a manual click-through would confirm except final aesthetic judgment. If the user wants live-screenshot capabilities restored, they would need to grant the relevant permission in System Settings > Privacy & Security > Files and Folders (or Full Disk Access) to whatever process hosts the Preview tool.

No other release-blocking issues. Two previously-open analytical gaps remain open by design, unchanged this session: no tract-level ED-utilization domain (RISK-015, deferred to Phase 7) and no offline demo snapshot for `analytics.*` tables (RISK-019, deferred).

## Last commands run

`make lint && make typecheck && make test && make audit && make build && make test-e2e` — all green (199 backend tests, 39 frontend unit tests, all 4 audit suites including clean-room check, production build, 124/126 e2e runs with 2 honest skips). `git status` confirmed the working tree contains only intended Phase 5 closeout changes. Commit not yet made as of this `STATE.md` write — see "next actions."

## Next three actions (exact Phase 6 resume point)

1. Commit this session's closeout work as a single coherent commit (content audit, Playwright adoption + 9 defect fixes, all usability tasks verified, full design-system/user-guide documentation, governance updates), following the same commit pattern as prior phases.
2. Report Phase 5 closeout completion to the user with the requested 13-item summary (commit hash, files changed, Overview/Explore capabilities, e2e/accessibility/responsive test counts, usability-task results, content fixes, remaining manual-checklist items, remaining risks, whether Phase 5 is fully closed, exact Phase 6 resume point) — **do not proceed to Phase 6 without the user's go-ahead**, per this session's explicit "stop after Phase 5 closeout" instruction.
3. When authorized to continue: start Phase 6 (Access Lab — routing, catchments, OR-Tools mobile-clinic/site-placement optimizer) per `docs/07_BUILD_PHASES.md` and `TASKS.md`'s Phase 6 section. The Playwright e2e harness (`apps/web/playwright.config.ts`) and the `SelectedGeography` canonical-selection pattern (`apps/web/app/explore/selection.ts`) are directly reusable for Access Lab's own map/selection UI — extend rather than reinvent. Re-attempt `mcp__Claude_Preview__preview_start` at the very start of that session in case the user has granted the macOS permission in the meantime; if still blocked, continue with the now-proven Playwright-based verification pattern rather than re-diagnosing the same root cause a third time.

## Current running processes

None. All dev/API servers started during this session were stopped cleanly (confirmed via `lsof -ti:3000,8000` returning nothing before the final verification run, which used Playwright's own managed `webServer` lifecycle).

## Notes for continuation

- Toolchain unchanged (node@22.23.1, pnpm 11.12.0, uv 0.11.28, Python 3.12.13). New: Playwright's Chromium binary is cached at `~/Library/Caches/ms-playwright/` (downloaded once this session, ~265MB; not part of the repo, will need re-downloading on a fresh clone via `npx playwright install chromium`).
- `make test-e2e` requires the live warehouse (`warehouse/scc_health.duckdb`) with `analytics.*` tables populated (`make data`) — it exercises real scores, not the offline demo snapshot (RISK-019, `analytics.*` has no demo-mode equivalent yet).
- The analytics pipeline was re-run once this session (to bake in the metric-citation content fix) — this is a normal, expected operation (`run_analytics_pipeline` is idempotent and deterministic under its fixed seed), not a sign of a data problem; scores are unchanged, only the `citation`/`limitations` text differs.
- `SelectedGeography` (`apps/web/app/explore/selection.ts`) and `domainLabel()` (`apps/web/lib/labels.ts`) are now established shared patterns — any future page that selects a geography or displays a domain name should reuse these, not reinvent them.
- The Explore 3-column grid's breakpoint is deliberately `xl` (1280px), not the more common `lg` (1024px) — see `docs/design/design-system.md` §2 before "fixing" this back to `lg`, which would reintroduce the exact overflow bug found and fixed this session.
