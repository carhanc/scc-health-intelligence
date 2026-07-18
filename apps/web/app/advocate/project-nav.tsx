"use client";

import { useRef, useState } from "react";
import { Button, Dialog, StepIndicator, type Step } from "@scc-health/ui";
import {
  type AdvocacyWorkspace,
  deleteWorkspace,
  duplicateWorkspace,
  exportWorkspaceJson,
  importWorkspaceBackup,
  renameWorkspace,
} from "@/lib/workspace/storage";
import { ADVOCACY_TERMS } from "@/lib/advocacy-terms";

/** The project identity, save status, step navigation, and project-
 * maintenance actions -- everything a returning user needs to orient
 * themselves and everything a project-management action they might want,
 * moved into one unobtrusive "Project options" disclosure instead of six
 * always-visible toolbar buttons (docs/design/advocate-intuitive-
 * workspace-research.md §"backup and restore"). */
export function ProjectNav({
  workspace,
  allWorkspaces,
  autosaveStatus,
  storageUnavailable,
  steps,
  activeStage,
  onSelectStage,
  onSwitchWorkspace,
  onNewWorkspace,
  onWorkspaceChanged,
  onImportWorkspace,
  onImportError,
}: {
  workspace: AdvocacyWorkspace;
  allWorkspaces: AdvocacyWorkspace[];
  autosaveStatus: "idle" | "saving" | "saved" | "error";
  storageUnavailable: boolean;
  steps: Step[];
  activeStage: string;
  onSelectStage: (id: string) => void;
  onSwitchWorkspace: (workspaceId: string) => void;
  onNewWorkspace: () => void;
  onWorkspaceChanged: () => void;
  onImportWorkspace: (workspace: AdvocacyWorkspace) => void;
  onImportError: (message: string) => void;
}) {
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState(workspace.title);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const detailsRef = useRef<HTMLDetailsElement>(null);

  async function handleDelete() {
    if (allWorkspaces.length <= 1) {
      await deleteWorkspace(workspace.workspaceId);
      onNewWorkspace();
      return;
    }
    await deleteWorkspace(workspace.workspaceId);
    const remaining = allWorkspaces.filter((w) => w.workspaceId !== workspace.workspaceId);
    onSwitchWorkspace(remaining[0]!.workspaceId);
  }

  async function handleDuplicate() {
    const copy = await duplicateWorkspace(workspace.workspaceId);
    if (copy) onSwitchWorkspace(copy.workspaceId);
    setOptionsOpen(false);
  }

  function handleDownloadBackup() {
    const json = exportWorkspaceJson(workspace);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${workspace.title.replace(/[^\w\s-]/g, "").trim() || "advocacy-project"}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setOptionsOpen(false);
  }

  async function handleRestoreFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const text = await file.text();
    const result = importWorkspaceBackup(text);
    if (!result.ok) {
      onImportError(
        result.reason === "unparseable" ? ADVOCACY_TERMS.unparseableBackupError : ADVOCACY_TERMS.invalidBackupError,
      );
      return;
    }
    onImportWorkspace(result.workspace);
    setOptionsOpen(false);
  }

  async function handleRenameSubmit() {
    const nextTitle = renameValue.trim() || ADVOCACY_TERMS.defaultProjectTitle;
    await renameWorkspace(workspace.workspaceId, nextTitle);
    setRenameOpen(false);
    onWorkspaceChanged();
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="text-xs font-medium text-[var(--color-text-tertiary)]" htmlFor="project-switcher">
          {allWorkspaces.length > 1 ? "Switch project" : "Project"}
        </label>
        {allWorkspaces.length > 1 ? (
          <select
            id="project-switcher"
            value={workspace.workspaceId}
            onChange={(e) => onSwitchWorkspace(e.target.value)}
            className="mt-1 w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] px-2 py-1.5 text-sm"
          >
            {allWorkspaces.map((w) => (
              <option key={w.workspaceId} value={w.workspaceId}>
                {w.title}
              </option>
            ))}
          </select>
        ) : (
          <p className="mt-1 truncate text-sm font-semibold text-[var(--color-text-primary)]" id="project-switcher">
            {workspace.title}
          </p>
        )}
        <p className="mt-1 text-xs text-[var(--color-text-tertiary)]" role="status">
          {storageUnavailable
            ? ADVOCACY_TERMS.storageUnavailable
            : autosaveStatus === "saving"
              ? ADVOCACY_TERMS.saving
              : autosaveStatus === "error"
                ? ADVOCACY_TERMS.couldNotSave
                : ADVOCACY_TERMS.savedOnDevice}
        </p>
      </div>

      <StepIndicator steps={steps} activeId={activeStage} onSelect={onSelectStage} />

      <details ref={detailsRef} open={optionsOpen} onToggle={(e) => setOptionsOpen(e.currentTarget.open)}>
        <summary className="cursor-pointer text-sm font-medium text-[var(--color-interactive)]">
          {ADVOCACY_TERMS.projectOptionsMenu}
        </summary>
        <div className="mt-2 flex flex-col gap-1.5 border-l border-[var(--color-border)] pl-3">
          <button
            type="button"
            onClick={() => {
              setRenameValue(workspace.title);
              setRenameOpen(true);
            }}
            className="text-left text-sm text-[var(--color-text-primary)] hover:text-[var(--color-interactive)]"
          >
            {ADVOCACY_TERMS.renameCta}
          </button>
          <button
            type="button"
            onClick={handleDuplicate}
            className="text-left text-sm text-[var(--color-text-primary)] hover:text-[var(--color-interactive)]"
          >
            {ADVOCACY_TERMS.duplicateCta}
          </button>
          {/* The help text under these two is shown as always-visible
              secondary text, not only a hover title -- 3 independent
              blind usability reviewers of this pass all flagged "backup"/
              "restore" as an unexplained jargon spike when the only
              explanation was a hover-only tooltip nobody would think to
              check. */}
          <div>
            <button
              type="button"
              onClick={handleDownloadBackup}
              className="text-left text-sm text-[var(--color-text-primary)] hover:text-[var(--color-interactive)]"
            >
              {ADVOCACY_TERMS.downloadBackupCta}
            </button>
            <p className="text-xs text-[var(--color-text-tertiary)]">{ADVOCACY_TERMS.backupHelpText}</p>
          </div>
          <div>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="text-left text-sm text-[var(--color-text-primary)] hover:text-[var(--color-interactive)]"
            >
              {ADVOCACY_TERMS.restoreBackupCta}
            </button>
            <p className="text-xs text-[var(--color-text-tertiary)]">{ADVOCACY_TERMS.restoreHelpText}</p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={handleRestoreFile}
            aria-label={ADVOCACY_TERMS.restoreBackupCta}
          />
          <button
            type="button"
            onClick={handleDelete}
            className="text-left text-sm text-[var(--color-alert)] hover:underline"
          >
            {ADVOCACY_TERMS.deleteCta}
          </button>
        </div>
      </details>

      <Button variant="secondary" size="sm" onClick={onNewWorkspace} className="w-full">
        + {ADVOCACY_TERMS.newProjectCta}
      </Button>

      <Dialog open={renameOpen} onClose={() => setRenameOpen(false)} title="Rename project">
        <label htmlFor="rename-project-input" className="block text-sm font-medium text-[var(--color-text-primary)]">
          Project name
        </label>
        <input
          id="rename-project-input"
          type="text"
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          className="mt-1 w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] px-3 py-2 text-sm"
        />
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setRenameOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleRenameSubmit}>Save name</Button>
        </div>
      </Dialog>
    </div>
  );
}
