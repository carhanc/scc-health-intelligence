"use client";

import type { AdvocacyWorkspace } from "@/lib/workspace/storage";
import { outputTypeLabel, AUDIENCES } from "./output-types";

const NEXT_ACTION_BY_STAGE: Record<string, string> = {
  project: "Choose a place, then review the evidence found for it.",
  evidence: "Review your evidence, then choose what to create.",
  draft: "Choose what to create, then create your draft.",
  review: "Check the draft, then copy, print, or save it.",
};

/** The task-oriented project summary (docs/design/advocate-intuitive-
 * workspace-research.md §7) -- every value here helps the user continue
 * the task, never a decorative KPI. Derived entirely from existing
 * workspace state (no new fetch), so this is a pure, cheap render. */
export function ProjectSummaryPanel({
  workspace,
  activeStage,
  hasDraft,
}: {
  workspace: AdvocacyWorkspace;
  activeStage: string;
  hasDraft: boolean;
}) {
  const place = workspace.selectedGeography?.displayName ?? null;
  const audience = AUDIENCES.find((a) => a.id === workspace.targetAudience)?.label ?? null;
  const evidenceCount = workspace.selectedEvidenceIds.length;
  const draftTypeLabel = outputTypeLabel(workspace.requestedOutputs[0] ?? "");

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">{workspace.title}</h2>
      </div>

      <dl className="space-y-3 text-sm">
        <div>
          <dt className="text-xs font-medium text-[var(--color-text-tertiary)]">Place</dt>
          <dd className="text-[var(--color-text-primary)]">{place ?? "Not chosen yet"}</dd>
        </div>
        {workspace.projectGoal && (
          <div>
            <dt className="text-xs font-medium text-[var(--color-text-tertiary)]">Goal</dt>
            <dd className="text-[var(--color-text-primary)]">{workspace.projectGoal}</dd>
          </div>
        )}
        <div>
          <dt className="text-xs font-medium text-[var(--color-text-tertiary)]">Who it's for</dt>
          <dd className="text-[var(--color-text-primary)]">{audience ?? "Not chosen yet"}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-[var(--color-text-tertiary)]">Evidence</dt>
          <dd className="text-[var(--color-text-primary)]">
            {evidenceCount === 0 ? "None selected yet" : `${evidenceCount} fact${evidenceCount === 1 ? "" : "s"} selected`}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-[var(--color-text-tertiary)]">Draft</dt>
          <dd className="text-[var(--color-text-primary)]">
            {draftTypeLabel ?? "Not chosen yet"}
            {draftTypeLabel && (hasDraft ? " · Created" : " · Not created yet")}
          </dd>
        </div>
      </dl>

      <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-sunken)] p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-tertiary)]">Next</p>
        <p className="mt-0.5 text-sm text-[var(--color-text-primary)]">
          {NEXT_ACTION_BY_STAGE[activeStage] ?? NEXT_ACTION_BY_STAGE.project}
        </p>
      </div>
    </div>
  );
}
