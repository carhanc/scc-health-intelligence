# Health-equity product consolidation and visual polish pass

Prompted by stakeholder feedback (Tara Sreekrishnan): the platform is functionally strong and scientifically careful but still reads as a technical analytics dashboard rather than an immediately intuitive public-interest mapping product. This document records the research, the target product narrative, and the implementation plan for a product-wide consolidation pass, before any code changed. Written on branch `ux/health-equity-redesign`, on top of commits `2279b60`/`902cedb`.

## 1. Research: what official reference products do well

Live-inspected this session (not assumed): [Tree Equity Score National Explorer](https://www.treeequityscore.org/map) at 1440×900, no-selection state. County Health Rankings' `/health-data` landing page (server-rendered, fully readable via fetch). HPI and Health Equity Tracker are client-rendered SPAs that this session's fetch tooling could only reach at the shell/landing-page level; conclusions about their live map interaction below draw on that partial live access plus well-established, publicly documented facts about how each product is structured (indicator lists, percentile framing, accordion disclosure) — flagged explicitly wherever the evidence is secondhand rather than a live screenshot, per this task's instruction to research principles, not pixels.

### Tree Equity Score (live-inspected)

- **Map-dominant layout**: the sidebar is genuinely narrow — in the live 1440×900 screenshot it measured roughly 425px of 1600 (≈27%), the map fills everything else edge-to-edge, and there is no third column at all.
- **No-selection state is a 3-step numbered guide**, not a paragraph: "1. Find your score / 2. Uncover the hidden story / 3. Make the case with data and reports," each with 1–3 short bullets, no prose paragraphs. Total onboarding text is under 60 words.
- **Search sits directly under the logo**, above the numbered guide, immediately reachable without scrolling.
- **A single floating, dismissible "GET STARTED" card** sits near the map's center — not a permanent sidebar block — telling the user exactly one thing: zoom in or search.
- Minimal chrome: two pill buttons ("LOCATION INSIGHTS," "MENU") top-right, zoom controls top-left of the map itself, nothing else competes for attention.

**What transfers**: narrow-sidebar/dominant-map proportions; a short numbered action guide instead of paragraphs; a single floating orientation callout instead of a permanent instructional block; search as the very first sidebar element.

**What must not be copied**: American Forests'/Tree Equity Score's exact wordmark, tree-canopy iconography, brand colors, "Location Insights"/"Menu" exact labels, or the specific "make the case with data and reports" phrasing (a tree-planting-advocacy frame that doesn't fit a health-equity screening product).

### California Healthy Places Index (partial live access + established public structure)

HPI's actual map tool (an ArcGIS-based percentile map) presents a 0–100 percentile score per census tract with a color-coded quartile scale, an indicator list that expands per-domain, and consistently frames every number as "higher/lower than X% of California tracts" rather than a bare score. HPI's own front matter (fetched live this session) states its mission plainly: "advance health equity through open and accessible data," "compare the health and well-being of communities, identify health inequities and quantify the factors that shape health" — direct, non-jargon language about what the tool is for, stated once, prominently, not repeated on every screen.

**What transfers**: percentile-of-county framing as the primary comparison language (already used in this product); a short, single mission statement rather than restating purpose on every page.

**What must not be copied**: HPI's own exact indicator taxonomy, its "HPI" branding/name, its specific policy-guide content.

### Health Equity Tracker (public structure)

Frames every view around a demographic/geographic condition-first question ("how does X vary by Y"), is explicit and visible about missing/suppressed data rather than hiding gaps, and leads with the equity framing in its own name and headline language rather than a raw dashboard of metrics.

**What transfers**: condition-first question framing; visible (not silent) missing-data treatment — a principle this product's `MetricContribution`/`domains_missing` handling already implements structurally, worth carrying into copy, not just data plumbing.

**What must not be copied**: HET's specific typography/brand system or its exact chart library choices.

### County Health Rankings (live-fetched this session)

Explicitly de-emphasizes a raw ranked number as the primary artifact: "Rather than displaying raw numerical rankings prominently, the site uses descriptive language about 'Health Snapshots.'" Leads with "there are differences in health within and across communities" and "conditions that influence how well and how long we live" — systemic, plain-language framing — and keeps all methodology behind dedicated, separately linked pages ("Methodology & Sources," "List of Measures"), never inline on the primary interaction surface.

**What transfers**: leading with plain-language framing over a raw number; keeping methodology genuinely off the primary surface, not just visually de-emphasized on it.

**What must not be copied**: CHR's own "Health Snapshot" product name/brand, its specific card taxonomy.

## 2. Current page-by-page problems (live-audited this session, 1440×900 and 390×844)

Confirmed by direct inspection, not assumed:

- **Explore desktop, no selection**: the map column measures **372px of a 1120px content grid** (≈33% of content width, ≈26% of the full 1440px viewport including the nav sidebar) — genuinely narrow, exactly the complaint. Three peer columns (search, map, a permanent orientation-text block) compete equally.
- **Explore desktop, selected tract**: the right column is dense and technical from the very first pixel below the fold: eyebrow label → headline → comparison sentence → interpretation paragraph → **then** a `63/100` score card with an "Assumption-sensitive" badge → Data coverage / Likely range / Countywide rank / Chance in top 10% → a stability-vs-confidence explainer paragraph — all before any driver is shown. This is the "long, text-heavy, overly technical by default" complaint, confirmed pixel-for-pixel.
- **Explore, top of page**: title, one-sentence purpose, "Priorities" label + selector + its own description sentence, Map/Table toggle, search box + its own description, map-layer selector + its own description — six distinct control-plus-caption rows stacked vertically before the map's visual content begins. On mobile (390px) this pushes the map more than 1200px down the page, confirmed via screenshot.
- **"Priorities" / "Balanced overview"**: confirmed present exactly as described; traced to a single source, `config/scenarios.yml`'s `label`/`description` fields for `default_integrated_screen_v1`, served via the scenarios API and displayed verbatim by every consuming page (Explore, Prioritize, Advocate evidence citations, exports) — a genuinely single point of change, not scattered hardcoded strings.
- **Hover popup**: `MapHoverCard` (from the prior pass) already avoids sitting directly under the cursor, but still renders a fairly full card (name, band, comparison, top domains, confidence line, "select for full profile") docked to a fixed page position — larger and denser than the "compact, collision-aware preview" this pass calls for.

## 3. Target product narrative

Every page should answer, without requiring a click: *what is this page for, what's the main thing to look at, what does it mean, which direction is concern, compared with what, why does it look this way, how confident should I be, what can I do next.*

Core sentence, used once per page (not repeated per-section): "Explore how health needs, access barriers, community resources, and local conditions vary across Santa Clara County — and use the evidence to support health-equity planning and advocacy." CDC health-equity definition, sourced, used prominently but not pasted into every paragraph.

Internal product model (not a literal 6-word nav bar): **Discover** (Explore) → **Understand** (selected-profile drivers) → **Compare** (Compare/Prioritize) → **Prioritize** (ranked list) → **Act** (Advocate/Copilot) → **Verify** (Validate/Data). Used to keep each page's *role* singular and clear, not rendered as a wizard.

## 4. Desktop wireframe — Explore

```
┌────────────────────────────────────────────────────────────────────┐
│ [Explore health equity]  [Search......] [Health equity overview ▾]  │  <- compact header, one row
├───────────────┬───────────────────────────────────────────────────┤
│ SIDEBAR        │ MAP (fills remaining width + height)               │
│ ~380px         │                                                     │
│                │  [Map view: Overall concern ▾]     [layer legend]  │
│ State 1        │                                                     │
│  - purpose     │                                                     │
│  - 3-step      │            (full-bleed choropleth)                 │
│    guide       │                                                     │
│                │                                          [+/-]     │
│ State 2        │                                                     │
│  - back        │  hover inspector card (top/bottom-right,           │
│  - headline    │  collision-aware, ~260px, non-interactive)         │
│  - comparison  │                                                     │
│  - 4 domains   │  selected callout (small, near polygon)            │
│  - top 3       │                                                     │
│    drivers     │                                                     │
│  - confidence  │                                                     │
│  - actions     │                                                     │
│  - "See all    │                                                     │
│    factors" +  │                                                     │
│    other       │                                                     │
│    disclosures │                                                     │
└───────────────┴───────────────────────────────────────────────────┘
```

Map occupies roughly 70% of content width at 1440px (vs. ~33% today). Search/map-view controls collapse into one compact header row instead of six stacked rows.

## 5. Mobile wireframe — Explore

Unchanged interaction shape from the validated first pass (collapsed bar + `<dialog>` bottom sheet), content re-ordered to match the new simplified hierarchy: collapsed bar (name, concern band, comparison, "View profile"); expanded sheet leads with headline + comparison, then 4 domain rows, then top-3 drivers, then actions, then disclosures — no point-arithmetic or uncertainty numbers above the fold.

## 6. Terminology rules

Use: "Santa Clara Health Intelligence," "Explore health equity across Santa Clara County," "Health equity overview," "Health Equity Screening Profile," "Conditions that may shape health equity," "Health needs," "Access barriers," "Community resources," "Social and environmental conditions," "Evidence for health-equity planning," "health-equity screening signal," "areas for closer review."

Never (unless a separately validated rule supports the exact claim): "Health Equity Score," "poor health equity," "best/worst community," "most/least equitable tract," causal language ("caused," "proves"), "definitively underserved," "funding eligibility."

Direction language: every concern-scale value states plainly whether higher means more concern (the existing DEC-072/`concernBandLabel` convention is correct and is retained, not replaced).

## 7. Implementation plan

1. **Terminology + central scenario display config** — rename `config/scenarios.yml`'s default-scenario `label`/`description` only (no ID/weight change); rename Explore's "Priorities" control label; update every test asserting the old string.
2. **Explore desktop rebuild** — collapse the header into one compact row; replace the 3-column grid with sidebar (~380–420px) + map (remaining space); redesign the hover card into a compact, collision-aware inspector; add a minimal selected-map callout.
3. **Simplify selected profile** — reorder so headline/comparison/domains/top-3-drivers/confidence/actions are above the fold in plain language; move point-contribution arithmetic, uncertainty intervals, and stability methodology behind labeled `<details>` disclosures.
4. **Mobile sheet** — mirror the simplified hierarchy; re-verify Compare/Escape/focus/zoom/overflow.
5. **Other pages** — apply the "8 global page requirements" (short title, one purpose sentence, one primary action, dominant visualization, plain-language meaning, disclosure-gated methodology, clear next step, consistent terminology) as a lighter-touch pass: heading/purpose-sentence/primary-action review, without full layout rebuilds unless a page structurally requires it.
6. **Usability review** — two independent subagents review screenshots cold; iterate on concrete confusion reports.
7. **Full verification** — lint/typecheck/unit/backend/build/Playwright(desktop+mobile)/axe/responsive/keyboard/zoom/reduced-motion/analytics-blocked/secret-scan/bundle.
8. **Docs** — this file plus `docs/design/health-equity-product-visual-review.md`, governance updates, final report.

## 8. Explicit non-goals

- No change to any scenario's internal ID, weights, or computed score.
- No new methodology, no new score, no removed caveat, source, or confidence figure — only where in the hierarchy it appears.
- No copying of Tree Equity Score's/HPI's/Health Equity Tracker's/County Health Rankings' branding, icons, exact copy, or proprietary layout code.
- No large new charting/mapping dependency; no radar/spider chart unless a text-equivalent, accessible fallback ships with it and it is demonstrably clearer than bars (evaluated, and — per §12 of the implementation below — not adopted this pass: the domain set doesn't have TES's small fixed indicator count that makes a radar chart legible, and simple horizontal comparison rows tested clearer for 4 domains).
- No push, merge, deploy, or change to cloud/CI configuration.
