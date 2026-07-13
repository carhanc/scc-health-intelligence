"use client";

import { useQuery } from "@tanstack/react-query";
import { Badge, ErrorState, LoadingRegion, SkeletonText } from "@scc-health/ui";
import { api, ApiError } from "@/lib/api";

export const CUSTOM_SCENARIO_ID = "__custom__";

// A scenario the user might reasonably look for that this platform does
// not yet score at the tract level -- shown as a real, visible,
// explained "not available" option rather than silently omitted or
// faked with an unrelated weighting (CLAUDE.md: "a failed source must
// produce a visible unavailable state, a logged reason, and a
// documented fallback"; DECISIONS.md DEC-027).
const UNAVAILABLE_SCENARIOS = [
  {
    id: "language_access",
    label: "Language access",
    reason:
      "No tract-level language-barrier data source is currently scored, so this platform cannot build this priority lens without reweighting unrelated factors under a misleading label. Coverage navigation or a Custom scenario are the closest available substitutes.",
  },
];

export function ScenarioSelector({
  selectedScenarioId,
  onSelect,
}: {
  selectedScenarioId: string;
  onSelect: (scenarioId: string) => void;
}) {
  const query = useQuery({
    queryKey: ["prioritize-scenarios"],
    queryFn: () => api.getScenarios(),
    retry: 1,
  });

  if (query.isLoading) {
    return (
      <LoadingRegion label="Loading scenarios">
        <SkeletonText lines={4} />
      </LoadingRegion>
    );
  }
  if (query.isError) {
    return (
      <ErrorState
        title="Scenarios unavailable"
        description={
          query.error instanceof ApiError ? query.error.message : "Couldn't load scenarios. Is the API running?"
        }
      />
    );
  }
  if (!query.data) return null;

  const selectedNamed = query.data.scenarios.find((s) => s.scenario_id === selectedScenarioId);
  const isCustom = selectedScenarioId === CUSTOM_SCENARIO_ID;

  return (
    <div>
      <fieldset>
        <legend className="text-sm font-semibold text-[var(--color-text-primary)]">Scenario</legend>
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {query.data.scenarios.map((s) => (
            <label
              key={s.scenario_id}
              className={`flex cursor-pointer items-start gap-2 rounded-[var(--radius-md)] border p-2.5 text-sm transition-colors ${
                selectedScenarioId === s.scenario_id
                  ? "border-[var(--color-interactive)] bg-[var(--color-interactive-subtle)]"
                  : "border-[var(--color-border)] hover:border-[var(--color-border-strong)]"
              }`}
            >
              <input
                type="radio"
                name="prioritize-scenario"
                className="mt-0.5"
                checked={selectedScenarioId === s.scenario_id}
                onChange={() => onSelect(s.scenario_id)}
              />
              <span className="font-medium text-[var(--color-text-primary)]">{s.label}</span>
            </label>
          ))}

          <label
            className={`flex cursor-pointer items-start gap-2 rounded-[var(--radius-md)] border p-2.5 text-sm transition-colors ${
              isCustom
                ? "border-[var(--color-interactive)] bg-[var(--color-interactive-subtle)]"
                : "border-[var(--color-border)] hover:border-[var(--color-border-strong)]"
            }`}
          >
            <input
              type="radio"
              name="prioritize-scenario"
              className="mt-0.5"
              checked={isCustom}
              onChange={() => onSelect(CUSTOM_SCENARIO_ID)}
            />
            <span className="font-medium text-[var(--color-text-primary)]">Custom scenario</span>
          </label>
        </div>
      </fieldset>

      {selectedNamed && <p className="mt-3 text-sm text-[var(--color-text-secondary)]">{selectedNamed.description}</p>}
      {isCustom && (
        <p className="mt-3 text-sm text-[var(--color-text-secondary)]">
          Set your own weighting for each factor below.
        </p>
      )}

      <div className="mt-3 space-y-1.5">
        {UNAVAILABLE_SCENARIOS.map((u) => (
          <div key={u.id} className="flex items-start gap-2 rounded-[var(--radius-md)] border border-dashed border-[var(--color-border)] p-2.5 text-sm">
            <Badge tone="neutral">Not available yet</Badge>
            <span className="text-[var(--color-text-secondary)]">
              <strong className="font-medium text-[var(--color-text-primary)]">{u.label}:</strong> {u.reason}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
