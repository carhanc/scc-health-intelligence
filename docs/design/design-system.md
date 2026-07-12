# Design system

Documents the design system as it actually exists in this codebase after Phase 5 — `apps/web/app/globals.css` (tokens), `packages/ui/src/*` (components), and the page-level composition in `apps/web/app/`. This is not aspirational: every value and pattern below is implemented and covered by at least one automated test (`apps/web/test/`, `apps/web/e2e/`).

Companion documents: `docs/design/component-inventory.md` (per-component API and usage rules), `docs/design/content-style-guide.md` (writing rules), `docs/design/usability-testing.md` (task-level verification evidence), `docs/design/information-architecture.md` and `user-flows.md` (Phase 0 IA groundwork).

## 1. Typography

- Font: Inter, loaded via `next/font/google` as `--font-sans`, falling back to `system-ui, sans-serif`.
- No separate type-scale token file — sizes come directly from Tailwind's default scale (`text-xs` through `text-3xl`), used consistently by role:
  - `text-3xl`/`text-2xl` — page `<h1>` (responsive: `text-2xl sm:text-3xl` on Explore/Data, `text-3xl sm:text-4xl` on Overview's hero).
  - `text-lg` — section `<h2>`/card `<h3>` headings, tract-name headings.
  - `text-sm` — default body copy, form labels, button text.
  - `text-xs` — secondary/meta text (source lines, limitations, badges' inner text).
  - `text-3xl tabular-nums` — the one large numeral treatment, reserved for the primary score display.
- **Tabular numerals everywhere a number appears in a table or comparison** (`globals.css` applies `font-variant-numeric: tabular-nums` to every `<table>` and to any element with the `.tabular-nums` class), so digits align vertically in the DataTable, score displays, and side-by-side comparisons.

## 2. Spacing and layout

- Spacing uses Tailwind's default scale directly (`gap-1.5`, `p-4`, `mt-3`, etc.) — no custom spacing tokens. Convention: `space-y-*`/`gap-*` for repeated vertical rhythm inside a section, explicit `mt-*` for spacing between named sections.
- Page shell padding: `px-4 py-6 sm:px-6 lg:px-10 lg:py-8` on every top-level page (Overview, Explore, Data, and all "coming soon" shells) — one consistent horizontal/vertical rhythm across the whole app.
- `--container-max: 1440px` bounds the widest content width (matches the largest required responsive breakpoint).
- `--nav-width: 15rem` (240px) — the desktop sidebar's fixed width.
- Explore's three-region layout (search / map-or-table / detail) is `grid-cols-1` (stacked) below `xl` (1280px) and `grid-cols-[320px_minmax(0,1fr)_380px]` at `xl` and above. **This breakpoint is deliberately `xl`, not the more common `lg`** — the fixed 320px + 380px columns plus gaps do not fit inside the content area once the 240px nav sidebar is subtracted from a 1024px (`lg`) viewport; verified by real horizontal-overflow measurement in `apps/web/e2e/responsive.spec.ts`; see `docs/design/usability-testing.md`'s "additional issues found" section for the discovery.

## 3. Breakpoints

Standard Tailwind breakpoints (`sm` 640px, `md` 768px, `lg` 1024px, `xl` 1280px), used deliberately rather than reflexively:

| Breakpoint | Used for |
|---|---|
| `lg` (1024px) | App shell switches from mobile drawer navigation to the persistent desktop sidebar. |
| `xl` (1280px) | Explore's three-column layout activates (see §2 for why not `lg`). |
| `sm` (640px) | Minor heading-size and padding bumps only. |

Verified at the six widths required by the release gate: 1440, 1280, 1024, 768, 390, 320 — each checked for zero page-level horizontal overflow and full workflow completion (search, select, view/switch, compare, evidence), not merely "does it stack" (`apps/web/e2e/responsive.spec.ts`).

## 4. Color tokens

All colors are CSS custom properties on `:root` (`apps/web/app/globals.css`), mirrored as literal hex strings in `packages/ui/src/tokens.ts` (`COLOR`, `CHART_PALETTE`, `MAP_SEQUENTIAL_SCALE`, `MAP_NO_DATA_COLOR`) for contexts that cannot consume a CSS variable — MapLibre GL style expressions and any future canvas/SVG chart rendering. **The two files must be kept in sync by hand**; each has a comment pointing at the other.

### Surfaces
| Token | Value | Use |
|---|---|---|
| `--color-background` | `#faf9f7` | Page background (warm off-white, not stark white). |
| `--color-surface` | `#ffffff` | Cards, panels, drawers. |
| `--color-surface-raised` | `#ffffff` | Modals/popovers — distinguished from `--color-surface` by shadow, never by a different fill. |
| `--color-surface-sunken` | `#f2efe9` | Nested/inset areas: table row stripes, code/citation blocks, the freshness-summary box on Overview. |

### Text
| Token | Value | Contrast | Use |
|---|---|---|---|
| `--color-text-primary` | `#1e2933` | 13.6:1 on background | Body copy, headings. |
| `--color-text-secondary` | `#4b5a67` | 7.2:1 | Supporting text, form labels. |
| `--color-text-tertiary` | `#5c6874` | ≥4.88:1 against every surface in the app, including tinted ones | De-emphasized meta: timestamps, IDs, footer disclaimers, "Soon" nav badges. **Was `#6b7885`** (4.29:1 against the page background, 3.86:1 against the tinted "current page" nav background) — failed WCAG AA; found by automated axe-core scanning during Phase 5 closeout and corrected. Any future tertiary-text use must re-check contrast against the specific background it sits on, not assume white. |
| `--color-text-on-interactive` | `#ffffff` | — | Text on a filled interactive-colored background (primary buttons). |

### Borders
`--color-border` (`#d9d4cc`, default hairline), `--color-border-strong` (`#b8b0a2`, table rules and active dividers).

### Interactive (teal)
`--color-interactive` (`#0b6e75`), `--color-interactive-hover` (`#085158`), `--color-interactive-subtle` (`#e3f0f0`, selected-row/hover-fill background), `--color-focus-ring` (`#0b6e75`, same hue as interactive — a focus ring should never surprise the eye with an unrelated color).

### Semantic status colors
| Tone | Token(s) | Meaning | Never use for |
|---|---|---|---|
| Caution (amber) | `--color-caution` `#b8720a`, `-subtle` `#fbf0dc`, `-strong` `#7a4c07` | Uncertainty, stale data, assumption-sensitive rankings, demo-mode. | A genuine system failure (use alert). |
| Alert (red) | `--color-alert` `#b3261e`, `-subtle` `#fbe9e8` | Genuine failures only: a source unavailable, an API error, a validation error. | **Never** an ordinary high percentile or high-concern score — a red "90th percentile" implies a fire alarm, not a screening signal. High-concern scores use the map's teal sequential scale (§8) or a neutral badge, never red. |
| Success (green) | `--color-success` `#2f6b3a`, `-subtle` `#e7f2e8` | Used sparingly: an optimizer run that solved OPTIMAL, "Robust" stability, live (non-demo, non-stale) data. | Decorative emphasis — success color implies a real positive determination was made. |
| Neutral | `--color-neutral` `#6b7885`, `-subtle` `#eceae5` | Unavailable, no-data, demo-mode, "not yet built" states. | — |

Color is never the only channel for meaning — every status badge carries text (`Badge`'s `children`), and every status message states the same thing in a sentence somewhere nearby (docs/01 §18's "no essential information conveyed only by color").

## 5. Surface hierarchy

Three levels only, deliberately restrained (avoids the "wall of cards" anti-pattern the product charter warns against):
1. **Page background** (`--color-background`) — the default; most content sits directly on it with no card wrapper.
2. **Surface** (`--color-surface`, white) — used only for content that is genuinely a distinct object: the score summary box, a data table, a dialog, a domain disclosure. Not every paragraph needs a card.
3. **Sunken** (`--color-surface-sunken`) — nested content inside a surface: table stripes, the plain-language summary banner, the freshness box.

Elevation is communicated by shadow (`--shadow-sm/md/lg`), reserved for true overlays (dialogs, drawers, popovers) — never applied to a flat inline card, which would imply it's floating above content it isn't.

## 6. Radius and borders

`--radius-sm` (0.25rem, small controls/focus rings), `--radius-md` (0.5rem, buttons/inputs/badges-as-pills use `rounded-full` instead), `--radius-lg` (0.75rem, cards/dialogs/panels). One hairline border color (`--color-border`) for the vast majority of dividers; `--color-border-strong` reserved for table rules and active/selected dividers where a slightly stronger line aids scanning.

## 7. Focus behavior

A single global focus-visible rule (`globals.css`) applies to every native interactive element (`a`, `button`, `[tabindex]`, `input`, `select`, `textarea`): a 2px solid ring in `--color-focus-ring`, 2px offset, rounded to match the element. Individual components add their own `focus-visible:outline` classes only when they need a tighter offset (e.g. `DataTable` rows use `-outline-offset-2` so the ring sits inside a table cell rather than overlapping the row above).

**Roving tabindex** is used for both composite widgets that behave like a single control with internal options:
- `Tabs` (WAI-ARIA tabs pattern: one tab in the Tab order, Left/Right/Home/End move the active tab).
- `SegmentedControl` (WAI-ARIA radiogroup pattern: one option in the Tab order, Left/Right/Up/Down/Home/End move the selection) — **rebuilt during Phase 5 closeout** after automated testing found every option was independently tabbable with no arrow-key support, the opposite of what a `radiogroup` announcement leads a keyboard/screen-reader user to expect.

**Focus trapping and restoration**: `Dialog` uses the native `<dialog>` element's `showModal()`, which provides a real focus trap and automatically returns focus to the triggering element on close — verified end-to-end in `apps/web/e2e/accessibility.spec.ts` and `explore-errors-and-comparison.spec.ts` (Escape closes the evidence drawer and focus returns to the button that opened it).

**Skip link**: the first Tab stop on every page is "Skip to main content," jumping to `#main-content` (verified in `apps/web/e2e/accessibility.spec.ts`).

## 8. Interaction patterns

- **Loading**: `Skeleton`/`SkeletonText` preserve layout (never a spinner that collapses the page), wrapped in `LoadingRegion` (`role="status" aria-live="polite"`) so screen readers announce the loading state once, not once per skeleton bar.
- **Empty**: `EmptyState` — explains why nothing is shown and what the user can do next (never a bare "no results").
- **Error**: `ErrorState` — a truthful, plain-language primary message, with the raw technical detail behind a `<details>` disclosure, paired with a `Retry` action and (where relevant) a `Clear selection` action. Never shows a stack trace or a raw HTTP status as the primary message.
- **Unavailable/stale/demo**: `DataModeBadge` (live/demo/unavailable) and `FreshnessBadge` (6 states: unavailable, draft, intentional_older, newest_verified, lagged, stale) — always a dot + text label, never color alone.
- **Hover vs. focus**: nothing essential is ever hover-only. `Tooltip` shows on hover *and* keyboard focus. The map's hover popup is `aria-hidden` and decorative-only — the same information (tract name and score) is always available by clicking the tract or from the accessible table.
- **Disclosure**: native `<details>`/`<summary>` for the per-domain metric breakdown (keyboard- and screen-reader-native for free, no custom JS needed) rather than a hand-rolled accordion.

## 9. Map conventions

- **No external basemap tiles** (DEC-040) — the map renders only this platform's own tract-choropleth polygons and place-outline overlays, on a flat neutral background (`#eceae5`). Fully keyless, fully reliable, and free of visual noise unrelated to the scored geography.
- **Sequential single-hue scale**, never red/green: `--map-scale-1` (lightest, `#eef6f6`) through `--map-scale-7` (darkest, `#063f43`), all teal — "higher concern" reads as "more saturated," not "alarm-colored."
- **No-data fill** (`--map-no-data`, `#e4e0d8`) is a distinct neutral, visually separated from the sequential scale, and is never the same as the lightest "low concern" shade — a missing score must never look like a real low score.
- **Selected-tract outline**: a 3px solid dark line (`#1e2933`), redrawn via a MapLibre filter expression, not a separate re-fetch.
- **Selected-place outline**: a 3px dashed dark line, added when a non-tract geography (place/district/ZCTA/county) is selected, with the map panning/zooming to fit it — added during Phase 5 closeout to fix a real usability gap (Task 1: a user could find a city but had no way to see where it was on the map).
- **Plain-language legend**: always rendered below the map as visible text + a gradient swatch, not a hover-only tooltip.
- **Accessible alternative, always paired**: the map is never the only way to reach the underlying data — `ExploreTable` (an accessible, sortable `DataTable`) carries the identical dataset, reachable via the Map/Table segmented control.

## 10. Chart conventions

`CHART_PALETTE` — the Okabe-Ito 6-color qualitative, colorblind-safe palette (`#0072b2` blue, `#e69f00` orange, `#009e73` bluish green, `#cc79a7` reddish purple, `#56b4e9` sky blue, `#d55e00` vermillion) — reserved for future categorical charting (no chart library is wired in yet as of Phase 5; `PercentileBar` is the only quantitative visual built so far, and it uses the interactive teal, not the chart palette, since it represents one metric's position, not a category).

## 11. Status labels and uncertainty language

Exactly four canonical stability labels, always shown as a `StabilityBadge` with a plain-language `title` explaining what each means (never just the bare word):

| Label | Tone | Meaning shown to the user |
|---|---|---|
| Robust | success | "This ranking holds up across nearly every tested weighting and data-uncertainty scenario." |
| Moderately stable | interactive (teal) | "This area stays elevated overall, but its exact rank shifts somewhat depending on assumptions." |
| Assumption-sensitive | caution | "Whether this area ranks highly depends a lot on which priorities are weighted most." |
| Data-limited | neutral | "Missing data or high uncertainty makes this ranking less reliable than others." |

Uncertainty is always shown as a range next to the point estimate ("Likely range: 65 - 78"), never hidden, never presented as false precision. A missing value is always a dash (`—`) or the literal text "No data" — **never rendered as `0`** (verified directly in `apps/web/test/geography-detail.test.tsx` and `apps/web/e2e/explore-data-integrity.spec.ts`).

## 12. Content rules

See `docs/design/content-style-guide.md` for the full writing style guide. Summary of the release-gate rules enforced during Phase 5 closeout:
- No internal build-phase numbers, file names, or config keys in primary user-facing text (technical detail is allowed only behind an explicit disclosure, e.g. a `<details>` block or the Data page's transparency tables).
- No raw snake_case identifiers rendered as labels (`domainLabel()` in `apps/web/lib/labels.ts` converts every domain key to its plain-language form, with a safe fallback humanizer for any future unmapped key).
- Every source citation names a publisher and vintage in plain English — never an internal filename or database table reference.

## 13. Accessibility conventions

WCAG 2.2 AA is a release gate, verified with automated `axe-core` scans (`apps/web/e2e/accessibility.spec.ts`) across Overview, Explore (map view, table view, tract-selected view with the evidence drawer open), the Data page, and a coming-soon shell — zero serious/critical violations, plus manual-pattern keyboard tests (skip link, full Explore workflow via keyboard only, radiogroup arrow-key navigation). See `docs/design/usability-testing.md` for the specific violations found and fixed this pass (color contrast, scrollable-region focusability, duplicate IDs, invalid HTML nesting, and the SegmentedControl roving-tabindex gap).

## 14. Responsive behavior

Verified at 1440/1280/1024/768/390/320px (`apps/web/e2e/responsive.spec.ts`) for: navigation reachability (desktop sidebar vs. mobile drawer), zero page-level horizontal overflow, and full workflow completion (search → select → map/table → detail → compare → evidence) at every width — not merely "does it stack." Below `lg` (1024px), navigation moves from an always-visible sidebar to a drawer opened by a hamburger button; below `xl` (1280px), Explore's three-region layout collapses to a single stacked column in map/detail/search order (see §2 for why the threshold is `xl`, not `lg`).

## 15. Component usage guidance and anti-patterns

See `docs/design/component-inventory.md` for the full per-component reference. House rules that cut across all components:

- **Don't invent a one-off button, badge, or card style.** Use `Button`/`Badge`/`Card` and their tone/variant props; a new visual treatment belongs in the token system, not a local Tailwind class soup.
- **Don't build a custom accordion, tab strip, or modal.** `Tabs`, `SegmentedControl`, and `Dialog` already implement the correct ARIA pattern; a hand-rolled equivalent is very likely to reintroduce a keyboard-accessibility bug this project has already found and fixed once.
- **Don't skip the loading/error/empty triad.** Every data-fetching component in this app implements all three explicitly (see `apps/web/app/explore/geography-detail.tsx` for the reference pattern) — a component that only handles the happy path is incomplete, not "an MVP."
- **Don't show a percentile without its raw value**, and don't show a score without its coverage/uncertainty — `PercentileBar` and the score summary card enforce this by construction (there's no way to render one without the other in the props they accept).
- **Don't add a second source of truth for a domain/scenario/geography label.** `apps/web/lib/labels.ts` (`domainLabel`) and the live `/api/v1/scenarios` endpoint are the only places these are defined; a hardcoded label elsewhere in a component will drift.
