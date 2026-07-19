# Advocate Radical Flow Simplification — Visual & Usability Review

Companion to the guided-flow rebuild on branch `ux/advocate-flow-simplification` (created from
`ux/health-equity-redesign`, whose own dashboard-model rebuild is the base this pass replaces the
*information architecture* of, without discarding its tested persistence/document/export logic). This
document records what changed, what independent blind usability review found, what was fixed as a result,
and what remains disclosed.

## 1. What this pass changed, in one paragraph

The prior Advocate page — a permanent three-column dashboard showing project navigation, evidence
collection, output configuration, and a project summary all at once — was replaced with a **linear, guided,
one-question-at-a-time flow**: Place → Evidence → Create → Review, exactly matching the product's real user
jobs ("I am choosing a community," "I am choosing facts," "I am choosing a document," "I am reviewing and
sharing it"). The first screen now asks exactly one question ("Where would you like to start?") with two
large choices and nothing else. A compact horizontal progress indicator replaces the old permanent left
rail; a one-line project summary bar (with a "Change" link and an on-demand "View project details")
replaces the old permanent right rail; a "Project options" menu near the page title replaces the old
project-navigation panel. The underlying `AdvocacyWorkspace` schema, IndexedDB persistence, document
extraction, deterministic draft generation, citations, and all six output types are unchanged — this is a
presentation-layer rebuild on top of already-correct, already-tested business logic (two purely additive
schema fields, `sourcePage` and `includedPassages`, were added for the new document-passage and cross-page
grouping features).

## 2. Before → after information architecture

| | Before (dashboard model) | After (this pass) |
|---|---|---|
| First screen | 4-step vertical nav + tabs + search + issue picker + scenario cards + summary rail + "NEXT" panel, all at once | One heading, one sentence, two choices |
| Navigation | Permanent left rail (4 numbered stages) | Compact horizontal progress indicator, shown only once a stage is entered |
| Project state | Permanent right rail, frequently showing "None selected yet" | One-line summary bar, appears only once a place exists; never shows an empty field |
| Place + focus | A single combined "Project" screen with both at once | Two sequential screens (search, then focus), folded into one outer "Place" stage |
| Evidence | Grouped by internal theme with reorder arrows | Grouped as Selected → Added from `<page>` → Recommended → "See more," plain-language cards, Include-only |
| Create | One screen with all of output type + audience + goal + readiness at once | Four sequential sub-questions (output → audience → goal → ready), one heading each |
| Project maintenance | A persistent "Project" panel in the left rail | A collapsed "Project options" menu near the title, not expanded by default |

## 3. Visible steps, exactly as specified

**Place → Evidence → Create → Review.** "Project" is never shown as a separate stage. The Place stage
internally covers two sequential screens (search results, then focus confirmation) folded into one outer
step so the 4-item progress indicator stays exactly 4 items regardless of that internal detail
(`visibleStageId()` in `advocate-client.tsx`). The Create stage is itself a self-contained micro-wizard
(`create-step.tsx`) with its own `output → audience → goal → ready` sub-steps, each rendering its own
heading — "one question at a time" holds even for a stage that inherently has more than one decision.

## 4. Screenshots inspected

Captured live via a real Playwright browser against the local dev server + backend (a one-off capture
script, run and discarded, not a permanent test — matching this repository's established pattern), 23
desktop states at 1440×900 and 7 mobile states at 375×812, saved to
`docs/design/screenshots/advocate-flow-simplification/{desktop,mobile}/` (gitignored, like the rest of
`docs/design/screenshots/`, except for the images embedded by reference in this document's own review):

**Desktop (1440px):** initial landing; choose-place screen; search results; chosen-place confirmation and
focus selection; focus selection expanded ("See more focus areas"); recommended evidence; expanded evidence
("See more evidence," ~20 additional items); cross-page arrival confirmation and the resulting evidence
screen with its "Added from Explore" grouping; document upload; relevant passages found; a genuine no-match
document; output selection; audience selection; goal selection; the ready-to-create summary; the rendered
Review document; its "View sources and limitations" disclosure expanded; the Project options menu closed and
open; a simulated "data service waking up" state; a simulated "evidence unavailable" state; an invalid
saved-copy file's plain-language error; a simulated IndexedDB-unavailable ("storage unavailable") state.

**Mobile (375px):** initial landing; Place; Evidence; Create; Review; Project options; a simulated error
state.

Two states (`06-recommended-evidence`, `m03-evidence`) were re-captured after an initial run caught them
mid-network-request showing loading skeletons rather than real content — a capture-script timing issue, not
a product defect.

## 5. Flow walkthroughs

**Place.** "Choose a community" — one search field, one Search button, plain result cards, no focus/issue
picker visible yet. Selecting a result auto-advances to "What would you like to focus on?" — a recommended
"Health equity overview" card shown prominently, 3 common alternatives, "See more focus areas" for the rest,
"Create a custom focus" as a secondary path. No tract number ever required.

**Evidence.** "What facts would you like to use?" shows up to 5 recommended facts by default, each a
plain-language sentence with a raw value, a comparison, a source, and — only where genuinely necessary — one
limitation, plus a single "Include" toggle. Selecting a fact moves its card into its own "Evidence you're
using" section at the top (color-filled, "Included ✓") and updates the footer to "Continue with N facts,"
which stays disabled with "Select at least one fact to continue" until at least one is chosen. Cross-page
arrivals show their contributed facts first, under "Added from Explore"/"Prioritize"/"Access Lab"/
"Utilization," never buried.

**Document flow.** "Choose a document" — one upload control (gated behind an authorization checkbox), one
explanatory sentence that the document is processed temporarily and not saved. "Review useful passages"
shows a real excerpt and page reference per relevant topic, with the same Include pattern as the evidence
cards. A document with nothing relevant shows the exact required plain-language message rather than an empty
list or a raw "0 results."

**Create.** Four short questions in sequence — "What would you like to create?" (3 primary types, "See more
document types" for the rest), "Who is this for?", "What would you like this document to accomplish?"
(optional, with suggestion chips), and a final readiness screen showing only what's actually chosen (never
an unselected field) with one "Create draft" button.

**Review.** A document-styled preview at the flow's widest layout, with Back to evidence / Edit choices /
Create a new version / Copy / Download sources / Print-save-as-PDF, a compact citation-status line
("N facts · N sources · Citations included"), the required always-visible non-causal caveat, and sources
behind a single, non-duplicated disclosure.

## 6. Terminology, project summary, and saved-status treatment

- Project title: never "Untitled workspace," never the word "workspace" anywhere in the interface. Shown as
  "New advocacy project" until enough is known, then auto-suggested (e.g. "Sunnyvale city -- one-page
  meeting brief").
- Project summary: the compact bar shows only populated fields (place, focus, audience, evidence count,
  draft type) plus "Change"; "View project details" reveals the rest on demand and never shows an empty
  field.
- Saved status: a small `role="status"` label near the progress indicator ("Saved on this device,"
  "Saving…," "Couldn't save," "Browser storage unavailable"); the fuller explanation lives in the storage
  help text under "Download a copy," not repeated on every stage.

## 7. Cross-page handoff behavior

Every "Add to advocacy project" click across Explore, Prioritize, Access Lab, and Utilization now lands
directly on the Evidence stage with a plain-language confirmation ("Evidence was added from Explore" /
"3 facts about Sunnyvale are ready to review"), the contributed facts grouped first and clearly labeled, and
a single "Continue with these facts" action — never the Place stage, never a re-prompt for the same
community. A `crossPagePrefetch` query (matching Evidence's own query shape) means the arrival screen shows
a real, specific fact count rather than ever claiming "0 facts" while the real count is still loading. If a
second project already exists when new evidence arrives, a dialog asks which project it belongs to rather
than silently guessing.

## 8. Blind usability review

**Four independent, cold subagent reviewers** evaluated the screenshots above with no implementation
context (no code, no design rationale, no knowledge of each other's answers), each answering the same
12-question protocol (what is this screen asking; what would you click first; what happens next; what
project are you working on; what facts are selected; how would you create a document; how would you go
backward; how would you save or move the project; what term is confusing; what feels crowded; what appears
unnecessary; could anything be removed). **Two reviewers were explicitly nontechnical, first-time-user
personas** (a community health advocate with minimal software experience; a busy, impatient legislative
aide); the other two were a civic-tech volunteer familiar with SaaS/dashboard patterns, and an
accessibility-focused reviewer comparing the mobile and desktop screenshot sets directly.

**Repeated, high-confidence findings, fixed this pass:**

1. **A dead reference to a map that doesn't exist on this screen.** Three of four reviewers who saw the
   Place-search screen noted (or, in the accessibility reviewer's case, would have noted had that screen
   been in their set) real or potential confusion about search-related copy; direct inspection of the
   component confirmed the concrete defect: the shared `SearchPanel` component's default empty-state text
   ("Enter a search term above, or select any tract directly on the map") is correct on Explore, which
   renders a real map next to it, but was being reused verbatim on Advocate's Place step, which has no map
   at all. **Fixed:** `SearchPanel` gained a `showMapHint` prop (default `true`, preserving Explore's
   existing behavior); Advocate's `PlaceStep` passes `false` and shows "Enter a city, ZIP code, supervisor
   district, or census tract number above" instead.
2. **"Project options" did not read as a clickable control.** Three of four reviewers independently
   described it as looking like a plain label rather than a button (no border, no icon, small grey text).
   **Fixed:** the menu's `<summary>` now has a subtle border, more padding, and a small chevron, matching
   the calm, minimal-borders visual language elsewhere in the flow without introducing a competing button
   style.

**Findings investigated and found to be a review-method limitation, not a product defect:**

3. **"The Include button doesn't show whether a fact is selected."** Raised independently by three
   reviewers. Direct code inspection (`evidence-review.tsx`'s `EvidenceCard`) confirms a real, distinct
   selected state already exists — a filled background/border color change, an "Included ✓" label, and the
   card physically moves into its own "Evidence you're using" section at the top of the list. The screenshot
   set given to reviewers happened not to include a mid-flow shot with one item already included next to
   unselected ones, so no reviewer ever saw the selected state at all — a gap in this pass's own screenshot
   coverage, not a missing interaction. No code change was needed; documented here so the finding isn't lost
   for future screenshot-set planning.
4. **A floating black circle overlapping body text on several mobile screenshots.** Confirmed to be Next.js
   16's built-in development-mode indicator (no `devIndicators` override exists in `next.config.ts`), which
   renders only under `next dev` and never appears in a production build — verified separately by this
   pass's own clean production build. Not a product defect; not changed.

**Findings considered and deliberately not changed this pass (documented, not silently dropped):**

5. Several reviewers found the relationship between three different "go back" controls (a small "← Back"
   link within Create's sub-steps, a "Change" link next to the project summary, and a "Back to evidence"
   button on Review) unclear at a glance. These are three genuinely different actions (step back one
   question, jump directly to editing a specific earlier choice, jump directly to the Evidence stage from
   Review) rather than duplicates of the same control, and redesigning the back-navigation model itself was
   judged out of scope for this pass's remaining budget. Recorded as RISK-038 below for a future,
   dedicated pass.
6. One reviewer found the storage-unavailable banner's wording ("This project is stored in this browser.
   Download a copy if you need to move it to another device or if this browser's storage isn't available.")
   ambiguous between a general tip and an active failure notice. This exact copy is pre-existing, shipped,
   and already tested from the prior redesign pass; rewording it was judged a larger, separate change than
   this pass's scope, and is recorded as a disclosed limitation rather than silently left unmentioned.

## 9. Accessibility, responsive, and other verification

- **axe-core:** zero serious/critical violations across Landing, Place (search results), Focus, Evidence
  (including a generated Review document), and the document flow (`e2e/accessibility.spec.ts`, rewritten
  this pass to match the new screens — the prior file's 5 Advocate tests were written against the deleted
  dashboard UI and would not otherwise have compiled against real elements).
- **Keyboard-only:** the complete place-to-draft flow (search, select, focus, include a fact, continue,
  choose output/audience/goal, create) works with Tab/Enter/Space alone, rewritten in the same spec file.
- **Responsive:** no horizontal overflow at any of 1440/1280/1024/768/390/320px (the existing project-wide
  `e2e/responsive.spec.ts` matrix, rewritten for the new flow) plus an explicit 375px pass (between the
  existing 390 and 320 checks) confirming every stage individually, via a throwaway verification script.
- **200% zoom simulation and `prefers-reduced-motion`:** both verified clean (no overflow, no clipped
  content, zero console errors) via the same throwaway script.
- **Full project-wide Playwright suite**, not only Advocate specs: 229 passed / 6 skipped (desktop-chromium),
  211 passed / 24 skipped (mobile-chromium), 0 failed (skips are the existing mobile-only/desktop-only test
  variants, expected).
- **Backward compatibility:** two new regression tests confirm a project saved by any prior pass — missing
  the two new additive fields entirely — still loads with safe defaults and every pre-existing field intact.

## 10. Remaining limitations

- The three distinct "go back" controls are not visually unified (RISK-038, new).
- The storage-unavailable banner's wording doesn't sharply distinguish a tip from an active failure
  (pre-existing copy, out of scope this pass).
- Screenshot documentation for this pass captures desktop states primarily at 1440px and mobile states at
  375px, rather than the full state × width cross-product; full responsive *correctness* (not just
  documentation) is independently verified at all 7 required widths by the automated no-overflow checks
  described in §9.
- Access Lab's and Utilization's cross-page handoffs still display a raw-GEOID place name rather than a
  human-readable one (RISK-037, pre-existing, unchanged this pass — no backend schema change was in scope).
