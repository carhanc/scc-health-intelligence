# Manual visual-review checklist

Claude Preview remains blocked in this environment by a macOS TCC (Files and Folders) permission gap (`RISK_REGISTER.md` RISK-012) — the process hosting it cannot launch a dev server under `~/Desktop`. Everything *functional* has been verified with a real, automated Chromium browser via Playwright (62 end-to-end tests, 9 accessibility scans, 24 responsive checks, all passing — see `docs/design/usability-testing.md`). What's left is **genuinely visual judgment** that no automated tool can make: does it look good, is anything visually cramped or misaligned, does the map read clearly to a human eye.

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
