"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button, Card, DataModeBadge, ErrorState, LoadingRegion, SkeletonText } from "@scc-health/ui";
import { api, ApiError, type AdvocacyEvidenceItem, type GeneratedBriefResponse } from "@/lib/api";
import { CUSTOM_SCENARIO_ID } from "../prioritize/scenario-selector";

const OUTPUT_TYPES = [
  { id: "one_page_brief", label: "One-page meeting brief" },
  { id: "detailed_memo", label: "Detailed advocacy memo" },
  { id: "staff_questions", label: "Commissioner / staff question list" },
  { id: "public_comment", label: "Public-comment talking points" },
  { id: "geography_profile", label: "Geography evidence profile" },
  { id: "source_appendix", label: "Source and limitation appendix" },
];

const AUDIENCES = [
  { id: "commissioner", label: "Commissioner / staff" },
  { id: "public", label: "General public" },
  { id: "advocate", label: "Fellow advocates" },
];

/** Every output type is built from the same generated sections/questions
 * (one backend call, no duplicated generation logic) -- what makes each
 * output genuinely distinct is which of those sections it surfaces and
 * whether it includes the question list, matching each output's real
 * purpose (a 1-minute public comment should not carry a full methods
 * appendix; a staff question list should lead with the questions, not
 * bury them at the bottom). */
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

const QUESTIONS_SHOWN_FOR: ReadonlySet<string> = new Set([
  "one_page_brief",
  "detailed_memo",
  "staff_questions",
]);

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

export function OutputGenerator({
  geographyLabel,
  scenarioId,
  evidence,
  notes,
  onExported,
}: {
  geographyLabel: string | null;
  scenarioId: string;
  evidence: AdvocacyEvidenceItem[];
  notes: string;
  onExported: (outputType: string, configurationHash: string) => void;
}) {
  const [outputType, setOutputType] = useState(OUTPUT_TYPES[0]!.id);
  const [audience, setAudience] = useState(AUDIENCES[0]!.id);

  const mutation = useMutation({
    mutationFn: () =>
      api.generateAdvocacyBrief({
        outputType,
        geographyLabel: geographyLabel ?? "Selected geography",
        scenarioId: scenarioId === CUSTOM_SCENARIO_ID ? null : scenarioId,
        audience,
        evidence,
        notes,
        dataMode: "live",
      }),
    onSuccess: (result) => onExported(outputType, result.configuration_hash),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-4">
        <label className="text-sm">
          <span className="block font-medium text-[var(--color-text-primary)]">Output type</span>
          <select
            value={outputType}
            onChange={(e) => setOutputType(e.target.value)}
            className="mt-1 rounded-[var(--radius-sm)] border border-[var(--color-border)] px-2 py-1"
          >
            {OUTPUT_TYPES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="block font-medium text-[var(--color-text-primary)]">Audience</span>
          <select
            value={audience}
            onChange={(e) => setAudience(e.target.value)}
            className="mt-1 rounded-[var(--radius-sm)] border border-[var(--color-border)] px-2 py-1"
          >
            {AUDIENCES.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
        </label>
        <Button className="self-end" onClick={() => mutation.mutate()} disabled={evidence.length === 0}>
          Generate
        </Button>
      </div>

      {evidence.length === 0 && (
        <p className="text-sm text-[var(--color-text-secondary)]">
          Select at least one evidence item above before generating an output.
        </p>
      )}

      {mutation.isPending && (
        <LoadingRegion label="Generating output">
          <SkeletonText lines={8} />
        </LoadingRegion>
      )}
      {mutation.isError && (
        <ErrorState
          title="Could not generate this output"
          description={mutation.error instanceof ApiError ? mutation.error.message : "Try again."}
        />
      )}
      {mutation.data && <GeneratedOutput brief={mutation.data} />}
    </div>
  );
}

function GeneratedOutput({ brief }: { brief: GeneratedBriefResponse }) {
  function handlePrint() {
    window.print();
  }

  function handleDownloadCsv() {
    const header = "evidence_id,label,value,data_status,publisher,source_vintage,citation,limitation";
    const rows = brief.evidence_used.map((e) =>
      [e.evidence_id, e.label, e.value, e.data_status, e.publisher, e.source_vintage, e.citation, e.limitation ?? ""]
        .map((field) => `"${String(field).replace(/"/g, '""')}"`)
        .join(","),
    );
    const csv = [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "advocacy_evidence.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div id="advocate-output-print-area">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-semibold text-[var(--color-text-primary)]">
              {brief.geography_label}
              {brief.scenario_label && ` -- ${brief.scenario_label}`}
            </h3>
            <p className="text-xs text-[var(--color-text-tertiary)]">
              Generated {new Date(brief.generated_at).toLocaleString()} for {brief.audience} audience{" "}
              <DataModeBadge mode={brief.data_mode} />
            </p>
          </div>
          <div className="flex gap-2 print:hidden">
            <Button size="sm" variant="secondary" onClick={handleDownloadCsv}>
              Download CSV
            </Button>
            <Button size="sm" onClick={handlePrint}>
              Print / save as PDF
            </Button>
          </div>
        </div>

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

        <p className="mt-4 rounded-[var(--radius-sm)] bg-[var(--color-caution-subtle)] p-2 text-xs text-[var(--color-caution-strong)]">
          {brief.non_causal_disclaimer}
        </p>
        <p className="mt-2 text-xs text-[var(--color-text-tertiary)]">
          Configuration hash: <code>{brief.configuration_hash}</code>
        </p>
      </Card>
    </div>
  );
}
