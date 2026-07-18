# Advocate Workspace Comprehension, Dashboard, and Cross-Page Integration — Visual & Usability Review

Companion to [advocate-intuitive-workspace-research.md](./advocate-intuitive-workspace-research.md) (the
pre-implementation research and terminology plan this pass followed). This document records what changed,
what independent blind usability review found, what was fixed as a result, and what remains disclosed.

## 1. What this pass changed, in one paragraph

Advocate was rebuilt from a single dense page exposing internal vocabulary (matched evidence, evidence
bundle, output type, Generate, Export/Import JSON, configuration hash) into a 4-stage guided project
dashboard (Project → Evidence → Draft → Review & share) with a persistent, clickable step indicator, a
centralized plain-language terminology module, plain-language evidence cards grouped by theme, a visual
"What do you want to create?" picker, a document-style draft preview with citations behind a status line
and a disclosure, and a backup/restore flow moved into an unobtrusive "Project options" menu with real
error handling for a genuinely invalid file. The underlying `AdvocacyWorkspace` data model, IndexedDB
schema, and every business-logic handler are unchanged — this was a presentation-layer rebuild built on
existing, already-correct evidence-matching and deterministic-generation logic.

## 2. Screenshots inspected

Captured live via a real Playwright browser against the local dev server + backend (`e2e/
_capture-screenshots.mjs`, run and discarded — a one-off capture script, not a permanent test), at 1440×900
(desktop) and 375×812 (mobile):

- **`01-landing.png`** — the empty landing state: "Start an advocacy project," two entry cards ("Start with
  a place" with a full search box, "Start with a document"), and a preview grid of the 6 real output types.
- **`02-project-stage-place-chosen.png`** — the Project stage immediately after choosing Sunnyvale city:
  scenario-selection tabs, "Who is this for?"/"What do you want this document to help accomplish?"
  questions, right-rail summary beginning to populate.
- **`03-evidence-stage.png`** / **`04-evidence-selected.png`** — evidence cards grouped by plain-language
  theme ("Health equity screening score," "Health needs and community conditions"), each showing a
  plain-language status badge, value, comparison context, source, and limitation; selected cards move into
  a distinct "Evidence you're using" section with reorder controls.
- **`05-draft-stage.png`** — the "What do you want to create?" visual card picker (all 6 real output types)
  and a calm, non-blocking readiness checklist.
- **`06-review-share-draft.png`** — the dominant document-style draft preview: citation-status line, headed
  sections, "Questions for decision-makers," the always-visible non-causal caveat, and (for output types
  whose body doesn't already include a sources section) the "View sources and limitations" disclosure.
- **`07-project-options-menu.png`** — the "Project options" disclosure open, showing Rename/Duplicate/
  Download/Restore/Delete, each with plain-language help text now shown visibly rather than hover-only (see
  §4).
- **`08-document-upload-entry.png`** / **`09-document-upload-results.png`** — "Find useful evidence in a
  document," the plain-language authorization checkbox, and a real extraction result ("We found 2
  potentially relevant passages") with the in-memory-processing disclosure.
- **`10-explore-cross-page-button.png`** / **`11-cross-page-arrival-confirmation.png`** — Explore's tract
  detail page and the resulting Advocate arrival screen after clicking "Add to advocacy project," showing
  the plain-language confirmation banner ("Added Census Tract 5001... to your advocacy project.").
- **`12`–`15` (mobile)** — the landing state, Project stage, Evidence stage, and the collapsed-by-default
  project-summary panel expanded via its explicit "Show project summary" toggle, all at 375px with no
  horizontal overflow (confirmed via `document.documentElement.scrollWidth`).

## 3. Terminology and hierarchy changes

Every string a user sees now flows through one module, `apps/web/lib/advocacy-terms.ts` (`ADVOCACY_TERMS`,
`dataStatusLabel`/`dataStatusDefinition`), replacing what were previously several independently-written
label strings. The full before/after mapping (Workspace→project, Matched evidence→Evidence found, Generate→
Create draft, Export/Import JSON→Download/Restore a project backup, etc.) is the terminology table in the
research doc; live testing this pass confirmed none of the removed terms (workspace, matched evidence,
evidence bundle, output type, JSON) appear anywhere in the normal interface. "JSON" appears nowhere in a
primary label; a backup file's `.json` extension is visible only in the OS file picker, which this product
doesn't control.

## 4. Blind usability review

Three independent, cold subagent reviewers evaluated the screenshots above with **no implementation
context** (no code, no file paths, no prior conversation) and **no knowledge of each other's answers**,
each answering the same 12-question comprehension protocol (purpose, 5-second orientation, stage clarity,
evidence-card comprehension, output-type clarity, trust/sourcing clarity, "Project options" comprehension,
document-upload trust, cross-page handoff clarity, a jargon inventory, a one-sentence summary, and a 30-
second "guided tool vs. technical dashboard" gut check). One reviewer was explicitly role-played as a
community member unfamiliar with software terminology; one as a working advocacy professional evaluating
whether they'd trust the output professionally; one as a general first-time user.

**Convergent findings (found independently by all 3 reviewers, treated as the strongest signal):**

1. **"Download project backup" / "Restore a project backup" read as IT/database jargon**, mismatched with
   the plain-language tone everywhere else — all three reviewers used words like "sysadmin," "database
   internals," or "IT people" for this specific pair of labels, and all three separately guessed the
   button's purpose correctly from context (rename/settings) but were unsure what "backup" specifically
   meant for a document they hadn't finished. **Fixed**: the help text that explains each action
   (`ADVOCACY_TERMS.backupHelpText`/`restoreHelpText`) previously existed only as a hover-only HTML `title`
   attribute — invisible to a screenshot, invisible to a first glance, and weak for screen readers. It is
   now shown as always-visible secondary text directly under each button (`project-nav.tsx`). The label
   words themselves ("backup"/"restore") were kept — they were an explicit choice in this pass's own
   terminology plan, deliberately preferred over "Export/Import JSON," and "backup" is arguably common
   enough language (people back up phones/computers) that the real gap was explanation, not word choice.
2. **The "Calculated estimate" / "Reported measurement" status badges were not self-explanatory from the
   badge text alone** — reviewers correctly read the fuller inline text ("Model-based small-area estimate")
   when present, but the badge word alone left them unsure who did the calculating or how much to trust it.
   **Not changed this pass**: the fuller definition already exists as a `title` tooltip
   (`dataStatusDefinition`) behind the badge, matching this pass's own progressive-disclosure design
   (short label always visible, fuller detail available on demand) — and reviewers seeing only static
   screenshots cannot experience a hover state at all, a limitation of the review method itself, not
   necessarily the product. Flagged here rather than silently dropped in case a future pass wants the
   short definition itself reworded to be self-explanatory without any interaction.

**A concrete defect found by one reviewer, corroborated by re-inspection of the same screenshot by a
second:** the "Sources and limitations" section of a generated draft rendered a raw, full-precision ISO
8601 timestamp with microseconds and a UTC offset (`retrieved 2026-07-15T03:38:38.049106+00:00`) — a
machine-generated string that had never been reformatted for display. **Fixed**: `apps/api/.../
advocacy_generation.py` now formats any `retrieved_at` value that parses as a full ISO datetime down to a
plain date (`retrieved 2026-07-15`); the several other `retrieved_at` values that are already short,
human-written strings ("computed at analytics build time," "see Data page for per-source retrieval dates")
pass through unchanged. Covered by a new backend regression test
(`test_generate_sections_formats_a_full_iso_timestamp_retrieved_at_as_a_plain_date`).

**A methodology-transparency concern raised by two reviewers, disclosed but not changed this pass:** the
platform's own derived Health Equity Screening Score, when selected as evidence, is listed inside the
generated draft's "What evidence supports the concern?" bullet list alongside independently-sourced raw
metrics (e.g. CDC prevalence figures), with no sub-heading distinguishing "this platform's own composite
score" from "an external, independently-published measurement." The Evidence stage's own UI already groups
these into visually distinct sections ("Health equity screening score" vs. "Health needs and community
conditions"), but the *generated document text* does not carry that distinction forward. Not fixed this
pass — the generation logic that would need to change (`generate_sections()`'s `what_evidence_supports`
list) is backend content-generation logic, and reorganizing it deserved more scrutiny than this pass's
remaining time allowed; flagged here rather than fixed hastily or silently dropped.

**Non-issues correctly explained by the review methodology, not the product:** one reviewer could not find
the "Add to advocacy project" button in the Explore screenshot — the screenshot's viewport happened to crop
above the actual button, a capture-script limitation, not a real absence (confirmed live: the button is
present and functional, per the e2e cross-page suite). Two reviewers noted "tract"/"census tract" and
"percentile" are used without inline definition; these are pre-existing, established platform-wide terms
(see `apps/web/lib/glossary.ts` and the `GlossaryTerm` component used elsewhere in the product) already
covered by this platform's standing glossary pattern, not new jargon introduced by this pass, and reworking
the whole platform's baseline vocabulary is out of this Advocate-focused pass's scope.

## 5. Real bugs found and fixed during live verification (not usability-review findings)

Found through direct, hands-on testing of the running app via the Claude Browser pane (evidence selection,
draft creation, backup download/restore round-trip, document upload, project switching, mobile layout),
independent of the usability-review process above:

1. **An unhandled 4th backend `data_status` value.** `apps/api/.../advocacy_evidence.py` legitimately
   returns `"derived"` (for averaged/composite evidence, including the screening score itself) alongside
   the 3 values the frontend's type and label mapping accounted for — an evidence card was rendering the
   bare, untranslated word "derived." Fixed by widening `DataStatus` (`apps/web/lib/api.ts`) and
   `advocacy-terms.ts`'s label/definition maps to all 4 real values; the incomplete, now-superseded 3-value
   copy in `glossary.ts` was removed rather than left to drift independently (DEC-082).
2. **`getWorkspace`/`listWorkspaces` never healed a pre-existing record missing a newer schema field** —
   the safe-defaulting logic (`migrateWorkspace`) only ever ran on the backup-*import* path. A real,
   pre-existing project (created earlier in this same session's live testing, before this defect was found)
   exported with `titleIsUserSet` genuinely absent from its JSON, meaning that flag evaluated as falsy
   forever and would have silently re-triggered the auto-title-suggestion logic on every future edit,
   overwriting a name the project's owner believed was permanently theirs. This is the single most
   significant defect found this pass. Fixed by running every read through the same defaulting logic while
   explicitly preserving the record's real `updatedAt` (so `listWorkspaces`' sort order and "last saved"
   display aren't corrupted by the read itself) — DEC-084, covered by 2 new regression tests.
3. **The guided dashboard always resumed a reloaded, switched, or restored project at the first ("Project")
   stage**, regardless of how much of the project already existed — reloading a project that already had a
   place, audience, and evidence selected dropped the user back on the empty search form, while the
   summary panel's own "Next" guidance simultaneously (and wrongly) suggested "Choose a place..." Fixed
   with a shared `resumeStageFor(workspace)` helper applied uniformly on mount, project switch, and backup
   import (DEC-085).
4. **Explore's tract-detail cross-page handoff hardcoded a raw-GEOID display name** (`` `Tract ${geoid}` ``)
   even though the same component already fetches and displays a real human-readable name (`name_long`) for
   its own page heading, one line away. Fixed to pass `profile.name_long` instead (DEC-085). Access Lab's
   and Utilization's equivalent handoffs were investigated and left unchanged — their underlying API
   responses genuinely have no name field to use, a disclosed, backend-scoped limitation (RISK-037), not a
   frontend oversight.
5. **The `<details>`-based "Project options" menu and the 6-item output-type picker had ambiguous
   accessible names** for their step-indicator and card buttons in one accessibility-inspection tool,
   traced to the button's visible text being split across multiple child `<span>`/`<p>` elements rather
   than a single text node. Even though real screen readers generally compute a correct name from mixed
   child text content per the standard accessible-name algorithm, explicit `aria-label`s were added to both
   (`StepIndicator.tsx`, `draft-creator.tsx`) as a defensive, unambiguous improvement, consistent with this
   product's existing pattern of explicit `aria-label`s on evidence-card checkboxes.
6. **A genuine UI duplication**: 5 of the 6 output types already include a "Sources and limitations" section
   as real, always-visible document body content, making the separate "View sources and limitations"
   disclosure directly below it show the identical source list twice on screen. Fixed by only rendering the
   disclosure for output types whose document body doesn't already cover sources (`draft-preview.tsx`).

## 6. Verification evidence

- **Frontend unit tests:** 103/103 passing (17 files), including 2 new regression tests for the
  field-healing fix.
- **Frontend lint/typecheck:** clean.
- **Backend pytest:** 192/192 passing (advocacy/document-specific: 54/54), including 1 new regression test
  for the timestamp-formatting fix.
- **Advocate e2e suite** (`advocate-core.spec.ts`, `advocate-cross-page.spec.ts`, `advocate-document.spec.ts`
  — near-total rewrites for the new multi-stage flow and terminology, not just string touch-ups): **42/42
  passing** across both `desktop-chromium` and `mobile-chromium` projects. Every contributing page's
  cross-page handoff (Explore, Prioritize, Access Lab, Utilization) is asserted end-to-end with a
  plain-English confirmation-text check, not just an internal-record existence check, per this pass's
  explicit testing requirement. One isolated timeout was investigated and re-run 3 times cleanly before
  being confirmed a genuine flake (an unrelated setup step, evidence-list loading, under load) rather than
  a real regression, per this project's "do not call a failure a flake without isolated reproduction and
  evidence" rule.
- **Live manual verification** via the Claude Browser pane: full place → evidence → draft → review flow;
  evidence selection/removal/reorder; document upload with both a real match and a real no-match case;
  backup download → restore round-trip with a real captured file (including a deliberately corrupted file
  producing the expected plain-language error); project creation, switching, and the multi-project picker
  dialog; the mobile collapsed-summary-panel toggle; keyboard-reachable "Project options" disclosure;
  reduced-motion CSS support confirmed present.
- **No new runtime dependency added** — this pass touched only existing `apps/web`/`apps/api` source files
  and test files; no `package.json`/`pnpm-lock.yaml`/`pyproject.toml` changed.

## 7. Known limitations, disclosed not hidden

- Access Lab's and Utilization's "Add to advocacy project" handoff uses a raw-GEOID display name
  (`Tract 06085500100`) rather than a human-readable name, because their underlying API responses have no
  name field at all — would require a backend schema addition to fix (RISK-037).
- The generated draft's "What evidence supports the concern?" section does not visually distinguish the
  platform's own derived screening score from independently-sourced raw metrics within the generated text
  itself (though the Evidence-stage UI does group them separately) — flagged by usability review, not fixed
  this pass (§4).
- The "Calculated estimate"/"Reported measurement" badge text is a short label with a fuller definition
  behind a hover disclosure, which a static screenshot (and this review's own methodology) cannot exercise
  — an inherent limitation of blind screenshot-based review, not a confirmed defect.
- A generated draft is never persisted to `IndexedDB` (it's cheap, deterministic, derived output) — reloading
  the Review & share stage without a live `draftResult` shows a calm, already-existing "No draft has been
  created yet — Go to the Draft step" empty state rather than the draft itself; this is an intentional
  design tradeoff (avoiding a schema field for regenerable content), not an oversight.
