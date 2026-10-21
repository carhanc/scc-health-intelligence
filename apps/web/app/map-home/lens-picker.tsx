"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { CUSTOM_SCENARIO_ID } from "../prioritize/scenario-selector";
import { WeightSliders } from "../prioritize/weight-sliders";
import { COMMON_FOCUS_IDS, FOCUS_BLURBS, RECOMMENDED_FOCUS_ID, UNAVAILABLE_FOCUS_AREAS } from "../focus-options";
import { WeightBreakdown } from "../weight-breakdown";

/**
 * "What matters most to you?" There is no single correct definition of
 * health priority, so this is the control that lets a person say what they
 * care about. The same five areas are always scored; a focus only changes
 * how much each one counts, and the weighting is one click away, never
 * hidden. "Build your own" turns the weights into sliders and recolors the
 * map as you move them.
 */
export function LensPicker({
  scenarioId,
  onSelectNamed,
  onSelectCustom,
  customWeights,
  onCustomChange,
}: {
  scenarioId: string;
  onSelectNamed: (scenarioId: string) => void;
  onSelectCustom: () => void;
  customWeights: Record<string, number>;
  onCustomChange: (weights: Record<string, number>) => void;
}) {
  const [showMore, setShowMore] = useState(false);
  const isCustom = scenarioId === CUSTOM_SCENARIO_ID;

  const query = useQuery({
    queryKey: ["scenarios"],
    queryFn: api.getScenarios,
    retry: 1,
    staleTime: 10 * 60 * 1000,
  });

  const scenarios = query.data?.scenarios ?? [];
  const byId = new Map(scenarios.map((s) => [s.scenario_id, s]));
  const topIds = [RECOMMENDED_FOCUS_ID, ...COMMON_FOCUS_IDS].filter((id) => byId.has(id));
  const moreScenarios = scenarios.filter((s) => !topIds.includes(s.scenario_id));
  const active = byId.get(scenarioId);
  const moreContainsActive = moreScenarios.some((s) => s.scenario_id === scenarioId);

  // A plain function (not a component), so chips keep their identity, and keyboard focus, across renders.
  function renderChip(id: string, label: string) {
    const selected = scenarioId === id;
    return (
      <button
        key={id}
        type="button"
        aria-pressed={selected}
        onClick={() => onSelectNamed(id)}
        className={`rounded-full px-3 py-1.5 text-sm font-medium leading-5 transition-colors ${
          selected
            ? "bg-[var(--color-interactive)] text-[var(--color-text-on-interactive)]"
            : "border border-[var(--color-border-strong)] bg-[var(--color-surface)] text-[var(--color-text-primary)] hover:border-[var(--color-interactive)] hover:text-[var(--color-interactive)]"
        }`}
      >
        {label}
      </button>
    );
  }

  if (query.isError) {
    return (
      <p className="text-sm text-[var(--color-text-secondary)]">
        Focus areas couldn&rsquo;t load, so the map is showing the overall picture.
      </p>
    );
  }

  return (
    <div>
      <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">What matters most to you?</h3>
      <div className="mt-2.5 flex flex-wrap gap-2">
        {topIds.map((id) => renderChip(id, byId.get(id)!.label))}
        {(showMore || moreContainsActive) &&
          moreScenarios.map((s) => renderChip(s.scenario_id, s.label))}
        {!showMore && !moreContainsActive && moreScenarios.length > 0 && (
          <button
            type="button"
            onClick={() => setShowMore(true)}
            className="rounded-full border border-dashed border-[var(--color-border-strong)] px-3 py-1.5 text-sm font-medium leading-5 text-[var(--color-text-secondary)] hover:border-[var(--color-interactive)] hover:text-[var(--color-interactive)]"
          >
            More focus areas
          </button>
        )}
        <button
          type="button"
          aria-pressed={isCustom}
          onClick={onSelectCustom}
          className={`rounded-full px-3 py-1.5 text-sm font-medium leading-5 transition-colors ${
            isCustom
              ? "bg-[var(--color-accent-strong)] text-white"
              : "border border-dashed border-[var(--color-border-strong)] text-[var(--color-text-secondary)] hover:border-[var(--color-accent-strong)] hover:text-[var(--color-accent-strong)]"
          }`}
        >
          Build your own
        </button>
      </div>

      {(showMore || moreContainsActive) && (
        <p className="mt-2 text-xs text-[var(--color-text-tertiary)]">
          {UNAVAILABLE_FOCUS_AREAS.map((u) => `${u.label} isn't scored yet (no tract-level data source).`).join(" ")}
        </p>
      )}

      {isCustom ? (
        <div className="mt-4 rounded-[var(--radius-md)] bg-[var(--color-surface-sunken)] p-4">
          <WeightSliders weights={customWeights} onChange={onCustomChange} />
        </div>
      ) : (
        <>
          <p className="mt-3 text-sm text-[var(--color-text-secondary)]">
            {FOCUS_BLURBS[scenarioId] ?? active?.description}
          </p>
          {active && (
            <details className="group mt-2">
              <summary className="cursor-pointer text-sm font-medium text-[var(--color-interactive)] hover:underline">
                How this is weighted
              </summary>
              <div className="mt-2.5 max-w-sm">
                <WeightBreakdown weights={active.weights} />
                <p className="mt-2 text-xs text-[var(--color-text-tertiary)]">
                  Every focus scores the same five areas. Only how much each one counts changes.
                </p>
              </div>
            </details>
          )}
        </>
      )}
    </div>
  );
}

