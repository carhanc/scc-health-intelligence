"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ErrorState, LoadingRegion, SkeletonText } from "@scc-health/ui";
import { api, ApiError } from "@/lib/api";
import { CUSTOM_SCENARIO_ID } from "../prioritize/scenario-selector";
import { WeightSliders, DEFAULT_WEIGHTS } from "../prioritize/weight-sliders";
import { RECOMMENDED_FOCUS_ID, COMMON_FOCUS_IDS, FOCUS_BLURBS } from "./focus-options";

/** "What would you like to focus on?" -- the real backend scenarios,
 * reframed in plain language: one recommended option shown prominently,
 * a few common alternatives, and the rest behind "See more focus areas"
 * (docs/design/advocate-flow-simplification-visual-review.md "FOCUS
 * STEP"). Selecting any option calls onSelect, which the parent uses to
 * advance immediately to Evidence -- this screen never shows a dense
 * grid of every option at equal weight. */
export function FocusStep({
  selectedScenarioId,
  onSelect,
  customWeights,
  onCustomWeightsChange,
}: {
  selectedScenarioId: string;
  onSelect: (scenarioId: string) => void;
  customWeights: Record<string, number>;
  onCustomWeightsChange: (weights: Record<string, number>) => void;
}) {
  const [showMore, setShowMore] = useState(false);
  const [showCustom, setShowCustom] = useState(selectedScenarioId === CUSTOM_SCENARIO_ID);

  const query = useQuery({
    queryKey: ["prioritize-scenarios"],
    queryFn: () => api.getScenarios(),
    retry: 1,
  });

  if (query.isLoading) {
    return (
      <LoadingRegion label="Loading focus areas">
        <SkeletonText lines={4} />
      </LoadingRegion>
    );
  }
  if (query.isError) {
    return (
      <ErrorState
        title="Focus areas unavailable"
        description={query.error instanceof ApiError ? query.error.message : "Couldn't load focus areas."}
      />
    );
  }
  if (!query.data) return null;

  const scenarios = query.data.scenarios;
  const recommended = scenarios.find((s) => s.scenario_id === RECOMMENDED_FOCUS_ID);
  const common = COMMON_FOCUS_IDS.map((id) => scenarios.find((s) => s.scenario_id === id)).filter(
    (s): s is NonNullable<typeof s> => !!s,
  );
  const shownIds = new Set([RECOMMENDED_FOCUS_ID, ...COMMON_FOCUS_IDS]);
  const more = scenarios.filter((s) => !shownIds.has(s.scenario_id));

  function OptionCard({ id, label, blurb, prominent }: { id: string; label: string; blurb: string; prominent?: boolean }) {
    const isSelected = selectedScenarioId === id;
    return (
      <button
        type="button"
        onClick={() => onSelect(id)}
        aria-pressed={isSelected}
        aria-label={`${label}${prominent ? ", recommended" : ""}: ${blurb}${isSelected ? ", selected" : ""}`}
        className={`w-full rounded-[var(--radius-lg)] border p-4 text-left transition-colors ${
          isSelected
            ? "border-[var(--color-interactive)] bg-[var(--color-interactive-subtle)]"
            : "border-[var(--color-border)] hover:bg-[var(--color-surface-sunken)]"
        } ${prominent ? "sm:p-5" : ""}`}
      >
        <p className={`font-semibold text-[var(--color-text-primary)] ${prominent ? "text-base" : "text-sm"}`}>
          {label}
          {prominent && (
            <span className="ml-2 rounded-full bg-[var(--color-interactive-subtle)] px-2 py-0.5 text-xs font-medium text-[var(--color-interactive-hover)]">
              Recommended
            </span>
          )}
        </p>
        <p className="mt-1 text-sm text-[var(--color-text-secondary)]">{blurb}</p>
      </button>
    );
  }

  return (
    <div className="space-y-4">
      {recommended && (
        <OptionCard
          id={recommended.scenario_id}
          label={recommended.label}
          blurb={FOCUS_BLURBS[recommended.scenario_id] ?? recommended.description}
          prominent
        />
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {common.map((s) => (
          <OptionCard key={s.scenario_id} id={s.scenario_id} label={s.label} blurb={FOCUS_BLURBS[s.scenario_id] ?? s.description} />
        ))}
      </div>

      {!showMore && more.length > 0 && (
        <button
          type="button"
          onClick={() => setShowMore(true)}
          className="text-sm font-medium text-[var(--color-interactive)] hover:underline"
        >
          See more focus areas
        </button>
      )}
      {showMore && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {more.map((s) => (
            <OptionCard key={s.scenario_id} id={s.scenario_id} label={s.label} blurb={FOCUS_BLURBS[s.scenario_id] ?? s.description} />
          ))}
        </div>
      )}

      {!showCustom ? (
        <button
          type="button"
          onClick={() => setShowCustom(true)}
          className="block text-sm font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-interactive)] hover:underline"
        >
          Create a custom focus
        </button>
      ) : (
        <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] p-4">
          <p className="text-sm font-semibold text-[var(--color-text-primary)]">Custom focus</p>
          <p className="mt-1 text-sm text-[var(--color-text-secondary)]">Set your own weighting for each factor.</p>
          <div className="mt-3">
            <WeightSliders weights={customWeights || DEFAULT_WEIGHTS} onChange={onCustomWeightsChange} />
          </div>
          <button
            type="button"
            onClick={() => onSelect(CUSTOM_SCENARIO_ID)}
            className="mt-3 rounded-[var(--radius-md)] bg-[var(--color-interactive)] px-4 py-2 text-sm font-medium text-[var(--color-text-on-interactive)] hover:bg-[var(--color-interactive-hover)]"
          >
            Use this custom focus
          </button>
        </div>
      )}
    </div>
  );
}
