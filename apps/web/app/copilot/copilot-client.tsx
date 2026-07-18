"use client";

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Badge,
  BackendWakeState,
  Button,
  Card,
  DataModeBadge,
  ErrorState,
  LoadingRegion,
  SkeletonText,
} from "@scc-health/ui";
import { api, ApiError, type AdvocacyEvidenceItem, type CopilotAction } from "@/lib/api";
import { SearchPanel } from "../explore/search-panel";
import type { SelectedGeography } from "../explore/selection";
import { ScenarioSelector, CUSTOM_SCENARIO_ID } from "../prioritize/scenario-selector";

const ACTIONS: { id: CopilotAction; label: string }[] = [
  { id: "summarize_geography", label: "Summarize this geography" },
  { id: "explain_prioritization", label: "Explain why this area is prioritized" },
  { id: "prepare_questions", label: "Prepare questions for this meeting" },
  { id: "list_what_cannot_be_concluded", label: "List what cannot be concluded" },
  { id: "identify_missing_evidence", label: "Identify missing evidence" },
  { id: "draft_public_comment", label: "Draft a one-minute public comment" },
  { id: "draft_commissioner_briefing", label: "Draft a commissioner briefing" },
  { id: "rewrite_for_public_audience", label: "Rewrite for a public audience" },
];

export function CopilotClient() {
  const [selectedGeography, setSelectedGeography] = useState<SelectedGeography | null>(null);
  const [scenarioId, setScenarioId] = useState("default_integrated_screen_v1");
  const [action, setAction] = useState<CopilotAction>("summarize_geography");
  const [instruction, setInstruction] = useState("");

  const statusQuery = useQuery({ queryKey: ["copilot-status"], queryFn: () => api.getCopilotStatus() });

  const evidenceQuery = useQuery({
    queryKey: ["copilot-evidence", selectedGeography?.geographyType, selectedGeography?.geoid, scenarioId],
    queryFn: () =>
      api.getAdvocateEvidence(
        selectedGeography!.geographyType,
        selectedGeography!.geoid,
        scenarioId === CUSTOM_SCENARIO_ID ? undefined : scenarioId,
      ),
    enabled: !!selectedGeography,
    retry: 1,
  });

  const askMutation = useMutation({
    mutationFn: (evidence: AdvocacyEvidenceItem[]) =>
      api.askCopilot({ action, instruction, evidence, useLlm: true }),
  });

  function handleAsk() {
    if (!evidenceQuery.data) return;
    askMutation.mutate(evidenceQuery.data.items);
  }

  return (
    <div className="mx-auto max-w-[var(--container-max)] px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
      <div className="max-w-3xl">
        <h1 className="text-2xl font-semibold text-[var(--color-text-primary)] sm:text-3xl">Copilot</h1>
        <p className="mt-1.5 text-sm text-[var(--color-text-secondary)]">
          Understand and communicate the evidence: ask a question in plain language and get a grounded,
          cited answer. Every number comes from this platform&apos;s own analytics -- the assistant only
          drafts prose from evidence it was actually given, never invents a statistic or a source.
        </p>
        {statusQuery.data && (
          <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--color-text-secondary)]">
            {statusQuery.data.llm_configured ? (
              <>
                <Badge tone="success">AI drafting enabled</Badge>
                <span>Model: {statusQuery.data.model}</span>
              </>
            ) : (
              <>
                <Badge tone="neutral">Deterministic mode</Badge>
                <span>No AI provider configured. Guided templates are always available.</span>
              </>
            )}
          </p>
        )}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
        <div className="order-2 space-y-4 lg:order-1">
          <SearchPanel selected={selectedGeography} onSelect={setSelectedGeography} />
          <ScenarioSelector selectedScenarioId={scenarioId} onSelect={setScenarioId} />
        </div>

        <div className="order-1 space-y-4 lg:order-2">
          <Card>
            <label className="block text-sm font-medium text-[var(--color-text-primary)]" htmlFor="copilot-action">
              What do you need?
            </label>
            <select
              id="copilot-action"
              value={action}
              onChange={(e) => setAction(e.target.value as CopilotAction)}
              className="mt-1 w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] px-2 py-1.5 text-sm"
            >
              {ACTIONS.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </select>

            <label className="mt-3 block text-sm font-medium text-[var(--color-text-primary)]" htmlFor="copilot-instruction">
              Additional instruction (optional)
            </label>
            <textarea
              id="copilot-instruction"
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              rows={2}
              className="mt-1 w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] px-2 py-1.5 text-sm"
              placeholder="e.g. Keep it under 100 words."
            />

            <Button
              className="mt-3"
              onClick={handleAsk}
              disabled={!selectedGeography || evidenceQuery.isLoading || askMutation.isPending}
            >
              Ask Copilot
            </Button>
            {!selectedGeography && (
              <p className="mt-2 text-xs text-[var(--color-text-secondary)]">
                Choose a place on the left first.
              </p>
            )}
          </Card>

          {evidenceQuery.isLoading && selectedGeography && (
            <LoadingRegion label="Loading evidence">
              <SkeletonText lines={3} />
            </LoadingRegion>
          )}

          {/* Copilot's ask request is the platform's most latency-sensitive
              first-load path -- on a cold-started free-tier backend this
              can plausibly take longer than an ordinary skeleton implies,
              so it gets the explicit wake-state treatment rather than a
              bare spinner (docs/design/health-equity-ux-redesign.md §7/§9.8). */}
          <BackendWakeState isLoading={askMutation.isPending} onRetry={handleAsk} skeletonLines={6} />
          {askMutation.isError && (
            <ErrorState
              title="Copilot request failed"
              description={askMutation.error instanceof ApiError ? askMutation.error.message : "Try again."}
            />
          )}
          {askMutation.data && <CopilotResponseCard response={askMutation.data} dataMode={evidenceQuery.data?.data_mode} />}
        </div>
      </div>
    </div>
  );
}

function CopilotResponseCard({
  response,
  dataMode,
}: {
  response: NonNullable<ReturnType<typeof useMutation<Awaited<ReturnType<typeof api.askCopilot>>>>["data"]>;
  dataMode?: "live" | "demo";
}) {
  async function handleCopy() {
    await navigator.clipboard.writeText(response.text);
  }

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Badge tone={response.is_ai_generated ? "interactive" : "neutral"}>
          {response.is_ai_generated ? `AI-generated (${response.model})` : "Deterministic (not AI-generated)"}
        </Badge>
        {dataMode && <DataModeBadge mode={dataMode} />}
      </div>

      <p className="mt-3 whitespace-pre-line text-sm text-[var(--color-text-primary)]">{response.text}</p>

      {response.evidence_ids_unsupported.length > 0 && (
        <p className="mt-3 rounded-[var(--radius-sm)] bg-[var(--color-alert-subtle)] p-2 text-xs text-[var(--color-alert)]">
          The model referenced {response.evidence_ids_unsupported.length} citation(s) that do not
          match any evidence actually provided -- removed from the trusted citation list below.
        </p>
      )}

      <div className="mt-3">
        <h2 className="text-xs font-semibold text-[var(--color-text-primary)]">Evidence used</h2>
        <ul className="mt-1 space-y-1">
          {response.evidence_used.map((item) => (
            <li key={item.evidence_id} className="text-xs text-[var(--color-text-secondary)]">
              {item.label}: {item.value} ({item.publisher}, {item.source_vintage})
            </li>
          ))}
        </ul>
      </div>

      <p className="mt-3 text-xs text-[var(--color-text-tertiary)]">
        Generated {new Date(response.generated_at).toLocaleString()} -- configuration hash{" "}
        <code>{response.configuration_hash}</code>
      </p>

      <Button size="sm" variant="secondary" className="mt-3" onClick={handleCopy}>
        Copy response
      </Button>
    </Card>
  );
}
