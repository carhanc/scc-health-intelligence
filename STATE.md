# STATE.md — Session Continuity Resume Point

**Last updated:** 2026-07-14 (Phase 8 — Advocate, Document Intelligence, optional Copilot — complete)

## Current phase and gate

**Phase 5 — CLOSED. Gate 5: PASS.** (Unchanged; see git history for detail.)

**Phase 6 (Access Lab, real-world accessibility modeling, resource intelligence, mobile-service optimization) — CLOSED. Gate 6: PASS.** Full detail in `TASKS.md`'s Phase 6 section and commit `4c782bc`.

**Phase 6.5 (geography search UX: city/ZIP/district-first search, city drill-down) — CLOSED. Gate 6.5: PASS.** Full detail in `TASKS.md`'s Phase 6.5 section, `DECISIONS.md` DEC-052 through DEC-054, `RISK_REGISTER.md` RISK-026. Commit `e92cb75`.

**Phase 7 (Prioritize, Utilization, Validate) — CLOSED. Gate 7: PASS.** Expanded scope from the original spec pack's narrower "Utilization Lab" per an explicit kickoff instruction. Full detail in `TASKS.md`'s Phase 7 section, `DECISIONS.md` DEC-055 through DEC-060, `RISK_REGISTER.md` RISK-027 through RISK-029 (and RISK-015 closed). Commit `dc81dfa`.

**Phase 8 (Advocate workspace, Document Intelligence, optional Copilot) — CLOSED. Gate 8: PASS.** Expanded scope from the original spec pack's narrower "Advocate workspace" per an explicit kickoff instruction into a complete advocacy/meeting-preparation workspace. Full detail in `TASKS.md`'s Phase 8 section, `DECISIONS.md` DEC-061 through DEC-065, `RISK_REGISTER.md` RISK-030 through RISK-032.

## What Phase 8 built

1. **Advocacy evidence assembly** (`apps/api/src/scc_health_api/services/advocacy_evidence.py`): a read-only presentation layer over already-computed `analytics.*`/`resources.*` tables (DEC-030 boundary preserved, no new score/percentile/access figure computed). City/ZIP/supervisor-district geography evidence is a disclosed unweighted average across member tracts, never presented as a single tract's real figure (DEC-061). A geography that resolves to zero member tracts returns no evidence at all — a real bug (an unknown geography silently falling through to a county-wide resource-count fallback) was found and fixed during development, caught by a new regression test (DEC-062).
2. **`config/topic_ontology.yml`**: a versioned, inspectable mapping of 12 real advocacy topics to real metric/scenario/resource-category IDs already scored by this platform. "Language access" is deliberately left with an explicit `unavailable_reason`, consistent with DEC-027/DEC-057's precedent of disclosing unavailability rather than fabricating a mapping.
3. **Document Intelligence** (`document_intelligence.py`): validated (extension allowlist, 15 MB size cap, magic-byte check), in-memory-only (never persisted to disk) extraction (PDF/DOCX/TXT/Markdown) and rule-based structure/geography/topic detection. Uploaded content is always treated as untrusted data, never instructions — enforced structurally (delimited context blocks, post-generation citation validation), not just by pattern-matching (`docs/methods/document-intelligence.md` §5).
4. **Deterministic advocacy generation** (`advocacy_generation.py`): rules/templates over already-cited evidence producing 10 evidence-grounded sections, meeting questions, and a limitations note — zero AI calls, always available, reproducible via a SHA-256 configuration hash.
5. **Six advocacy output types** sharing one backend generation call, frontend-filtered by output type (one-page brief, detailed memo, staff questions, public comment, geography profile, source/limitation appendix) — verified live to render genuinely different content per type.
6. **Copilot, two modes behind one interface** (DEC-063): `DeterministicProvider` reuses the exact same generation functions as Advocate's brief builder; `AnthropicProvider` is server-side-only (`ANTHROPIC_API_KEY`), and every response is validated post-generation so a claimed citation to evidence it was never given is silently discarded, never surfaced (DEC-064).
7. **Advocate page** (`/advocate`): three entry paths (place/issue search, document upload, cross-page prefilled workspace), evidence review with select/reorder, six output types, print-to-PDF and CSV export (reusing DEC-060's decision-memo pattern rather than a new export architecture, DEC-065 — DOCX evaluated and deferred, documented honestly).
8. **Copilot page** (`/copilot`): plain-language action picker, evidence-grounded answers, explicit deterministic-vs-AI-generated labeling, evidence-used citations.
9. **Browser-local workspace persistence** (`apps/web/lib/workspace/`): a versioned `AdvocacyWorkspace` schema (IndexedDB via a hand-written Promise wrapper, no `idb` dependency), New/Save/Rename/Duplicate/Delete/Export-JSON/Import-JSON, a `migrateWorkspace()` recovery function that never throws on malformed input.
10. **Cross-page "Use in Advocate" integration**: a shared `createWorkspaceFromGeography()` helper carries structured state (geography type/id/display name, scenario where relevant) directly into a new workspace from Explore, Prioritize, Access Lab, and Utilization — never scraped display text.
11. **6 new governance/methods/security docs**: `docs/user-guide/advocate.md`, `docs/user-guide/copilot.md`, `docs/methods/document-intelligence.md`, `docs/methods/advocacy-evidence.md`, `docs/security/document-handling.md`, `docs/architecture/phase9-production-requirements.md`.

## Final verification (all live-run this session, all green)

- `make lint` / `make typecheck` / `make audit` / `make build` — all clean.
- `make test` (`test-unit`): 437 backend pytest (up from 368) + 66 frontend vitest (up from 50), 0 failures.
- `make audit`: 258 checks across 8 suites, all passing (unchanged from Phase 7 — Phase 8 added no new warehouse tables to audit).
- Full e2e suite (`npx playwright test`, both desktop and mobile projects): **316 passed, 2 honest pre-existing skips, 0 failures** (up from 240) — 4 new spec files (`advocate-core`, `advocate-cross-page`, `advocate-document`, `copilot-core`, 33 new tests total) plus extended `accessibility.spec.ts`/`responsive.spec.ts`/`nav-coming-soon.spec.ts` coverage for the two newly-real pages.
- Accessibility: zero serious/critical violations across Advocate (initial, evidence-selected + brief-generated, document-upload tab) and Copilot (initial and after an ask), both viewports.
- **Two real bugs found live during this session's verification and fixed, not just test-fudged:**
  1. A horizontal-overflow bug at 390px on Copilot — a long explanatory sentence was rendered inside a pill-shaped `Badge` component (`whitespace-nowrap` by design, correctly, for its many other short-label uses across the app). Fixed by moving the sentence outside the badge as plain text, keeping the badge itself short ("Deterministic mode" / "AI drafting enabled").
  2. A cross-page "Use in Advocate" test (Utilization) that never navigated: `getByRole('button', {name: 'Use'})` substring-matched a `"High modeled use"` column-sort header button (which sits earlier in DOM order, in the table's header row, than any row's real `"Use"` action button) — the click was silently re-sorting the table instead of navigating. This was a genuine ambiguity in the test's own locator, not a product bug; fixed with `exact: true`. Two other test assertions were also fixed for asserting on a raw tract GEOID that the UI correctly never displays (it shows a human-readable label like "Census Tract 5001" instead, per this platform's "no internal IDs in primary views" rule) — again a test-correctness fix, not a product defect.
  3. A pre-existing vitest test (`geography-detail.test.tsx`) started failing once `UseInAdvocateButton` (which calls `useRouter()`) was added to `geography-detail.tsx` — the test's render tree had no Next.js App Router context mounted. Fixed by adding a local `vi.mock("next/navigation", ...)` to that test file, matching its existing local-mock pattern for `@/lib/api`.
- Live browser verification covered: the full Sunnyvale/Gilroy advocacy workflow end to end (search → evidence selection/reorder → all 6 output types → print/CSV export → save/export-JSON/import-JSON/reload-persistence), document upload (valid agenda detecting real topics/geographies/agenda items; a prompt-injection-styled document correctly flagged and never followed; an unsupported-extension file correctly rejected), all 4 cross-page "Use in Advocate" entry points, Copilot in deterministic mode across multiple actions, keyboard-only completion of the full Advocate workflow, and mobile-viewport completion of the same workflow with no horizontal overflow.
- Clean-room audit (`scripts/check_clean_room.py`) — passing, unchanged.

## Blockers

**RISK-012, status `accepted`** (unchanged): Claude Preview MCP tool remains blocked by a macOS TCC permission gap. Playwright (driven directly via Bash) remains the primary automated browser-verification path and was used for all Phase 8 UI verification, including live debugging of the two real bugs found above.

No other release-blocking issues. RISK-021 through RISK-032 are open-by-design scope/limitation disclosures, not defects — see `RISK_REGISTER.md`. RISK-032 in particular (no golden-evaluation set or adversarial red-team pass against a live-configured AI model) is the most relevant open item for a deployment that intends to actually enable AI-assisted Copilot mode — see `docs/architecture/phase9-production-requirements.md` §4.

## Last commands run

Full sequence: `uv run pytest apps/api/tests pipelines/tests`, `pnpm -r test`, a full `npx playwright test` run (both projects, run twice — once to find real bugs, once clean after fixing them), `make lint && make typecheck && make audit && make build`, and `uv run python scripts/check_clean_room.py` — all green on the final pass. `git status --short` reviewed; no `.next`, `node_modules`, `.env.local`, secrets, or oversized artifacts staged; `apps/web/e2e/fixtures/` (three small text fixtures for document-upload tests) is the only new binary-adjacent content and is intentionally committed test data.

## Next action (exact Phase 9 resume point)

**Do not begin Phase 9 without confirming with the user first** — this Phase 8 kickoff instruction explicitly said "Stop after Phase 8. Do not begin production deployment work in the same pass."

Per `docs/architecture/phase9-production-requirements.md` (written this session specifically as the Phase 9 handoff) and `docs/07_BUILD_PHASES.md`, when authorized, Phase 9 covers:

1. **Server-side workspace persistence and authentication** — the `AdvocacyWorkspace` schema is already shaped for this (stable IDs, a `schemaVersion` field, an existing `migrateWorkspace()` function, and export/import JSON as the exact transfer format for migrating a user's existing browser-local workspaces into an account). No auth provider decision has been made yet — confirm with stakeholders before building.
2. **A real decision on document retention** if "reopen a workspace and still see the original uploaded document" becomes a requirement — Phase 8 is deliberately stateless/in-memory-only for uploads (`docs/security/document-handling.md`); persisting raw files would change this platform's "no PHI storage" posture and needs its own privacy/security review, not a quiet addition.
3. **AI-assisted Copilot production readiness**, if that mode is to be enabled for real users: rate limiting on `/api/v1/copilot/ask` (not implemented), the golden-evaluation set and adversarial red-team pass recorded as open in RISK-032, and cost monitoring for the configured provider.
4. **Scheduled data refresh, observability, and release engineering** — unchanged, still entirely unbuilt (`make data` remains manual; no CI/CD deploy pipeline, error tracking, or uptime monitoring exists).
5. **DOCX advocacy export**, if user demand justifies it (RISK-031) — `python-docx` write support could reuse the dependency already present read-only for document intelligence.
6. Two Phase 7-era product gaps remain open and low-priority: RISK-028 (`mobile_transit_care_v1`/`older_adult_support_v1` share an identical weight vector) and RISK-029 (Phase 7 `analytics.utilization_*` tables have no offline demo snapshot).

## Current running processes

None. All dev/API servers started during this session were stopped cleanly (`pkill -f "uvicorn scc_health_api"`, `pkill -f "next dev"`).

## Notes for continuation

- Toolchain: node@22 is installed via Homebrew (`/usr/local/opt/node@22`) but not on the default PATH -- `export PATH="/usr/local/opt/node@22/bin:$PATH"` before any pnpm/node command.
- `uv sync --package X` vs `uv sync --all-packages`: syncing a single package's deps in this uv workspace can strip other workspace packages' dependencies (pipeline-only packages like polars/scikit-learn/ortools got removed once this session) — always use `--all-packages` to restore/maintain the full shared venv.
- **Playwright locator gotcha (found live this session):** `getByRole('button', {name: 'X'})` is a *substring* match by default, not exact. A short label like `"Use"` can accidentally match an unrelated, earlier-in-DOM-order element whose accessible name merely *contains* "Use" (e.g. a `"High modeled use"` column-sort header). Pass `exact: true` whenever a button/link label is short enough to plausibly be a substring of something else on the same page.
- **Badge component gotcha (found live this session):** `packages/ui/src/Badge.tsx`'s `whitespace-nowrap` is correct and load-bearing for its many short-pill-label uses across the app (e.g. "Suppressed (small count)", "Top 10% modeled use") — do not remove it. Never put a full explanatory sentence inside a `<Badge>`; put the short label in the badge and the explanation in adjacent plain text instead.
- `ESLint` config in this project does NOT register the `react-hooks` plugin -- `// eslint-disable-next-line react-hooks/exhaustive-deps` comments cause a hard lint error and must never be added.
- `EvidenceItem` (backend, `schemas/advocacy.py`) and `AdvocacyEvidenceItem` (frontend, `apps/web/lib/api.ts`) are the same shape under intentionally different names (the frontend name was changed from `EvidenceItem` specifically to avoid a TS2717 collision with an unrelated existing type) — keep both in sync if the shape changes.
- `apps/web/e2e/fixtures/` now exists as an established location for small, intentionally-committed test-document fixtures (agenda/prompt-injection/malicious-extension samples) — reuse it for any future document-upload test rather than creating fixtures inline or in a new location.
- Clean-room boundary reminder (unchanged all sessions, DEC-001): never inspect/reference the sibling project directory this repository's spec calls out, or any other sibling repository outside this project root.
