# STATE.md — Session Continuity Resume Point

**Last updated:** 2026-07-13 (Phase 7 — Prioritize, Utilization, Validate — complete)

## Current phase and gate

**Phase 5 — CLOSED. Gate 5: PASS.** (Unchanged; see git history for detail.)

**Phase 6 (Access Lab, real-world accessibility modeling, resource intelligence, mobile-service optimization) — CLOSED. Gate 6: PASS.** Full detail in `TASKS.md`'s Phase 6 section and commit `4c782bc`.

**Phase 6.5 (geography search UX: city/ZIP/district-first search, city drill-down) — CLOSED. Gate 6.5: PASS.** Full detail in `TASKS.md`'s Phase 6.5 section, `DECISIONS.md` DEC-052 through DEC-054, `RISK_REGISTER.md` RISK-026. Commit `e92cb75`.

**Phase 7 (Prioritize, Utilization, Validate) — CLOSED. Gate 7: PASS.** Expanded scope from the original spec pack's narrower "Utilization Lab" per an explicit kickoff instruction. Full detail in `TASKS.md`'s Phase 7 section, `DECISIONS.md` DEC-055 through DEC-060, `RISK_REGISTER.md` RISK-027 through RISK-029 (and RISK-015 closed).

## What Phase 7 built

1. **ZIP-to-tract ED-utilization allocation, closing RISK-015** (`pipelines/.../utilization/zip_to_tract_allocation.py`, `run_utilization_pipeline.py`): real observed ZIP-level HCAI ED encounters allocated to tracts via the existing audited `geo.crosswalk_zip_tract` (Phase 2) — never a new crosswalk. `analytics.utilization_criterion_validity` closes RISK-015 with a real, non-tautological, moderate positive correlation (Spearman r 0.27-0.37) between modeled tract ED rate and each of the 8 scenarios' own scores. DEC-055.
2. **A real methodological artifact found and disclosed**: area-weighted allocation is unreliable for a small number of large, sparsely-populated tracts (one measured at 37,378 modeled ED visits per 1,000 residents — ~100x the true countywide rate of ~320). Fixed with a disclosed `rate_reliability` plausibility-ceiling flag (16 of 408 tracts), never a silent correction or a hidden row. DEC-056/RISK-027.
3. **`environmental_burden_priority_v1` scenario added** (config/scenarios.yml) — a real product gap (no original scenario weighted environmental_burden above 0.20). **"Language access" deliberately left unavailable**, shown in the Prioritize UI as a genuine, explained "not available yet" option rather than faked with a relabeled generic weighting (no tract-level language-barrier metric exists to weight, DEC-027/DEC-057).
4. **Prioritize page** (`/prioritize`): 8 named scenarios + custom weighting with always-renormalized sliders, site/program constraints (reuses Access Lab's precomputed optimizer scenarios verbatim, DEC-060), ranked results with inline explainability + deep link to Explore's full evidence drawer, scenario comparison, CSV export, printable/downloadable decision memo.
5. **Utilization page** (`/utilization`): facility view (real 2024 payer/disposition/language breakdowns for all 9 Santa Clara facilities), geographic view (observed ZIP table + modeled tract table, kept visually and structurally distinct), trends over time (real 2008-2024 county series), capacity-vs-demand shown as a factual side-by-side comparison (never "occupancy").
6. **Validate page** (`/validate`): data coverage (links to the existing Data page rather than duplicating it), scoring methods, uncertainty & sensitivity, validation (convergent-vs-SVI and criterion-vs-ED-utilization, tautology guard status), known limitations, reproducibility (scenario weight hashes, seeds, real persisted audit status via new `meta.audit_runs` table, DEC-059).
7. **Custom-weighting aggregation** duplicated as a small, dependency-isolated, separately-tested module in the API (`services/custom_scenario_scoring.py`, DEC-058, extending the DEC-022/DEC-051 pattern) — live-verified to reproduce the "Balanced overview" named scenario's exact ranking when given identical weights.

## Final verification (all live-run this session, all green)

- `make lint` / `make typecheck` / `make audit` / `make build` — all clean.
- `make test` — 368 backend (pytest, up from 314) + 50 frontend (vitest) unit/integration tests, 0 failures.
- `make audit` — 258 checks across 8 suites (up from 7, new `utilization_audits.py` suite), all passing, including a new suite closing RISK-015.
- Full e2e suite (`npx playwright test`, both desktop and mobile projects): 240 passed, 2 honest pre-existing skips, 0 failures (up from 77 — 3 new spec files: `prioritize-core`, `utilization-core`, `validate-core`, plus extended `accessibility.spec.ts`/`responsive.spec.ts`/`nav-coming-soon.spec.ts` coverage).
- Accessibility: zero serious/critical violations across every tab of all three new pages, both viewports. Two real issues found live and fixed: a horizontally-scrollable table with no focusable content (missing `tabIndex`/`role="region"`), and a heading-order skip (h3 directly under h1, no h2) across every Validate panel.
- Live browser verification: every tab of Prioritize/Utilization/Validate, custom-weighting slider rebalancing (always sums to 100%), scenario comparison overlap, CSV/memo export rendering, the one live low-reliability tract flag rendering correctly, facility payer/disposition/language breakdown expansion.
- Clean-room audit (`scripts/check_clean_room.py`) — passing, unchanged.

## Blockers

**RISK-012, status `accepted`** (unchanged): Claude Preview MCP tool remains blocked by a macOS TCC permission gap. Playwright (driven directly via Bash) remains the primary automated browser-verification path and was used for all Phase 7 UI verification.

No other release-blocking issues. RISK-021 through RISK-029 are open-by-design scope/limitation disclosures, not defects — see `RISK_REGISTER.md`.

## Last commands run

Full sequence: `make lint && make typecheck && make test && make audit && make build`, a full `npx playwright test` run (both projects), and a standalone `pytest apps/api/tests pipelines/tests` pass — all green. `git status --short` reviewed; `cache/` confirmed still gitignored; disk space was critically low mid-session (Next.js dev-server `.next` cache had grown to 1.4GB over the long session) and was cleared — no stray scratch files or verification scripts left in the working tree.

## Next action (exact Phase 8 resume point)

**Do not begin Phase 8 without confirming with the user first** — the Phase 7 kickoff instruction explicitly said "Stop after Phase 7. Do not begin Phase 8."

Per `TASKS.md`'s Phase 8 section (`Advocate workspace, Document Intelligence, optional Copilot`) and `docs/07_BUILD_PHASES.md`, when authorized:

1. Advocate workspace: evidence-backed brief/talking-points generation, reusing Prioritize's decision-memo pattern (DEC-060's precedent — reuse, don't duplicate) as a starting point rather than building export logic a third time.
2. Document Intelligence: user-uploaded county meeting documents as untrusted data (never instructions, per CLAUDE.md), with citation-grounded extraction.
3. Optional Copilot: deterministic no-key mode always available; Anthropic-backed mode optional. Every numeric answer must come from tested analytics tools or read-only queries (CLAUDE.md), never freehand model arithmetic — the custom-weighting endpoint pattern (DEC-058) and every existing `/api/v1/*` route are the tools a Copilot mode should call, not reimplement.
4. Two real, minor product gaps surfaced during Phase 7 remain open and worth considering in scope: RISK-028 (`mobile_transit_care_v1`/`older_adult_support_v1` share an identical weight vector — would need a real transit-frequency or age-65+ metric to differentiate) and RISK-029 (Phase 7 `analytics.utilization_*` tables have no offline demo snapshot, matching RISK-019's existing Phase 4 gap).

## Current running processes

None. All dev/API servers started during this session were stopped cleanly.

## Notes for continuation

- Toolchain: node@22 is installed via Homebrew (`/usr/local/opt/node@22`) but not on the default PATH -- `export PATH="/usr/local/opt/node@22/bin:$PATH"` before any pnpm/node command.
- Disk space: this session's Next.js dev server accumulated a 1.4GB `.next` cache over many hours of live verification -- if disk space runs low again, `rm -rf apps/web/.next` is safe (fully regenerable) and was the fix used this session.
- `analytics.utilization_*` and `meta.audit_runs` exist only in the live warehouse (`make data`, specifically `run_utilization_pipeline` and `run_audits`) -- no offline demo snapshot yet, matching Phase 4's `analytics.*` precedent (RISK-019/RISK-029).
- `geo.crosswalk_zip_tract` (Phase 2) is now also the authoritative source for ZIP-to-tract ED-utilization allocation, not just the ZCTA-tract relationship it was originally built for -- any future feature needing a ZIP/ZCTA-to-tract estimate should reuse it, not build a second crosswalk.
- `config/scenarios.yml` now has 8 named scenarios (not 7) -- any code or test that hardcodes a scenario count needs updating (already done in `apps/api/tests/test_analytics_routes.py`/`test_utilization_routes.py`; check for others if scenarios.yml changes again).
- `useTractNames()` (`apps/web/lib/use-tract-names.ts`) is the established pattern for resolving many tract display names at once (reuses the existing `getAllTractBoundaries` endpoint, one request not 408) -- any future large tract-list UI should reuse this, not add per-row name-resolution calls.
- `SelectedGeography.displayName` is reliable only for the one render immediately following a fresh in-app selection -- unchanged from Phase 6.5's note; still the correct pattern to follow for any new component needing a durable display name.
- Clean-room boundary reminder (unchanged all sessions, DEC-001): never inspect/reference the sibling project directory this repository's spec calls out, or any other sibling repository outside this project root.
