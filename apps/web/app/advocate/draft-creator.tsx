"use client";

import { useMutation } from "@tanstack/react-query";
import { Button, ErrorState, LoadingRegion, SkeletonText } from "@scc-health/ui";
import { api, ApiError, type AdvocacyEvidenceItem, type GeneratedBriefResponse } from "@/lib/api";
import { CUSTOM_SCENARIO_ID } from "../prioritize/scenario-selector";
import { ADVOCACY_TERMS } from "@/lib/advocacy-terms";
import { OUTPUT_TYPES } from "./output-types";

/** The "Draft" stage: "What do you want to create?" as a visual card
 * picker (not a bare <select>), a calm readiness checklist, and the
 * "Create draft" action -- audience and goal are chosen earlier, in the
 * Project stage, and passed in read-only here (docs/design/advocate-
 * intuitive-workspace-research.md §"draft creation"). Production
 * generation is deterministic-only (apps/api's advocacy_generation.py);
 * this component never implies an unconstrained AI is independently
 * writing advocacy claims. */
export function DraftCreator({
  outputType,
  onOutputTypeChange,
  geographyLabel,
  scenarioId,
  audienceLabel,
  goal,
  evidence,
  notes,
  onDraftCreated,
}: {
  outputType: string;
  onOutputTypeChange: (id: string) => void;
  geographyLabel: string | null;
  scenarioId: string;
  audienceLabel: string | null;
  goal: string;
  evidence: AdvocacyEvidenceItem[];
  notes: string;
  onDraftCreated: (outputType: string, result: GeneratedBriefResponse) => void;
}) {
  const mutation = useMutation({
    mutationFn: () =>
      api.generateAdvocacyBrief({
        outputType,
        geographyLabel: geographyLabel ?? "Selected geography",
        scenarioId: scenarioId === CUSTOM_SCENARIO_ID ? null : scenarioId,
        audience: audienceLabel ?? "commissioner",
        evidence,
        notes,
        dataMode: "live",
      }),
    onSuccess: (result) => onDraftCreated(outputType, result),
  });

  const checklist: { label: string; met: boolean }[] = [
    { label: "Place selected", met: !!geographyLabel },
    { label: audienceLabel ? `Audience: ${audienceLabel}` : "Audience selected", met: !!audienceLabel },
    { label: ADVOCACY_TERMS.evidenceCountSuffix(evidence.length), met: evidence.length > 0 },
    { label: goal ? `Goal: ${goal}` : "Add your goal", met: !!goal },
  ];
  const allReady = checklist.every((c) => c.met);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-semibold text-[var(--color-text-primary)]">
          {ADVOCACY_TERMS.whatToCreateQuestion}
        </h2>
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {OUTPUT_TYPES.map((t) => {
            const selected = t.id === outputType;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => onOutputTypeChange(t.id)}
                aria-pressed={selected}
                aria-label={`${t.label}: ${t.description}${selected ? ", selected" : ""}`}
                className={`rounded-[var(--radius-md)] border p-3 text-left transition-colors ${
                  selected
                    ? "border-[var(--color-interactive)] bg-[var(--color-interactive-subtle)]"
                    : "border-[var(--color-border)] hover:bg-[var(--color-surface-sunken)]"
                }`}
              >
                <p className="text-sm font-medium text-[var(--color-text-primary)]">{t.label}</p>
                <p className="mt-0.5 text-xs text-[var(--color-text-secondary)]">{t.description}</p>
              </button>
            );
          })}
        </div>
      </div>

      <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-tertiary)]">
          Ready to create
        </p>
        <ul className="mt-1.5 space-y-1 text-sm">
          {checklist.map((c) => (
            <li key={c.label} className={c.met ? "text-[var(--color-text-primary)]" : "text-[var(--color-caution-strong)]"}>
              {c.met ? "✓" : "•"} {c.label}
            </li>
          ))}
        </ul>
        {!allReady && (
          <p className="mt-1.5 text-xs text-[var(--color-text-secondary)]">
            You can still create a draft with what you have -- missing items above will be left out.
          </p>
        )}
      </div>

      <p className="text-xs text-[var(--color-text-tertiary)]">
        The draft will organize your selected evidence into a clear structure. Review every statement before
        sharing.
      </p>

      <Button onClick={() => mutation.mutate()} disabled={evidence.length === 0 || mutation.isPending}>
        {ADVOCACY_TERMS.createDraftCta}
      </Button>

      {evidence.length === 0 && (
        <p className="text-sm text-[var(--color-text-secondary)]">
          Select at least one fact of evidence before creating a draft.
        </p>
      )}

      {mutation.isPending && (
        <LoadingRegion label="Creating your draft">
          <SkeletonText lines={8} />
        </LoadingRegion>
      )}
      {mutation.isError && (
        <ErrorState
          title="Couldn't create this draft"
          description={mutation.error instanceof ApiError ? mutation.error.message : "Try again."}
        />
      )}
    </div>
  );
}
