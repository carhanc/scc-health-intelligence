# Manual visual-review checklist

Claude Preview remains blocked in this environment by a macOS TCC (Files and Folders) permission gap (`RISK_REGISTER.md` RISK-012) — the process hosting it cannot launch a dev server under `~/Desktop`. Everything *functional* has been verified with a real, automated Chromium browser via Playwright (240+ end-to-end tests as of Phase 7, accessibility scans across every tab of every page, responsive checks at all 6 required widths, all passing — see `docs/design/usability-testing.md`). What's left is **genuinely visual judgment** that no automated tool can make: does it look good, is anything visually cramped or misaligned, does the map read clearly to a human eye.

**Run `make dev` (or `pnpm --filter @scc-health/web dev` + the API), open `http://localhost:3000` in your own browser, and confirm the items below.** Nothing here re-tests functionality already covered automatically — only look, don't click through every workflow again.

## Overview (`/`)

- [ ] Layout feels balanced, not lopsided or cramped at a normal desktop width.
- [ ] Heading hierarchy is visually clear — you can tell at a glance which text is the page title, which is a section heading, which is body copy.
- [ ] No text is clipped, truncated unexpectedly, or overlapping another element.
- [ ] The three task cards read as clickable actions, not decorative boxes.
- [ ] The countywide snapshot numbers are legible and not visually crowded.

## Explore (`/explore`)

- [ ] The map renders with visible tract shading (not blank, not a solid single color) and the legend gradient is easy to read.
- [ ] Clicking a tract, the selected outline is clearly visible against the surrounding tracts.
- [ ] The search box and results list look inviting to use, not like a developer form.
- [ ] Switch to Table view: the table is easy to scan, columns aren't cramped, sort indicators are visible.
- [ ] With a tract selected: the profile panel's hierarchy is clear (you can tell the score from the domain list from the trust disclaimer at a glance).
- [ ] Open a comparison: the two tracts' numbers are easy to visually compare side by side.
- [ ] Open the evidence drawer: it slides in cleanly, doesn't overlap content awkwardly, and is easy to read.
- [ ] The Priorities dropdown and its description text look intentional, not like an afterthought bolted onto the layout.

## Responsive widths

Resize your browser window (or use your browser's device toolbar) to each width and check Explore with a tract selected:

- [ ] **1440px** — full three-column layout looks comfortable, not stretched or empty.
- [ ] **1024px** — layout has switched to a single stacked column; nothing overlaps the sidebar.
- [ ] **768px** — same stacked layout; touch targets (buttons, search box) look large enough to tap comfortably.
- [ ] **390px** — mobile layout; navigation is reachable via the menu button, nothing is cut off at the screen edge.
- [ ] **320px** — smallest supported width; confirm the page is still usable, not just "technically not broken."

## Prioritize (`/prioritize`)

- [ ] The scenario cards and custom-weighting sliders look inviting to use, not like a raw settings panel.
- [ ] Moving a slider updates the "Applied weights" percentages smoothly, with no visible flicker or layout jump.
- [ ] The ranked-results table is easy to scan; the stability badge and "Show drivers" button are clearly distinguishable from plain text.
- [ ] The "Why this ranked here" explanation card, once expanded, sits in an obviously-related position relative to the table (not orphaned far from what triggered it).
- [ ] The decision memo in the Export tab looks genuinely printable — check the browser's print preview and confirm nothing is cut off or awkwardly paginated.
- [ ] The Compare tab's three-column overlap view (both / only-left / only-right) reads clearly at a glance.

## Utilization (`/utilization`)

- [ ] The facility table and its expanded payer/disposition/language breakdown look organized, not like three unrelated lists stacked together.
- [ ] The "Suppressed (small count)" badges in the Trends table are visually distinct from real numbers, not easy to misread as a value.
- [ ] The "Unreliable estimate — do not use" badge on a flagged tract is visually prominent (not a pale, easy-to-miss footnote) given how important that distinction is.
- [ ] Switching between the Disposition / Race group / Sex / Expected payer trend buttons feels responsive, with a clear active-state indicator.

## Validate (`/validate`)

- [ ] All six tabs are easy to tell apart and navigate between; the currently active tab is visually obvious.
- [ ] The metric-registry disclosure list (Scoring methods tab) expands cleanly without shifting surrounding content awkwardly.
- [ ] The convergent-validity and criterion-validity result cards (Validation tab) are easy to visually compare against each other.
- [ ] The audit-status grid (Reproducibility tab) reads clearly as a real pass/fail summary, not a wall of undifferentiated text.

## Advocate (`/advocate`)

- [ ] The three entry paths (place/issue, document, and a prefilled cross-page workspace) are visually distinct tabs, not easy to confuse.
- [ ] Evidence cards read clearly at a glance: value, unit, source, and the observed-vs-modeled badge are all visible without opening anything further.
- [ ] Selecting/deselecting evidence gives immediate, visible feedback (checkbox state, selected-count text) with no lag or flicker.
- [ ] The "Selected, in export order" list and its reorder controls look genuinely usable, not like a raw debug list.
- [ ] The PHI/privacy warning on the document-upload tab is prominent and readable before the upload control becomes usable — it should not read as legal boilerplate easy to skip past.
- [ ] Document analysis results (detected topics, geographies, agenda items, warnings) are organized clearly, not a wall of undifferentiated text.
- [ ] The generated brief's sections are easy to visually scan; the non-causal disclaimer and "what evidence does not prove" section are visually distinguishable from the main narrative, not buried.
- [ ] Switching output type (brief / memo / questions / talking points / profile / appendix) produces an obviously different, correctly-updated document, not a jarring layout jump.
- [ ] The workspace toolbar's autosave/"Local only" status is visible without hunting for it.
- [ ] Print preview (browser print-to-PDF) of a generated brief looks genuinely presentable — no cut-off content, no leftover interactive chrome (buttons, checkboxes) in the printed output.

## Copilot (`/copilot`)

- [ ] The "Deterministic (not AI-generated)" vs. any AI-generated response is unmistakably distinguishable at a glance, not a subtle label easy to miss.
- [ ] The action dropdown's options read as plain-language tasks, not internal action-ID strings.
- [ ] "Evidence used" citations are visually connected to the response text they support, not a disconnected list at the bottom.
- [ ] The disabled state of "Ask Copilot" before a place is selected is visually obvious (not just technically disabled with no visual cue).

## Across all of the above, confirm

- [ ] No overlapping elements anywhere.
- [ ] No clipped or cut-off text.
- [ ] No column so narrow it makes its content unreadable or unusable.
- [ ] No control that's visually hidden or hard to find (a button that blends into the background, etc).
- [ ] The selected tract/place is always visually obvious — you shouldn't have to guess what's currently selected.
- [ ] The map is understandable at a glance without reading documentation — a new visitor should be able to guess that darker = more concern.
- [ ] Tables remain genuinely usable (not just present) at every width you checked.
- [ ] On mobile widths, it's obvious how to open navigation and how to close it.

If you find something wrong, note the exact page, width, and what you saw — that's a real, actionable bug report, not something this checklist can catch on its own.
