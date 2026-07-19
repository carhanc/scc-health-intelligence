"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { HorizontalSteps, type HorizontalStep } from "@scc-health/ui";
import {
  api,
  type AdvocacyEvidenceItem,
  type DocumentAnalysisResponse,
  type DocumentTopicMatch,
  type GeneratedBriefResponse,
} from "@/lib/api";
import type { SelectedGeography } from "../explore/selection";
import { CUSTOM_SCENARIO_ID } from "../prioritize/scenario-selector";
import { DEFAULT_WEIGHTS } from "../prioritize/weight-sliders";
import {
  type AdvocacyWorkspace,
  createEmptyWorkspace,
  getWorkspace,
  listWorkspaces,
  saveWorkspace,
  suggestProjectTitle,
} from "@/lib/workspace/storage";
import { ADVOCACY_TERMS } from "@/lib/advocacy-terms";
import { ProjectMenu } from "./project-menu";
import { ProjectSummaryBar, ProjectDetailsDisclosure } from "./project-summary-bar";
import { LandingChoice, CrossPageArrival } from "./landing-choice";
import { PlaceStep } from "./place-step";
import { FocusStep } from "./focus-step";
import { ChooseDocumentScreen, ReviewPassagesScreen } from "./document-step";
import { EvidenceReview } from "./evidence-review";
import { CreateStep } from "./create-step";
import { DraftPreview } from "./draft-preview";
import { RECOMMENDED_FOCUS_ID } from "./focus-options";
import { outputTypeLabel } from "./output-types";

type Stage = "landing" | "place" | "focus" | "evidence" | "create" | "review";
type DocumentSubStep = "choose" | "review";

const VISIBLE_STAGES: { id: "place" | "evidence" | "create" | "review"; label: string }[] = [
  { id: "place", label: ADVOCACY_TERMS.stagePlace },
  { id: "evidence", label: ADVOCACY_TERMS.stageEvidence },
  { id: "create", label: ADVOCACY_TERMS.stageCreate },
  { id: "review", label: ADVOCACY_TERMS.stageReview },
];

/** Maps the internal stage (which includes "focus," a sub-step of Place
 * not shown in the outer progress indicator) to the visible stage id. */
function visibleStageId(stage: Stage): "place" | "evidence" | "create" | "review" {
  if (stage === "landing" || stage === "place" || stage === "focus") return "place";
  return stage;
}

/** Where to land a returning project -- resumes at the first stage that
 * still needs input, never always back at the start (docs/design/
 * advocate-flow-simplification-visual-review.md). A generated draft is
 * never persisted, so "review" is never auto-selected here. */
function resumeStageFor(ws: AdvocacyWorkspace): Stage {
  if (ws.selectedGeography) return ws.selectedEvidenceIds.length > 0 ? "create" : "evidence";
  if (ws.documentFindings.length > 0) return "create";
  return "landing";
}

export function AdvocateClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [workspace, setWorkspace] = useState<AdvocacyWorkspace | null>(null);
  const [allWorkspaces, setAllWorkspaces] = useState<AdvocacyWorkspace[]>([]);
  const [autosaveStatus, setAutosaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [storageUnavailable, setStorageUnavailable] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [stage, setStage] = useState<Stage>("landing");
  const [documentSubStep, setDocumentSubStep] = useState<DocumentSubStep>("choose");
  const [activeDocument, setActiveDocument] = useState<DocumentAnalysisResponse | null>(null);
  const [draftResult, setDraftResult] = useState<GeneratedBriefResponse | null>(null);
  const [showProjectDetails, setShowProjectDetails] = useState(false);
  const [justArrivedFromCrossPage, setJustArrivedFromCrossPage] = useState(false);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initializedRef = useRef(false);

  const refreshWorkspaceList = useCallback(async () => {
    try {
      setAllWorkspaces(await listWorkspaces());
    } catch {
      setStorageUnavailable(true);
    }
  }, []);

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    (async () => {
      try {
        const urlWorkspaceId = searchParams.get("workspace");
        const existing = await listWorkspaces();
        setAllWorkspaces(existing);

        let active: AdvocacyWorkspace | null = null;
        if (urlWorkspaceId) {
          active = await getWorkspace(urlWorkspaceId);
          if (active?.selectedGeography && searchParams.get("added") === "1") {
            setJustArrivedFromCrossPage(true);
          }
        }
        if (!active && existing.length > 0) {
          active = existing[0]!;
        }
        if (!active) {
          active = createEmptyWorkspace(ADVOCACY_TERMS.defaultProjectTitle);
          await saveWorkspace(active);
          setAllWorkspaces([active]);
        }
        setWorkspace(active);
        if (!(active.selectedGeography && searchParams.get("added") === "1")) {
          setStage(resumeStageFor(active));
        }
      } catch {
        setStorageUnavailable(true);
        setWorkspace(createEmptyWorkspace(ADVOCACY_TERMS.defaultProjectTitle));
      }
    })();
  }, []);

  useEffect(() => {
    if (!workspace) return;
    const params = new URLSearchParams(searchParams.toString());
    if (params.get("workspace") !== workspace.workspaceId) {
      params.set("workspace", workspace.workspaceId);
      router.replace(`/advocate?${params.toString()}`);
    }
  }, [workspace?.workspaceId]);

  const persist = useCallback((next: AdvocacyWorkspace) => {
    setWorkspace(next);
    if (storageUnavailable) return;
    setAutosaveStatus("saving");
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(async () => {
      try {
        await saveWorkspace(next);
        setAutosaveStatus("saved");
      } catch {
        setAutosaveStatus("error");
        setStorageUnavailable(true);
      }
    }, 500);
  }, [storageUnavailable]);

  function persistWithTitleSuggestion(next: AdvocacyWorkspace) {
    if (next.titleIsUserSet) {
      persist(next);
      return;
    }
    const suggested = suggestProjectTitle({
      placeLabel: next.selectedGeography?.displayName ?? null,
      outputTypeLabel: outputTypeLabel(next.requestedOutputs[0] ?? ""),
    });
    persist({ ...next, title: suggested });
  }

  async function handleSwitchWorkspace(workspaceId: string) {
    const next = await getWorkspace(workspaceId);
    if (next) {
      setWorkspace(next);
      setDraftResult(null);
      setJustArrivedFromCrossPage(false);
      setStage(resumeStageFor(next));
    }
  }

  async function handleNewWorkspace() {
    const next = createEmptyWorkspace(ADVOCACY_TERMS.defaultProjectTitle);
    await saveWorkspace(next);
    await refreshWorkspaceList();
    setWorkspace(next);
    setDraftResult(null);
    setStage("landing");
    setJustArrivedFromCrossPage(false);
  }

  async function handleImportWorkspace(imported: AdvocacyWorkspace) {
    await saveWorkspace(imported);
    await refreshWorkspaceList();
    setWorkspace(imported);
    setDraftResult(null);
    setJustArrivedFromCrossPage(false);
    setStage(resumeStageFor(imported));
    setImportError(null);
  }

  function handleSelectGeography(selection: SelectedGeography) {
    if (!workspace) return;
    persistWithTitleSuggestion({
      ...workspace,
      selectedGeography: {
        geographyType: selection.geographyType,
        geoid: selection.geoid,
        displayName: selection.displayName,
      },
      selectedScenarioId: workspace.selectedScenarioId ?? RECOMMENDED_FOCUS_ID,
      selectedEvidenceIds: [],
      evidenceSnapshots: [],
    });
    setStage("focus");
  }

  function handleSelectScenario(scenarioId: string) {
    if (!workspace) return;
    persist({
      ...workspace,
      selectedScenarioId: scenarioId,
      customWeights: scenarioId === CUSTOM_SCENARIO_ID ? workspace.customWeights ?? DEFAULT_WEIGHTS : null,
    });
    setStage("evidence");
  }

  function handleCustomWeightsChange(weights: Record<string, number>) {
    if (!workspace) return;
    persist({ ...workspace, customWeights: weights });
  }

  function handleSetAudience(audienceId: string) {
    if (!workspace) return;
    persist({ ...workspace, targetAudience: audienceId });
  }

  function handleSetGoal(goal: string) {
    if (!workspace) return;
    persist({ ...workspace, projectGoal: goal });
  }

  function handleOutputTypeChange(outputType: string) {
    if (!workspace) return;
    persistWithTitleSuggestion({ ...workspace, requestedOutputs: [outputType] });
  }

  function handleEvidenceLoaded(items: AdvocacyEvidenceItem[]) {
    if (!workspace) return;
    const merged = [...workspace.evidenceSnapshots];
    for (const item of items) {
      if (!merged.some((existing) => existing.evidence_id === item.evidence_id)) merged.push(item);
    }
    if (merged.length !== workspace.evidenceSnapshots.length) {
      persist({ ...workspace, evidenceSnapshots: merged });
    }
  }

  function handleToggleEvidence(item: AdvocacyEvidenceItem) {
    if (!workspace) return;
    const isSelected = workspace.selectedEvidenceIds.includes(item.evidence_id);
    persist({
      ...workspace,
      selectedEvidenceIds: isSelected
        ? workspace.selectedEvidenceIds.filter((id) => id !== item.evidence_id)
        : [...workspace.selectedEvidenceIds, item.evidence_id],
    });
  }

  function handleDocumentAnalyzed(result: DocumentAnalysisResponse) {
    if (!workspace) return;
    persist({
      ...workspace,
      documentFindings: [...workspace.documentFindings, result],
      uploadedDocuments: [
        ...workspace.uploadedDocuments,
        { filename: result.filename, fileHash: result.file_hash, analyzedAt: new Date().toISOString() },
      ],
    });
    setActiveDocument(result);
    setDocumentSubStep("review");
  }

  function handleToggleIncludedPassage(topic: DocumentTopicMatch, excerpt: string | null) {
    if (!workspace || !activeDocument) return;
    const exists = workspace.includedPassages.some(
      (p) => p.docFilename === activeDocument.filename && p.topicId === topic.topic_id,
    );
    persist({
      ...workspace,
      includedPassages: exists
        ? workspace.includedPassages.filter(
            (p) => !(p.docFilename === activeDocument.filename && p.topicId === topic.topic_id),
          )
        : [
            ...workspace.includedPassages,
            { docFilename: activeDocument.filename, topicId: topic.topic_id, topicLabel: topic.label, excerpt },
          ],
    });
  }

  function handleDraftCreated(outputType: string, result: GeneratedBriefResponse) {
    if (!workspace) return;
    setDraftResult(result);
    setStage("review");
    persist({
      ...workspace,
      requestedOutputs: [outputType],
      exportHistory: [
        ...workspace.exportHistory,
        { outputType, generatedAt: new Date().toISOString(), configurationHash: result.configuration_hash },
      ],
      configurationHash: result.configuration_hash,
    });
  }

  // The cross-page arrival screen needs a real fact count ("3 facts...
  // are ready to review"), but evidence is otherwise only fetched once
  // the Evidence step itself mounts -- prefetching it here, only for
  // this one specific landing state, avoids showing a wrong "0 facts"
  // before the user has even seen the Evidence step (found live).
  const crossPageGeography = workspace?.selectedGeography;
  // Matches EvidenceReview's own default exactly (RECOMMENDED_FOCUS_ID
  // when no scenario is set yet) so this prefetch's cache key lines up
  // with the query the Evidence step will itself run -- otherwise a
  // cross-page arrival with no scenario (Access Lab/Utilization don't
  // pass one) would trigger two separate fetches instead of one shared,
  // cached result.
  const crossPageScenarioId = workspace?.selectedScenarioId ?? RECOMMENDED_FOCUS_ID;
  const crossPagePrefetch = useQuery({
    queryKey: ["advocate-evidence", crossPageGeography?.geographyType, crossPageGeography?.geoid, crossPageScenarioId],
    queryFn: () =>
      api.getAdvocateEvidence(
        crossPageGeography!.geographyType,
        crossPageGeography!.geoid,
        crossPageScenarioId === CUSTOM_SCENARIO_ID ? undefined : crossPageScenarioId,
      ),
    enabled: justArrivedFromCrossPage && !!crossPageGeography,
    retry: 1,
  });

  if (!workspace) {
    return (
      <div className="mx-auto max-w-[var(--container-max)] px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
        <p className="text-sm text-[var(--color-text-secondary)]">Loading your project…</p>
      </div>
    );
  }

  const selectedGeography: SelectedGeography | null = workspace.selectedGeography
    ? {
        geographyType: workspace.selectedGeography.geographyType as SelectedGeography["geographyType"],
        geoid: workspace.selectedGeography.geoid,
        displayName: workspace.selectedGeography.displayName,
        source: "url",
      }
    : null;

  const selectedEvidenceItems = workspace.selectedEvidenceIds
    .map((id) => workspace.evidenceSnapshots.find((e) => e.evidence_id === id))
    .filter((e): e is AdvocacyEvidenceItem => e !== undefined);

  const combinedNotes = [
    workspace.userNotes,
    ...workspace.includedPassages.map(
      (p) => `Relevant passage from ${p.docFilename} ("${p.topicLabel}")${p.excerpt ? `: ${p.excerpt}` : ""}`,
    ),
  ]
    .filter(Boolean)
    .join("\n\n");

  const savedStatusText = storageUnavailable
    ? ADVOCACY_TERMS.storageUnavailable
    : autosaveStatus === "saving"
      ? ADVOCACY_TERMS.saving
      : autosaveStatus === "error"
        ? ADVOCACY_TERMS.couldNotSave
        : ADVOCACY_TERMS.savedOnDevice;

  const horizontalSteps: HorizontalStep[] = VISIBLE_STAGES.map((s) => ({
    id: s.id,
    label: s.label,
    complete:
      // A place is enough to consider this stage complete -- requiring
      // selectedScenarioId too incorrectly showed "not started" for a
      // real, pre-existing project saved before this pass paired every
      // place selection with a default focus (found live: a legacy
      // project with real evidence already loaded still showed "Place"
      // as incomplete).
      (s.id === "place" && !!selectedGeography) ||
      (s.id === "evidence" && (selectedEvidenceItems.length > 0 || workspace.includedPassages.length > 0)) ||
      (s.id === "create" && !!draftResult) ||
      (s.id === "review" && !!draftResult),
  }));

  function handleSelectVisibleStage(id: string) {
    if (id === "place") {
      setStage(selectedGeography ? "focus" : "place");
    } else {
      setStage(id as Stage);
    }
  }

  const isReview = stage === "review";
  const showChrome = stage !== "landing";

  return (
    <div className="mx-auto max-w-[var(--container-max)] px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--color-text-primary)] sm:text-3xl">
            Turn evidence into action
          </h1>
          <p className="mt-1.5 text-sm text-[var(--color-text-secondary)]">
            Create a clear, sourced advocacy document about a Santa Clara County community.
          </p>
        </div>
        <ProjectMenu
          workspace={workspace}
          allWorkspaces={allWorkspaces.length > 0 ? allWorkspaces : [workspace]}
          onSwitchWorkspace={handleSwitchWorkspace}
          onNewWorkspace={handleNewWorkspace}
          onWorkspaceChanged={refreshWorkspaceList}
          onImportWorkspace={handleImportWorkspace}
          onImportError={setImportError}
        />
      </div>

      {storageUnavailable && (
        <div className="mt-4 rounded-[var(--radius-md)] border border-[var(--color-caution)] bg-[var(--color-caution-subtle)] p-3 text-sm text-[var(--color-caution-strong)]">
          {ADVOCACY_TERMS.storageHelpText}
        </div>
      )}
      {importError && (
        <div
          role="alert"
          className="mt-4 flex items-center justify-between gap-3 rounded-[var(--radius-md)] border border-[var(--color-alert)] bg-[var(--color-alert-subtle)] p-3 text-sm text-[var(--color-alert)]"
        >
          <span>
            {importError} {ADVOCACY_TERMS.nothingChangedNote}
          </span>
          <button type="button" onClick={() => setImportError(null)} className="font-medium underline">
            Dismiss
          </button>
        </div>
      )}

      {showChrome && (
        <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
          <HorizontalSteps steps={horizontalSteps} activeId={visibleStageId(stage)} onSelect={handleSelectVisibleStage} />
          <span role="status" className="text-xs text-[var(--color-text-tertiary)]">
            {savedStatusText}
          </span>
        </div>
      )}

      {showChrome && workspace.selectedGeography && (
        <div className="mt-3">
          <ProjectSummaryBar workspace={workspace} onChangePlace={() => setStage("place")} />
          <button
            type="button"
            onClick={() => setShowProjectDetails((v) => !v)}
            aria-expanded={showProjectDetails}
            className="mt-1 text-xs font-medium text-[var(--color-interactive)] hover:underline"
          >
            {showProjectDetails ? ADVOCACY_TERMS.hideProjectDetailsCta : ADVOCACY_TERMS.viewProjectDetailsCta}
          </button>
          {showProjectDetails && (
            <div className="mt-1">
              <ProjectDetailsDisclosure workspace={workspace} />
            </div>
          )}
        </div>
      )}

      <div className={`mt-6 ${isReview ? "max-w-5xl" : "max-w-[880px]"}`}>
        {stage === "landing" &&
          (justArrivedFromCrossPage && workspace.selectedGeography ? (
            <CrossPageArrival
              placeLabel={workspace.selectedGeography.displayName}
              factCount={crossPagePrefetch.data?.items.length ?? workspace.evidenceSnapshots.length}
              isLoadingCount={crossPagePrefetch.isLoading}
              sourcePage={workspace.sourcePage}
              onReviewEvidence={() => {
                // justArrivedFromCrossPage deliberately stays true here --
                // the Evidence step still needs it to show "Added from
                // <sourcePage>" on this first view (found live: clearing
                // it immediately meant that grouping never had a chance
                // to render). It only gates the landing screen itself,
                // which this flow never returns to.
                setStage("evidence");
              }}
              onAddMoreInformation={() => setStage("focus")}
            />
          ) : (
            <LandingChoice
              onChooseCommunity={() => setStage("place")}
              onChooseDocument={() => {
                setDocumentSubStep("choose");
                setStage("evidence");
              }}
            />
          ))}

        {stage === "place" && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">Choose a community</h2>
            <PlaceStep onSelectGeography={handleSelectGeography} />
          </div>
        )}

        {stage === "focus" && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
              What would you like to focus on?
            </h2>
            <FocusStep
              selectedScenarioId={workspace.selectedScenarioId ?? RECOMMENDED_FOCUS_ID}
              onSelect={handleSelectScenario}
              customWeights={workspace.customWeights ?? DEFAULT_WEIGHTS}
              onCustomWeightsChange={handleCustomWeightsChange}
            />
          </div>
        )}

        {stage === "evidence" && !selectedGeography && (
          <>
            {documentSubStep === "choose" && <ChooseDocumentScreen onAnalyzed={handleDocumentAnalyzed} />}
            {documentSubStep === "review" && activeDocument && (
              <ReviewPassagesScreen
                finding={activeDocument}
                includedTopicIds={
                  new Set(
                    workspace.includedPassages
                      .filter((p) => p.docFilename === activeDocument.filename)
                      .map((p) => p.topicId),
                  )
                }
                onToggleTopic={handleToggleIncludedPassage}
                onContinue={() => setStage("create")}
              />
            )}
          </>
        )}

        {stage === "evidence" && selectedGeography && (
          <div className="space-y-5">
            <div>
              <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
                What facts would you like to use?
              </h2>
            </div>
            <EvidenceReview
              selectedGeography={selectedGeography}
              selectedScenarioId={workspace.selectedScenarioId ?? RECOMMENDED_FOCUS_ID}
              selectedEvidenceIds={workspace.selectedEvidenceIds}
              sourcePage={justArrivedFromCrossPage ? workspace.sourcePage : null}
              onToggleEvidence={handleToggleEvidence}
              onEvidenceLoaded={handleEvidenceLoaded}
            />
            <div>
              <button
                type="button"
                onClick={() => setStage("create")}
                disabled={selectedEvidenceItems.length === 0}
                className="rounded-[var(--radius-md)] bg-[var(--color-interactive)] px-5 py-2.5 text-sm font-medium text-[var(--color-text-on-interactive)] hover:bg-[var(--color-interactive-hover)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {ADVOCACY_TERMS.continueWithFactsCta(selectedEvidenceItems.length)}
              </button>
              {selectedEvidenceItems.length === 0 && (
                <p className="mt-1.5 text-sm text-[var(--color-text-secondary)]">
                  {ADVOCACY_TERMS.selectAtLeastOneFactNote}
                </p>
              )}
            </div>
          </div>
        )}

        {stage === "create" && (
          <CreateStep
            outputType={workspace.requestedOutputs[0] ?? ""}
            onOutputTypeChange={handleOutputTypeChange}
            geographyLabel={selectedGeography?.displayName ?? null}
            scenarioId={workspace.selectedScenarioId ?? RECOMMENDED_FOCUS_ID}
            targetAudience={workspace.targetAudience}
            onAudienceChange={handleSetAudience}
            goal={workspace.projectGoal}
            onGoalChange={handleSetGoal}
            evidence={selectedEvidenceItems}
            notes={combinedNotes}
            onDraftCreated={handleDraftCreated}
            onBackToEvidence={() => setStage(selectedGeography ? "evidence" : "landing")}
          />
        )}

        {stage === "review" &&
          (draftResult ? (
            <DraftPreview
              brief={draftResult}
              onBackToEvidence={() => setStage("evidence")}
              onEditProject={() => setStage("create")}
              onCreateNewVersion={() => {
                setDraftResult(null);
                setStage("create");
              }}
            />
          ) : (
            <div className="rounded-[var(--radius-md)] border border-dashed border-[var(--color-border)] p-6 text-center">
              <p className="text-sm text-[var(--color-text-secondary)]">
                No draft has been created yet for this project.
              </p>
              <button
                type="button"
                onClick={() => setStage("create")}
                className="mt-2 text-sm font-medium text-[var(--color-interactive)] hover:underline"
              >
                Go to the Create step →
              </button>
            </div>
          ))}
      </div>
    </div>
  );
}
