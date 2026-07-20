"use client";

import { useRef, useState } from "react";
import { Button, Dialog } from "@scc-health/ui";
import {
  type AdvocacyWorkspace,
  deleteWorkspace,
  duplicateWorkspace,
  exportWorkspaceJson,
  importWorkspaceBackup,
  renameWorkspace,
} from "@/lib/workspace/storage";
import { ADVOCACY_TERMS } from "@/lib/advocacy-terms";

/** All project-maintenance actions collapsed into one compact menu near
 * the page title -- never a permanent rail (docs/design/advocate-flow-
 * simplification-visual-review.md). Project switching lives here too,
 * as a simple list rather than a native <select> always on screen. */
export function ProjectMenu({
  workspace,
  allWorkspaces,
  onSwitchWorkspace,
  onNewWorkspace,
  onWorkspaceChanged,
  onImportWorkspace,
  onImportError,
}: {
  workspace: AdvocacyWorkspace;
  allWorkspaces: AdvocacyWorkspace[];
  onSwitchWorkspace: (workspaceId: string) => void;
  onNewWorkspace: () => void;
  onWorkspaceChanged: () => void;
  onImportWorkspace: (workspace: AdvocacyWorkspace) => void;
  onImportError: (message: string) => void;
}) {
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState(workspace.title);
  const [menuOpen, setMenuOpen] = useState(false);
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
    setMenuOpen(false);
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
    setMenuOpen(false);
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
    setMenuOpen(false);
  }

  async function handleRenameSubmit() {
    const nextTitle = renameValue.trim() || ADVOCACY_TERMS.defaultProjectTitle;
    await renameWorkspace(workspace.workspaceId, nextTitle);
    setRenameOpen(false);
    onWorkspaceChanged();
  }

  return (
    <div>
      <details ref={detailsRef} open={menuOpen} onToggle={(e) => setMenuOpen(e.currentTarget.open)}>
        <summary className="flex cursor-pointer list-none items-center gap-1 rounded-[var(--radius-sm)] border border-[var(--color-border)] px-2.5 py-1.5 text-sm font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-sunken)] hover:text-[var(--color-text-primary)]">
          {ADVOCACY_TERMS.projectOptionsMenu}
          <span aria-hidden="true" className="text-[10px]">
            ▾
          </span>
        </summary>
        <div className="mt-2 flex max-w-xs flex-col gap-1 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-2 text-sm shadow-sm">
          <button
            type="button"
            onClick={() => {
              setRenameValue(workspace.title);
              setRenameOpen(true);
              setMenuOpen(false);
            }}
            className="rounded-[var(--radius-sm)] px-2 py-1.5 text-left text-[var(--color-text-primary)] hover:bg-[var(--color-surface-sunken)]"
          >
            {ADVOCACY_TERMS.renameCta}
          </button>

          <button
            type="button"
            onClick={() => {
              onNewWorkspace();
              setMenuOpen(false);
            }}
            className="rounded-[var(--radius-sm)] px-2 py-1.5 text-left text-[var(--color-text-primary)] hover:bg-[var(--color-surface-sunken)]"
          >
            {ADVOCACY_TERMS.newProjectCta}
          </button>

          {allWorkspaces.length > 1 && (
            <div className="border-t border-[var(--color-border)] pt-1">
              <p className="px-2 pt-1 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-tertiary)]">
                {ADVOCACY_TERMS.switchProjectCta}
              </p>
              {allWorkspaces.map((w) => (
                <button
                  key={w.workspaceId}
                  type="button"
                  onClick={() => {
                    onSwitchWorkspace(w.workspaceId);
                    setMenuOpen(false);
                  }}
                  aria-current={w.workspaceId === workspace.workspaceId ? "true" : undefined}
                  className="block w-full truncate rounded-[var(--radius-sm)] px-2 py-1.5 text-left text-[var(--color-text-primary)] hover:bg-[var(--color-surface-sunken)] aria-[current=true]:bg-[var(--color-interactive-subtle)] aria-[current=true]:font-medium"
                >
                  {w.title}
                </button>
              ))}
            </div>
          )}

          <button
            type="button"
            onClick={handleDuplicate}
            className="rounded-[var(--radius-sm)] border-t border-[var(--color-border)] px-2 py-1.5 pt-2.5 text-left text-[var(--color-text-primary)] hover:bg-[var(--color-surface-sunken)]"
          >
            {ADVOCACY_TERMS.duplicateCta}
          </button>

          <div>
            <button
              type="button"
              onClick={handleDownloadBackup}
              className="w-full rounded-[var(--radius-sm)] px-2 py-1.5 text-left text-[var(--color-text-primary)] hover:bg-[var(--color-surface-sunken)]"
            >
              {ADVOCACY_TERMS.downloadBackupCta}
            </button>
            <p className="px-2 text-xs text-[var(--color-text-tertiary)]">{ADVOCACY_TERMS.backupHelpText}</p>
          </div>
          <div>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full rounded-[var(--radius-sm)] px-2 py-1.5 text-left text-[var(--color-text-primary)] hover:bg-[var(--color-surface-sunken)]"
            >
              {ADVOCACY_TERMS.restoreBackupCta}
            </button>
            <p className="px-2 text-xs text-[var(--color-text-tertiary)]">{ADVOCACY_TERMS.restoreHelpText}</p>
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
            className="rounded-[var(--radius-sm)] border-t border-[var(--color-border)] px-2 py-1.5 pt-2.5 text-left text-[var(--color-alert)] hover:bg-[var(--color-alert-subtle)]"
          >
            {ADVOCACY_TERMS.deleteCta}
          </button>
        </div>
      </details>

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
