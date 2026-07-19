"use client";

import { useQuery } from "@tanstack/react-query";
import type { AdvocacyWorkspace } from "@/lib/workspace/storage";
import { api } from "@/lib/api";
import { CUSTOM_SCENARIO_ID } from "../prioritize/scenario-selector";
import { outputTypeLabel, AUDIENCES } from "./output-types";
import { ADVOCACY_TERMS } from "@/lib/advocacy-terms";

/** Same queryKey FocusStep uses, so switching between Focus and the
 * summary/details views serves from the React Query cache instead of
 * refetching the scenario list a second time. */
function useFocusLabel(scenarioId: string | null): string | null {
  const query = useQuery({ queryKey: ["prioritize-scenarios"], queryFn: () => api.getScenarios() });
  if (!scenarioId) return null;
  if (scenarioId === CUSTOM_SCENARIO_ID) return "Custom focus";
  return query.data?.scenarios.find((s) => s.scenario_id === scenarioId)?.label ?? null;
}

/** A compact, single-line project summary shown only once meaningful
 * information exists -- never an incomplete-value dashboard (docs/design/
 * advocate-flow-simplification-visual-review.md: "Do not show 'Evidence:
 * None selected yet'"). A "View project details" disclosure reveals
 * every current choice for anyone who wants it; nothing here is ever a
 * decorative KPI. Returns null entirely until there's a place to show. */
export function ProjectSummaryBar({
  workspace,
  onChangePlace,
}: {
  workspace: AdvocacyWorkspace;
  onChangePlace: () => void;
}) {
  const place = workspace.selectedGeography?.displayName ?? null;
  const focus = useFocusLabel(workspace.selectedScenarioId);
  if (!place) return null;

  const audience = AUDIENCES.find((a) => a.id === workspace.targetAudience)?.label ?? null;
  const evidenceCount = workspace.selectedEvidenceIds.length;
  const draftTypeLabel = outputTypeLabel(workspace.requestedOutputs[0] ?? "");

  return (
    <div
      data-testid="project-summary-bar"
      className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-[var(--color-text-secondary)]"
    >
      <span className="font-medium text-[var(--color-text-primary)]">{place}</span>
      {focus && (
        <>
          <span aria-hidden="true">·</span>
          <span>{focus}</span>
        </>
      )}
      {audience && (
        <>
          <span aria-hidden="true">·</span>
          <span>{audience}</span>
        </>
      )}
      {evidenceCount > 0 && (
        <>
          <span aria-hidden="true">·</span>
          <span>{ADVOCACY_TERMS.evidenceCountSuffix(evidenceCount)}</span>
        </>
      )}
      {draftTypeLabel && (
        <>
          <span aria-hidden="true">·</span>
          <span>{draftTypeLabel}</span>
        </>
      )}
      <button
        type="button"
        onClick={onChangePlace}
        className="font-medium text-[var(--color-interactive)] hover:underline"
      >
        {ADVOCACY_TERMS.changeCta}
      </button>
    </div>
  );
}

/** Everything currently known about the project, matching the compact
 * bar's own "only show what exists" rule field-by-field. The caller
 * (advocate-client.tsx) already gates whether this renders at all behind
 * its own "View project details" toggle button -- this is a plain list,
 * not a second nested disclosure, so one click reveals the content. */
export function ProjectDetailsDisclosure({ workspace }: { workspace: AdvocacyWorkspace }) {
  const place = workspace.selectedGeography?.displayName ?? null;
  const focus = useFocusLabel(workspace.selectedScenarioId);
  const audience = AUDIENCES.find((a) => a.id === workspace.targetAudience)?.label ?? null;
  const evidenceCount = workspace.selectedEvidenceIds.length;
  const draftTypeLabel = outputTypeLabel(workspace.requestedOutputs[0] ?? "");

  const rows: { label: string; value: string }[] = [];
  if (place) rows.push({ label: "Place", value: place });
  if (focus) rows.push({ label: "Focus", value: focus });
  if (workspace.projectGoal) rows.push({ label: "Goal", value: workspace.projectGoal });
  if (audience) rows.push({ label: "Who it's for", value: audience });
  if (evidenceCount > 0) rows.push({ label: "Evidence", value: ADVOCACY_TERMS.evidenceCountSuffix(evidenceCount) });
  if (draftTypeLabel) rows.push({ label: "Draft type", value: draftTypeLabel });

  if (rows.length === 0) return null;

  return (
    <dl data-testid="project-details-disclosure" className="space-y-1.5 text-sm">
      {rows.map((r) => (
        <div key={r.label} className="flex gap-2">
          <dt className="w-24 flex-none text-[var(--color-text-tertiary)]">{r.label}</dt>
          <dd className="text-[var(--color-text-primary)]">{r.value}</dd>
        </div>
      ))}
    </dl>
  );
}
