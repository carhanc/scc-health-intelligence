# Content style guide

Writing rules for every user-facing string in this product — UI copy, error messages, badge text, and the plain-language fields in `config/metrics.yml`/`config/scenarios.yml` that flow straight through the API into the interface. Companion to `docs/design/design-system.md` (visual system) and `docs/design/component-inventory.md` (component reference).

The default reader is **not** a data scientist, epidemiologist, or GIS analyst — a county commissioner, community advocate, student, or resident with no statistical training must be able to use this product's primary interface without help (CLAUDE.md: "the default interface must be understandable without statistical training").

## 1. The core rule: nothing internal leaks into primary text

Primary interface text (headings, body copy, badges, error messages, citations, limitations) must never contain:
- **Internal build-phase numbers** ("Phase 6," "Phase 4 scope"). A build phase means nothing to a first-time visitor and dates the product. `ComingSoonPage` accepts a `phase` prop for internal roadmap bookkeeping but never renders it — the visible badge just says "Coming soon."
- **File names, config keys, or schema/table references** (`DATA_MANIFEST.json`, `source_id=cdc_places_tract_2025`, `resources.hcai_facilities`, `social.acs_observations`). A citation should name a **publisher and vintage** ("CDC PLACES, 2025 release, tract-level"), nothing more.
- **Raw snake_case identifiers** as if they were labels (`workforce_shortage`, `default_integrated_screen_v1`). Every internal key that reaches the UI goes through a plain-language mapping first — `domainLabel()` (`apps/web/lib/labels.ts`) for domains, the API's own `label`/`description` fields (`config/scenarios.yml`) for scenarios.
- **Doc-section references** (`docs/03 §7.1`, `DEC-020`). These belong in code comments and governance docs, never in a string a user reads.
- **Implementation instructions accidentally left in content fields** — this happened once: a scenario's `description` field literally read "...the UI must still show these weights..." (an instruction to whoever built the UI, not a description of what the scenario does). Found and fixed during Phase 5 closeout; the lesson is to read every `label`/`description`/`citation`/`limitations` field in the config files as if seeing it rendered on screen, not as a developer note.

Technical detail is not forbidden — it belongs **behind an explicit disclosure**: a `<details>` block, the evidence drawer, or the Data page's transparency tables, all of which exist specifically so a technically-curious reader can go deeper without it cluttering the primary view for everyone else.

## 2. Plain-language replacements in use

| Instead of | Use | Where |
|---|---|---|
| `workforce_shortage` | "Workforce shortage" | Domain labels, via `domainLabel()` |
| `access_barriers` | "Access barriers" | ″ |
| `health_burden` | "Health burden" | ″ |
| `environmental_burden` | "Environmental burden" | ″ |
| `resource_accessibility` | "Resource accessibility" | ″ |
| `default_integrated_screen_v1` | "Balanced overview" | Scenario label (`config/scenarios.yml`) |
| GEOID | "census tract number" | Search hints, no-results messages |
| "Tract GEOID" (table column) | "Census tract number" | `ExploreTable` header |
| "Place GEOID {id}" | "Place ID {id}" | Place profile |
| "ZCTA selected" | "ZIP-code area selected" | Empty-state title for a ZCTA selection |
| "warehouse" / "DuckDB warehouse" | "database" / "behind the scenes" | Data page prose (raw table names are still shown in the actual table browser, since that page's whole purpose is transparency into the real tables — see §4) |

If a future domain or scenario is added without updating these mappings, `domainLabel()` falls back to a generic humanizer (underscores → spaces, capitalized) rather than ever showing raw snake_case — a safety net, not a substitute for adding the real mapping.

## 3. Tone

- Short sentences, direct verbs, concrete comparisons. "This tract's diabetes rate is higher than 82% of Santa Clara County" beats "This tract exhibits an elevated prevalence ratio relative to the county distribution."
- Neutral, not alarmist and not falsely reassuring. A high-concern score is stated plainly ("high combined concern") without dramatizing it, and a low score isn't framed as "all clear" — it's "lower combined concern," since the absence of a signal in this scenario's chosen priorities isn't a guarantee of no need.
- No marketing language. Never "AI-powered," "cutting-edge," "revolutionary," or similar — this is a civic transparency tool, not a product being sold.
- Second person sparingly, mostly implicit. Instructions read as direct statements ("Click any tract on the map") rather than "You can click any tract."

## 4. When technical terms are allowed

The Data page is the one place raw technical identifiers are appropriate as primary content, not an exception to bury — its entire purpose is to let a reader inspect the actual underlying tables (`schema_name.table_name`, row counts, live previews). Showing real table names there is honest transparency, not a slip; renaming them to something friendlier would misrepresent what's actually being shown.

Everywhere else, technical terms belong behind a disclosure:
- The evidence drawer (`Dialog`, opened by "View sources & evidence") is where a metric's exact source, method, and limitations live in full — this is where "margin-of-error propagation," "confidence interval," or a Census table number (`table B17001`) are appropriate, because the reader has explicitly asked to go deeper.
- A `<details>` element inside an error message (`GeographyLoadError`) is where the raw HTTP/API error text lives, never as the primary message.

## 5. Uncertainty and stability language

Never state a number without its uncertainty when uncertainty is available. The four canonical stability labels are always paired with a plain-language explanation (never the bare word alone):

| Label | Plain-language explanation always shown alongside it |
|---|---|
| Robust | "This ranking holds up across nearly every tested weighting and data-uncertainty scenario." |
| Moderately stable | "This area stays elevated overall, but its exact rank shifts somewhat depending on assumptions." |
| Assumption-sensitive | "Whether this area ranks highly depends a lot on which priorities are weighted most." |
| Data-limited | "Missing data or high uncertainty makes this ranking less reliable than others." |

A missing value is always "No data" or a dash (`—`) — **never the numeral `0`**, which would misrepresent absence as a real measured low value. This is enforced by construction in `PercentileBar` (a `null` percentile renders a flat track with an explicit "no percentile available" label, never a bar at position 0) and by tests (`apps/web/test/geography-detail.test.tsx`, `apps/web/e2e/explore-data-integrity.spec.ts`).

## 6. Non-causal framing (non-negotiable, per CLAUDE.md)

Every score display carries, in the same view (not a separate page the user has to find), a plain-language statement that it is a **screening signal**, not a prediction or causal claim:

> "This is a county-relative screening score, not a prediction or a causal claim. A high score means this tract's profile warrants a closer look under this scenario's priorities — it does not mean any specific program or intervention would fix it."

And on Overview, under "Screening, not causation":

> "A high score means an area warrants a closer look — it is not a claim that any specific program will fix it."

Never use causal verbs ("causes," "leads to," "results in," "drives" used as a causal claim rather than a description of statistical contribution) about a score, a correlation, an optimization result, or a comparison. "Driven mainly by Workforce shortage" describes which domain contributed most to a screening score's math, not a causal mechanism — if this phrasing is ever ambiguous in a new surface, prefer "primarily reflects" or "weighted most heavily toward."

## 7. Status and freshness labels

Six canonical freshness states, each with one fixed plain-language label (`FreshnessBadge`) — never invent a new phrasing for the same underlying state:

| State | Label shown |
|---|---|
| `unavailable` | "Data unavailable" |
| `draft` | "Draft source (not used)" |
| `intentional_older` | "Published on its normal schedule" |
| `newest_verified` | "Recently checked" |
| `lagged` | "Refresh due soon" |
| `stale` | "Overdue for refresh" |

Data mode (`DataModeBadge`) is always one of exactly three: "Live data," "Demo snapshot," "Data unavailable" — a reader should never have to guess whether a number is real.

## 8. Error messages

Every error a user can encounter follows the same shape: a truthful plain-language primary statement naming what failed in terms the reader already understands ("We couldn't load census tract 06085999999"), never a raw HTTP status or exception message as the headline. A `Retry` action and, where the user has something to clear or undo, a `Clear selection` action. The literal technical detail (an `ApiError` message, an HTTP status code) lives behind a "Technical details" `<details>` disclosure, present but not in the way.

## 9. Accessibility-relevant content rules

- Never convey meaning through color/icon alone — every badge, every status indicator has a text label a screen reader will announce.
- Never put essential information only in a tooltip (`Tooltip` is for brief supplementary clarification, and it shows on focus as well as hover, but nothing a user *needs* to complete a task is tooltip-only).
- Alt/label text for anything that functions as an image (`PercentileBar`'s `role="img"`) states the actual value in words, not just "chart" or "graph."
- Section and page headings form a real, unbroken hierarchy (`h1` → `h2` → `h3`) — headings are never skipped for visual-size reasons.
