# Product-Wide Flow Simplification — Research and Audit

Pre-implementation research for the final major usability pass across the platform, following the same
discipline as the Explore and Advocate redesigns: audit first, then implement. Advocate's guided-flow model
(one question at a time, progressive disclosure, one primary action, plain language, calm spacing) is the
interaction-quality baseline; this pass applies the same *principles*, not Advocate's literal visual layout,
to Copilot, Prioritize, Access Lab, Utilization, Validate, and Data, plus a coherence pass on Overview,
Explore, and Advocate's shared surfaces.

Audit method: live inspection of every route at 1440/1280/1024/768/390/375/320px via the Claude Browser
pane, plus four parallel deep code-architecture research passes (one each for Copilot; Prioritize; Access
Lab + Utilization; Validate + Data) reading every relevant file in full, not excerpts.

## 1. Page-by-page comprehension failures (confirmed live)

**Copilot.** First viewport shows, in order: a 3-line intro paragraph, a "Deterministic mode / No AI
provider configured" status line, a permanent left column (place search + a 9-card scenario grid, one of
which is a static "Not available yet" warning card), and a right-column form with a generic "What do you
need?" dropdown and a disabled "Ask Copilot" button whose only enabling hint is a small caption ("Choose a
place on the left first."). **On mobile, the disabled form renders before the search field that unblocks
it** (grid column reordering puts `order-1` main content above `order-2` search) — a genuine sequencing bug,
not just a density problem. The scenario dropdown offers only 8 of the 10 real backend actions (missing
`compare_geographies`, `connect_document_to_evidence` entirely). No cross-page arrival support exists
(`selectedGeography` is local `useState`, never reads `useSearchParams()`), unlike Advocate.

**Prioritize.** A permanent 360px left sidebar (9-card scenario grid + "Not available yet" language-access
card, plus weight sliders when Custom is active) sits beside a 4-tab main area (Ranked results / Site &
program constraints / Compare / Export) whose default view is **all 408 tracts in one unpaginated,
horizontally-scrolling table** — the first thing a user sees is a wall of rows, not a result. Every visible
row shows "100%" data coverage (adds no information at default weighting) and a bare "Robust" badge with no
inline explanation (a `title` tooltip exists but is invisible in a first glance and on touch devices).
Export is a full top-level tab equal in visual weight to the actual analysis views.

**Access Lab.** A 4-sentence methodology paragraph and a Walking/Driaving mode toggle render before any
place is chosen — the toggle has nothing to act on yet. All four tabs (Access summary, Resource browser,
Resource gaps, Mobile-service scenarios) are reachable before a tract exists, and the default tab's only
content is a bordered "No tract selected yet" panel that just restates what the empty search field already
implies. Transit is not actually a third toggle option (confirmed in code) — it's an always-shown
per-tract section — so any redesign copy must not imply a three-way mode switch.

**Utilization.** A methodology paragraph carrying two nested technical distinctions (observed-vs-modeled,
county/facility/ZIP geography) renders before the first result. Facility view's full 9-row table is the
default landing content with no framing question first. The capacity-vs-demand caveat ("licensed beds is
not an occupancy rate") is genuinely important but currently leads the page rather than sitting next to the
comparison it protects against misreading.

**Validate.** Six equally-weighted tabs (Data coverage, Scoring methods, Uncertainty & sensitivity,
Validation, Known limitations, Reproducibility) appear immediately, with no top-level answer to the one
question a visitor actually has ("can I trust this?"). The coverage tab's six `StatCard`s are all
equal-sized regardless of whether a bucket is ever non-zero in practice (with the current manifest, "Draft
(not used)" is always 0 and still occupies a full card). A raw internal source key leaks verbatim into the
unavailable-sources list: **"Public Health Alliance of Southern California -- ca_hpi_3_0."**

**Data.** The Sources table's first column is a raw `source_id` (`acs_5year_b01003`, `ca_hpi_3_0`,
`osm_overpass_network`, …) as both the row's primary label and its link text — there is no plain-language
name anywhere. No search or filter exists over ~30+ rows. **A real, confirmed bug**: two source rows share
the identical `source_id` `osm_overpass_network`, producing a live React "two children with the same key"
console error — must be fixed as part of any Data-page work regardless of the redesign, since a stable
unique key is required either way.

**Overview.** Already close to the target model: one heading, one purpose sentence, three clear action
cards (Discover/Prioritize/Compare), a plain-number "Countywide snapshot," and a short "Where might action
be most urgent" preview list. Confirmed live at 1440px — **no rebuild needed**, only the terminology fix
below (the same bare "Robust" badge appears in its tract-preview list).

**Explore.** Confirmed live: map-first, one search field, a numbered 4-step "how to use this" card, a
screening-view dropdown. Matches the target model already — **preserve entirely**, per the task's explicit
instruction not to rebuild it. Only verify terminology/handoff consistency during implementation, not a
redesign.

**Advocate.** Unchanged since the prior pass; used as the interaction-quality baseline. Not rebuilt.

## 2. Duplicated patterns (the actual "global component opportunities")

- **The recommended/common/see-more focus picker already exists once, correctly, in Advocate**
  (`app/advocate/focus-step.tsx` + `focus-options.ts`) but Prioritize and Copilot each independently render
  the *original* 9-card `ScenarioSelector` grid (`app/prioritize/scenario-selector.tsx`) at full weight,
  permanently visible. Rather than inventing a fourth pattern, this pass generalizes Advocate's already-
  proven recommended/common/see-more/custom structure into one shared component reused by Prioritize's new
  "Adjust priorities" disclosure and Copilot's new focus-selection step, and Advocate keeps using it too —
  net reduction from 2 duplicated full-grid implementations to 1 shared progressive one, with zero change
  to the underlying `api.getScenarios()` data or scenario IDs.
- **Loading/error states already mostly go through `BackendWakeState`/`ErrorState`/`SkeletonText`
  (`@scc-health/ui`)**, but wording and structure vary page to page (Copilot's error title is "Copilot
  request failed," Prioritize's constraints tab has its own solved/unsolved language, etc.). No new
  component is needed here — this is a copy-consistency pass over the existing shared components, not a new
  pattern.
- **`DataTable` (`packages/ui/src/DataTable.tsx`)** is already the correct accessible-table pattern
  (sortable `<button>` headers, `aria-sort`, keyboard row selection) and is reused consistently by Access
  Lab and Utilization already — no change needed to the table primitive itself, only to what leads each
  table (a summary/cards first, per page).
- **`UseInAdvocateButton` + `sourcePage`** is already correctly wired on every current handoff, including
  Access Lab and Utilization (verified directly in code: `sourcePage="Access Lab"` /
  `sourcePage="Utilization"` are both already present) — a research-agent pass initially flagged this as a
  gap by inspecting the shared type definition rather than the call sites; corrected here. **Copilot has no
  handoff at all today** — this pass adds one, reusing the exact same `UseInAdvocateButton`/`sourcePage`
  pattern, not a new mechanism.
- **A genuinely new shared piece worth building**: a small `TaskPageHeader` (title + one-line purpose +
  optional compact status/help link) and a `PlainLanguageEmptyState` (what this does / what's needed / one
  primary action), since six pages currently hand-roll slightly different versions of both.

## 3. Jargon inventory (verbatim strings to replace or relocate)

| Current | Where | Treatment |
|---|---|---|
| "Deterministic mode" as the page's first status | Copilot | Move to a collapsed "About how answers are created" disclosure; visible phrase becomes "Grounded in platform evidence." |
| "Scenario" as a user-facing label | Prioritize, Copilot | Replace with "focus" in all normal-interface copy; internal `scenario_id` values and API contracts unchanged. |
| Bare "Robust" badge | Prioritize, Overview | Keep the short visual badge; always pair with the existing tooltip text as visible copy, not hover-only. |
| "ca_hpi_3_0" / "acs_5year_b01003" / raw `source_id` as primary label | Validate, Data | Plain-language source name first; raw ID moves into expanded/advanced metadata. |
| "Not available yet" language-access card, permanently visible at full weight | Prioritize, Copilot | Move under "See more focus areas," not a same-weight peer of real options. |
| "Site & program constraints" as an equal top-level tab name | Prioritize | Reframe as a secondary "Add practical constraints" action, not a primary analysis tab. |
| "Export" as a top-level tab | Prioritize | Reframe as a secondary "Download results" action. |

## 4. Target information architecture

Global journey model (conceptual, not a rendered wizard): **Discover** (Overview, Explore) → **Understand**
(Explore, Access Lab, Utilization, Copilot) → **Prioritize** (Prioritize) → **Trust** (Validate, Data) →
**Act** (Advocate). Each page keeps its own route and left-nav entry; the model only disciplines each page
to answer, within 5 seconds: what is this for, what do I do first, what's the main result, what happens
after I act, where's more detail.

- **Copilot** → "Understand the evidence": action choice first, then only-needed sequential questions
  (place → focus), answer-dominant result.
- **Prioritize** → "Find areas for closer review": ranked result dominates immediately; "Adjust priorities"
  becomes a disclosure/drawer, not a permanent column.
- **Access Lab** → "Understand access to care": place-only first screen; travel mode and tabs appear only
  after a place exists.
- **Utilization** → "See how health services are used": a 3-choice task question first, replacing an
  immediate full table.
- **Validate** → "Trust, methods, and data quality": one plain-language trust answer first; six tabs become
  five better-grouped sections.
- **Data** → "Explore data sources and coverage": search/filter and plain names first; technical metadata
  on demand; the duplicate-key bug fixed as part of the same change.

## 5. Page-specific task model (first action → primary result → next step)

| Page | First action | Primary result | Next step |
|---|---|---|---|
| Copilot | Choose an action | A grounded, cited explanation | Ask another question / compare / add to Advocate |
| Prioritize | See top-ranked areas | A concise ranked list (10-15) | Inspect one area / view all 408 / add to Advocate |
| Access Lab | Choose a community | Nearest-care + resource summary | Browse resources / see gaps / add to Advocate |
| Utilization | Choose a question | A plain-language finding | View supporting table / add to Advocate where wired |
| Validate | See overall trust status | Grouped status (current / needs attention / unavailable) | Drill into methods, limitations, or reproducibility |
| Data | Search or filter sources | A readable source list | Open a source's detail / see where it's used |

## 6. Responsive strategy

No new breakpoints — reuse the platform's established 1440/1280/1024/768/390/375/320 set
(`e2e/responsive.spec.ts`). Desktop: replace the permanent-sidebar-plus-table layouts (Prioritize, Copilot)
with a centered decision screen for setup, then a wide result surface, matching Advocate's existing
`max-w-[880px]` setup / wider-review pattern. Mobile: guided screens stack to one column; "Adjust
priorities"/"Advanced filters" become a disclosure or sheet, never a pre-expanded permanent block; dense
tables gain a concise summary/cards view first, with the full table reachable via "View all N."

## 7. Accessibility risks

- Bare-badge-only status (Robust, freshness labels) must keep visible text, not rely on color or a
  hover-only tooltip, for both the existing WCAG color-only-meaning rule and touch-device parity.
  (W3C/WAI: don't convey information by color alone; CDC Clear Communication Index: define technical terms
  where they're used, not only in a tooltip a screen-reader user or touch user may never trigger.)
- New disclosures ("Adjust priorities," "About how answers are created," "How access is modeled," "About
  this data") must use native `<details>`/`<summary>` or an equivalent with correct `aria-expanded`,
  matching the pattern already established and tested in Advocate's `ProjectMenu`/`ProjectDetailsDisclosure`.
- Guided step transitions (Copilot's action → place → focus sequence) must not move focus silently — follow
  Advocate's existing pattern of an accessible heading per step and no unannounced auto-focus jumps.
- Utilization/Validate charts (if any chart is introduced for Trends) need an accessible table alternative,
  per the existing `DataTable` precedent and the task's explicit requirement.

## 8. Performance risks

- No new chart, table, or wizard library — every page audited already has what it needs (`DataTable`,
  `Card`, `Badge`, `Tabs`, React Query, `<details>`). A concise-summary-first Prioritize view means
  **fewer** default DOM rows (10-15 instead of 408), not more.
- Reusing one shared focus-picker component instead of three independent scenario grids is a net bundle
  reduction, not an addition.
- No new network requests: existing `getScenarios()`, `getScenarioScores()`, `getAdvocateEvidence()`,
  `getSources()`, `getDataExplorer()` queries are reused as-is; opening a disclosure must not trigger a
  fetch that hasn't already happened.

## 9. Implementation plan (maps to the 9 suggested commits)

1. Shared task-page header, plain-language empty state, and the generalized focus-picker component
   (extracted from Advocate's `FocusStep`), reused by Prioritize and Copilot.
2. Rebuild Copilot: action-first screen, sequential place/focus questions, answer-dominant result, provider
   status moved to a disclosure, Advocate handoff added.
3. Simplify Prioritize: ranked-result-first layout, "Adjust priorities" disclosure, concise top-N view with
   "View all 408," plain stability text, restructured tab/action model.
4. Simplify Access Lab: place-only first screen, deferred travel-mode/tabs, summary-cards-first result.
5. Simplify Utilization: task-chooser-first screen, leading takeaway per view, compacted methodology.
6. Rebuild Validate (trust-first overview, regrouped sections, plain source names) and Data (search/filter,
   readable rows, fix the duplicate-key bug).
7. Harmonize navigation labels, loading/wake/error copy, and verify/complete cross-page context handoffs.
8. Full verification gate (lint/typecheck/tests/build/e2e/axe/responsive/performance) plus screenshots and
   6 blind usability reviews.
9. Governance docs, visual review doc, commits, push.

## 10. Explicit non-goals

- Not rebuilding Explore's map-first experience or Advocate's guided flow — both are preserved as-is except
  for small shared-terminology/loading/error harmonization.
- Not changing any scenario ID, weight array shape, API contract, scientific methodology, or score
  calculation anywhere.
- Not adding a chart library, wizard library, or table library.
- Not implementing a real conversational/multi-turn Copilot — the redesign reframes the existing
  single-turn, template-grounded action model in plain language; it does not imply unrestricted AI or add a
  chat UI.
- Not adding transit as a third selectable travel mode on Access Lab (it remains contextual, matching
  today's real backend behavior).
- Not fixing RISK-038 (Advocate's three distinct "back" controls) — out of scope for this pass, already
  disclosed.
