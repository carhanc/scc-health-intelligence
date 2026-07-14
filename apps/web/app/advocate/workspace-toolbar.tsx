"use client";

import { useRef, useState } from "react";
import { Badge, Button, Dialog } from "@scc-health/ui";
import {
  type AdvocacyWorkspace,
  deleteWorkspace,
  duplicateWorkspace,
  exportWorkspaceJson,
  importWorkspaceJson,
  renameWorkspace,
} from "@/lib/workspace/storage";

export function WorkspaceToolbar({
  workspace,
  allWorkspaces,
  autosaveStatus,
  onSwitchWorkspace,
  onNewWorkspace,
  onWorkspaceChanged,
  onImportWorkspace,
}: {
  workspace: AdvocacyWorkspace;
  allWorkspaces: AdvocacyWorkspace[];
  autosaveStatus: "idle" | "saving" | "saved";
  onSwitchWorkspace: (workspaceId: string) => void;
  onNewWorkspace: () => void;
  onWorkspaceChanged: () => void;
  onImportWorkspace: (workspace: AdvocacyWorkspace) => void;
}) {
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState(workspace.title);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
  }

  function handleExport() {
    const json = exportWorkspaceJson(workspace);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${workspace.title.replace(/[^\w\s-]/g, "").trim() || "workspace"}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleImportFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const imported = importWorkspaceJson(text);
    onImportWorkspace(imported);
    event.target.value = "";
  }

  async function handleRenameSubmit() {
    await renameWorkspace(workspace.workspaceId, renameValue.trim() || "Untitled workspace");
    setRenameOpen(false);
    onWorkspaceChanged();
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-sunken)] p-3">
      <label className="flex items-center gap-2 text-sm">
        <span className="font-medium text-[var(--color-text-primary)]">Workspace:</span>
        <select
          value={workspace.workspaceId}
          onChange={(e) => onSwitchWorkspace(e.target.value)}
          className="rounded-[var(--radius-sm)] border border-[var(--color-border)] px-2 py-1"
        >
          {allWorkspaces.map((w) => (
            <option key={w.workspaceId} value={w.workspaceId}>
              {w.title}
            </option>
          ))}
        </select>
      </label>

      <span className="text-xs text-[var(--color-text-tertiary)]" role="status">
        {autosaveStatus === "saving" && "Saving…"}
        {autosaveStatus === "saved" && "All changes saved locally"}
      </span>

      <div className="ml-auto flex flex-wrap gap-1.5">
        <Button size="sm" variant="secondary" onClick={onNewWorkspace}>
          New
        </Button>
        <Button size="sm" variant="secondary" onClick={() => setRenameOpen(true)}>
          Rename
        </Button>
        <Button size="sm" variant="secondary" onClick={handleDuplicate}>
          Duplicate
        </Button>
        <Button size="sm" variant="secondary" onClick={handleExport}>
          Export JSON
        </Button>
        <Button size="sm" variant="secondary" onClick={() => fileInputRef.current?.click()}>
          Import JSON
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json"
          className="hidden"
          onChange={handleImportFile}
          aria-label="Import workspace JSON file"
        />
        <Button size="sm" variant="danger" onClick={handleDelete}>
          Delete
        </Button>
      </div>

      <Dialog open={renameOpen} onClose={() => setRenameOpen(false)} title="Rename workspace">
        <label htmlFor="rename-workspace-input" className="block text-sm font-medium text-[var(--color-text-primary)]">
          Workspace name
        </label>
        <input
          id="rename-workspace-input"
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

      <Badge tone="neutral" title="Stored only in this browser -- not synced to any account or server.">
        Local only
      </Badge>
    </div>
  );
}
