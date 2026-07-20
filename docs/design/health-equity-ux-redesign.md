# Health-equity UX redesign

Branch: `ux/health-equity-redesign`. Companion to `docs/design/design-system.md` (visual system baseline), `docs/design/component-inventory.md` (existing component reference), and `docs/design/content-style-guide.md` (language rules — unchanged and reaffirmed by this redesign, not superseded). This document is the record of what was found, decided, and built; it is written before implementation and will be referenced, not rewritten, as each commit lands.

## 1. Purpose and scope

The platform's underlying analytics are sound (score decomposition, uncertainty, and stability language already meet a high bar — see §3). The redesign's job is presentation and information hierarchy: make the 30-second comprehension question answerable on every page, fix a real, verified metric-explanation defect on Overview, replace the map's color scale with one that actually communicates "concern" the way the rest of the product's language already does, and tighten density on the pages that currently dump large amounts of undifferentiated data (Prioritize's 408-row table, Utilization's wide facility table).

This is **not** a rebuild. No new data source, no new composite score, no renamed metric, no changed API contract beyond what §9 documents narrowly. Every visual/interaction change reuses or extends the existing `packages/ui` component system and CSS custom-property tokens (`apps/web/app/globals.css`) rather than introducing a new design language. Nothing here references, copies, or reuses any code, asset, or wording from Tree Equity Score or any other external product — the four referenced screenshots were used only to extract interaction/information-hierarchy *principles* (listed in §5), never to copy layout, branding, iconography, or text.

## 2. Constraints reaffirmed

- Branch-only work; no push, no deploy, no credential or infrastructure change.
- No fabricated or backfilled data; no new "unavailable" states hidden rather than shown.
- No causal language upgrade — every score-adjacent surface keeps the non-causal disclosure text already codified in `content-style-guide.md` §6.
- No score validated against a variable used to construct it.
- Leading zeros / GEOID-as-string preserved everywhere (no new geography-ID handling is introduced by this redesign).
- Core functionality must keep working without paid API keys, and with `@vercel/analytics`/`@vercel/speed-insights` blocked (both are already unconditionally safe no-ops per the prior Analytics commit — reverified in §11).
- Accessibility is a release gate: the existing zero-serious/critical-violation baseline (`e2e/accessibility.spec.ts`) must still read zero after every commit, not just at the end.

## 3. Research summary

Full architecture inventory (routes, shared `packages/ui` components, map/chart implementation, query/state patterns, exports) was gathered via direct codebase inspection and is treated as ground truth for §7–§9 below rather than repeated in full here. Key facts that shape this redesign:

- **No charting library exists** (`recharts`/`d3`/`visx` are absent from both `apps/web/package.json` and `packages/ui/package.json`). `PercentileBar` is the one reusable data-visualization primitive; `DomainDisclosure` (in `apps/web/app/explore/geography-detail.tsx`) is the existing "driver breakdown" pattern (per-domain `<details>` + nested `PercentileBar` per metric + raw value + plain-language definition). This redesign extends `PercentileBar`/`DomainDisclosure` rather than adding a charting dependency — no new heavy dependency is justified by anything in scope here.
- **Selection state is URL-driven only** (`apps/web/app/explore/selection.ts`), no context/localStorage for selection — this is what makes state shareable and is preserved as-is.
- **The score-decomposition and uncertainty disclosure pattern is already strong**: live-verified on Explore for tract `06085503112` — score, `StabilityBadge` ("Robust"), data coverage, a likely-range interval, countywide rank with a range, "chance it's in the top 10%," and the full non-causal disclosure sentence all appear together in one view, with a "What's driving this score" section decomposing into five domains. This redesign's job on Explore is legend/color and mobile layout order (§9.2), not rebuilding this panel.
- **Live-verified defects, not assumptions:**
  1. Overview's "7"/"16" cards (§4).
  2. The map's color scale is a monochrome single-hue teal ramp (`MAP_SEQUENTIAL_SCALE`, `packages/ui/src/tokens.ts:22-30`) with a legend correctly labeled "Lower ↔ Higher" but no color distinction between "elevated" and "extreme" concern — verified live on `/explore` (San José, tract 5031.12).
  3. On mobile (375px), the Explore page renders the full-height map **before** the "Find a place" search box, pushing the actual primary interaction below a large empty-looking map — verified live.
  4. Prioritize's ranked-results table renders all 408 rows into the DOM at once with no pagination, virtualization, or default filtering — verified live (full text dump of all 408 rows returned in a single page read).
  5. Utilization's facility table is wide enough to clip a column ("Trauma...") at 1280px without an obvious horizontal-scroll affordance — verified live at desktop width.

## 4. The Overview "7" / "16" defect — root cause and fix

**Current code** (`apps/web/app/overview-snapshot.tsx:44-48`):
```ts
const scored = scores.filter((s) => s.score !== null);
const highConcernCount = scored.filter((s) => (s.score ?? 0) >= HIGH_CONCERN_THRESHOLD).length; // 7
const dataLimitedCount = scored.filter((s) => s.stability_label === "Data-limited").length;       // 0
const robustCount = scored.filter((s) => s.stability_label === "Robust").length;                  // 16
```
Both `highConcernCount` and `robustCount` independently filter the same 408-tract `scored` array. The UI copy directly under "16" reads "**of those rankings** are stable across tested assumptions" (`overview-snapshot.tsx:59`) — "those" unambiguously refers back to the 7 high-concern tracts from the card to its left, implying `robustCount` is a subset of `highConcernCount` and therefore `robustCount ≤ highConcernCount`. It never is, because the filters are independent: "16" is how many of all 408 tracts (at every score level) are `Robust`, not how many of the 7 high-concern tracts are.

**Verified against the live warehouse this session:** 408/408 tracts scored, 7 with score ≥ 75, 16 `Robust` tracts countywide, and — critically — the intersection of the two sets is exactly 7 (all 7 high-concern tracts are themselves `Robust`). The card's intended meaning ("of the high-concern tracts, how many hold up under stress-testing") has a true value of **7 of 7**, not 16.

**Fix (implemented in commit 2, §12):**
- Compute `robustHighConcernCount = highConcernScores.filter(s => s.stability_label === "Robust").length` from the already-filtered high-concern subset, not from `scored`.
- Rewrite the card as "**7 of 7** high-concern tracts have rankings that hold up across tested assumptions" (exact wording finalized against `content-style-guide.md` §5's stability-label phrasing) so the sentence is self-contained and no longer needs "those" to carry the subset relationship.
- Add a fourth, separate fact only if there is a genuine reason to show "Robust across all 408 tracts" as its own number — decided against: it doesn't answer a Discover-stage question ("where's the concern, and can I trust it") and would just be a second unexplained number. `dataLimitedCount` (currently 0) stays as the third card since it answers a real question ("where does low data quality limit confidence") over the correct universe (all 408, not just high-concern).
- Denominator made explicit in the source line, which already reads "{scored.length} of 408 tracts scored" — kept, and the per-card copy now names its own universe ("of the high-concern tracts" vs. the existing "tracts where data gaps limit confidence" which is already correctly countywide).

## 5. 30-second comprehension objective

Every primary page must let a first-time reader answer, without training: what is this page for; what am I looking at; is the number good or bad and how sure is that; what would I do next; where did this come from; what's uncertain here; how do I get back to where I was. This governs the per-page requirements in §9 — each page's content requirements below are the concrete implementation of this test, not a restatement of it.

## 6. Color system for concern

### 6.1 The change, and the decision it reverses

`packages/ui/src/tokens.ts` and `docs/design/design-system.md` currently encode a deliberate rule: the map's sequential scale is single-hue teal, never red/green, because ("a red '90th percentile' implies a fire alarm, not a screening signal" — `design-system.md:68`). This redesign replaces that single-hue scale with an explicit five-stop **concern gradient** (dark red/red-orange → orange → warm neutral → muted teal/green → gray/hatching for missing data), matching this task's explicit specification.

This is recorded as **DEC-072** in `DECISIONS.md` (added alongside this document) rather than silently overwritten, because it reverses a previously-reasoned decision. The resolution: the original concern (a bare red number reading as an "alarm" rather than a "screening signal") is addressed by *keeping every other guardrail in place* — the non-causal disclosure sentence still appears in the same view as every score (§3, unchanged), the legend is explicitly labeled "Higher concern / Lower concern" (never "danger," "critical," or "alarm"), color is never the only cue (every colored element pairs with a visible number, rank, or text badge), and the reddest end of the scale is reserved exclusively for this one "combined concern" legend — it is not reused as a generic emphasis color elsewhere in the product (the pre-existing `--color-alert` red used for system/data-freshness alerts on Validate remains a visually distinct, separately-named token, not merged with the new concern-scale red).

### 6.2 Token design

New tokens added to `apps/web/app/globals.css` and mirrored in `packages/ui/src/tokens.ts` (replacing `MAP_SEQUENTIAL_SCALE`/`MAP_NO_DATA_COLOR`, keeping the same call sites):

```
--concern-scale-1: #1a5c4a   /* lowest concern — muted teal/green */
--concern-scale-2: #6a9b7f   /* low-moderate */
--concern-scale-3: #d8cfa8   /* warm neutral midpoint */
--concern-scale-4: #e08f3c   /* elevated — orange */
--concern-scale-5: #c0392b   /* highest concern — dark red/red-orange */
--concern-no-data: #d9d4cc   /* gray, matches --color-border; hatched pattern in map fill, not a flat color alone */
```
Five stops (not seven) — a five-stop scale keeps each named region ("lowest," "low-moderate," "moderate," "elevated," "highest") individually distinguishable at normal map zoom, where the prior seven-stop teal ramp already required close inspection to tell adjacent stops apart; verified for pairwise contrast and simulated deuteranopia/protanopia/tritanopia distinguishability before use (§11, part of the accessibility gate, not assumed safe because it "looks" colorblind-considerate).

Missing-data tracts get the existing `--concern-no-data` gray **plus** a diagonal-hatch fill pattern in the MapLibre paint expression (a `fill-pattern` referencing a small generated hatch tile, or a `fill-opacity`/second outline-layer approximation if MapLibre's data-driven pattern support proves awkward — exact technique decided during implementation and verified visually) so a missing tract is never one shade lighter than "lowest concern" — it must be structurally, not just chromatically, distinct, matching the requirement that missing data never resemble low concern.

Every legend (`MapLegend` in `explore-map.tsx`, plus any new metric-card legend) is rebuilt to literally show the words "Higher concern" and "Lower concern" at the two ends (the existing map legend already does this — kept), and the no-data swatch keeps its own explicit "No score for this scenario" label (already present — kept).

### 6.3 Where this scale does and doesn't apply

Applies to: the Explore map choropleth, any place-level "combined concern" indicator reused from it (e.g., a future compact map thumbnail), and the Overview snapshot's implicit color coding if added. Does **not** apply to: `StabilityBadge` (stays its existing 4-tone system — stability is a different axis of meaning from concern level and must not be visually conflated with it), `FreshnessBadge`/`DataModeBadge` (data-quality axis, unchanged), or `--color-alert` (system/data-integrity alerts, unchanged, kept visually distinct from the new concern red by hue and by never appearing on the same surface in a way that could be confused).

## 7. Shared component vocabulary

Mapped against the existing `packages/ui` inventory (§3) rather than rebuilt from scratch:

| Requested concept | Resolution |
|---|---|
| PageIntroduction | New thin wrapper (`packages/ui/src/PageIntro.tsx`) standardizing the h1 + one-sentence purpose + optional plain-language definition slot every page already hand-rolls slightly differently. |
| PlainLanguageDefinition | New — a small `<details>`-free inline component pairing a term with a one-sentence definition, used beside metric labels (e.g., "Combined concern score" on Explore). |
| MetricCard | Extends the existing `SnapshotFact` pattern (`overview-snapshot.tsx`) into a shared `packages/ui/src/MetricCard.tsx` (value, label, detail, optional trend/comparison slot) so Overview, Access Lab, and Validate's summary cards stop each hand-rolling the same card shape. |
| MetricDirectionLabel | New small helper — renders "higher = more concern" / "higher = better" next to any metric so directionality is never left implicit. |
| EquityStatusBadge | Realized as the existing `Badge`/`StabilityBadge` with the new concern-scale tone applied where a badge (not a map) needs to show concern level — no new badge component, a new `tone` option on the existing one. |
| ConfidenceBadge | `StabilityBadge` already is this — kept, not duplicated. |
| DataFreshnessBadge | `FreshnessBadge` already is this — kept. |
| MapLegend | Existing `MapLegend()` in `explore-map.tsx`, rebuilt for the new concern scale (§6). |
| MapHoverCard | Existing hover-info floating card in `explore-map.tsx` — content tightened per §9.2, not rebuilt. |
| SelectedGeographyPanel | Existing geography-detail panel (`geography-detail.tsx`) — already strong (§3), layout order adjusted for mobile only. |
| DriverBarList / DriverExplanation | Existing `DomainDisclosure` — extended with a one-line plain-language explanation per domain, not rebuilt. |
| RankContext | New small component: "#1 of 408, county-relative" phrasing standardized once and reused (Explore, Prioritize, Overview recommendations currently each phrase this slightly differently). |
| ComparisonDelta | New — a small "+12 vs. county median" style component for Explore's comparison panel and Prioritize's compare panel, which currently show raw numbers side by side without a computed delta. |
| EmptyState / LoadingState | Existing `EmptyState`/`Skeleton`/`LoadingRegion` — kept. |
| BackendWakeState | New — `packages/ui/src/BackendWakeState.tsx`. Distinct from a generic loading spinner: renders only after a configurable delay threshold (proposed 4s) elapses on a still-pending first query, shows "The data service is waking up. The first load may take up to a couple of minutes; later pages should be faster." with a `Retry` action, never a fixed countdown or precise ETA. Wired into the shared query-error/loading pattern used across pages (§9), not hand-added per page. |
| ErrorState | Existing `ErrorState` — kept. |
| EvidenceSourceList | Existing evidence-drawer content in `geography-detail.tsx` — presentation tightened, not rebuilt. |
| HowCalculatedDisclosure | New thin `<details>` wrapper standardizing the "How is this calculated?" pattern that currently appears with slightly different markup in 2–3 places. |
| GuidedNextStep | New — small "what to do next" callout used at the bottom of Explore/Prioritize/Access Lab result views, pointing toward Advocate/Copilot/Compare, replacing ad hoc single links with a consistent pattern. |
| LayerControl / FilterControl | Not introduced as new abstractions — the map has no multi-layer concept to control (§3) and no scope item in this redesign adds one; Explore's existing scenario-select `<select>` already serves the one "filter" the page has. |
| MobileBottomSheet | New — used only where §9 calls for it (Explore's mobile map-selection flow), built on the existing `Dialog`'s `variant="side"` sizing logic extended for a bottom anchor, not a new interaction paradigm. |
| ContextualHelp | Realized via `Tooltip` (existing) plus `PlainLanguageDefinition` (new, above) — no separate component. |
| GlossaryTerm | New — small inline component wrapping a term with a `Tooltip` definition, backed by one shared glossary data file (`apps/web/lib/glossary.ts`) so a term's definition is written once and reused everywhere it appears, rather than redefined per page. |

Net new components: `PageIntro`, `PlainLanguageDefinition`, `MetricCard`, `MetricDirectionLabel`, `RankContext`, `ComparisonDelta`, `BackendWakeState`, `HowCalculatedDisclosure`, `GuidedNextStep`, `MobileBottomSheet`, `GlossaryTerm` — eleven, all thin compositions of existing primitives (`Card`, `Badge`, `Tooltip`, `Dialog`, existing tokens), no new runtime dependency.

## 8. Global UX requirements (cross-page)

- Progressive disclosure: plain-language conclusion first, `<details>`/evidence-drawer for depth — already the dominant pattern (§3); this redesign's job is consistency (`HowCalculatedDisclosure`) not invention.
- Selected-geography state stays URL-driven (`selection.ts`, unchanged) and is what "shareable/bookmarkable" already depends on — preserved exactly.
- `BackendWakeState` (§7) replaces bare `Skeleton` as the loading state specifically for first-load queries that can plausibly hit a cold Render free-tier start; it does not replace `Skeleton` for genuinely fast, already-warm subsequent queries.
- Minimal animation; `prefers-reduced-motion` already handled globally (`globals.css:118-128`) — any new transition (e.g., `MobileBottomSheet`'s slide-in) must respect it, verified not assumed.
- No hardcoded point-in-time values: the 7/16 fix (§4), any rank, year, or build ID shown anywhere continues to be read live from the API response object in scope at render time — this redesign adds no new hardcoded figure anywhere, and the a11y/visual-review pass (§11) includes a grep-based check for suspicious literals (`77`, `408`, `2026`, etc.) in any file touched.
- Prioritize's 408-row table (§3 point 4): default view becomes the current top 25 by rank (already sorted) with an explicit "Show all 408" control and/or `DataTable`'s existing sort controls left in place — full data remains reachable and exportable exactly as today, only the default render is lighter. This is a real, verified density problem, not a stylistic preference.

## 9. Page-by-page plan

### 9.1 Overview
Fix §4's card computation and copy. `CountywideSnapshot` and `PrioritySnapshot` migrate to `MetricCard`/`RankContext` respectively (visual output equivalent, shared component underneath). No other structural change — the page's task-entry-card + snapshot + recommendations + freshness + "how to read this" structure already matches the Discover-stage job well.

### 9.2 Explore
- Map recolored to the concern scale (§6); legend rebuilt with explicit "Higher/Lower concern" labels (already present) plus the new no-data hatch swatch.
- Mobile layout order fixed: "Find a place" search moves above the map in the DOM/visual order below `1024px` (the `responsive.spec.ts` tablet-portrait/mobile breakpoints), so the primary interaction isn't buried under a tall empty map — implemented as a CSS order change (`order` utility or source reordering in `explore-client.tsx`), not a new component.
- `MapHoverCard` content reviewed for the same plain-language/disclosure rules as the full detail panel (currently minimal — kept minimal, verified it doesn't imply more precision than the full panel).
- `GuidedNextStep` added at the bottom of a selected-geography's detail panel (currently ends at "Use in Advocate" with no path toward Copilot or Compare mentioned there).

### 9.3 Prioritize
Default-to-top-25 table view (§8), `RankContext`/`ComparisonDelta` applied to the compare panel, "Show drivers" rows reviewed against `DomainDisclosure` for consistency. Weight sliders and export/print flow are unchanged (no verified defect found).

### 9.4 Access Lab
Empty state already strong (§3, screenshot-verified). `PlainLanguageDefinition` added beside "modeled estimates" (already bolded in intro text but not linked to a fuller explanation) and beside the walking/driving toggle. No structural change to the four-tab layout (Access summary / Resource browser / Resource gaps / Mobile-service scenarios), which already matches a reasonable Understand→Prioritize path.

### 9.5 Utilization
Facility table's horizontal-scroll affordance made explicit (a visible scroll shadow/indicator, or the table wrapped to make clipping obviously scrollable rather than looking cut off) — the verified desktop-width clipping issue (§3 point 5). Geographic/Trends tabs reviewed for the same `MetricCard`/`RankContext` consistency pass, no data or query change.

### 9.6 Validate
Already a strong "for anyone checking this platform's work" page with plain-language-first tab content (§3, screenshot-verified) and an existing good use of status-color semantics (green/amber/red counts) that predates and is compatible with §6's new concern scale (this page's colors represent data-freshness status, not geographic concern — kept as `--color-success`/`--color-caution`/`--color-alert`, not migrated to the new concern tokens, since they answer a different question). `MetricCard` applied for visual consistency only.

### 9.7 Advocate
`GlossaryTerm`/`PlainLanguageDefinition` pass over the workspace-toolbar and evidence-review copy. No change to the local-only IndexedDB persistence model, export formats, or print layout (all functioning, no verified defect).

### 9.8 Copilot
`BackendWakeState` applies here specifically — a Copilot request is the platform's most latency-sensitive first-load path. "Deterministic mode" badge and guided-template dropdown are functioning well as-is (§3 screenshot); no structural change.

### 9.9 Data
No structural change — this page's job (raw transparency into real tables) is explicitly the one place technical detail belongs as primary content (`content-style-guide.md` §4), and the live source-catalog table already reads directly from the real catalog/warehouse. Horizontal-scroll review applied the same as Utilization (§9.5) since the sources table is similarly wide.

## 10. Language and scientific rules

No change to `content-style-guide.md`'s existing rules (§6 non-causal framing, §5 stability-label pairing, §7 freshness labels) — this redesign is required to comply with them, not rewrite them. The one addition: §4's corrected Overview copy and any new component's default copy (`GuidedNextStep`, `RankContext`, `MetricDirectionLabel`) are written against the same style guide and reviewed against its "core rule" checklist (§1: no internal identifiers, no phase numbers, no doc-section references) before landing.

## 11. Testing and visual verification plan

- Existing unit/e2e/axe/responsive suites re-run after every commit (not just at the end) — a regression introduced by this redesign must be caught immediately, not accumulated.
- New unit test for the Overview fix: `apps/web/test/overview-snapshot.test.tsx` asserting the high-concern/robust-subset computation against a fixture where the naive (pre-fix) computation would have produced a different, wrong number — a true regression test, not just a snapshot.
- Color-scale accessibility: contrast ratios for text-on-swatch and swatch-vs-swatch distinguishability checked (WCAG 2.2, matching the existing project standard already applied to every other token), plus a colorblind-simulation pass (deuteranopia/protanopia/tritanopia) on the map legend and a representative choropleth screenshot — real images generated and inspected, not assumed safe because the palette "looks" considerate.
- Real Playwright screenshots captured at the required breakpoints (1440/1280/1024/768/390/320, matching `responsive.spec.ts`'s existing set) for every page touched, before/after where a visual change was made, assembled into `docs/design/health-equity-ux-visual-review.md` with inline images/descriptions and an explicit pass/fail note per breakpoint per page — this document does not exist yet and is produced during commit 5, from real captured screenshots, not written from memory of what the change "should" look like.
- Analytics-blocked functional check: reload each redesigned page with `@vercel/analytics`/`@vercel/speed-insights` network requests blocked (already unconditionally safe per the prior Analytics commit) and confirm no console error and full functionality — spot-checked, not assumed.
- Bundle-size delta measured via `next build` output before/after (no new runtime dependency is introduced, so the expected delta is small; measured, not assumed).

## 12. Implementation plan (5 commits)

1. **Health-equity UX system + shared components** — new tokens (§6.2), DEC-072 recorded, the eleven new shared components (§7) built and unit-tested in isolation, no page wiring yet.
2. **Overview + Explore redesign** — §4's fix, §9.1, §9.2 (map recolor, legend, mobile order fix, `GuidedNextStep`).
3. **Prioritize, Access Lab, Utilization** — §9.3, §9.4, §9.5.
4. **Validate, Advocate, Copilot, Data** — §9.6–§9.9.
5. **Accessibility, responsive, and visual verification** — §11 in full, `docs/design/health-equity-ux-visual-review.md` produced, any defect found during this pass fixed before the branch is considered done.

No push, no deploy at any point in this sequence. Each commit is independently buildable and independently gated by the full existing test suite plus whatever this redesign adds.
