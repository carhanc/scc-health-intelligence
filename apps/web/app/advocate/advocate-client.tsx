"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Tabs, TabPanel, type Step } from "@scc-health/ui";
import type { AdvocacyEvidenceItem, DocumentAnalysisResponse, GeneratedBriefResponse } from "@/lib/api";
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
import { ProjectNav } from "./project-nav";
import { ProjectSummaryPanel } from "./project-summary-panel";
import { StartProjectLanding } from "./start-project-landing";
import { GeographyIssueEntry } from "./geography-issue-entry";
import { DocumentEntry } from "./document-entry";
import { EvidenceReview } from "./evidence-review";
import { DraftCreator } from "./draft-creator";
import { DraftPreview } from "./draft-preview";
import { AUDIENCES, outputTypeLabel } from "./output-types";

type EntryTab = "geography" | "document";
type Stage = "project" | "evidence" | "draft" | "review";

const STAGES: { id: Stage; label: string }[] = [
  { id: "project", label: ADVOCACY_TERMS.stageProject },
  { id: "evidence", label: ADVOCACY_TERMS.stageEvidence },
  { id: "draft", label: ADVOCACY_TERMS.stageDraft },
  { id: "review", label: ADVOCACY_TERMS.stageReview },
];

/** Where to land a user on a workspace that's just been loaded or switched
 * to -- resumes at the first stage that still needs input, rather than
 * always "project", so returning to an already-started project doesn't
 * look like it forgot everything (a generated draft is never persisted,
 * so "review" is never auto-selected here -- see handleDraftCreated). */
function resumeStageFor(ws: AdvocacyWorkspace): Stage {
  if (!ws.selectedGeography) return "project";
  return ws.selectedEvidenceIds.length > 0 ? "draft" : "evidence";
}

export function AdvocateClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [workspace, setWorkspace] = useState<AdvocacyWorkspace | null>(null);
  const [allWorkspaces, setAllWorkspaces] = useState<AdvocacyWorkspace[]>([]);
  const [autosaveStatus, setAutosaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [storageUnavailable, setStorageUnavailable] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [entryTab, setEntryTab] = useState<EntryTab>("geography");
  const [activeStage, setActiveStage] = useState<Stage>("project");
  const [draftResult, setDraftResult] = useState<GeneratedBriefResponse | null>(null);
  const [showMobileSummary, setShowMobileSummary] = useState(false);
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
          // A ?added=1 param means this exact visit was triggered by a
          // cross-page "Add to advocacy project" click (not just a
          // returning user reloading their own saved project, which also
          // has a ?workspace= id) -- only then does the landing state
          // offer to continue with what was just added (docs/design/
          // advocate-intuitive-workspace-research.md §"dashboard landing
          // state" / "cross-page integration").
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
        setActiveStage(resumeStageFor(active));
      } catch {
        setStorageUnavailable(true);
        // Even without IndexedDB, the page should still be usable for a
        // single session -- fall back to an in-memory-only project rather
        // than showing nothing.
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

  /** Applies a partial update and, if the project's title is still the
   * auto-suggested default (never after the user renames it), refreshes
   * that suggestion from the new state -- so a real project name appears
   * without the user ever typing one, but a chosen name is never
   * silently overwritten. */
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
      setActiveStage(resumeStageFor(next));
    }
  }

  async function handleNewWorkspace() {
    const next = createEmptyWorkspace(ADVOCACY_TERMS.defaultProjectTitle);
    await saveWorkspace(next);
    await refreshWorkspaceList();
    setWorkspace(next);
    setDraftResult(null);
    setActiveStage("project");
    setJustArrivedFromCrossPage(false);
  }

  async function handleImportWorkspace(imported: AdvocacyWorkspace) {
    await saveWorkspace(imported);
    await refreshWorkspaceList();
    setWorkspace(imported);
    setDraftResult(null);
    setActiveStage(resumeStageFor(imported));
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
      selectedEvidenceIds: [],
      evidenceSnapshots: [],
    });
  }

  function handleSelectScenario(scenarioId: string) {
    if (!workspace) return;
    persist({
      ...workspace,
      selectedScenarioId: scenarioId,
      customWeights: scenarioId === CUSTOM_SCENARIO_ID ? workspace.customWeights ?? DEFAULT_WEIGHTS : null,
    });
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

  function handleReorderSelected(fromIndex: number, toIndex: number) {
    if (!workspace) return;
    const ids = [...workspace.selectedEvidenceIds];
    const [moved] = ids.splice(fromIndex, 1);
    ids.splice(toIndex, 0, moved!);
    persist({ ...workspace, selectedEvidenceIds: ids });
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
  }

  function handleClearDocumentFindings() {
    if (!workspace) return;
    persist({ ...workspace, documentFindings: [], uploadedDocuments: [] });
  }

  function handleDraftCreated(outputType: string, result: GeneratedBriefResponse) {
    if (!workspace) return;
    setDraftResult(result);
    setActiveStage("review");
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

  function handleNotesChange(notes: string) {
    if (!workspace) return;
    persist({ ...workspace, userNotes: notes });
  }

  if (!workspace) {
    return <p className="text-sm text-[var(--color-text-secondary)]">Loading your project…</p>;
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

  const hasStarted = !!selectedGeography || workspace.documentFindings.length > 0 || entryTab === "document";
  const currentOutputType = workspace.requestedOutputs[0] ?? "one_page_brief";
  const audienceLabel = AUDIENCES.find((a) => a.id === workspace.targetAudience)?.label ?? null;

  const steps: Step[] = STAGES.map((s) => ({
    id: s.id,
    label: s.label,
    complete:
      (s.id === "project" && !!selectedGeography) ||
      (s.id === "evidence" && selectedEvidenceItems.length > 0) ||
      (s.id === "draft" && !!draftResult) ||
      (s.id === "review" && !!draftResult),
    status:
      s.id === "evidence"
        ? workspace.selectedEvidenceIds.length > 0
          ? ADVOCACY_TERMS.evidenceCountSuffix(workspace.selectedEvidenceIds.length)
          : undefined
        : undefined,
  }));

  return (
    <div className="mx-auto max-w-[var(--container-max)] px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
      <div className="max-w-3xl">
        <h1 className="text-2xl font-semibold text-[var(--color-text-primary)] sm:text-3xl">
          Turn evidence into action
        </h1>
        <p className="mt-1.5 text-sm text-[var(--color-text-secondary)]">
          Create a clear, sourced advocacy document using evidence from across Santa Clara Health Intelligence.
        </p>
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
      {justArrivedFromCrossPage && workspace.selectedGeography && (
        <div
          role="status"
          className="mt-4 flex items-center justify-between gap-3 rounded-[var(--radius-md)] border border-[var(--color-interactive)] bg-[var(--color-interactive-subtle)] p-3 text-sm text-[var(--color-text-primary)]"
        >
          <span>Added {workspace.selectedGeography.displayName} to your advocacy project.</span>
          <button
            type="button"
            onClick={() => setJustArrivedFromCrossPage(false)}
            className="font-medium text-[var(--color-interactive)] underline"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[260px_minmax(0,1fr)_360px]">
        <div className="order-1 lg:order-1">
          <ProjectNav
            workspace={workspace}
            allWorkspaces={allWorkspaces.length > 0 ? allWorkspaces : [workspace]}
            autosaveStatus={autosaveStatus}
            storageUnavailable={storageUnavailable}
            steps={steps}
            activeStage={activeStage}
            onSelectStage={(id) => setActiveStage(id as Stage)}
            onSwitchWorkspace={handleSwitchWorkspace}
            onNewWorkspace={handleNewWorkspace}
            onWorkspaceChanged={refreshWorkspaceList}
            onImportWorkspace={handleImportWorkspace}
            onImportError={setImportError}
          />
        </div>

        <div className="order-3 lg:order-2 lg:min-w-0">
          {!hasStarted ? (
            <StartProjectLanding
              onSelectGeography={handleSelectGeography}
              onStartFromDocument={() => setEntryTab("document")}
            />
          ) : (
            <>
              {activeStage === "project" && (
                <div className="space-y-6">
                  <Tabs
                    items={[
                      { id: "geography", label: "Start from a place or issue" },
                      { id: "document", label: "Start from a document" },
                    ]}
                    activeId={entryTab}
                    onChange={(id) => setEntryTab(id as EntryTab)}
                    label="Advocate entry path"
                  />
                  <TabPanel id="geography" activeId={entryTab}>
                    <GeographyIssueEntry
                      selectedGeography={selectedGeography}
                      onSelectGeography={handleSelectGeography}
                      selectedScenarioId={workspace.selectedScenarioId ?? "default_integrated_screen_v1"}
                      onSelectScenario={handleSelectScenario}
                      customWeights={workspace.customWeights ?? DEFAULT_WEIGHTS}
                      onCustomWeightsChange={handleCustomWeightsChange}
                    />
                  </TabPanel>
                  <TabPanel id="document" activeId={entryTab}>
                    <DocumentEntry
                      onAnalyzed={handleDocumentAnalyzed}
                      existingFindings={workspace.documentFindings}
                      onClearFindings={handleClearDocumentFindings}
                    />
                  </TabPanel>

                  <div className="grid grid-cols-1 gap-6 border-t border-[var(--color-border)] pt-6 sm:grid-cols-2">
                    <div>
                      <label className="block text-sm font-semibold text-[var(--color-text-primary)]">
                        {ADVOCACY_TERMS.whoIsThisForQuestion}
                      </label>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {AUDIENCES.map((a) => (
                          <button
                            key={a.id}
                            type="button"
                            aria-pressed={workspace.targetAudience === a.id}
                            onClick={() => handleSetAudience(a.id)}
                            className={`rounded-full border px-3 py-1.5 text-sm ${
                              workspace.targetAudience === a.id
                                ? "border-[var(--color-interactive)] bg-[var(--color-interactive-subtle)] text-[var(--color-interactive-hover)]"
                                : "border-[var(--color-border)] text-[var(--color-text-primary)]"
                            }`}
                          >
                            {a.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label htmlFor="project-goal" className="block text-sm font-semibold text-[var(--color-text-primary)]">
                        {ADVOCACY_TERMS.whatShouldItAccomplishQuestion}
                      </label>
                      <input
                        id="project-goal"
                        type="text"
                        value={workspace.projectGoal}
                        onChange={(e) => handleSetGoal(e.target.value)}
                        placeholder="e.g. Request a meeting about primary-care access"
                        className="mt-2 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 py-2 text-sm"
                      />
                    </div>
                  </div>
                </div>
              )}

              {activeStage === "evidence" && (
                <div className="space-y-6">
                  <div>
                    <h2 className="text-base font-semibold text-[var(--color-text-primary)]">
                      {ADVOCACY_TERMS.evidenceSectionHeading}
                    </h2>
                    <EvidenceReview
                      selectedGeography={selectedGeography}
                      selectedScenarioId={workspace.selectedScenarioId ?? "default_integrated_screen_v1"}
                      selectedEvidenceIds={workspace.selectedEvidenceIds}
                      onToggleEvidence={handleToggleEvidence}
                      onReorderSelected={handleReorderSelected}
                      onEvidenceLoaded={handleEvidenceLoaded}
                    />
                  </div>
                  <div>
                    <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">Your notes</h2>
                    <textarea
                      value={workspace.userNotes}
                      onChange={(e) => handleNotesChange(e.target.value)}
                      placeholder="Add your own observations -- kept separate from the platform's evidence in every export."
                      className="mt-2 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] p-3 text-sm"
                      rows={3}
                    />
                  </div>
                </div>
              )}

              {activeStage === "draft" && (
                <DraftCreator
                  outputType={currentOutputType}
                  onOutputTypeChange={handleOutputTypeChange}
                  geographyLabel={selectedGeography?.displayName ?? null}
                  scenarioId={workspace.selectedScenarioId ?? "default_integrated_screen_v1"}
                  audienceLabel={audienceLabel}
                  goal={workspace.projectGoal}
                  evidence={selectedEvidenceItems}
                  notes={workspace.userNotes}
                  onDraftCreated={handleDraftCreated}
                />
              )}

              {activeStage === "review" &&
                (draftResult ? (
                  <DraftPreview
                    brief={draftResult}
                    onEditProject={() => setActiveStage("project")}
                    onCreateNewVersion={() => {
                      setDraftResult(null);
                      setActiveStage("draft");
                    }}
                  />
                ) : (
                  <div className="rounded-[var(--radius-md)] border border-dashed border-[var(--color-border)] p-6 text-center">
                    <p className="text-sm text-[var(--color-text-secondary)]">
                      No draft has been created yet for this project.
                    </p>
                    <button
                      type="button"
                      onClick={() => setActiveStage("draft")}
                      className="mt-2 text-sm font-medium text-[var(--color-interactive)] hover:underline"
                    >
                      Go to the Draft step →
                    </button>
                  </div>
                ))}
            </>
          )}
        </div>

        <div className="order-2 lg:order-3">
          <button
            type="button"
            onClick={() => setShowMobileSummary((v) => !v)}
            className="w-full rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 py-2 text-left text-sm font-medium text-[var(--color-text-primary)] lg:hidden"
            aria-expanded={showMobileSummary}
          >
            {showMobileSummary ? "Hide project summary" : "Show project summary"}
          </button>
          <div className={`${showMobileSummary ? "mt-3 block" : "hidden"} lg:mt-0 lg:block`}>
            <ProjectSummaryPanel workspace={workspace} activeStage={activeStage} hasDraft={!!draftResult} />
          </div>
        </div>
      </div>
    </div>
  );
}
