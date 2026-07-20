"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button, ErrorState, LoadingRegion, SkeletonText } from "@scc-health/ui";
import { api, ApiError, type AdvocacyEvidenceItem, type GeneratedBriefResponse } from "@/lib/api";
import { CUSTOM_SCENARIO_ID } from "../prioritize/scenario-selector";
import { ADVOCACY_TERMS } from "@/lib/advocacy-terms";
import { OUTPUT_TYPES, AUDIENCES, PRIMARY_OUTPUT_TYPE_IDS } from "./output-types";

type SubStep = "output" | "audience" | "goal" | "ready";

/** The "Create" stage as a short one-question-at-a-time sequence -- what
 * to create, who it's for, what it should accomplish, then a concise
 * readiness summary and the Create draft action (docs/design/advocate-
 * flow-simplification-visual-review.md "CREATE STEP"). Generation is
 * deterministic-only (apps/api's advocacy_generation.py); this never
 * implies an unconstrained AI is independently writing advocacy claims. */
export function CreateStep({
  outputType,
  onOutputTypeChange,
  geographyLabel,
  scenarioId,
  targetAudience,
  onAudienceChange,
  goal,
  onGoalChange,
  evidence,
  notes,
  onDraftCreated,
  onBackToEvidence,
}: {
  outputType: string;
  onOutputTypeChange: (id: string) => void;
  geographyLabel: string | null;
  scenarioId: string;
  targetAudience: string;
  onAudienceChange: (id: string) => void;
  goal: string;
  onGoalChange: (goal: string) => void;
  evidence: AdvocacyEvidenceItem[];
  notes: string;
  onDraftCreated: (outputType: string, result: GeneratedBriefResponse) => void;
  onBackToEvidence: () => void;
}) {
  const [subStep, setSubStep] = useState<SubStep>(outputType ? (targetAudience ? "ready" : "audience") : "output");
  const [goalDraft, setGoalDraft] = useState(goal);

  const audienceLabel = AUDIENCES.find((a) => a.id === targetAudience)?.label ?? null;
  const outputLabel = OUTPUT_TYPES.find((t) => t.id === outputType)?.label ?? null;

  const mutation = useMutation({
    mutationFn: () =>
      api.generateAdvocacyBrief({
        outputType,
        // A document-only project (no place chosen) has no real
        // geography -- passing an honest placeholder instead of a value
        // like "Selected geography" that would read as if a place had
        // actually been picked (found live: "Geography: Selected
        // geography." in a generated draft).
        geographyLabel: geographyLabel ?? "No specific community selected",
        scenarioId: scenarioId === CUSTOM_SCENARIO_ID ? null : scenarioId,
        audience: targetAudience || "commissioner",
        evidence,
        notes,
        dataMode: "live",
      }),
    onSuccess: (result) => onDraftCreated(outputType, result),
  });

  const canCreate = evidence.length > 0 || notes.trim().length > 0;

  if (subStep === "output") {
    return (
      <OutputTypeQuestion
        outputType={outputType}
        onSelect={(id) => {
          onOutputTypeChange(id);
          setSubStep("audience");
        }}
        onBack={onBackToEvidence}
      />
    );
  }

  if (subStep === "audience") {
    return (
      <AudienceQuestion
        targetAudience={targetAudience}
        onSelect={(id) => {
          onAudienceChange(id);
          setSubStep("goal");
        }}
        onBack={() => setSubStep("output")}
      />
    );
  }

  if (subStep === "goal") {
    return (
      <GoalQuestion
        goal={goalDraft}
        onChange={setGoalDraft}
        onContinue={() => {
          onGoalChange(goalDraft);
          setSubStep("ready");
        }}
        onBack={() => setSubStep("audience")}
      />
    );
  }

  return (
    <div className="space-y-5">
      <button
        type="button"
        onClick={() => setSubStep("goal")}
        className="text-sm font-medium text-[var(--color-interactive)] hover:underline"
      >
        ← Back
      </button>

      <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] p-4">
        <p className="text-sm font-semibold text-[var(--color-text-primary)]">
          Ready to create your {outputLabel?.toLowerCase() ?? "draft"}
        </p>
        <ul className="mt-2 space-y-1 text-sm text-[var(--color-text-secondary)]">
          {geographyLabel && <li>{geographyLabel}</li>}
          <li>{evidence.length > 0 ? ADVOCACY_TERMS.evidenceCountSuffix(evidence.length) : "No facts selected"}</li>
          {audienceLabel && <li>{audienceLabel}</li>}
        </ul>
        {!audienceLabel && (
          <p className="mt-2 text-sm font-medium text-[var(--color-caution-strong)]">Choose who this is for.</p>
        )}
      </div>

      <Button onClick={() => mutation.mutate()} disabled={!canCreate || mutation.isPending}>
        {ADVOCACY_TERMS.createDraftCta}
      </Button>

      {!canCreate && (
        <p className="text-sm text-[var(--color-text-secondary)]">{ADVOCACY_TERMS.selectAtLeastOneFactNote}</p>
      )}

      {mutation.isPending && (
        <LoadingRegion label="Creating your draft">
          <SkeletonText lines={8} />
        </LoadingRegion>
      )}
      {mutation.isError && (
        <ErrorState
          title="We couldn't create the draft"
          description={
            (mutation.error instanceof ApiError ? mutation.error.message : "Your selected evidence is still saved.") +
            " Try again."
          }
        />
      )}
    </div>
  );
}

function OutputTypeQuestion({
  outputType,
  onSelect,
  onBack,
}: {
  outputType: string;
  onSelect: (id: string) => void;
  onBack: () => void;
}) {
  const [showMore, setShowMore] = useState(!PRIMARY_OUTPUT_TYPE_IDS.includes(outputType) && !!outputType);
  const primary = OUTPUT_TYPES.filter((t) => PRIMARY_OUTPUT_TYPE_IDS.includes(t.id));
  const more = OUTPUT_TYPES.filter((t) => !PRIMARY_OUTPUT_TYPE_IDS.includes(t.id));

  return (
    <div className="space-y-4">
      <button type="button" onClick={onBack} className="text-sm font-medium text-[var(--color-interactive)] hover:underline">
        ← Back
      </button>
      <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">{ADVOCACY_TERMS.whatToCreateQuestion}</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {primary.map((t) => (
          <OutputCard key={t.id} id={t.id} label={t.label} description={t.description} selected={t.id === outputType} onSelect={onSelect} />
        ))}
      </div>
      {!showMore ? (
        <button type="button" onClick={() => setShowMore(true)} className="text-sm font-medium text-[var(--color-interactive)] hover:underline">
          {ADVOCACY_TERMS.seeMoreDocumentTypesCta}
        </button>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {more.map((t) => (
            <OutputCard key={t.id} id={t.id} label={t.label} description={t.description} selected={t.id === outputType} onSelect={onSelect} />
          ))}
        </div>
      )}
    </div>
  );
}

function OutputCard({
  id,
  label,
  description,
  selected,
  onSelect,
}: {
  id: string;
  label: string;
  description: string;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(id)}
      aria-pressed={selected}
      aria-label={`${label}: ${description}${selected ? ", selected" : ""}`}
      className={`rounded-[var(--radius-lg)] border p-4 text-left transition-colors ${
        selected
          ? "border-[var(--color-interactive)] bg-[var(--color-interactive-subtle)]"
          : "border-[var(--color-border)] hover:bg-[var(--color-surface-sunken)]"
      }`}
    >
      <p className="text-sm font-semibold text-[var(--color-text-primary)]">{label}</p>
      <p className="mt-1 text-sm text-[var(--color-text-secondary)]">{description}</p>
    </button>
  );
}

function AudienceQuestion({
  targetAudience,
  onSelect,
  onBack,
}: {
  targetAudience: string;
  onSelect: (id: string) => void;
  onBack: () => void;
}) {
  return (
    <div className="space-y-4">
      <button type="button" onClick={onBack} className="text-sm font-medium text-[var(--color-interactive)] hover:underline">
        ← Back
      </button>
      <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">{ADVOCACY_TERMS.whoIsThisForQuestion}</h2>
      <div className="flex flex-col gap-2 sm:max-w-sm">
        {AUDIENCES.map((a) => (
          <button
            key={a.id}
            type="button"
            onClick={() => onSelect(a.id)}
            aria-pressed={targetAudience === a.id}
            className={`rounded-[var(--radius-md)] border p-3 text-left text-sm font-medium transition-colors ${
              targetAudience === a.id
                ? "border-[var(--color-interactive)] bg-[var(--color-interactive-subtle)] text-[var(--color-interactive-hover)]"
                : "border-[var(--color-border)] text-[var(--color-text-primary)] hover:bg-[var(--color-surface-sunken)]"
            }`}
          >
            {a.label}
          </button>
        ))}
      </div>
    </div>
  );
}

const GOAL_SUGGESTIONS = [
  "Request a meeting",
  "Share community evidence",
  "Recommend further review",
  "Ask for more information",
  "Prepare for public comment",
];

function GoalQuestion({
  goal,
  onChange,
  onContinue,
  onBack,
}: {
  goal: string;
  onChange: (goal: string) => void;
  onContinue: () => void;
  onBack: () => void;
}) {
  return (
    <div className="space-y-4">
      <button type="button" onClick={onBack} className="text-sm font-medium text-[var(--color-interactive)] hover:underline">
        ← Back
      </button>
      <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">{ADVOCACY_TERMS.whatShouldItAccomplishQuestion}</h2>
      <p className="text-xs text-[var(--color-text-tertiary)]">Optional, but recommended.</p>
      <input
        type="text"
        value={goal}
        onChange={(e) => onChange(e.target.value)}
        placeholder="e.g. Request a meeting about primary-care access"
        className="w-full rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 py-2 text-sm"
        list="advocate-goal-suggestions"
      />
      <datalist id="advocate-goal-suggestions">
        {GOAL_SUGGESTIONS.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
      <div className="flex flex-wrap gap-2">
        {GOAL_SUGGESTIONS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onChange(s)}
            className="rounded-full border border-[var(--color-border)] px-3 py-1 text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-sunken)]"
          >
            {s}
          </button>
        ))}
      </div>
      <Button onClick={onContinue}>Continue</Button>
    </div>
  );
}
