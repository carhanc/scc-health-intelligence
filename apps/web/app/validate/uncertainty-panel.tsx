"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, DataModeBadge, ErrorState, LoadingRegion, SkeletonText } from "@scc-health/ui";
import { api, ApiError } from "@/lib/api";
import { stabilityLabelDescription } from "@/lib/labels";

export function UncertaintyPanel() {
  const [scenarioId, setScenarioId] = useState("default_integrated_screen_v1");

  const scenariosQuery = useQuery({ queryKey: ["validate-scenario-list"], queryFn: () => api.getScenarios() });
  const uncertaintyQuery = useQuery({
    queryKey: ["validate-uncertainty", scenarioId],
    queryFn: () => api.getUncertaintySummary(scenarioId),
    retry: 1,
  });
  const sensitivityQuery = useQuery({
    queryKey: ["validate-sensitivity", scenarioId],
    queryFn: () => api.getSensitivitySummary(scenarioId),
    retry: 1,
  });

  return (
    <div className="space-y-5">
      <label className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-medium text-[var(--color-text-primary)]">Scenario:</span>
        <select
          value={scenarioId}
          onChange={(e) => setScenarioId(e.target.value)}
          className="rounded-[var(--radius-sm)] border border-[var(--color-border)] px-2 py-1"
        >
          {(scenariosQuery.data?.scenarios ?? []).map((s) => (
            <option key={s.scenario_id} value={s.scenario_id}>
              {s.label}
            </option>
          ))}
        </select>
      </label>

      {uncertaintyQuery.isLoading && (
        <LoadingRegion label="Loading uncertainty summary">
          <SkeletonText lines={5} />
        </LoadingRegion>
      )}
      {uncertaintyQuery.isError && (
        <ErrorState
          title="Uncertainty summary unavailable"
          description={uncertaintyQuery.error instanceof ApiError ? uncertaintyQuery.error.message : "Couldn't load uncertainty data."}
        />
      )}
      {uncertaintyQuery.data && (
        <Card>
          <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">
            Uncertainty -- {uncertaintyQuery.data.scenario_label}
          </h2>
          <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
            {uncertaintyQuery.data.n_tracts_scored} of{" "}
            {uncertaintyQuery.data.n_tracts_scored + uncertaintyQuery.data.n_tracts_data_limited} tracts have a
            combined score under this scenario.
            {uncertaintyQuery.data.n_tracts_data_limited > 0 &&
              ` ${uncertaintyQuery.data.n_tracts_data_limited} are too data-limited to score at all.`}
          </p>
          <dl className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {uncertaintyQuery.data.stability_label_counts.map((c) => (
              <div key={c.stability_label}>
                <dt className="text-xs text-[var(--color-text-secondary)]" title={stabilityLabelDescription(c.stability_label)}>
                  {c.stability_label}
                </dt>
                <dd className="text-lg font-semibold tabular-nums text-[var(--color-text-primary)]">{c.n_tracts} tracts</dd>
              </div>
            ))}
          </dl>
          {uncertaintyQuery.data.median_ci_width !== null && (
            <p className="mt-3 text-xs text-[var(--color-text-tertiary)]">
              Typical (median) Monte Carlo confidence interval width: {uncertaintyQuery.data.median_ci_width.toFixed(1)}{" "}
              points.
            </p>
          )}
          <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">
            {uncertaintyQuery.data.note} <DataModeBadge mode={uncertaintyQuery.data.data_mode} />
          </p>
        </Card>
      )}

      {sensitivityQuery.data && (
        <Card>
          <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">
            Sensitivity to alternate weightings -- {sensitivityQuery.data.scenario_label}
          </h2>
          <ul className="mt-2 space-y-1.5">
            {sensitivityQuery.data.preset_comparisons.map((c) => (
              <li key={c.preset_id} className="flex items-center justify-between text-sm">
                <span className="text-[var(--color-text-secondary)]">{c.preset_label}</span>
                <span className="tabular-nums text-[var(--color-text-primary)]">
                  {c.spearman_rank_correlation_vs_named_scenario !== null
                    ? `r = ${c.spearman_rank_correlation_vs_named_scenario.toFixed(2)}`
                    : "Not computable"}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-[var(--color-text-tertiary)]">{sensitivityQuery.data.note}</p>
          <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">{sensitivityQuery.data.optimizer_sensitivity_note}</p>
        </Card>
      )}
    </div>
  );
}
