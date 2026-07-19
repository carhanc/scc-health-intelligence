"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge, Card, DataModeBadge, ErrorState, LoadingRegion, SkeletonText } from "@scc-health/ui";
import { api, ApiError, type OptimizationScenario } from "@/lib/api";

const STATUS_TONE: Record<string, "success" | "alert" | "caution"> = {
  OPTIMAL: "success",
  FEASIBLE: "success",
  INFEASIBLE: "alert",
};

// The pipeline (out of scope to edit here -- source-data pipelines are not
// touched by this pass) appends a raw internal-domain-key fragment to
// every scenario's label, e.g. "...(health_burden-weighted, transit-hub
// candidates)". The intro paragraph above the list already explains this
// in plain language ("...reach the most health-burden-weighted
// population"), so repeating the same idea as a technical-looking
// parenthetical on every card is both redundant and a leaked internal
// term. Strip only that exact known suffix for display; nothing else
// about the label is altered.
const SCENARIO_LABEL_TECHNICAL_SUFFIX = /\s*\(health_burden-weighted, transit-hub candidates\)\s*$/i;
function formatScenarioLabel(label: string): string {
  return label.replace(SCENARIO_LABEL_TECHNICAL_SUFFIX, "");
}

/**
 * Precomputed mobile-clinic siting sensitivity scenarios (DEC-051): this
 * is deliberately NOT an interactive live solver -- every scenario shown
 * here is a disclosed, pre-vetted parameter combination, so a reader
 * always sees exactly what assumptions produced a given result. Never
 * describes coverage as "people served" or a guaranteed outcome.
 */
export function OptimizerScenarios() {
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["access-optimizer-scenarios"],
    queryFn: () => api.getOptimizationScenarios(),
    retry: 1,
  });

  if (query.isLoading) {
    return (
      <LoadingRegion label="Loading mobile-service scenarios">
        <SkeletonText lines={6} />
      </LoadingRegion>
    );
  }
  if (query.isError) {
    return (
      <ErrorState
        title="Scenarios unavailable"
        description={
          query.error instanceof ApiError
            ? query.error.message
            : "Couldn't load mobile-service scenarios. Is the API running?"
        }
      />
    );
  }
  if (!query.data) return null;

  return (
    <div className="space-y-3">
      <p className="text-sm text-[var(--color-text-secondary)]">
        These are <strong className="font-semibold text-[var(--color-text-primary)]">modeled planning scenarios</strong>{" "}
        exploring where a limited number of new mobile-service sites near existing transit stops could reach the
        most health-burden-weighted population -- not a decided plan, a real deployment, or a guarantee of health
        outcomes. Candidate sites are real VTA transit stops; coverage distance is a straight-line screening
        estimate. <DataModeBadge mode={query.data.data_mode} />
      </p>

      <ul className="space-y-3">
        {query.data.scenarios.map((scenario) => (
          <li key={scenario.run_id}>
            <ScenarioCard
              scenario={scenario}
              expanded={expandedRunId === scenario.run_id}
              onToggle={() => setExpandedRunId(expandedRunId === scenario.run_id ? null : scenario.run_id)}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

function ScenarioCard({
  scenario,
  expanded,
  onToggle,
}: {
  scenario: OptimizationScenario;
  expanded: boolean;
  onToggle: () => void;
}) {
  const coveragePct =
    scenario.total_population > 0
      ? Math.round((scenario.population_covered / scenario.total_population) * 100)
      : null;

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
            {formatScenarioLabel(scenario.scenario_label)}
          </h3>
          <p className="mt-0.5 text-xs text-[var(--color-text-secondary)]">
            Up to {scenario.k_sites} sites, within {scenario.distance_threshold_miles} mi
          </p>
        </div>
        <Badge tone={STATUS_TONE[scenario.status] ?? "neutral"}>
          {scenario.status === "INFEASIBLE" ? "No solution satisfies these constraints" : "Solved"}
        </Badge>
      </div>

      {scenario.status !== "INFEASIBLE" ? (
        <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div>
            <dt className="text-xs text-[var(--color-text-secondary)]">Modeled population within reach</dt>
            <dd className="text-base font-semibold text-[var(--color-text-primary)]">
              {Math.round(scenario.population_covered).toLocaleString()}
              {coveragePct !== null && (
                <span className="ml-1 text-xs font-normal text-[var(--color-text-tertiary)]">
                  ({coveragePct}% of county)
                </span>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--color-text-secondary)]">Sites selected</dt>
            <dd className="text-base font-semibold text-[var(--color-text-primary)]">
              {scenario.selected_sites.length}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--color-text-secondary)]">High-need tracts still unreached</dt>
            <dd className="text-base font-semibold text-[var(--color-text-primary)]">
              {scenario.unserved_high_need_tracts.length}
            </dd>
          </div>
        </dl>
      ) : (
        <p className="mt-3 text-sm text-[var(--color-text-secondary)]">
          No combination of sites under these constraints satisfies the requirement -- for example, the equity
          requirement cannot be met with this few sites at this distance threshold. This is a real, informative
          result, not an error.
        </p>
      )}

      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="mt-3 text-sm font-medium text-[var(--color-interactive)] hover:underline"
      >
        {expanded ? "Hide assumptions and limitations" : "Show assumptions and limitations"}
      </button>
      {expanded && (
        <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-[var(--color-text-secondary)]">
          {scenario.assumptions.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      )}
    </Card>
  );
}
