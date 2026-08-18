"use client";

import { useState } from "react";
import { Button, Card, DataModeBadge } from "@scc-health/ui";
import type { GeneratedBriefResponse } from "@/lib/api";
import { ADVOCACY_TERMS } from "@/lib/advocacy-terms";

const SECTIONS_BY_OUTPUT_TYPE: Record<string, string[]> = {
  one_page_brief: [
    "what_is_happening",
    "where_is_it_happening",
    "what_evidence_supports_the_concern",
    "what_evidence_does_not_prove",
    "sources_and_limitations",
  ],
  detailed_memo: [
    "what_is_happening",
    "where_is_it_happening",
    "who_may_be_affected",
    "what_evidence_supports_the_concern",
    "what_evidence_does_not_prove",
    "what_existing_resources_are_nearby",
    "what_intervention_scenarios_fit",
    "sources_and_limitations",
    "user_notes",
  ],
  staff_questions: ["sources_and_limitations"],
  public_comment: [
    "what_is_happening",
    "who_may_be_affected",
    "what_evidence_supports_the_concern",
    "what_evidence_does_not_prove",
  ],
  geography_profile: [
    "where_is_it_happening",
    "what_evidence_supports_the_concern",
    "what_existing_resources_are_nearby",
    "what_intervention_scenarios_fit",
    "sources_and_limitations",
  ],
  source_appendix: ["sources_and_limitations"],
};

const QUESTIONS_SHOWN_FOR: ReadonlySet<string> = new Set(["one_page_brief", "detailed_memo", "staff_questions"]);

const SECTION_LABELS: Record<string, string> = {
  what_is_happening: "What is happening?",
  where_is_it_happening: "Where is it happening?",
  who_may_be_affected: "Who may be affected?",
  what_evidence_supports_the_concern: "What evidence supports the concern?",
  what_evidence_does_not_prove: "What does the evidence not prove?",
  what_existing_resources_are_nearby: "What existing resources are nearby?",
  what_intervention_scenarios_fit: "What intervention scenarios fit?",
  sources_and_limitations: "Sources and limitations",
  user_notes: "Notes",
};

/** The "Review & Share" stage -- the dominant final surface, styled to
 * read as a document/print preview rather than an API response. Source
 * status is summarized in one line up top; full source metadata stays
 * behind an explicit "View sources and limitations" disclosure rather
 * than always-on (docs/design/advocate-intuitive-workspace-research.md
 * §"citations and sources"). The always-visible one-line non-causal
 * caveat is CLAUDE.md's non-negotiable rule -- kept outside any
 * disclosure, same as Explore's headline (DEC-077). */
export function DraftPreview({
  brief,
  onBackToEvidence,
  onEditProject,
  onCreateNewVersion,
}: {
  brief: GeneratedBriefResponse;
  onBackToEvidence: () => void;
  onEditProject: () => void;
  onCreateNewVersion: () => void;
}) {
  const [copied, setCopied] = useState(false);

  function handlePrint() {
    window.print();
  }

  function draftAsPlainText(): string {
    const lines: string[] = [];
    lines.push(`${brief.geography_label}${brief.scenario_label ? ` -- ${brief.scenario_label}` : ""}`);
    for (const key of SECTIONS_BY_OUTPUT_TYPE[brief.output_type] ?? Object.keys(brief.sections)) {
      if (!brief.sections[key]) continue;
      lines.push("", SECTION_LABELS[key] ?? key, brief.sections[key]!);
    }
    if (QUESTIONS_SHOWN_FOR.has(brief.output_type) && brief.questions.length > 0) {
      lines.push("", "Questions for decision-makers", ...brief.questions.map((q) => `- ${q.question}`));
    }
    lines.push("", ADVOCACY_TERMS.causalCaveat);
    return lines.join("\n");
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(draftAsPlainText());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can fail (permissions, insecure context) -- the
      // draft itself is unaffected either way, so this fails quietly
      // rather than showing an alarming error for a non-destructive
      // convenience action; Print/Download remain available.
    }
  }

  function handleDownloadCsv() {
    const header = "evidence_id,label,value,data_status,publisher,source_vintage,source_url,citation,limitation";
    const rows = brief.evidence_used.map((e) =>
      [
        e.evidence_id,
        e.label,
        e.value,
        e.data_status,
        e.publisher,
        e.source_vintage,
        e.source_url ?? "",
        e.citation,
        e.limitation ?? "",
      ]
        .map((field) => `"${String(field).replace(/"/g, '""')}"`)
        .join(","),
    );
    const csv = [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "advocacy-evidence-sources.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  const sourceCount = new Set(brief.evidence_used.map((e) => `${e.publisher}|${e.source_vintage}`)).size;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={onBackToEvidence}>
            Back to evidence
          </Button>
          <Button variant="secondary" size="sm" onClick={onEditProject}>
            Edit choices
          </Button>
          <Button variant="secondary" size="sm" onClick={onCreateNewVersion}>
            {ADVOCACY_TERMS.recreateDraftCta}
          </Button>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" onClick={handleCopy}>
            {copied ? "Copied!" : "Copy"}
          </Button>
          <Button size="sm" variant="secondary" onClick={handleDownloadCsv}>
            Download sources
          </Button>
          <Button size="sm" onClick={handlePrint}>
            Print / save as PDF
          </Button>
        </div>
      </div>

      <div id="advocate-output-print-area">
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-base font-semibold text-[var(--color-text-primary)]">
                {brief.geography_label}
                {brief.scenario_label && ` -- ${brief.scenario_label}`}
              </h3>
              <p className="text-xs text-[var(--color-text-tertiary)]">
                Created {new Date(brief.generated_at).toLocaleString()} for {brief.audience} audience{" "}
                <DataModeBadge mode={brief.data_mode} />
              </p>
            </div>
          </div>

          <p className="mt-3 text-sm text-[var(--color-text-secondary)]">
            {brief.evidence_used.length} fact{brief.evidence_used.length === 1 ? "" : "s"} · {sourceCount} source
            {sourceCount === 1 ? "" : "s"} · Citations included
          </p>

          <div className="mt-4 space-y-4">
            {(SECTIONS_BY_OUTPUT_TYPE[brief.output_type] ?? Object.keys(brief.sections))
              .filter((key) => brief.sections[key])
              .map((key) => (
                <div key={key}>
                  <h4 className="text-sm font-semibold text-[var(--color-text-primary)]">
                    {SECTION_LABELS[key] ?? key}
                  </h4>
                  <p className="mt-1 whitespace-pre-line text-sm text-[var(--color-text-secondary)]">
                    {brief.sections[key]}
                  </p>
                </div>
              ))}
          </div>

          {QUESTIONS_SHOWN_FOR.has(brief.output_type) && brief.questions.length > 0 && (
            <div className="mt-4">
              <h4 className="text-sm font-semibold text-[var(--color-text-primary)]">
                Questions for decision-makers
              </h4>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-[var(--color-text-secondary)]">
                {brief.questions.map((q) => (
                  <li key={q.question}>{q.question}</li>
                ))}
              </ul>
            </div>
          )}

          <p className="mt-4 text-xs text-[var(--color-text-secondary)]">{ADVOCACY_TERMS.causalCaveat}</p>

          {/* Most output types already include a "sources_and_limitations"
              section as real document content above (see
              SECTIONS_BY_OUTPUT_TYPE) -- showing this disclosure too would
              duplicate the same source list twice on screen. Only render it
              for output types whose document body doesn't already cover
              sources (currently just public_comment). */}
          {!(SECTIONS_BY_OUTPUT_TYPE[brief.output_type] ?? []).includes("sources_and_limitations") && (
            <details className="mt-3 print:hidden">
              <summary className="cursor-pointer text-xs font-medium text-[var(--color-interactive)]">
                View sources and limitations
              </summary>
              <ul className="mt-2 space-y-2">
                {brief.evidence_used.map((e) => (
                  <li key={e.evidence_id} className="text-xs text-[var(--color-text-secondary)]">
                    <span className="font-medium text-[var(--color-text-primary)]">{e.label}</span> --{" "}
                    {e.source_url ? (
                      <a
                        href={e.source_url}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="font-medium text-[var(--color-interactive)] underline underline-offset-2 print:no-underline print:text-inherit"
                      >
                        {e.publisher}
                      </a>
                    ) : (
                      e.publisher
                    )}
                    , {e.source_vintage}
                    {e.limitation && <>. {e.limitation}</>}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </Card>
      </div>
    </div>
  );
}
