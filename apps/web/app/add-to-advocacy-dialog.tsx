"use client";

import { useState } from "react";
import { Button, Dialog } from "@scc-health/ui";
import type { AdvocacyWorkspace } from "@/lib/workspace/storage";

/** Shown only when at least one real (non-empty) advocacy project already
 * exists, so a click never silently lands evidence in an unrelated
 * project (docs/design/advocate-intuitive-workspace-research.md §"cross-
 * page integration"). Defaults to "start a new project" -- adding to an
 * existing project is an explicit choice, never the default, and the
 * dialog says plainly when it would replace that project's place. */
export function AddToAdvocacyDialog({
  open,
  onClose,
  existingProjects,
  newPlaceLabel,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  existingProjects: AdvocacyWorkspace[];
  newPlaceLabel: string;
  onConfirm: (targetWorkspaceId: string | null) => void;
}) {
  const [choice, setChoice] = useState<string>("new");

  return (
    <Dialog open={open} onClose={onClose} title="Add to advocacy project">
      <p className="text-sm text-[var(--color-text-secondary)]">
        Where should evidence about {newPlaceLabel} go?
      </p>
      <div className="mt-3 space-y-2">
        <label className="flex items-start gap-2 text-sm">
          <input
            type="radio"
            name="add-to-advocacy-target"
            checked={choice === "new"}
            onChange={() => setChoice("new")}
            className="mt-1"
          />
          <span>
            <span className="font-medium text-[var(--color-text-primary)]">Start a new project</span>
          </span>
        </label>
        {existingProjects.map((p) => (
          <label key={p.workspaceId} className="flex items-start gap-2 text-sm">
            <input
              type="radio"
              name="add-to-advocacy-target"
              checked={choice === p.workspaceId}
              onChange={() => setChoice(p.workspaceId)}
              className="mt-1"
            />
            <span>
              <span className="font-medium text-[var(--color-text-primary)]">Add to "{p.title}"</span>
              {p.selectedGeography && p.selectedGeography.displayName !== newPlaceLabel && (
                <span className="block text-xs text-[var(--color-caution-strong)]">
                  This will replace {p.selectedGeography.displayName} with {newPlaceLabel} in this project.
                </span>
              )}
            </span>
          </label>
        ))}
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={() => onConfirm(choice === "new" ? null : choice)}>Continue</Button>
      </div>
    </Dialog>
  );
}
