# Product-Wide Flow Simplification — Visual & Usability Review

Companion to the product-wide pass on branch `ux/product-wide-flow-simplification` (created from
`ux/advocate-flow-simplification`). This document records what changed on every remaining route, what six
independent blind usability reviews found, what was fixed in response, and what remains disclosed as a
known limitation.

## 1. What this pass changed, in one paragraph

Copilot, Prioritize, Access Lab, Utilization, Validate, and Data were rebuilt around the same discipline
that made the Advocate redesign work — one question at a time, progressive disclosure, one dominant primary
action, plain language, calm spacing — without copying Advocate's specific layout, since each page has a
different job. Overview, Explore, and Advocate were reviewed for coherence only and were not rebuilt: their
already-tested map-first, score, and guided-flow systems are untouched except for small shared-vocabulary
and cross-page-handoff fixes. No scenario IDs, API contracts, scientific calculations, or source-data
pipelines were changed. A shared `FocusPicker` component (generalized from Advocate's own focus step) now
backs Advocate, Prioritize, and Copilot's priority/focus selection, replacing three separately-built full
scenario grids with one battle-tested component.

## 2. Before → after, page by page

### Copilot
| | Before | After |
|---|---|---|
| First screen | Provider-status banner, a permanent search field, a 9-card scenario grid, and a disabled answer form all visible before any input | One heading, one sentence, "Uses platform evidence only," and six task cards ("Explain a community," "Compare two places," etc.) |
| Place selection | Combined with everything else on one screen | A dedicated "Which community?" screen, skipped entirely when arriving from Explore with a place already chosen |
| Focus selection | The same 9-card grid used everywhere else in the product | The shared `FocusPicker`: one recommended card, a few common alternatives, "See more focus areas" |
| Answer | A bullet-dump of every fact matched to the query, doubled by an identical numbered source list right below it | The same real bullet-dump body, now collapsed to the first 8 lines with a "Show all N facts" disclosure, and a compact source list that doesn't repeat each fact's full value a second time |
| Provider status | A leading `[Deterministic mode -- guided template, not generative AI...]` line at the top of every answer | Moved entirely into a collapsed "About how answers are created" disclosure; never leads the answer |

### Prioritize
| | Before | After |
|---|---|---|
| First screen | A full scenario-selector grid before any result was visible | The ranked result is already showing; "Adjust priorities" is a link, not a precondition |
| Default result | A 408-row table | The top 10 areas as concise cards (rank, score, concern band, top two factors, stability, coverage caveat only when it matters) |
| Stability | A bare "Robust" badge | The same badge plus a plain-language sentence ("Ranks similarly under most alternate weightings") |
| Navigation | Six-plus tabs including a dedicated "Export" tab | "Ranked areas" / "Compare places," with "Add practical constraints" and "Download results" as secondary actions, not tabs |

### Access Lab
| | Before | After |
|---|---|---|
| First screen | Travel-mode toggle, tabs, resource browser, and a full methodology paragraph all visible with no place chosen | One question: "Which community would you like to explore?" |
| After selecting a place | Everything appeared at once | A compact context bar, then "How are people traveling?", then the access-summary result; Resource browser / Resource gaps / Mobile-service scenarios appear only as secondary tabs below it |
| Error state (access summary) | `"...Is the API running, and has \`run_access_metrics_pipeline\` been run?"` | `"Couldn't load this tract's access summary. Is the API running?"` — matches every sibling panel's plain wording |
| ZIP-code guidance | Named "Explore" as the way forward with no working link | The same guidance now links directly to `/explore` |
| Mobile-service scenario titles | `"...(health_burden-weighted, transit-hub candidates)"` — a leaked internal domain-key fragment | The same real title with that technical parenthetical suffix removed (the plain-language equivalent already appears once, above the list) |

### Utilization
| | Before | After |
|---|---|---|
| First screen | The full 9-facility table rendered immediately | "What would you like to understand?" — three task cards (Compare facilities / Explore where patients come from / See changes over time) |
| Facility comparison | A table with no lead sentence | A computed one-line takeaway ("1 of 9 facilities operate a comprehensive-level ED...") above the same table |
| Trends | A table only | A dependency-free SVG bar chart with a real computed takeaway sentence, the same table below as the accessible alternative |

### Validate
| | Before | After |
|---|---|---|
| Title | "Validate" | "Trust, methods, and data quality" |
| Top summary | Six equal-sized status cards, including zero-count categories | Three grouped cards (Available and current / Needs attention / Unavailable), each shown only when its count is greater than zero |
| Navigation | Six top-level tabs, including a forced Uncertainty/Validation split | Five: Overview, How scores are built, Checks and uncertainty (merged), Known limitations, Reproduce the analysis |
| Unavailable-source display | Raw internal key as the primary label | Publisher name primary, `source_id` secondary and de-emphasized |

### Data
| | Before | After |
|---|---|---|
| Heading | "Data" | "Explore data sources and coverage" |
| Source list | `source_id` as the link text | Publisher name as the link text, `source_id` shown secondary in a smaller `<code>` line |
| Filtering | None | Search box plus four status filters (All / Available and current / Needs attention / Unavailable), mirroring Validate's vocabulary |

### Overview, Explore, Advocate (coherence review only, not rebuilt)
Overview's single "Explore the map" primary action, Discover→Understand→Prioritize→Act framing, and absence
of unexplained numbers were confirmed already correct. Explore's map-first redesign was left entirely
intact; its "What would you like to do next?" section gained a third link ("See its access to care" →
Access Lab), carrying the selected tract's real GEOID and display name. Advocate was used only as the
interaction-quality baseline and was not rebuilt; its Focus step now imports the same shared `FocusPicker`
used by Prioritize and Copilot.

## 3. First action per page (five-second acceptance test)

| Page | First action a user sees | Acceptance test |
|---|---|---|
| Copilot | Pick one of six task cards | "I can choose what I need explained." |
| Prioritize | Already-ranked top-10 list; "Adjust priorities" if wanted | "I can see the highest-priority areas and adjust assumptions if needed." |
| Access Lab | One search field: "Which community would you like to explore?" | "I should choose a community to understand travel access." |
| Utilization | Pick one of three task cards | "I can choose whether to compare facilities, places, or trends." |
| Validate | Grouped trust summary, answering "can I trust this?" | "I can quickly see whether the data is current and what its limits are." |
| Data | Search box plus status filters over the source list | "I can find a source and understand where it is used." |

## 4. Six independent blind usability reviews

Six cold subagent reviewers, each given only the product's one-paragraph purpose statement and a fixed set
of real screenshots (no code, no task explanation), answered the same 10-question protocol per page. Four
of the six were explicit nontechnical first-time-user personas (a parent, a community organizer, a county
resident, and a resident browsing cold across the whole product); the remaining two were semi-technical
personas (a hospital capacity planner; a county epidemiologist/data-quality reviewer) matched to Utilization
and Validate/Data's actual audience.

**Reviewer 1 — Copilot (nontechnical parent persona).** Correctly identified the page's purpose and first
click. High-confidence finding: the generated "explanation" was a ~30-line wall of raw bullets, duplicated
almost verbatim a second time as a numbered source list — directly contradicting the page's own promise of
"a clear, sourced explanation." **Fixed**: the answer body now collapses to 8 lines with a "Show all N
facts" disclosure, and the source list no longer repeats each fact's full value a second time.

**Reviewer 2 — Prioritize (nontechnical community-organizer persona).** Identified the page and its ranked
result correctly. Findings: "Robust" and "Ranks similarly under most alternate weightings" repeat verbatim
on every card with no explanation on first encounter; the full 408-row table has no visible search/filter;
a screenshot of the "selected tract drivers" state appeared visually identical to the full table with no
visible change (traced to a full-page screenshot at a scale where an inline row expansion is not visible —
confirmed working via the existing `prioritize-core.spec.ts` "Show drivers" test, not a real defect).
**Not fixed this pass** (secondary-severity, single-reviewer, larger-scope changes — table search/filter,
a first-use glossary for "Robust"): recorded as a known limitation below.

**Reviewer 3 — Access Lab (nontechnical county-resident persona).** Found the page's purpose and its "How
are people traveling?" flow clear. High-confidence findings, all fixed: a raw backend/pipeline debugging
string in the access-summary error state; a leaked internal domain-key fragment in mobile-service scenario
titles; a dead-end ZIP-code guidance message naming "Explore" with no way to get there. Lower-severity,
not fixed this pass: "block group" jargon shown unexplained in the main result; the resource-browser table's
address column truncating at the right edge on narrower widths.

**Reviewer 4 — Utilization (semi-technical capacity-planner persona).** Confirmed the task-first landing and
the computed takeaway sentence worked as intended. Findings: a facility drill-down panel appeared to render
only loading skeletons in the captured state; a very large blank gap and an empty second table appeared
partway down the geographic-view screenshot; the 279-row trends table has no filter to jump to one category.
**Not fixed this pass**: these three require live re-verification beyond a static screenshot (the dedicated
`utilization-core.spec.ts` suite exercises the facility drill-down and asserts real content renders, and
passed cleanly both before and after this pass, so the screenshot artifact is most likely a timing/viewport
interaction specific to that one capture, not a reproducible defect) — recorded as a known limitation to
re-check with a longer wait before the next screenshot pass.

**Reviewer 5 — Validate and Data (semi-technical epidemiologist/data-quality persona).** Confirmed both
pages' purpose and grouped-status summaries read clearly. Findings: raw identifiers (`ca_hpi_3_0`,
`acs_5year_b01003`, `weights_hash`, raw hex hashes) still visible, even if de-emphasized; the Data page's
full unfiltered source list is very long with no pagination; the "Checks and uncertainty" tab showed
unresolved loading skeletons mixed with finished content in the captured state; "Published on its normal
schedule" repeats as a badge on nearly every source row, diluting the badges that matter. **Not fixed this
pass** (each is either already a deliberate, disclosed trade-off from the earlier Validate/Data rebuild, or
a larger-scope pagination/glossary feature): recorded as known limitations.

**Reviewer 6 — Cross-product navigation and coherence (nontechnical persona).** Confirmed the product feels
coherent throughout — identical sidebar, header, palette, typography, and card style across every page and
both viewport classes, with Prioritize's dense ranked-card list as the one page that reads visually busier
than the calm "short intro + few cards" pattern every other landing screen establishes. Findings: "Access
Lab" and "Utilization" don't self-describe from the nav label alone; "Compare places" and "explain this
place to me" are each offered from three separate entry points (Overview, Prioritize/Copilot, Explore/Access
Lab/Copilot respectively) with no signal distinguishing them. **Not fixed this pass** (nav-label renames and
entry-point consolidation are larger, cross-cutting IA changes outside this pass's five concrete-fix budget
and risk breaking the "do not rename routes casually" constraint without a dedicated pass): recorded as
known limitations.

## 5. Fixes made in response to review findings

1. **Copilot: collapsed the bullet-dump answer and de-duplicated the source list.** `copilot-client.tsx` —
   the body now shows the first 8 real facts with a "Show all N facts" disclosure; the Sources list drops
   the repeated value/percentile text when the answer is the deterministic bullet-dump template, keeping
   only the citation number, label, and publisher/vintage it didn't already state above.
2. **Copilot: removed the leading `[Deterministic mode -- ...]` line from the visible answer.** Found before
   the blind reviews, independently confirming the same "never lead with provider/architecture status"
   requirement the task itself states. The real `is_ai_generated`/`llm_configured` fields already drive the
   "Grounded in platform evidence" badge and the collapsed "About how answers are created" disclosure — the
   static disclaimer line is now stripped only from the answer body's display text, never from the
   underlying data.
3. **Access Lab: replaced a raw pipeline-script name in an error message.** `access-summary-panel.tsx` —
   `"...Is the API running, and has \`run_access_metrics_pipeline\` been run?"` is now
   `"Couldn't load this tract's access summary. Is the API running?"`, matching the plain wording every
   other panel on the page and product already used.
4. **Access Lab: removed a leaked internal domain-key fragment from scenario titles.** `optimizer-
   scenarios.tsx` — the pipeline (out of scope to edit) appends `"(health_burden-weighted, transit-hub
   candidates)"` to every `scenario_label`; the frontend now strips that exact known technical suffix for
   display only, since the plain-language equivalent is already stated once in the intro paragraph above
   the list.
5. **Access Lab: gave the ZIP-code guidance message a real link.** `city-drill-down.tsx` — "pick a place on
   the map in Explore" is now an actual `<Link href="/explore">`, not plain text naming an action with no
   way to perform it.

Each fix was verified two ways: a targeted Playwright assertion added to the permanent suite
(`access-lab-core.spec.ts`, `copilot-core.spec.ts`), and a live screenshot recapture confirming the fixed
state renders correctly (not just passes the assertion).

## 6. What was removed vs. made progressive

**Removed entirely:** Copilot's permanent provider-status banner and scenario grid before any input;
Prioritize's Export tab as a first-class navigation item; Access Lab's permanent travel-mode toggle and
methodology paragraph before a place is chosen; Utilization's immediate full facility table; Validate's six
equal-sized status cards (including always-zero categories); the raw `[Deterministic mode...]` disclaimer
line from Copilot's visible answer; the raw pipeline-script name from an Access Lab error message; the
leaked internal domain-key fragment from Access Lab scenario titles.

**Made progressive (moved behind a disclosure, not deleted):** Copilot's provider/architecture detail lives
in "About how answers are created"; Copilot's full fact list lives behind "Show all N facts"; Prioritize's
scenario controls live behind "Adjust priorities," its full 408-row table behind "View all 408 tracts," and
Export behind "Download results"; Access Lab's Resource browser / Resource gaps / Mobile-service scenarios
live as secondary tabs reachable only once a place is chosen; Validate's raw source IDs and build hashes
remain visible but de-emphasized (smaller, secondary text) rather than hidden in an additional click, a
deliberate trade-off recorded as a known limitation in section 7.

## 7. Remaining limitations (disclosed, not fixed this pass)

- Prioritize's "Robust" badge and "Ranks similarly under most alternate weightings" sentence repeat
  verbatim on every card with no first-use explanation; the full 408-row table has no search/filter/sort UI
  beyond native table sort.
- Validate and Data still show some raw internal identifiers (`ca_hpi_3_0`, `acs_5year_b01003`,
  `weights_hash`, build hashes) as de-emphasized secondary text rather than moved fully into an expand-on-
  request disclosure.
- The Data page's full unfiltered source list and "Data tables" list render as one very long, unpaginated
  page.
- "Access Lab" and "Utilization" are nav labels that don't fully self-describe without visiting the page;
  "Compare places" and "explain this place to me" are each reachable from more than one entry point with no
  visible distinction between them.
- Utilization's facility drill-down and geographic-view table showed anomalies in one static screenshot
  capture (unresolved skeletons; a large blank region) that did not reproduce in the dedicated, passing
  `utilization-core.spec.ts` suite — flagged for a re-check with a longer capture wait, not confirmed as a
  live defect.
- "Block group" terminology in Access Lab's main result, and truncated addresses in its resource-browser
  table on narrower widths, remain unexplained/unresolved.

None of these affect data correctness, scientific methodology, or the non-negotiable product rules; all are
presentation/IA refinements a future pass can pick up.

## 8. Screenshots

Captured live via Playwright against the real dev server and backend, at 1440×900 (desktop) and 375×812
(mobile), saved to `docs/design/screenshots/product-wide-flow-simplification/{desktop,mobile}/` (gitignored,
matching every prior pass's convention): Copilot (10 states — initial action selection, place/focus
selection, ready state, generated explanation and sources, unavailable action, backend waking, backend
unavailable), Prioritize (7 — initial ranked view, priorities open, all-results table, selected-tract
drivers, compare places, download controls), Access Lab (8 — initial choose-place, selected tract across
both travel modes, resource browser, resource gaps, mobile-service scenarios, missing-data ZIP guidance,
backend error), Utilization (5 — initial task chooser, facility list, facility detail, geographic view,
trends chart and table), Validate (5 — overview through reproducibility), Data (4 — initial catalog, search,
filtered view, source-table detail), plus a coherence set (Overview, Explore, Advocate landing) and one
consolidated mobile screenshot per redesigned page. The Copilot and Access Lab screenshots affected by
section 5's fixes were recaptured after the fix landed and visually confirmed to show the corrected content.

## 9. Verification summary

- Frontend lint (ESLint, `--max-warnings=0`): clean.
- TypeScript (`tsc --noEmit`): clean.
- Frontend unit tests (Vitest): 105/105 passed.
- Backend/pipeline: unchanged this pass (zero files modified under `apps/api` or `pipelines`); prior
  193/193 pytest baseline stands.
- Full Playwright suite, desktop-chromium + mobile-chromium projects, every spec file (not just changed
  pages): 461 passed, 0 failed, 31 skipped (expected — mobile-only and desktop-only specs skip on the
  other project by design). Zero flakes on this final run.
- Accessibility (axe-core, serious/critical): every redesigned page and state passes, including the new
  Copilot bullet-collapse and Access Lab error/ZIP-guidance states.
- Responsive: all seven required widths (1440/1280/1024/768/390/375/320) verified for every redesigned page
  via the existing `responsive.spec.ts` suite, which was updated to reflect the new IA.
- Keyboard-only, 200% zoom, and reduced-motion were verified for all six redesigned pages during
  implementation (18/18 passed) prior to this final gate.
- No new dependency was added; the Utilization trends chart is a ~100-line hand-rolled SVG component with
  no third-party charting library.
