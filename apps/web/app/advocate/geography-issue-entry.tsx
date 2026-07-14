"use client";

import { SearchPanel } from "../explore/search-panel";
import type { SelectedGeography } from "../explore/selection";
import { ScenarioSelector, CUSTOM_SCENARIO_ID } from "../prioritize/scenario-selector";
import { WeightSliders, DEFAULT_WEIGHTS } from "../prioritize/weight-sliders";

/**
 * Steps 1-2 of the Advocate task flow ("Choose a place" / "Choose the
 * issue") -- reuses Explore's search panel and Prioritize's scenario
 * selector and weight sliders directly rather than rebuilding either.
 */
export function GeographyIssueEntry({
  selectedGeography,
  onSelectGeography,
  selectedScenarioId,
  onSelectScenario,
  customWeights,
  onCustomWeightsChange,
}: {
  selectedGeography: SelectedGeography | null;
  onSelectGeography: (selection: SelectedGeography) => void;
  selectedScenarioId: string;
  onSelectScenario: (scenarioId: string) => void;
  customWeights: Record<string, number>;
  onCustomWeightsChange: (weights: Record<string, number>) => void;
}) {
  const isCustom = selectedScenarioId === CUSTOM_SCENARIO_ID;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <div>
        <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">
          1. Choose a place
        </h2>
        <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
          Search a city, ZIP code, supervisor district, or census tract -- you never need to
          already know a tract number.
        </p>
        <div className="mt-3">
          <SearchPanel selected={selectedGeography} onSelect={onSelectGeography} />
        </div>
      </div>

      <div>
        <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">
          2. Choose the issue
        </h2>
        <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
          Pick a priority lens, or set your own weighting.
        </p>
        <div className="mt-3">
          <ScenarioSelector selectedScenarioId={selectedScenarioId} onSelect={onSelectScenario} />
          {isCustom && (
            <div className="mt-4">
              <WeightSliders weights={customWeights || DEFAULT_WEIGHTS} onChange={onCustomWeightsChange} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
