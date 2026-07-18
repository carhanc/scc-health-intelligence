# Advocate Workspace Comprehension, Dashboard, and Cross-Page Integration — Research

Pre-implementation research for a major usability pass on `/advocate` and every "Use in Advocate" entry
point across the platform. Written before any code changes, per this project's established practice
(prior consolidation and score/map passes both required research-before-implementation).

## 1. Current terminology problems

Confirmed by direct code inspection (`apps/web/app/advocate/*.tsx`, `apps/web/lib/workspace/*.ts`) and a
live screenshot of the page today:

- **"Workspace"** is the primary noun throughout: page toolbar reads "Workspace: Untitled workspace,"
  buttons "New / Rename / Duplicate / Export JSON / Import JSON / Delete." A first-time user has no reason
  to know what a "workspace" is in this context, and "Untitled workspace" as a default project name reads
  as a placeholder that was never meant to be user-facing.
- **"Export JSON" / "Import JSON"** expose a file-format implementation detail as the primary action verb.
  The exported file genuinely is JSON (`storage.ts:89`, `JSON.stringify(workspace, null, 2)`), but nothing
  about the *button label* needs to say so.
- **"Local only"** badge is shown with no explanation of what it means or why it matters.
- **`data_status` shown verbatim** — `EvidenceCard` renders the literal word `"modeled"` or `"observed"`
  from the API response as the badge text (`evidence-review.tsx:162`), not a plain-language rewrite.
- **"Configuration hash: <hex string>"** is printed at the bottom of every generated output
  (`output-generator.tsx:250-252`) with zero explanation of what it is or why a user would want it.
- **No confirmation message** anywhere in the "Use in Advocate" flow — the button just says "Preparing…"
  and navigates; a user searching for what got carried over has to infer it.
- **"Choose a place above to see matched evidence."** and section header **"Selected, in export order"**
  use "matched"/"export order" as if the user already knows the underlying evidence-matching mechanism.
- **"Recovered workspace (could not parse the imported file)"** — the only feedback shown for a corrupt
  import is a workspace *title*, not an error message; there is no error state at all for this case today.
- **IndexedDB failures are entirely unhandled in the UI** — `"IndexedDB is not available in this browser."`
  and `"IndexedDB operation failed."` (`storage.ts:17,42`) are thrown but never caught by any Advocate
  component, so a user on a browser with storage disabled currently sees nothing explain why nothing saves.

## 2. Current navigation/hierarchy problems

- The page is a **single long scroll**, not a guided flow: toolbar → entry-path tabs → two-column
  "1. Choose a place" / "2. Choose the issue" → "3. Review matched evidence" → "Your notes" → "4. Generate
  a brief and export," all stacked vertically with no persistent indication of where the user currently is
  or what's left to do. The numbering (1/2 inside one tab, then "3."/"4." below) is inconsistent — it reads
  as section numbers, not an actual step tracker a user can see progress against.
- There is no summary of the current project's state anywhere — a returning user reloading a saved
  workspace has to re-scroll the whole page to reconstruct what place, scenario, evidence, and draft state
  they left it in.
- The evidence list and the draft-generation controls are always both fully rendered regardless of whether
  a place has even been chosen yet, so a first-time visitor sees the entire apparatus at once rather than
  being guided one step at a time.

## 3. Cross-page integration problems

Confirmed via a full grep of every call site of `UseInAdvocateButton` (5 real call sites: Explore's tract,
place, and district profiles; Prioritize's per-row driver expansion; Access Lab's summary panel; plus one
`label="Use"` override in Utilization's geographic table):

- **Only geography identity and scenario ID travel with the click** (`quick-add.ts:16-29`) — value, unit,
  source, year, caveat, and observed/modeled/calculated status are *not* preserved at click time; they are
  re-fetched fresh once the new project loads. This means the button's implicit promise ("take this specific
  fact with you") isn't quite what happens today — worth being honest about in the redesigned confirmation
  copy rather than overclaiming.
- **No confirmation message** is shown before navigating away — a user clicking from, say, Prioritize has no
  visual anchor connecting "the row I clicked" to "the page I landed on."
- **Access Lab's call site never passes a `scenarioId`** — an inconsistency versus the other four call
  sites, meaning evidence arriving from Access Lab always uses whatever scenario the new project defaults to
  rather than the one active when the user clicked.
- **Label inconsistency**: 5 of 6 call sites use the default "Use in Advocate"; Utilization alone overrides
  to the bare "Use" (with an explicit test comment warning that a non-exact match would collide with a
  column-sort button of a similar name) — a real, disclosed naming collision risk in the existing code.
- **No pages currently offer a choice of project** — a click always creates a brand-new project
  (`createWorkspaceFromGeography`, always calls `createEmptyWorkspace`), so a user who already has an
  in-progress project and clicks a second "Use in Advocate" elsewhere gets a second, unrelated new project
  rather than an option to add to the one they were just building.
- **No entry point exists at all** from Overview, Utilization's non-table views, Validate, Copilot, or Data
  — the task's audit list names these as candidates; current code confirms zero call sites in any of them.

## 4. User groups

- **County commissioners and elected-body staff** — need a credible, source-backed one-page brief or
  question list they can bring into a meeting; not fluent in the platform's data model, not particularly
  fluent in general software UI conventions either.
- **Community advocates and organizers** — building public comments or talking points, often working from a
  phone, often returning to a partially-built project across multiple short sessions.
- **Researchers and analysts** — the only group likely to want the full technical detail (raw values,
  citations, configuration hash) readily available, but even they benefit from it being organized rather
  than always-on.
- **First-time, non-technical visitors** — the group this redesign is explicitly optimized for; per the
  task's explicit instruction, at least one blind usability reviewer must be unfamiliar with software
  terminology, standing in for this group.

## 5. Core jobs to be done

1. "I want to build a case for [place] having [problem]" — start from a place, gather evidence.
2. "I already found something on [Explore/Prioritize/Access Lab] — take it with me." — cross-page handoff.
3. "I have a meeting document — does it already say something useful?" — document upload.
4. "I need something I can actually hand to a decision-maker" — draft creation and export.
5. "I want to come back to this next week" — save, resume, rename, duplicate.
6. "I need to move this to another computer / share it with a colleague" — backup and restore.

## 6. Target terminology (central map)

Implemented as `apps/web/lib/advocacy-terms.ts`, exporting a small set of named string constants so no
future page can reintroduce old wording independently. Full mapping:

| Internal concept (unchanged) | Old UI text | New UI text |
|---|---|---|
| `AdvocacyWorkspace` | "Workspace" | "Advocacy project" / "Project" |
| create a workspace | "New" | "Start a new project" |
| `evidenceSnapshots` fetched for a geography | "matched evidence" | "Evidence found for this project" |
| `selectedEvidenceIds` | "Selected evidence" | "Evidence you're using" |
| the full evidence set attached to a project | "evidence bundle" | "Project evidence" |
| `requestedOutputs`/output-type selector | "Output type" | "What do you want to create?" |
| `targetAudience` selector | "Audience" | "Who is this for?" |
| brief generation | "Generate" | "Create draft" |
| the generated brief | "Generated output" | "Draft" |
| document upload feature | "Document Intelligence" (never shown, but the concept) | "Find useful evidence in a document" |
| `analyzeDocument` action | "Choose a file to upload" / analyze | "Review this document" |
| `detected_topics` | "matched passage"/"detected topics" | "Relevant passages" |
| `exportWorkspaceJson` | "Export JSON" | "Download project backup" |
| `importWorkspaceJson` | "Import JSON" | "Restore a project backup" |
| the `.json` file format itself | (implied by button text) | never named in normal UI; disclosed only inside "Advanced" help text as "Project backups use a JSON file format." |

Every one of these is a **presentation-layer rename only** — `AdvocacyWorkspace`'s field names
(`workspaceId`, `selectedEvidenceIds`, etc.), the IndexedDB store name, the exported file's JSON shape, and
the `.json` extension are all unchanged, so existing saved projects and previously downloaded backups keep
working without any migration.

## 7. Desktop wireframe (target)

```
┌────────────────────────────────────────────────────────────────────────────┐
│ Turn evidence into action                              [Saved on this device]│
│ Create a clear, sourced advocacy document using evidence from across the    │
│ platform.                                                                    │
├───────────────┬───────────────────────────────────┬─────────────────────────┤
│ PROJECT NAV    │ MAIN WORK AREA                     │ SUMMARY / PREVIEW       │
│ (~260px)       │ (flexible)                         │ (~380px)                │
│                │                                     │                         │
│ Sunnyvale      │  ● Project  ○ Evidence  ○ Draft    │ Sunnyvale primary-care  │
│ primary-care   │    ○ Review & Share                │ access                  │
│ access [rename]│                                     │                         │
│                │  Step content for the active stage  │ Place: Sunnyvale        │
│ 1 Project   ✓  │  (place/goal/audience, or evidence  │ Goal: Request a meeting│
│ 2 Evidence  ✓  │  list, or output picker, or draft   │ Evidence: 5 facts       │
│ 3 Draft     ○  │  preview) renders here, one stage   │ Draft: Not created yet  │
│ 4 Review    ○  │  dominant at a time.                │                         │
│                │                                     │ Next: Review your       │
│ Project options│                                     │ evidence →              │
│  Rename        │                                     │                         │
│  Duplicate     │                                     │                         │
│  Download backup│                                    │                         │
│  Restore backup│                                     │                         │
│  Delete        │                                     │                         │
│                │                                     │                         │
│ + Start new    │                                     │                         │
│   project      │                                     │                         │
└───────────────┴───────────────────────────────────┴─────────────────────────┘
```

At ≤1024px, the right summary/preview column collapses behind an explicit "Preview" toggle rather than
disappearing silently.

## 8. Mobile wireframe (target)

Single column: project name + compact step indicator (sticky), current stage's content, one large primary
action at the bottom of the viewport (sticky or repeated after long lists so a user scrolling a long evidence
list never loses the "Continue" action). Draft preview opens as a full-screen sheet, not squeezed into the
same column as the builder.

## 9. Evidence-card model (target)

Grouped by plain-language theme (Health needs, Access barriers, Community resources, Social and
environmental conditions, Service use, Data quality and limitations, Uploaded documents) instead of a flat
list. Per card: plain-language statement, key value, county comparison, place, source + year, an
observed/modeled/calculated label rewritten from the raw `data_status` word, a limitation line when present,
an include/remove control, and an optional "Why this matters"/"See calculation and limitations" disclosure
for anything beyond the seven always-visible fields. Raw contribution points and weights never appear by
default, matching the platform-wide progressive-disclosure convention already established in Explore.

## 10. Draft-builder model (target)

Four stages (Project → Evidence → Draft → Review & Share) as a persistent, visible step indicator a user can
click backward on without losing state (all stages read from the same `AdvocacyWorkspace`, nothing is
discarded by navigating). "Draft" stage: a plain-language "What do you want to create?" card picker over the
6 real output types (no invented types), a "Who is this for?" audience picker, a calm readiness checklist,
then "Create draft." "Review & Share" stage: the generated brief becomes the dominant visual surface,
resembling a document/print preview rather than an API response — with the existing real actions (Print /
save as PDF, Download CSV) clearly labeled, plus a "View sources and limitations" disclosure rather than
always-on source metadata, and the always-visible one-line non-causal caveat required by CLAUDE.md.

## 11. Backup/restore language

Moved into a single "Project options" menu (Rename / Duplicate / Download project backup / Restore a project
backup / Delete), replacing the always-visible toolbar row of six buttons. Exact copy specified by the task
is adopted verbatim: "Download a backup to move this project to another browser or device." / "Choose a
project backup previously downloaded from Advocate." Error states rewritten in plain English: "This file
isn't a valid Advocate project backup." for unparseable/wrong-shape files (replacing the current silent
"Recovered workspace..." fallback title with an actual visible error, while still safely falling back to
*not* destroying the current project — see §14 non-goals for why full multi-version migration UX isn't
built this pass).

## 12. Accessibility risks

- The step indicator must be a real, labeled landmark (not just styled `<div>`s) with `aria-current` on the
  active step, reachable and operable via keyboard alone.
- Evidence include/remove controls must announce their new state (already partially covered by the existing
  `aria-label="Include X..."` pattern — the redesign keeps and extends this, doesn't remove it).
- Document upload's "progress" and "we found N relevant passages" results must be announced to screen
  readers, not just visually revealed.
- The draft preview, once it becomes the dominant surface, must retain a sane heading hierarchy for
  screen-reader navigation (existing `SECTION_LABELS` headings are a good foundation, kept).
- Collapsing the right-hand preview column at ≤1024px must not remove it from the DOM entirely in a way
  that breaks a `Tab`-key-only flow — it becomes reachable via an explicit, labeled toggle.

## 13. Performance risks

- Must not add a network request per evidence card or per step change — evidence is already fetched once
  per geography/scenario via `evidence-review.tsx`'s existing `useQuery`; the redesign reads from that same
  cached result, just re-groups/re-renders it, no new fetch.
- The right-hand "live summary" panel must be a memoized derivation of existing workspace state, not a
  second independent computation.
- Multiple saved projects must not all render their full evidence lists simultaneously — only the active
  project's data is ever mounted; the project switcher lists titles only (already true today,
  `listWorkspaces()` returns full objects but the toolbar only reads `.title`/`.workspaceId` from them —
  the redesign keeps this shape but should confirm the dashboard summary doesn't accidentally deep-render
  every workspace's evidence).
- No new heavy dependency for the draft/document preview — the existing native `window.print()` approach is
  kept; a real in-browser document-editor library is explicitly out of scope this pass.

## 14. Implementation plan

1. Central terminology module (`apps/web/lib/advocacy-terms.ts`) + rename every literal string in
   `advocate-client.tsx`, `workspace-toolbar.tsx`, `evidence-review.tsx`, `document-entry.tsx`,
   `output-generator.tsx`, `geography-issue-entry.tsx` to reference it.
2. Rebuild `advocate-client.tsx` around an explicit 4-stage step model with a real step-indicator component,
   preserving all existing state/props wiring (no schema changes).
3. Desktop 3-zone layout (project nav / work area / summary-preview); mobile single-column with sticky
   step nav and primary action.
4. Landing state (no project yet) with the two offered paths and 6 output-type preview cards.
5. Project dashboard summary (place/goal/audience/evidence count/draft status/next action), auto-suggested
   project title (place + issue, editable, never a raw UUID — `createEmptyWorkspace`'s title default already
   isn't a UUID today, just "Untitled workspace"; this becomes a genuinely descriptive suggestion instead).
6. Evidence card redesign (themed grouping, plain-language observed/modeled/calculated, disclosure for
   technical detail) + document-upload flow rename and "relevant passages"/no-match copy.
7. Output selection as a visual card picker; audience/goal as plain-language questions; readiness checklist;
   draft preview restyled as the dominant, document-like final surface with existing actions relabeled.
8. Project-options menu replacing the always-visible toolbar row; plain-English backup/restore copy and
   error states (a real, visible error for corrupt/invalid imports, replacing today's silent fallback).
9. Unify all 6 cross-page call sites on one CTA label, add a plain-language confirmation, add a simple
   project picker when more than one project exists (currently always creates a new one).
10. Tests, accessibility, visual review, usability review, commits, push.

## 15. Explicit non-goals

- No account system, no server-side project storage — everything stays IndexedDB, browser-local, per the
  task's explicit constraint.
- No new/invented output types beyond the real 6 already implemented server-side.
- No real multi-version schema migration engine — `migrateWorkspace`'s existing safe-defaults-per-field
  approach is kept and given a *visible* error message for the "couldn't understand this file at all" case,
  but a genuine future `schemaVersion: 2` conditional-migration chain is out of scope; this pass does not
  introduce a second schema version.
- No AI-assisted generation mode added to Advocate — production brief generation remains deterministic-only,
  matching the existing, explicit `advocacy_generation.py` design; Copilot's separate AI-gated pattern is
  not imported into Advocate this pass.
- No rich in-browser document editor for the draft — `window.print()`-based PDF/print stays the mechanism;
  only its surrounding presentation changes.
- No change to `AdvocacyEvidenceItem`'s backend shape, the evidence-matching/scoring logic, citations, or
  any scientific calculation.
- No copying of GOV.UK's or USWDS's visual branding, icons, or exact component code — their task-list,
  check-answers, step-indicator, and process-list *interaction patterns* are the reference, not their pixels.
