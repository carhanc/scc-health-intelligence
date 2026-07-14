"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Tabs, TabPanel } from "@scc-health/ui";
import type { AdvocacyEvidenceItem, DocumentAnalysisResponse } from "@/lib/api";
import type { SelectedGeography } from "../explore/selection";
import { CUSTOM_SCENARIO_ID } from "../prioritize/scenario-selector";
import { DEFAULT_WEIGHTS } from "../prioritize/weight-sliders";
import {
  type AdvocacyWorkspace,
  createEmptyWorkspace,
  getWorkspace,
  listWorkspaces,
  saveWorkspace,
} from "@/lib/workspace/storage";
import { WorkspaceToolbar } from "./workspace-toolbar";
import { GeographyIssueEntry } from "./geography-issue-entry";
import { DocumentEntry } from "./document-entry";
import { EvidenceReview } from "./evidence-review";
import { OutputGenerator } from "./output-generator";

type EntryTab = "geography" | "document";

export function AdvocateClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [workspace, setWorkspace] = useState<AdvocacyWorkspace | null>(null);
  const [allWorkspaces, setAllWorkspaces] = useState<AdvocacyWorkspace[]>([]);
  const [autosaveStatus, setAutosaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [entryTab, setEntryTab] = useState<EntryTab>("geography");
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initializedRef = useRef(false);

  const refreshWorkspaceList = useCallback(async () => {
    setAllWorkspaces(await listWorkspaces());
  }, []);

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    (async () => {
      const urlWorkspaceId = searchParams.get("workspace");
      const existing = await listWorkspaces();
      setAllWorkspaces(existing);

      let active: AdvocacyWorkspace | null = null;
      if (urlWorkspaceId) {
        active = await getWorkspace(urlWorkspaceId);
      }
      if (!active && existing.length > 0) {
        active = existing[0]!;
      }
      if (!active) {
        active = createEmptyWorkspace("Untitled workspace");
        await saveWorkspace(active);
        setAllWorkspaces([active]);
      }
      setWorkspace(active);
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
    setAutosaveStatus("saving");
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(async () => {
      await saveWorkspace(next);
      setAutosaveStatus("saved");
    }, 500);
  }, []);

  async function handleSwitchWorkspace(workspaceId: string) {
    const next = await getWorkspace(workspaceId);
    if (next) setWorkspace(next);
  }

  async function handleNewWorkspace() {
    const next = createEmptyWorkspace("Untitled workspace");
    await saveWorkspace(next);
    await refreshWorkspaceList();
    setWorkspace(next);
  }

  async function handleImportWorkspace(imported: AdvocacyWorkspace) {
    await saveWorkspace(imported);
    await refreshWorkspaceList();
    setWorkspace(imported);
  }

  function handleSelectGeography(selection: SelectedGeography) {
    if (!workspace) return;
    persist({
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

  function handleExported(outputType: string, configurationHash: string) {
    if (!workspace) return;
    persist({
      ...workspace,
      exportHistory: [
        ...workspace.exportHistory,
        { outputType, generatedAt: new Date().toISOString(), configurationHash },
      ],
      configurationHash,
    });
  }

  function handleNotesChange(notes: string) {
    if (!workspace) return;
    persist({ ...workspace, userNotes: notes });
  }

  if (!workspace) {
    return <p className="text-sm text-[var(--color-text-secondary)]">Loading your workspace…</p>;
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

  return (
    <div className="mx-auto max-w-[var(--container-max)] px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
      <div className="max-w-3xl">
        <h1 className="text-2xl font-semibold text-[var(--color-text-primary)] sm:text-3xl">Advocate</h1>
        <p className="mt-1.5 text-sm text-[var(--color-text-secondary)]">
          Prepare for a public meeting: find the strongest evidence for a place or issue, generate
          questions and a brief, and export a complete, cited packet -- all saved locally in your
          browser, never on a server.
        </p>
      </div>

      <div className="mt-5">
        <WorkspaceToolbar
          workspace={workspace}
          allWorkspaces={allWorkspaces.length > 0 ? allWorkspaces : [workspace]}
          autosaveStatus={autosaveStatus}
          onSwitchWorkspace={handleSwitchWorkspace}
          onNewWorkspace={handleNewWorkspace}
          onWorkspaceChanged={refreshWorkspaceList}
          onImportWorkspace={handleImportWorkspace}
        />
      </div>

      <div className="mt-6">
        <Tabs
          items={[
            { id: "geography", label: "Start from a place or issue" },
            { id: "document", label: "Start from a document" },
          ]}
          activeId={entryTab}
          onChange={(id) => setEntryTab(id as EntryTab)}
          label="Advocate entry path"
        />
        <div className="mt-4">
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
        </div>
      </div>

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">3. Review matched evidence</h2>
        <div className="mt-3">
          <EvidenceReview
            selectedGeography={selectedGeography}
            selectedScenarioId={workspace.selectedScenarioId ?? "default_integrated_screen_v1"}
            selectedEvidenceIds={workspace.selectedEvidenceIds}
            onToggleEvidence={handleToggleEvidence}
            onReorderSelected={handleReorderSelected}
            onEvidenceLoaded={handleEvidenceLoaded}
          />
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">Your notes</h2>
        <textarea
          value={workspace.userNotes}
          onChange={(e) => handleNotesChange(e.target.value)}
          placeholder="Add your own observations -- kept separate from the platform's evidence in every export."
          className="mt-2 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] p-3 text-sm"
          rows={3}
        />
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
          4. Generate a brief and export
        </h2>
        <div className="mt-3">
          <OutputGenerator
            geographyLabel={selectedGeography?.displayName ?? null}
            scenarioId={workspace.selectedScenarioId ?? "default_integrated_screen_v1"}
            evidence={selectedEvidenceItems}
            notes={workspace.userNotes}
            onExported={handleExported}
          />
        </div>
      </section>
    </div>
  );
}
