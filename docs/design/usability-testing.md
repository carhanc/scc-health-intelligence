# Usability testing — Explore and Overview

Tracks the eight usability-task walkthroughs required by Phase 5 (`docs/07_BUILD_PHASES.md`, `docs/06_ACCEPTANCE_TESTS.md`). Each task must be completable by a first-time, non-technical user without instructions.

**Verification method for this closeout pass:** Playwright now launches a real Chromium browser (independent of the Preview MCP tool, which remains blocked by a macOS TCC permission gap this session -- see `RISK_REGISTER.md` RISK-012). Every task below was verified with a genuine browser click/keystroke against the real API and the live warehouse, not a mock. Test files live in `apps/web/e2e/`; run with `pnpm --filter @scc-health/web e2e`. Two items still call for direct human judgment (documented in the manual checklist handed to the user) since no automated tool can confirm visual quality.

For each task: starting route, exact steps, expected result, friction found, fix made, final pass/fail.

---

## Task 1 — Find Sunnyvale and identify its two leading concerns

**Starting route:** `/explore`

**Steps:** Type "Sunnyvale" into Find a place → Search → click the "City / place" result → click any tract shown inside the outlined city on the map → read the domain breakdown and take the two highest-scoring domains as the leading concerns.

**Expected result:** The user reaches a specific tract's score and domain breakdown without ever needing to know a census tract number.

**Friction found:** Selecting a place did nothing to the map -- no pan, no zoom, no visual indication of where Sunnyvale was. A first-time user had no way to get from "found the city" to "found a tract inside it." This would have failed the task outright.

**Fix made:** The map now fetches the selected place's real boundary (`GET /api/v1/geographies/{type}/{id}/boundary`, an endpoint that already existed) and pans/zooms to it with a dashed outline, plus a caption ("The dashed outline shows Sunnyvale city. Click any tract inside it to see that tract's score."). Applies to place, supervisor-district, ZCTA, and county selections alike. `apps/web/app/explore/explore-map.tsx`.

**Verified:** `apps/web/e2e/explore-place-selection.spec.ts` -- real click on the map after a place search resolves to a real 11-digit Santa Clara tract GEOID, and that tract's score/domain breakdown loads. **PASS.**

---

## Task 2 — Find a census tract by clicking it on the map, and understand why it ranks highly

**Starting route:** `/explore`

**Steps:** Click any shaded tract on the map → read the plain-language summary, score, and domain breakdown in the detail panel.

**Expected result:** The detail panel loads that exact tract's real profile, matching the tract clicked.

**Friction found (Phase 5 hotfix, reported directly by the user in a prior session):** Clicking a tract showed a correct hover popup but the detail panel failed with "Tract tract not found." Root cause: a parameter-count mismatch let the map's click handler silently substitute the literal string `"tract"` for the real GEOID. Full writeup: `DECISIONS.md` DEC-041.

**Fix made:** One canonical `SelectedGeography` object used by every selection entry point (`apps/web/app/explore/selection.ts`), with boundary-level GEOID validation before any API call.

**Verified (upgraded this closeout pass):** A real mouse click on the rendered map canvas (not a substitute) -- `apps/web/e2e/explore-core.spec.ts` "clicking a tract on the map loads that exact tract's profile": clicks the map, reads the resulting URL's tract id, and asserts the detail panel heading matches that exact id with no error text. **PASS**, on both desktop and touch-emulated mobile Chromium.

---

## Task 3 — Compare San Jose with Sunnyvale

**Starting route:** `/explore`

**Steps:** Find San Jose, click a tract inside it → click Compare → find and select a tract inside Sunnyvale → read the comparison result.

**Expected result:** A side-by-side, plain-language comparison of the two selected tracts' scores and domains.

**Friction found:** None new. The comparison panel already states plainly, before the user tries anything, that "comparisons work between two census tracts, since scores are calculated at the tract level" -- an honest disclosure rather than a silent limitation, consistent with the platform's rule against aggregating tract-level scores into an unvalidated city-level number.

**Verified:** `apps/web/e2e/usability-tasks.spec.ts` "Usability Task 3": selects a San Jose tract via the map (using the Task 1 fix), opens Compare, selects a Sunnyvale-area tract, and confirms the resulting comparison sentence and domain-by-domain breakdown render. **PASS.**

---

## Task 4 — Switch scenarios (priorities) and understand what changed

**Starting route:** `/explore?geography=tract&id=06085500100`

**Steps:** Open the Priorities dropdown → choose a different option (e.g. "Food access") → observe the description text and score change.

**Expected result:** The description paragraph updates to the new scenario's own plain-language description, the URL reflects the new scenario, and the score re-computes.

**Friction found:** None. The description paragraph and score both update from a single dropdown change with no separate "apply" step.

**Verified:** `apps/web/e2e/explore-scenario-and-state.spec.ts` "switching priorities changes the displayed results": switches from the default scenario to Food access, confirms the description paragraph changes to food-insecurity language, confirms the URL updates, and confirms the score value changes. **PASS.**

---

## Task 5 — Determine whether a selected tract's ranking is robust or assumption-sensitive

**Starting route:** `/explore?geography=tract&id=06085500100`

**Steps:** Look at the badge next to the score.

**Expected result:** A visible, plain-language label (Robust / Moderately stable / Assumption-sensitive / Data-limited) sits immediately beside the score, with a hoverable/focusable explanation of what that label means -- not buried in a separate methods page.

**Friction found:** None. The badge is part of the same score card, not a secondary disclosure.

**Verified:** `apps/web/e2e/usability-tasks.spec.ts` "Usability Task 5": confirms the badge is visible next to the score text and that its `title` attribute contains a real plain-language explanation (e.g. "Whether this area ranks highly depends a lot on which priorities are weighted most"), not just the bare label. **PASS.**

---

## Task 6 — Find the publisher, vintage, and limitations behind one metric

**Starting route:** `/explore?geography=tract&id=06085500100`

**Steps:** Expand any domain disclosure to read one metric's limitation inline, or open "View sources & evidence" to see every metric's source in one place.

**Expected result:** Every metric shows a real source citation (publisher + vintage) and a plain-language limitation, with no internal filenames, config keys, or schema/table names leaking into the text.

**Friction found:** Every metric's citation string included a trailing internal reference -- e.g. `"CDC PLACES, 2025 release, tract-level. DATA_MANIFEST.json source_id=cdc_places_tract_2025."` -- and one metric's limitation text named an internal database table (`social.acs_observations`) and another named internal schema-qualified table references (`resources.hcai_facilities`, `geo.tracts`). None of this means anything to a non-technical reader.

**Fix made:** Stripped the `DATA_MANIFEST.json source_id=...` suffix from all 24 affected citations and rewrote the two limitations/citations that named internal tables in plain language (`config/metrics.yml`). Metric citations are precomputed into the warehouse at pipeline-run time (not read live), so the analytics pipeline was re-run (`run_analytics_pipeline`) to bake the corrected text into `analytics.metric_contributions`; all data-quality audits re-verified green afterward (68,000+ rows, including the contribution-sum identity check).

**Verified:** `apps/web/e2e/usability-tasks.spec.ts` "Usability Task 6": confirms a limitation is visible inline in an expanded domain, and confirms the evidence drawer's source column is non-empty and contains no `DATA_MANIFEST`, `source_id=`, or raw filename pattern. **PASS.**

---

## Task 7 — Understand what the platform explicitly cannot conclude

**Starting route:** `/` (also checked on `/explore` with a tract selected)

**Steps:** Read the Overview page's "How to read what this platform shows you" section, and/or the score panel's disclaimer on any tract.

**Expected result:** Plain-language statements that a score is a screening signal, not a causal claim or a guarantee any specific intervention will help.

**Friction found:** None. Both surfaces already carry this framing: Overview's "Screening, not causation" trust point ("it is not a claim that any specific program will fix it"), and the tract score panel's own note ("This is a county-relative screening score, not a prediction or a causal claim").

**Verified:** `apps/web/e2e/usability-tasks.spec.ts` "Usability Task 7": confirms both statements render on their respective pages. **PASS.**

---

## Task 8 — Complete the core Explore workflow using keyboard only

**Starting route:** `/explore`

**Steps:** Tab to the search field, type a tract number, submit with Enter, Tab/Enter to select the result, Tab to "View sources & evidence," open it with Enter, close it with Escape, and confirm focus returns to the trigger.

**Expected result:** Every step is reachable and operable without a mouse; focus never gets lost or trapped in the wrong place.

**Friction found (found while writing this task's own test, before it could fail silently in front of a real user):** The Map/Table view switcher used `role="radiogroup"`/`role="radio"` but every option was independently in the Tab order with no arrow-key support -- the opposite of what a `radiogroup` announcement leads a screen-reader or keyboard user to expect (exactly one Tab stop, Left/Right to move the selection).

**Fix made:** Rebuilt `SegmentedControl` with proper roving tabindex (`tabIndex={0}` only on the selected option, `-1` on the rest) and Arrow/Home/End key handling, matching the pattern already used correctly in the `Tabs` component. `packages/ui/src/SegmentedControl.tsx`.

**Verified:** `apps/web/e2e/accessibility.spec.ts` "the full Explore workflow... works with keyboard only" (search → select → open evidence drawer → close, all via keyboard, focus returns to the trigger button) and "...follows the WAI-ARIA radiogroup pattern" (one tab stop, ArrowRight moves selection and changes the view). **PASS**, both on desktop and touch-emulated mobile Chromium.

---

## Additional issues found and fixed during this pass (not tied to a single numbered task)

- **Color contrast:** `--color-text-tertiary` (#6b7885) measured 4.29:1 against the page background and 3.86:1 against the tinted "current page" nav background via automated axe-core scanning -- both fail WCAG AA's 4.5:1 minimum for normal text. Affected the Overview footer disclaimer and every "Soon" badge in navigation. Darkened to #5c6874 (4.88:1 minimum against any surface in the app). `apps/web/app/globals.css`, `packages/ui/src/tokens.ts`.
- **Scrollable region not keyboard-focusable:** the evidence drawer's scrollable content area had no way to be scrolled by keyboard alone if it had no focusable children past the visible area (axe-core `scrollable-region-focusable`). Added `tabIndex={0}` with a visible focus ring. `packages/ui/src/Dialog.tsx`.
- **Duplicate `id` attributes:** the search box's `id="geo-search"` was hardcoded, so when the comparison panel rendered a second `SearchPanel` on the same page, the second instance's `<label>` no longer associated with its `<input>` (the browser only honors the first element with a given id) -- its accessible name silently fell back to the placeholder text. Replaced with React's `useId()` in both `SearchPanel` and the shared `Dialog` component. `apps/web/app/explore/search-panel.tsx`, `packages/ui/src/Dialog.tsx`.
- **Invalid HTML nesting → hydration error:** the "couldn't load this place" error message nested a `<details>` disclosure inside the shared `StateMessageBase`'s `<p>` wrapper -- a real browser (unlike jsdom, which doesn't validate this) rejected the nesting and threw a hydration mismatch. Changed the wrapper to a `<div>`. `packages/ui/src/StateMessage.tsx`.
- **Responsive overflow at 1024px:** Explore's 3-column desktop grid (320px + 380px fixed columns + gaps) could not fit inside the content area once the 240px nav sidebar was subtracted from a 1024px viewport, causing real horizontal page overflow. The 3-column layout now activates at 1280px (`xl:`) instead of 1024px (`lg:`); 1024-1279px uses the same stacked single-column layout as tablet/mobile, verified fully usable at that width. `apps/web/app/explore/explore-client.tsx`.

---

## Status

All 8 tasks verified with a real browser via Playwright, with genuine friction found and fixed for Tasks 1, 6, and 8 (plus five additional issues found via automated accessibility/responsive scanning during this pass, listed above). Two items still require direct human visual judgment that no automated tool can substitute for -- layout polish and map rendering quality -- and are handed to the user as a short manual checklist rather than claimed as passed here.
