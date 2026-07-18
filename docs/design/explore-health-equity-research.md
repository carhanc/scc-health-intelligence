# Explore-page comprehension redesign — research

Second-stage UX pass on `ux/health-equity-redesign`, focused on Explore-page comprehension, selected-geography storytelling, driving-factor explanation, and scientifically accurate use of "health equity." Companion to `docs/design/health-equity-ux-redesign.md` (the first pass) and `docs/design/design-system.md`. Written before implementation, per this pass's own instructions.

## 1. Reference-product research (official sources only)

**Method note:** `WebFetch` returned only navigation/footer chrome for several of these JS-rendered sites (Tree Equity Score's methodology page, HPI, Health Equity Tracker, CDC — the last also returned HTTP 403 to the fetch tool). Where that happened, the live site was instead driven directly through a real Chromium browser (accordion sections expanded, search executed, a tract selected) to read the actual rendered content. Health Equity Tracker's definitions page could not be reached through either path in the time available; its terminology is not directly quoted below, and no claim in this document is attributed to it.

### Tree Equity Score (treeequityscore.org)

Verified live via the National Explorer (`/map`) and Methods & Data page (`/methodology`, accordion-expanded):

- **Score definition, quoted from the site**: "Tree Equity Score measures how well the benefits of trees are reaching communities living on low-incomes, communities of color and others disproportionately impacted by extreme heat and other environmental hazards... The score ranges from 0-100. The lower the score, the greater priority for tree planting."
- **A documented "Priority index"** is the direct analogue of this platform's domain-contribution structure: "The priority index helps prioritize the need... based on seven equally-weighted climate, health and socioeconomic variables that are then integrated into Tree Equity Score" — Age (dependency ratio), Employment (unemployment rate), Health (health burden index), Heat severity, Income (poverty), Language (linguistic isolation), Race (people of color). The key transferable pattern: **every input factor is named, its plain-language meaning is stated, and the page states explicitly how many factors there are and that they're equally weighted** — nothing is presented as an opaque score.
- **No-selection orientation state** (`/map`, before any search): a persistent, non-modal, numbered 3-step list in the left rail — "1. Find your score" (search or browse), "2. Uncover the hidden story behind where trees are in your community" (click/tap shaded areas, toggle map layers, identify greatest-need areas), "3. Make the case with data and reports" (compare, get a report, set targets). This is a **permanent sidebar element, not a modal or dismissible overlay** — it just gets replaced by the selected-area panel once something is picked.
- **Map chrome**: a persistent bottom-left legend bar (`<70 [gradient swatch] 100`) plus separate **"Layers"** and **"Filters"** dropdown buttons docked at the bottom of the map — both remain visible and reachable regardless of selection state.
- **Selection flow**: clicking a shaded area opens "Find a location..." → "From map selection: Click on the map to see the reports available for the selected location" — i.e., the site treats a raw map click as step one of a two-step flow (click, then a report/detail view loads), not an instant inline popup.

**What transfers:** naming every contributing factor explicitly; a permanent (not dismissible-once-and-gone) orientation panel that is simply superseded by content once a selection exists; a persistent legend + persistent layer/filter controls docked to the map regardless of what's selected; treating "equally-weighted" as something worth stating outright rather than leaving implicit.

**What must not be copied:** the 0–100 "lower score = worse" polarity (this platform's concern scale runs the opposite direction and must stay internally consistent with the rest of the redesign, not flip to match); any Tree Equity Score/American Forests branding, the oak-leaf mark, the specific green/teal palette, or the exact wording of their copy; the tree-canopy subject matter obviously has no bearing on health domains and no vocabulary was borrowed verbatim.

### California Healthy Places Index (healthyplacesindex.org)

WebFetch on the About page returned real content (unlike the JS-map itself): HPI is "a powerful and easy-to-use data and policy platform created to advance health equity through open and accessible data," built from "23 social indicators of health — all positively associated with life expectancy at birth," explicitly framed around "race and place" and "conditions in which we are born, grow, live, work and age." **What transfers:** HPI's own self-description is a clean, short model for how a platform can state its purpose in terms of "health equity" without overclaiming — it says the indicators are "positively associated with" life expectancy (correlational language), never that they cause it. This directly matches this platform's own existing non-causal discipline (`content-style-guide.md` §6) and reinforces that the discipline is consistent with how a genuine health-equity data product actually talks about itself, not an idiosyncratic choice.

### County Health Rankings (countyhealthrankings.org)

The "Model of Health" page uses noticeably more causal language than this platform is permitted to use: "community conditions... **affect** our collective health and well-being," positioning conditions as **drivers** of outcomes rather than correlates. **This is flagged explicitly as a pattern NOT to transfer** — this platform's `content-style-guide.md` §6 and `CLAUDE.md`'s non-negotiable rules forbid causal verbs about a score or a contributing factor ("driven mainly by," used already in this platform's own copy, is examined and corrected in §4 below precisely because of this risk). Where County Health Rankings says a factor "affects" health, this platform must say a factor "contributes to" or "is associated with" the screening result.

### CDC health equity definition

The CDC-aligned definition supplied directly in this task's own instructions — "Health equity means everyone has a fair and just opportunity to attain their highest level of health" — is used verbatim as the platform's canonical definition (§3 below), with a citation link to the CDC page rather than a paraphrase, since WebFetch could not independently re-verify the live page text (403) and the instructions already supplied the authoritative wording to use.

## 2. Current Explore comprehension failures (live-verified this session)

Verified against the running app (`ux/health-equity-redesign`, post first-pass commits) at `/explore?geography=tract&id=06085503112&scenario=default_integrated_screen_v1`:

1. **"Driven mainly by X" picks the wrong domain outside equal-weight scenarios.** `geography-detail.tsx:192-194` sorts domains by `domain_score` (raw percentile) to pick the headline "driven mainly by" domain — not by `contribution` (percentile × the domain's actual weight in the active scenario). Live-verified against tract `06085503112` under the default `Balanced overview` scenario (all 5 domains weighted equally at 0.20): `domain_score` ranking and `contribution` ranking happen to agree here (Environmental burden highest on both: `domain_score=95.6`, `contribution=19.12`) **only because the weights are all equal in this one scenario** — sum-of-contributions is exactly `77.457`, matching `explanation.score`, confirmed live. Under any scenario with unequal domain weights (7 of the platform's 8 named scenarios are *not* equally weighted), a domain with a high percentile but a low weight could be reported as "driving" the score while contributing less in absolute terms than a domain with a merely-moderate percentile and a high weight. This is exactly the failure mode this task's instructions warn against ("Do not equate the highest percentile automatically with the strongest model contribution unless the calculation supports that") — found as a **real, currently-live defect**, not a hypothetical. Fixed in §7/implementation.
2. **No explicit percentile-style comparison sentence.** The panel shows a rank ("#1 (range #1-3)") and a "chance it's in the top 10%" figure, but never states "higher than N% of 408 tracts" — the exact phrasing this task's instructions specify, and arguably more immediately legible than a raw rank to a first-time reader.
3. **Domain breakdown shows a bare score, no direction/interpretation per row.** `DomainDisclosure` (`geography-detail.tsx:340-380`) shows `{domain_score}/100` and, once expanded, a percentile bar per metric — but nothing at the collapsed-row level states whether that domain's value means "more concern" or "less concern" here, or gives a one-line interpretation. A reader has to already know the platform-wide convention (higher = more concern, stated once on the Overview page) to interpret "84/100" correctly.
4. **No ranked "specific drivers" list independent of the domain accordion.** The 25 real per-metric `contribution` values that already exist in `explainScore`'s response (confirmed live: top driver for this tract is `ces_pollution_burden`, contribution `9.73`, i.e. ~12.6% of the total score) are never surfaced as a ranked list — they're only reachable by manually expanding all 5 domain `<details>` elements and reading percentile bars, with no ranking or "why this matters" framing.
5. **Hover tooltip under-delivers versus this task's own spec.** Current hover card (`explore-map.tsx`) shows only `{name}` and `Score: {score}/100` — no rank/percentile, no top domain(s), no confidence signal, no "select for full profile" prompt (all explicitly requested by this pass's instructions).
6. **No map layer switching exists.** Confirmed via code read (`explore-map.tsx`) and via the backend (`get_all_tract_boundaries_with_scores`, `apps/api/src/scc_health_api/repositories/geography.py:370-424`): exactly one fill layer, the composite score. No UI or API path lets a user view a single domain's values as the map fill.
7. **"Health equity" is not used anywhere on the Explore page.** Confirmed via a full page-text read: the word "equity" does not appear once in Explore's current copy (it appears on Overview's methodology-adjacent text and in the Privacy/Accessibility pages, but Explore itself never names the concept it exists to serve).
8. **No non-modal first-time orientation on Explore itself** — Overview has an orientation section, but Explore's "no selection" state is just the search box and an empty-state card with one line of instruction, not the richer numbered walkthrough this task's instructions (and Tree Equity Score's precedent) call for.
9. **Mobile selection is a full-page block push-down, not a bottom sheet.** First-pass work fixed the *order* (search above map) but selecting a tract still renders the full detail panel inline below the map, requiring a long scroll — no collapsed/expanded intermediate state, no persistent visible map while reading the profile.
10. **No per-metric source year is shown anywhere in `explainScore`'s consumption path** — confirmed absent from the API response itself (§3 below), so this is a data-availability gap, not just a UI gap.
11. **"Missing-data tract" cannot currently be demonstrated with live data.** Verified directly against the running warehouse: **0 of 408 tracts** have a null composite score, and **0 of 408** have any `domains_missing` entries under the default scenario — every one of the 25 registered metrics is present for every tract today. This is a genuinely good fact about current data completeness, not a bug, but it means the missing-data rendering path cannot be visually captured from live data this session (see the visual-review doc for how this is instead verified via a targeted unit test with a synthetic fixture).

## 3. Exact API/data-model availability (see also the full inventory produced by a dedicated research pass this session, summarized here)

**Already available, no backend change needed**, all on `ScoreExplanationResponse` (`GET /api/v1/scenarios/{scenario_id}/tracts/{tract_geoid}/explain`, `apps/api/src/scc_health_api/routes/analytics.py:207-372`):
- Composite score, coverage fraction, stability label, Monte Carlo rank/CI/probability-top-decile (`ScoreSummary`, already rendered).
- Per-domain: `domain_score` (0–100, percentile-scale, **scenario-independent** — verified directly against the warehouse, `analytics.domain_scores` has no `scenario_id` column, 2040 rows = 408 tracts × 5 domains, confirmed via direct query this session), `contribution` (0–100-scale points, **scenario-dependent**, sums exactly to the composite score — this identity is a tested invariant in `apps/api/tests/test_analytics_routes.py`), `normalized_weight`, `configured_weight`.
- Per-metric (`MetricContribution`, nested under each domain): `raw_value`, `unit`, `direction` (`concern_high`/`concern_low`/`neutral`), `percentile`, `effective_weight`, `contribution`, `standard_error`, CI limits, `source_id`, `citation`, `plain_language_definition`, `limitations`. **This is already everything a ranked, per-metric "specific drivers" list needs** — no backend change required for §9's driver list.
- `weight_sensitivity.most_influential_domain`: a real but *different* signal (rank-sensitivity to weight perturbation, Pearson correlation across 1000 Dirichlet draws) from `contribution` (direct magnitude). Live-verified these disagree for tract `06085503112`: `most_influential_domain = "resource_accessibility"` (the domain the composite rank is most sensitive to *if its weight changed*) even though `resource_accessibility` has the **smallest** `contribution` (3.93) of all 5 domains for this tract under this scenario. These must never be conflated in copy — the redesign uses `contribution` for "driver" language and does not surface `most_influential_domain` as a driver claim at all (it remains available only inside the existing Validate/uncertainty surfaces where "sensitivity to assumptions" is the explicit topic).
- `GET /api/v1/domains` already returns the full registered metric roster per domain (`DomainSummary.metrics`), independent of any tract — usable to compute "no data for X" by client-side diff against `explainScore`'s (present-only) metric list, with no backend change.

**Requires a small, justified backend addition** (per this task's explicit permission to make "the smallest possible tested API addition using calculations already present in the pipeline"):
- **Per-domain scores on the map layer.** `getAllTractBoundaries(scenarioId)` returns only `score`/`coverage_fraction`/`stability_label` per tract — no domain breakdown, so a "view a single domain on the map" layer switcher cannot be built today. The fix uses **zero new computation**: `analytics.domain_scores` already holds every tract's 5 domain scores, already computed, already scenario-independent. The addition is five more `LEFT JOIN`s (one per known domain name, matching the existing function's plain, explicit-SQL style — no dynamic pivot) to `get_all_tract_boundaries_with_scores`, adding `health_burden_score`, `access_barriers_score`, `environmental_burden_score`, `resource_accessibility_score`, `workforce_shortage_score` columns to each feature's `properties`. Implemented in §7.
- **Per-metric source vintage** is deliberately **not** added to the backend this pass — `MetricContribution.source_id` already exists and can be joined client-side against the already-fetched `GET /api/v1/sources` catalog (keyed by the same `source_id`) to reconstruct "ACS 2023"-style captions with no schema change at all. This is the smaller of the two options identified during research and is preferred exactly because it avoids a backend change where one isn't required.

**Explicitly not added:** no new methodology, no new per-domain rank/CI (composite-only rank stays composite-only), no change to how `contribution`/`effective_weight` are computed (the existing pipeline math in `pipelines/src/scc_health_pipeline/scoring/explainability.py` is reused exactly as-is — only how it's *displayed* changes).

## 4. Proposed information hierarchy (desktop)

Maps this task's 9-part model onto the data confirmed available in §3, replacing `TractDetail`'s current structure in `geography-detail.tsx`:

1. **Place** — geography name, type, GEOID (secondary text), parent context (county always; city/district where resolvable), clear-selection control. *(Already mostly present; GEOID/parent-context prominence adjusted.)*
2. **Headline screening result** — plain-language concern category (reusing `scoreBandLabel()`), **explicit comparison sentence** ("Higher than N% of 408 Santa Clara County tracts" — computed from the existing Monte-Carlo `median_rank`/408, not a new field), active scenario name, `StabilityBadge`, one-line "screening signal, not a verdict" qualifier (already present, kept).
3. **Comparison** — folded into (2)'s sentence rather than a separate block, since the denominator/rank data is the same underlying numbers already shown in `ScoreSummary` — avoiding a duplicate number presented twice in different phrasing.
4. **Interpretation** — a deterministic, rule-based sentence generated from the *corrected* top-contributor logic (§7), distinguishing observed/modeled/scenario-derived language per this task's explicit requirement.
5. **Domain breakdown** — `DomainDisclosure` rows extended with: direction ("Higher = more concern" via the existing `MetricDirectionLabel` component from the first pass), a one-line interpretation, and an explicit "vs. countywide" framing — still collapsed-by-default `<details>`, not a radar chart (per explicit instruction).
6. **Specific drivers** — new: a ranked (`contribution` descending, real math) top-N list, each row using labels ("Strong driver," "Contributes to higher/lower concern," "Context only") **only where `contribution` magnitude genuinely supports the label** (thresholds documented in §7), each showing plain-language value phrasing per this task's copy examples, source citation, and county comparison.
7. **Confidence and evidence quality** — extends the existing `ScoreSummary` coverage/stability display with an explicit modeled-vs-observed note and a link to Validate (new).
8. **Limits ("what this does not mean")** — extends the existing one-sentence disclosure into the explicit 4-point list this task requires (screening ≠ diagnosis, ≠ causation, ≠ funding-eligibility determination, community context still required) — kept short, not a wall of caveats.
9. **Actions** — extends the existing `GuidedNextStep` (Copilot, Prioritize links) plus the existing `Compare`/`Use in Advocate`/`View sources & evidence` buttons — no new action is invented; "Copy/share link" is added since the URL is already shareable (`selection.ts`, unchanged), just not currently surfaced as an explicit action.

## 5. Proposed information hierarchy (mobile)

- Search remains above the map (kept from the first pass).
- Selecting a tract opens a **bottom sheet** built on the first pass's existing `MobileBottomSheet`/`Dialog(variant="bottom")` component (no new UI primitive) with three states:
  - **Collapsed** (default on selection): place name, concern category badge, rank — a one-line summary, map fully visible above it, matching this task's explicit collapsed-state content spec.
  - **Intermediate**: adds the headline comparison sentence and domain breakdown, still with the map partially visible.
  - **Expanded**: full profile (all 9 sections from §4), scrollable, map hidden behind it.
  - State transitions via a drag handle **and** an explicit, keyboard/screen-reader-operable button (a drag gesture alone is never the only way to expand/collapse — WCAG 2.5.1).
- The native `<dialog>` element already used by `Dialog`/`MobileBottomSheet` provides real focus-trap and Escape-to-close for free (documented in `design-system.md` §8) — the *expanded* state traps focus (a true modal at that point, map genuinely hidden behind it); the *collapsed*/*intermediate* states do not trap focus, since the map stays visible and operable behind them and trapping would block that.

## 6. Terminology decisions

Adopted directly from this task's instructions, applied at these exact points:
- Explore's page intro (`PageIntro`, extended): incorporates "Explore health equity across Santa Clara County" framing and the CDC-aligned definition — "Health equity means everyone has a fair and just opportunity to attain their highest level of health" — with a citation link to the CDC page, shown collapsed behind a `GlossaryTerm`/definitions disclosure (per §8's "must not overwhelm the default view"), not inline as a permanent paragraph.
- Selected-panel heading: "Health Equity Screening Profile" (replacing the current bare `h2` of "Tract {geoid}").
- Domain-breakdown section heading stays "What's driving this score" (already accurate, already non-causal-safe language — "driving" here describes score *composition*, a documented mathematical fact per `contribution`, not a claim about real-world causation of health outcomes; kept per the "driven mainly by" analysis in §2/§7 which specifically fixes the *computation*, not the word itself, since `content-style-guide.md` §6 already explicitly sanctions "driven mainly by" as describing contribution-to-score-math, not causal mechanism).
- Never: "Health Equity Score" (this platform's score is a *concern* score, and is never renamed to imply it measures equity directly — equity is the *frame* for why the platform exists, not the name of the number), "this tract has poor health equity," "least equitable tract," causal claims about any factor "causing" inequity. Grepped this session's new/changed copy against this exact prohibited list before finalizing (§ testing).

## 7. The corrected driver calculation (exact logic to implement)

Replacing `geography-detail.tsx:192-194`'s `domain_score`-sorted `topDomain`:

```
rankedDomains = domains.filter(d => d.contribution !== null).sort by contribution DESC
topDomain = rankedDomains[0]   // now genuinely the largest contributor, not merely highest percentile

rankedMetrics = flatten(domains.map(d => d.metrics)).filter(m => m.contribution !== null).sort by contribution DESC
// "Strong driver" label: contribution >= 1.5x the mean per-metric contribution across all present metrics for this tract
// "Contributes to higher/lower concern": any other present metric, labeled by `direction`
// "Context only": reserved for a future evidence type this platform doesn't have today (not applied to explainScore metrics, which are always real contributors by construction) -- not used in this pass
// "Insufficient data": a metric named in GET /api/v1/domains's roster but absent from this tract's `domain.metrics` array
```

The "≥1.5× the mean" threshold is a documented, disclosed heuristic for the "Strong driver" *label* only — it changes no underlying score, weight, or ranking, only which rows get a text badge. This is recorded as a decision (`DECISIONS.md`, new entry) rather than left as an undocumented magic number, per this task's "do not create new methodology casually" instruction — it's a display-threshold choice, not a new metric.

## 8. Scientific risks

- **The "most influential domain ≠ largest contributor" distinction (§3) must be maintained wherever both concepts could appear** — the redesign never surfaces `most_influential_domain` inside the driver-explanation panel at all, precisely to avoid the two being visually adjacent and assumed to mean the same thing.
- **Place/district geographies' evidence is a lossy average**, confirmed in `advocacy_evidence.py` (per-tract values averaged unweighted across member tracts) — the redesigned driver list for a *place* selection (not a tract) must say so explicitly wherever it shows a value, not present a city-level number with the same precision framing as a single-tract number.
- **`stability_label` is a two-input gate, not pure rank-stability** (data-confidence gate first, rank-stability second) — confirmed in the pipeline source this session. The Confidence section's copy states both inputs rather than implying "Robust/Assumption-sensitive" is only about weight-sensitivity.
- **Causal-language discipline** — every new sentence template introduced this pass is checked against `content-style-guide.md` §6 before being written into code (verbs: "contributes to," "is associated with," "reflects," never "causes"/"leads to"/"results in").

## 9. Accessibility risks

- Bottom sheet: focus management differs by state (§5) — must be tested explicitly, not assumed from `Dialog`'s existing center/side-variant tests.
- Domain/driver rows must never rely on color alone for direction — every row pairs a color-coded badge with a text label (already this platform's established rule, `content-style-guide.md` §9; re-verified for every new row type this pass).
- Layer switcher must be a real, labeled control (radio group or `SegmentedControl`, reusing the first pass's shared component), keyboard-operable, and must update the accessible table view's data source too if/when a layer is active (deferred: this pass keeps the accessible `ExploreTable` on the composite score regardless of active map layer, and states this explicitly in the layer switcher's own helper text, rather than silently having the table and map disagree — a real, disclosed scope limit, not a silent gap).
- 200% zoom and reduced-motion: bottom sheet's open/close transition must respect `prefers-reduced-motion` (already handled globally per `globals.css`, re-verified for the new sheet states specifically).

## 10. Performance risks

- Driver/domain sorting (`contribution`-based) is computed once per `explainScore` response via a memoized derivation (`useMemo` keyed on the query data), not recomputed on every render or map interaction.
- The map-layer switch reuses the **already-fetched** `getAllTractBoundaries` response (all 5 domain scores now included in one payload, §3) — switching layers client-side re-paints the existing MapLibre source with a different `fill-color` property expression, **no new network request per layer switch**.
- `explainScore` continues to fetch only after a selection exists (unchanged) — no per-hover or per-polygon request is introduced; the redesigned hover card uses only the already-loaded boundary-feature properties (name, score, and now domain scores) already present in the map source, not a new fetch.
- No charting dependency is added — the driver list and domain breakdown extend the existing `PercentileBar` primitive.

## 11. Implementation plan

1. **Backend**: extend `get_all_tract_boundaries_with_scores` + its Pydantic response schema + `TractBoundaryFeatureProperties` (TS) with 5 domain-score columns; extend the existing boundary test (`test_tract_boundaries_join_real_scenario_scores`) rather than replace it.
2. **Frontend — selected panel**: rewrite `TractDetail`'s headline/interpretation logic (contribution-based, §7), add the ranked specific-drivers list, extend `DomainDisclosure` rows with direction/interpretation, extend the confidence section, extend the limits disclosure, extend `GuidedNextStep` with a share-link action.
3. **Frontend — map**: add a layer switcher (`SegmentedControl`, reusing the first pass's shared component) driving the fill-color property expression; redesign the hover card per §2 point 5; wire the new domain-score properties into both.
4. **Frontend — mobile**: build the 3-state bottom sheet on `MobileBottomSheet`.
5. **Frontend — orientation**: add the non-modal numbered walkthrough to Explore's no-selection state; add `GlossaryTerm`-gated definitions for health equity/census tract/percentile/scenario/modeled estimate/driver/confidence.
6. **Terminology**: apply §6 throughout Explore's copy.
7. **Tests**: unit tests for the corrected driver-sort logic (a fixture proving the old vs. new computation disagree under unequal weights, mirroring the Overview 7/16 regression-test pattern from the first pass), a synthetic-fixture test for the missing-metric rendering path (§2 point 11), component tests for the bottom sheet states, updated/new e2e coverage.
8. **Verification**: full gate sequence + visual review doc, per this task's explicit requirements.
