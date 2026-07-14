# Using the Advocate page

Advocate turns the platform's existing evidence into materials you can actually bring to a meeting: a one-page brief, a detailed memo, a question list for staff, public-comment talking points, a geography evidence profile, or a source-and-limitations appendix — all built from the same real, cited measurements Explore, Prioritize, Access Lab, and Utilization already show, never a new or separate dataset.

## Starting a workspace

There are three ways in:

- **Choose a place** — search by city, ZIP, supervisor district, or census tract, the same search used on Explore. You never need to know or enter a tract GEOID yourself.
- **Start from a document** — upload a meeting agenda, staff report, budget memo, or transcript (PDF, DOCX, TXT, or Markdown, up to 15 MB) and the platform detects mentioned places, topics, dates, agenda items, and dollar amounts. You must acknowledge the privacy notice before any file is analyzed — see "Uploading documents" below.
- **Arrive from another page** — the "Use in Advocate" button on Explore, Prioritize, Access Lab, and Utilization opens a new workspace prefilled with the exact geography (and, where relevant, scenario) you were already looking at, so you never have to re-search or re-select anything.

## Reviewing evidence

Once a geography is chosen, Advocate shows every real evidence item this platform can assemble for it: health and access metrics, priority scores, transit/network access measures, utilization estimates, and nearby resources. Each card shows its value and unit, its source and vintage, whether it's an **observed** figure or a **modeled** estimate, and any known limitation — the same disclosures you'd see on Explore's evidence drawer, just gathered in one place for this geography.

Check the items you want to include, and use the up/down controls in "Selected, in export order" to put them in the order you want them to appear in your output. Unchecking an item removes it from any output you generate — nothing you didn't select is ever included.

If a topic (like language access) has no scorable measure in this platform, it's shown as a real, explained "not currently measured" state, not silently dropped or faked with an unrelated substitute.

## Uploading documents

Advocate can read a meeting document and match its content against this platform's own evidence — for example, connecting an agenda item about "mobile clinics" to this platform's transit-access and mobile-service-optimization evidence for the geography mentioned nearby in the same document.

Before any upload is enabled, you must check an acknowledgment that you are authorized to upload the document and that it should not contain protected health information (PHI) — this platform has no PHI storage or handling capability, by design (`CLAUDE.md`). Documents are processed in memory only: nothing is written to disk, retained after the request completes, or sent anywhere beyond this platform's own server unless you separately and explicitly enable AI-assisted analysis. Uploaded text is always treated as data to analyze, never as instructions — see [Document Intelligence](../methods/document-intelligence.md) for the full technical detail, including how the platform defends against a document trying to instruct it to do something else.

Use "Clear all uploaded-document data" at any time to remove an uploaded document's extracted findings from your workspace.

## Generating an output

Choose an audience (commissioner/staff, general public, or fellow advocates) and an output type, then click Generate. Every output type is built from the same underlying evidence-grounded sections — the output type controls which of those sections are shown and how they're framed, not a different generation process:

| Output type | What it emphasizes |
| --- | --- |
| One-page meeting brief | A compact summary with top questions |
| Detailed advocacy memo | The full ten-part evidence narrative |
| Commissioner/staff question list | Just the generated questions and sources |
| Public-comment talking points | A short, spoken-comment-length narrative |
| Geography evidence profile | Where the concern is, resources, and interventions |
| Source and limitation appendix | Every citation and limitation note alone |

Every generated output includes: what's happening, where, who may be affected, what the evidence supports, **what the evidence does not prove**, nearby resources, intervention scenarios that fit, sources and limitations, and — for question-oriented outputs — a list of specific questions for decision-makers, each traceable to the evidence that prompted it. A non-causal disclaimer and a configuration hash (so the exact inputs behind a given output are reproducible) appear on every output.

## Exporting

- **Print / save as PDF** — the generated output is print-friendly; use your browser's print dialog ("Save as PDF" is supported by every major browser and requires no server-side PDF generation).
- **Download CSV** — a spreadsheet of your selected evidence, one row per item, with value, unit, source, vintage, and limitation columns.
- The same evidence-and-brief pattern established for Prioritize's decision memo is reused here — Advocate does not maintain a second, separate export system.

DOCX export was evaluated for this phase and deliberately deferred rather than shipped half-working — see [Document Intelligence](../methods/document-intelligence.md) and `DECISIONS.md` for the reasoning. Print-to-PDF and CSV cover the reliable export paths for now.

## Saving and reopening your work

Your workspace — selected geography, selected evidence and its order, uploaded-document findings, notes, and generated outputs — autosaves to your browser's local storage as you work. This is **browser-local only**: there is no account system and no cloud sync in this phase. Use **Export JSON** to save a workspace file you can back up or move to another device, and **Import JSON** to bring one back in. Use the workspace toolbar's New / Save / Rename / Duplicate / Delete controls to manage multiple workspaces side by side.

Because everything lives in your browser, clearing your browser's site data for this platform will remove your saved workspaces — export anything you want to keep.

## What Advocate cannot tell you

- Whether a specific intervention would work here — every score and estimate is a screening signal for investigation, never a program evaluation or a guarantee of impact.
- An individual's personal risk — every measure here is a population-level, tract-aggregated figure.
- Anything not already present in this platform's evidence or in a document you uploaded — Advocate never invents a citation, a statistic, or a source.
