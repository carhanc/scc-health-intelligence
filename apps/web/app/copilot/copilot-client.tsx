"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Badge,
  BackendWakeState,
  Button,
  Card,
  DataModeBadge,
  ErrorState,
} from "@scc-health/ui";
import { api, ApiError, type AdvocacyEvidenceItem, type CopilotAskResponse } from "@/lib/api";
import { SearchPanel } from "../explore/search-panel";
import type { SelectedGeography } from "../explore/selection";
import { parseSelectedGeographyFromParams } from "../explore/selection";
import { CUSTOM_SCENARIO_ID } from "../prioritize/scenario-selector";
import { DEFAULT_WEIGHTS } from "../prioritize/weight-sliders";
import { FocusPicker } from "../focus-picker";
import { RECOMMENDED_FOCUS_ID } from "../focus-options";
import { TaskPageHeader } from "../task-page-header";
import { UseInAdvocateButton } from "../use-in-advocate-button";
import {
  COPILOT_ACTIONS,
  findCopilotAction,
  filterEvidenceByCategory,
  buildCompareEvidence,
  type CopilotActionId,
} from "./copilot-actions";

type Stage = "landing" | "place" | "place-b" | "focus" | "instruction";

const GOAL_SUGGESTIONS = [
  "Keep it under 100 words",
  "Focus on what a commissioner would ask",
  "Write it for a general audience",
];

export function CopilotClient() {
  const searchParams = useSearchParams();

  const [stage, setStage] = useState<Stage>("landing");
  const [actionId, setActionId] = useState<CopilotActionId | null>(null);
  const [placeA, setPlaceA] = useState<SelectedGeography | null>(null);
  const [placeB, setPlaceB] = useState<SelectedGeography | null>(null);
  const [scenarioId, setScenarioId] = useState(RECOMMENDED_FOCUS_ID);
  const [customWeights, setCustomWeights] = useState<Record<string, number>>(DEFAULT_WEIGHTS);
  const [instruction, setInstruction] = useState("");
  const [arrivedWithPlace, setArrivedWithPlace] = useState(false);

  // A place arriving from another page (e.g. Explore's "Ask Copilot about
  // this tract") pre-fills placeA so the action-choice screen never makes
  // someone re-search a community another page already identified.
  useEffect(() => {
    const parsed = parseSelectedGeographyFromParams(
      searchParams.get("geography"),
      searchParams.get("id"),
    );
    if (!parsed) return;
    const name = searchParams.get("name");
    const scenario = searchParams.get("scenario");
    setPlaceA(name ? { ...parsed, displayName: name } : parsed);
    if (scenario) setScenarioId(scenario);
    setArrivedWithPlace(true);
  }, [searchParams]);

  const statusQuery = useQuery({ queryKey: ["copilot-status"], queryFn: () => api.getCopilotStatus() });

  const action = actionId ? findCopilotAction(actionId) : null;

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!action || !placeA) throw new Error("Missing action or place");
      const scenarioParam = scenarioId === CUSTOM_SCENARIO_ID ? undefined : scenarioId;

      let evidence: AdvocacyEvidenceItem[];
      let dataMode: "live" | "demo" | undefined;

      if (action.needsSecondPlace && placeB) {
        const [bundleA, bundleB] = await Promise.all([
          api.getAdvocateEvidence(placeA.geographyType, placeA.geoid, scenarioParam),
          api.getAdvocateEvidence(placeB.geographyType, placeB.geoid, scenarioParam),
        ]);
        evidence = buildCompareEvidence(placeA.displayName, bundleA.items, placeB.displayName, bundleB.items);
        dataMode = bundleA.data_mode;
      } else {
        const bundle = await api.getAdvocateEvidence(placeA.geographyType, placeA.geoid, scenarioParam);
        evidence = filterEvidenceByCategory(bundle.items, action.categoryFilter);
        dataMode = bundle.data_mode;
      }

      const response = await api.askCopilot({
        action: action.backendAction,
        instruction,
        evidence,
        useLlm: true,
      });
      return { response, dataMode };
    },
  });

  function resetAll() {
    createMutation.reset();
    setActionId(null);
    setPlaceA(null);
    setPlaceB(null);
    setScenarioId(RECOMMENDED_FOCUS_ID);
    setInstruction("");
    setArrivedWithPlace(false);
    setStage("landing");
  }

  function handleChooseAction(id: CopilotActionId) {
    setActionId(id);
    if (placeA) {
      setStage("focus");
    } else {
      setStage("place");
    }
  }

  function handleSelectPlaceA(selection: SelectedGeography) {
    setPlaceA(selection);
    if (action?.needsSecondPlace) {
      setStage("place-b");
    } else {
      setStage("focus");
    }
  }

  function handleSelectPlaceB(selection: SelectedGeography) {
    setPlaceB(selection);
    setStage("focus");
  }

  function handleSelectFocus(id: string) {
    setScenarioId(id);
    setStage("instruction");
  }

  const result = createMutation.data;

  return (
    <div className="mx-auto max-w-[var(--container-max)] px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
      <TaskPageHeader
        title="Understand the evidence"
        purpose="Choose a place and get a clear, sourced explanation using this platform's data."
      />

      <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--color-text-secondary)]">
        <span>Uses platform evidence only</span>
        <details className="inline-block">
          <summary className="inline cursor-pointer font-medium text-[var(--color-interactive)] hover:underline">
            About how answers are created
          </summary>
          <div className="mt-2 max-w-2xl space-y-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-xs text-[var(--color-text-secondary)]">
            <p>
              Answers are created from evidence already available in Santa Clara Health Intelligence. No
              new statistics or sources are invented.
            </p>
            {statusQuery.data && (
              <p>
                {statusQuery.data.llm_configured ? (
                  <>
                    <Badge tone="success">AI drafting enabled</Badge> Model: {statusQuery.data.model}. Answers
                    are still limited to the evidence provided.
                  </>
                ) : (
                  <>
                    <Badge tone="neutral">Grounded in platform evidence</Badge> No AI provider is configured,
                    so answers are assembled from guided templates rather than drafted prose. These
                    templates are always available.
                  </>
                )}
              </p>
            )}
          </div>
        </details>
      </div>

      <div className="mt-6 max-w-[880px]">
        {!result && stage === "landing" && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
              What would you like help with?
            </h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {COPILOT_ACTIONS.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => handleChooseAction(a.id)}
                  aria-label={`${a.label}: ${a.description}`}
                  className="w-full rounded-[var(--radius-lg)] border border-[var(--color-border)] p-4 text-left transition-colors hover:bg-[var(--color-surface-sunken)]"
                >
                  <p className="text-sm font-semibold text-[var(--color-text-primary)]">{a.label}</p>
                  <p className="mt-1 text-sm text-[var(--color-text-secondary)]">{a.description}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {!result && stage === "place" && (
          <div className="space-y-4">
            <button
              type="button"
              onClick={() => setStage("landing")}
              className="text-sm font-medium text-[var(--color-interactive)] hover:underline"
            >
              ← Back
            </button>
            <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">Which community?</h2>
            <SearchPanel selected={placeA} onSelect={handleSelectPlaceA} showMapHint={false} />
          </div>
        )}

        {!result && stage === "place-b" && (
          <div className="space-y-4">
            <button
              type="button"
              onClick={() => setStage("place")}
              className="text-sm font-medium text-[var(--color-interactive)] hover:underline"
            >
              ← Back
            </button>
            <p className="text-sm text-[var(--color-text-secondary)]">
              Comparing with <span className="font-medium text-[var(--color-text-primary)]">{placeA?.displayName}</span>
            </p>
            <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
              Which community would you like to compare it with?
            </h2>
            <SearchPanel selected={placeB} onSelect={handleSelectPlaceB} showMapHint={false} />
          </div>
        )}

        {!result && stage === "focus" && placeA && (
          <div className="space-y-4">
            {!arrivedWithPlace && (
              <button
                type="button"
                onClick={() => setStage(action?.needsSecondPlace ? "place-b" : "place")}
                className="text-sm font-medium text-[var(--color-interactive)] hover:underline"
              >
                ← Back
              </button>
            )}
            <p className="flex flex-wrap items-center gap-2 text-sm text-[var(--color-text-secondary)]">
              <span className="font-medium text-[var(--color-text-primary)]">{placeA.displayName}</span>
              {placeB && (
                <>
                  <span aria-hidden="true">vs.</span>
                  <span className="font-medium text-[var(--color-text-primary)]">{placeB.displayName}</span>
                </>
              )}
              <button
                type="button"
                onClick={() => setStage(action?.needsSecondPlace ? "place-b" : "place")}
                className="font-medium text-[var(--color-interactive)] hover:underline"
              >
                Change
              </button>
            </p>
            <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
              What should the explanation focus on?
            </h2>
            <FocusPicker
              selectedScenarioId={scenarioId}
              onSelect={handleSelectFocus}
              customWeights={customWeights}
              onCustomWeightsChange={setCustomWeights}
            />
          </div>
        )}

        {!result && stage === "instruction" && placeA && (
          <div className="space-y-4">
            <button
              type="button"
              onClick={() => setStage("focus")}
              className="text-sm font-medium text-[var(--color-interactive)] hover:underline"
            >
              ← Back
            </button>
            <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
              Anything else to include?
            </h2>
            <p className="text-xs text-[var(--color-text-tertiary)]">Optional.</p>
            <textarea
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              rows={2}
              className="w-full rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 py-2 text-sm"
              placeholder="e.g. Keep it under 100 words."
            />
            <div className="flex flex-wrap gap-2">
              {GOAL_SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setInstruction(s)}
                  className="rounded-full border border-[var(--color-border)] px-3 py-1 text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-sunken)]"
                >
                  {s}
                </button>
              ))}
            </div>

            <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>
              Create explanation
            </Button>

            <BackendWakeState
              isLoading={createMutation.isPending}
              onRetry={() => createMutation.mutate()}
              skeletonLines={6}
            />
            {createMutation.isError && (
              <ErrorState
                title="We couldn't create the explanation"
                description={
                  (createMutation.error instanceof ApiError
                    ? createMutation.error.message
                    : "Your selections are still saved.") + " Try again."
                }
              />
            )}
          </div>
        )}

        {result && placeA && (
          <CopilotResultView
            response={result.response}
            dataMode={result.dataMode}
            placeA={placeA}
            placeB={placeB}
            scenarioId={scenarioId}
            onAskAnother={resetAll}
            onCompareInstead={() => {
              createMutation.reset();
              setActionId("compare_places");
              setStage(placeB ? "focus" : "place-b");
            }}
          />
        )}
      </div>
    </div>
  );
}

function CopilotResultView({
  response,
  dataMode,
  placeA,
  placeB,
  scenarioId,
  onAskAnother,
  onCompareInstead,
}: {
  response: CopilotAskResponse;
  dataMode?: "live" | "demo";
  placeA: SelectedGeography;
  placeB: SelectedGeography | null;
  scenarioId: string;
  onAskAnother: () => void;
  onCompareInstead: () => void;
}) {
  const [showAllFacts, setShowAllFacts] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(displayText);
    } catch {
      // Clipboard permission can be denied by the browser; the button
      // itself gives no other feedback to react to, so this is a silent
      // no-op rather than a broken UI.
    }
  }

  // The deterministic template's generic evidence-bullet-dump branch
  // prepends a static "[Deterministic mode -- ...]" disclaimer line with
  // no data or citations in it. The task's own status ("Grounded in
  // platform evidence" badge above, plus "About how answers are created")
  // already communicates this -- repeating it as the answer's first line
  // would violate "never lead with provider/architecture status." Strip
  // only that exact static line; every evidence bullet after it is real
  // data and stays untouched.
  const displayText = response.text.replace(
    /^\[Deterministic mode -- guided template, not generative AI\. Configure an AI provider server-side for drafted prose\.\]\n?/,
    "",
  );

  // The deterministic (no AI provider configured) templates render as a
  // flat "- fact: value (...)" bullet list, one line per evidence item --
  // the same items also listed as numbered citations below. A blind
  // usability review found this doubles the same ~30 facts back to back
  // and reads as an unreadable wall of text rather than "a clear, sourced
  // explanation." Detect that shape (every non-empty line starts with
  // "- ") and, only then, (a) collapse the body to the first few lines
  // with a "Show all" disclosure, matching this pass's own progressive-
  // disclosure standard, and (b) drop the Sources list to a compact
  // citation index instead of repeating each fact's full text a second
  // time. Narrative (AI-generated or the distinct limitations/questions
  // templates) answers are untouched -- their prose doesn't duplicate the
  // citation list, so nothing here applies to them.
  const bodyLines = displayText.split("\n").filter((line) => line.trim().length > 0);
  const isBulletDump = bodyLines.length > 0 && bodyLines.every((line) => line.trimStart().startsWith("- "));
  const BULLET_PREVIEW_COUNT = 8;
  const visibleText =
    isBulletDump && !showAllFacts ? bodyLines.slice(0, BULLET_PREVIEW_COUNT).join("\n") : displayText;
  const hiddenFactCount = isBulletDump ? bodyLines.length - BULLET_PREVIEW_COUNT : 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
          {placeA.displayName}
          {placeB && ` vs. ${placeB.displayName}`}
        </h2>
        <div className="flex items-center gap-2">
          <Badge tone={response.is_ai_generated ? "interactive" : "neutral"}>
            {response.is_ai_generated ? `AI-generated (${response.model})` : "Grounded in platform evidence"}
          </Badge>
          {dataMode && <DataModeBadge mode={dataMode} />}
        </div>
      </div>

      <Card>
        <p className="whitespace-pre-line text-sm text-[var(--color-text-primary)]">{visibleText}</p>

        {isBulletDump && hiddenFactCount > 0 && (
          <button
            type="button"
            onClick={() => setShowAllFacts(true)}
            className="mt-2 text-xs font-medium text-[var(--color-interactive)] underline underline-offset-2"
          >
            Show all {bodyLines.length} facts ({hiddenFactCount} more)
          </button>
        )}

        {response.evidence_ids_unsupported.length > 0 && (
          <p className="mt-3 rounded-[var(--radius-sm)] bg-[var(--color-alert-subtle)] p-2 text-xs text-[var(--color-alert)]">
            The model referenced {response.evidence_ids_unsupported.length} citation(s) that do not match
            any evidence actually provided -- removed from the trusted citation list below.
          </p>
        )}

        <div className="mt-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-tertiary)]">
            Sources
          </h3>
          <ul className="mt-1.5 space-y-1">
            {response.evidence_used.map((item, i) =>
              isBulletDump ? (
                // The bullet-dump answer above already states each item's
                // full value and percentile inline -- repeating that here
                // would be the exact duplication the review flagged, so
                // this compact form keeps only what the answer didn't
                // already say (the citation number and publisher).
                <li key={item.evidence_id} className="text-xs text-[var(--color-text-secondary)]">
                  [{i + 1}] {item.label} --{" "}
                  {item.source_url ? (
                    <a
                      href={item.source_url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="font-medium text-[var(--color-interactive)] underline underline-offset-2"
                    >
                      {item.publisher}
                    </a>
                  ) : (
                    item.publisher
                  )}
                  , {item.source_vintage}
                </li>
              ) : (
                <li key={item.evidence_id} className="text-xs text-[var(--color-text-secondary)]">
                  [{i + 1}] {item.label}: {item.value} (
                  {item.source_url ? (
                    <a
                      href={item.source_url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="font-medium text-[var(--color-interactive)] underline underline-offset-2"
                    >
                      {item.publisher}
                    </a>
                  ) : (
                    item.publisher
                  )}
                  , {item.source_vintage})
                </li>
              ),
            )}
          </ul>
        </div>

        <p className="mt-4 text-xs text-[var(--color-text-secondary)]">
          This platform does not identify individuals or estimate individual-level risk. A high score or
          rate identifies a place for closer investigation -- it does not establish that any specific
          factor causes an outcome, or that any specific intervention would help.
        </p>

        <p className="mt-2 text-xs text-[var(--color-text-tertiary)]">
          Generated {new Date(response.generated_at).toLocaleString()}
        </p>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" onClick={onAskAnother}>
          Ask another question
        </Button>
        {!placeB && (
          <Button variant="secondary" size="sm" onClick={onCompareInstead}>
            Compare with another place
          </Button>
        )}
        <UseInAdvocateButton geography={placeA} scenarioId={scenarioId} sourcePage="Copilot" />
        <Button variant="secondary" size="sm" onClick={handleCopy}>
          Copy answer
        </Button>
      </div>
    </div>
  );
}
