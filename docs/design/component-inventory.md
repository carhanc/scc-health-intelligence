# Component inventory

Every component in `packages/ui/src/` (the shared design system, exported from `packages/ui/index.ts`) plus the key page-level composite components in `apps/web/app/`. For each: purpose, props, the ARIA/keyboard pattern it implements, and known anti-patterns to avoid. Companion to `docs/design/design-system.md` (tokens and cross-cutting rules) and `docs/design/content-style-guide.md` (writing rules).

Marked **(not yet wired up)** where a component exists and is tested but has no current call site in the app — built ahead of a feature that will need it, not a placeholder.

---

## `packages/ui` — shared components

### `Button`
`{ variant?: "primary" | "secondary" | "ghost" | "danger"; size?: "sm" | "md" } & ButtonHTMLAttributes`

The only button primitive in the app — every clickable action (Search, Compare, Retry, Clear selection, dialog Close, view-source triggers) renders through this, never a bare styled `<button>`. `disabled` is the real HTML attribute, not a click-blocked-looking-enabled button. **Anti-pattern:** inventing a one-off button style with local Tailwind classes instead of adding a variant here.

### `Badge` and its domain-specific helpers
`Badge`: `{ tone?: "neutral" | "interactive" | "caution" | "alert" | "success"; dot?: boolean; title?: string; children }`

The single pill primitive behind every status/source/uncertainty/scenario/freshness/stability indicator. The dot is decorative — meaning is always in the text, never color alone.

- `StabilityBadge({ label })` — maps the four canonical stability labels to a tone and a `title` tooltip explaining what the label means in plain language (see design-system.md §11 for the exact wording). Used in the tract score panel and the Overview priority snapshot.
- `FreshnessBadge({ state })` — maps six freshness states (`unavailable`, `draft`, `intentional_older`, `newest_verified`, `lagged`, `stale`) to a plain-language label and tone. Used on the Data page and Overview's freshness summary.
- `DataModeBadge({ mode: "live" | "demo" | "unavailable" })` — used next to every geography search result and profile so the user always knows whether they're looking at live or demo data.

**Anti-pattern:** conveying status by color/dot alone without a text label — every use of `Badge` in this codebase has visible text, and this must stay true for any new use.

### `Skeleton` / `SkeletonText` / `LoadingRegion`
`Skeleton({ className })`, `SkeletonText({ lines?, className? })`, `LoadingRegion({ label, children })`.

Loading placeholders that preserve layout (never a spinner that collapses the page). The skeleton bars themselves are `aria-hidden`; `LoadingRegion` (`role="status" aria-live="polite"`) is the thing that actually announces to screen readers, once, not once per bar — always wrap a loading skeleton block in `LoadingRegion`, never leave the bars unwrapped.

### `EmptyState` / `ErrorState`
Built on a shared internal `StateMessageBase`. `{ title: string; description: ReactNode; action?: {label, onClick}; secondaryAction?: {label, href} | {label, onClick}; icon? }`.

- `EmptyState` — `role="status"`, neutral tone. Explains why nothing is shown and what the user can do next.
- `ErrorState` — `role="alert"`, alert tone (red left accent). Always paired with a `Retry` action and, where relevant, a `Clear selection` action. Technical detail belongs behind a `<details>` disclosure inside `description`, never as the primary message.

`description` renders inside a `<div>`, not a `<p>` — deliberately, so callers can nest block-level content (like a `<details>` element) without triggering invalid-HTML hydration errors, a real bug found and fixed during Phase 5 closeout. **Anti-pattern:** putting a raw error message or HTTP status as the primary `title`/`description` text.

### `Card`
`{ children; className?; as?: "div" | "section" | "article" }`

Used sparingly by design — a plain section with spacing is preferred; reach for `Card` only when content is genuinely a distinct object (not every paragraph needs a card wrapper). **Anti-pattern:** wrapping every piece of content in a `Card`, producing the "wall of cards" look the product charter explicitly warns against.

### `Tabs` / `TabPanel` **(not yet wired up)**
`Tabs({ items: {id,label,badge?}[], activeId, onChange, label })`, `TabPanel({ id, activeId, children })`.

Full WAI-ARIA tabs pattern: roving tabindex (one tab in the Tab order), Left/Right/Home/End move the active tab, `aria-selected`/`aria-controls` wired correctly. Built for a future multi-tab detail view; the current tract detail panel uses native `<details>` disclosures instead (simpler, and keyboard/screen-reader support comes free from the browser). Component and its test suite (`apps/web/test/ui/tabs.test.tsx`) are ready whenever a tabbed layout is needed.

### `SegmentedControl`
`SegmentedControl<T>({ options: {value,label}[], value, onChange, label })`

The Map/Table view switcher. Full WAI-ARIA **radiogroup** pattern: exactly one option in the Tab order at a time, Left/Right/Up/Down/Home/End move the selection and immediately change it (radios don't require a separate "activate" step). **Rebuilt during Phase 5 closeout** — the original version made every option independently tabbable with no arrow-key handling, which is not what a `role="radiogroup"` announcement leads a keyboard or screen-reader user to expect. Verified in `apps/web/e2e/accessibility.spec.ts`. **Anti-pattern:** using this for more than ~4 options, or for options that aren't truly mutually exclusive (use `Tabs` or a `<select>` instead).

### `Breadcrumbs` **(not yet wired up)**
`Breadcrumbs({ items: {label, href?}[] })`

`nav aria-label="Breadcrumb"` with the current page marked `aria-current="page"`. Built ahead of a deeper page hierarchy (e.g. Access Lab or Copilot in a later phase); Overview and Explore are both one level deep, so no page currently needs it.

### `PercentileBar`
`{ percentile: number | null; comparePercentile?: number | null; label: string; compareLabel?: string }`

A 0-100 percentile bar with a primary marker and an optional comparison marker. **Never renders without a full text `aria-label` description** — the component has no way to be used percentile-only; the accessible name always states the label and the percentile in words, so the bar is never the sole carrier of meaning. When `percentile` is `null`, it renders a flat neutral track labeled "no percentile available" — never a bar at position 0, which would misrepresent a missing value as a real low one.

### `Dialog`
`{ open, onClose, title, children, variant?: "side" | "center" }`

Built on the native `<dialog>` element — real focus trap and Escape-to-close from the browser, no hand-rolled focus-trap logic to get wrong. `variant="side"` renders a right-anchored drawer (used for the evidence disclosure); `variant="center"` renders a centered modal. The title/`aria-labelledby` pairing uses `useId()` so multiple `Dialog` instances on the same page never collide — **fixed during Phase 5 closeout** after a hardcoded `id="dialog-title"` broke label association the moment a second dialog existed in the DOM. The scrollable content region has `tabIndex={0}` so it's directly keyboard-scrollable even with no focusable children inside it (another Phase 5 closeout fix, found by automated axe-core scanning). **Anti-pattern:** building a custom modal/backdrop instead of using this — the native `<dialog>` gives you correctness for free that a hand-rolled version is easy to get subtly wrong.

### `DataTable`
`DataTable<T>({ data, columns, caption, emptyMessage?, initialSorting?, onRowSelect?, getRowId?, selectedRowId? })`

A fully keyboard-accessible, sortable table built on `@tanstack/react-table`. Column headers are real `<button>` elements with `aria-sort`, so sort state is keyboard- and screen-reader-operable, not click-only. When `onRowSelect` is provided, rows are individually focusable (`tabIndex={0}`) with Enter/Space activating selection and a visible focus ring — this is the accessible alternative to a mouse-only clickable row, and it's what makes the Explore map's table view a genuine substitute for the map, not just a data dump. **Anti-pattern:** rendering a raw HTML table for tabular data with more than a handful of rows, or making rows clickable without also making them keyboard-operable.

### `Tooltip`
`{ label: string; children }`

Shows on hover **and** keyboard focus — never hover-only, since a keyboard-only or touch user must be able to reach the same information. Reserved for brief clarifications; anything essential must already be visible as text somewhere, never solely inside a tooltip (docs/01 §2's explicit anti-pattern).

### Tokens (`tokens.ts`)
`CHART_PALETTE` (6-color Okabe-Ito qualitative palette), `MAP_SEQUENTIAL_SCALE` (7-step single-hue teal scale), `MAP_NO_DATA_COLOR`, `COLOR` (literal hex mirror of the CSS custom properties), `scoreColorExpression()` (builds a MapLibre GL `interpolate` paint expression from the sequential scale). Exist because MapLibre style expressions and any future canvas/SVG chart need literal color values, not CSS variables — see design-system.md §4 for the "must be kept in sync by hand" caveat.

---

## App-level composite components (`apps/web/app/`)

These aren't in `packages/ui` (they're specific to one page's data, not generic/reusable), but are the main building blocks of Overview and Explore.

### `AppShell` (`app-shell.tsx`)
Persistent left sidebar at `lg` (1024px) and above; a hamburger-triggered off-canvas drawer below it. Renders the skip-to-content link (the first Tab stop on every page) and the 9-item primary navigation (`nav-items.ts`), marking the current page with `aria-current="page"` and unbuilt destinations with a visible "Soon" badge (never a broken link or silent 404).

### `ComingSoonPage` (`coming-soon.tsx`)
The shared shell for the 6 not-yet-built nav destinations (Prioritize, Access Lab, Utilization, Validate, Advocate, Copilot). States plainly what the page will do and links back to Explore/Overview. Deliberately never shows an internal build-phase number to the reader — `phase` is accepted as a prop for internal roadmap bookkeeping only and is not rendered.

### `CountywideSnapshot` / `PrioritySnapshot` / `FreshnessSummary` (`overview-snapshot.tsx`)
The three live-data blocks on Overview. Each fetches already-finalized numbers from the API (`getScenarioScores`, `getRecommendations`, `getSources`) and only performs simple client-side counting over them — no scoring or percentile math happens in the frontend, matching the "frontend never re-derives analytics" rule (DEC-030).

### `SearchPanel` (`explore/search-panel.tsx`)
Geography search box + results list. Uses `useId()` for its input's `id`/`label` association (fixed during Phase 5 closeout after a hardcoded id broke the second `SearchPanel` instance the comparison panel renders). Disables a result button if its identifier fails validation rather than letting a malformed selection through.

### `ExploreMap` (`explore/explore-map.tsx`)
The MapLibre choropleth. No external basemap tiles (DEC-040) — only this platform's own tract polygons and, when a place/district/ZCTA/county is selected, a dashed outline of that area fetched from the boundary endpoint and panned/zoomed to (added during Phase 5 closeout to fix a real usability gap: a user could find a city by name but had no way to see where it was). Hover shows a decorative, `aria-hidden` popup; the map itself is not required to be feature-by-feature keyboard operable because `ExploreTable` is the accessible alternative carrying identical data.

### `ExploreTable` (`explore/explore-table.tsx`)
The `DataTable` instantiation for all 408 tracts, same data source as the map, so the two views never disagree.

### `GeographyDetail` / `TractDetail` / `PlaceDetail` / `DistrictDetail` (`explore/geography-detail.tsx`)
Routes to the right detail view by geography type. `TractDetail` is the main one: plain-language summary, score card with uncertainty/rank/stability, per-domain `<details>` disclosures (raw value, percentile via `PercentileBar`, plain-language definition, limitation), and the evidence `Dialog`. `GeographyLoadError` is the shared truthful-error pattern (plain message, `Retry`, `Clear selection`, technical detail behind a disclosure).

### `ComparisonPanel` (`explore/comparison-panel.tsx`)
Tract-vs-tract comparison. Rendered as a `<section aria-labelledby>` landmark (not a bare `<div>`) so it's independently reachable/testable and announced correctly by assistive technology — added during Phase 5 closeout.

### `selection.ts` (`explore/selection.ts`)
Not a component — the canonical `SelectedGeography` model and validation functions (`isValidGeographyId`, `parseSelectedGeographyFromParams`) used by every selection entry point (map, table, search, comparison, URL state). See `DECISIONS.md` DEC-041 for why this exists: a prior bug let a mismatched callback signature silently substitute the literal string `"tract"` for a real GEOID. Any new selection entry point must construct one of these, never a bespoke shape.

### `labels.ts` (`lib/labels.ts`)
Not a component — `domainLabel()` converts a raw domain key (e.g. `workforce_shortage`) to its plain-language form (e.g. "Workforce shortage"), with a safe humanizing fallback for any future domain not yet in the lookup table. Added during Phase 5 closeout after automated review found raw snake_case domain keys rendering directly in the UI.
