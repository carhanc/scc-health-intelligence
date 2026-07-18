"use client";

import { useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Tabs, TabPanel } from "@scc-health/ui";
import { api } from "@/lib/api";
import { ScenarioSelector, CUSTOM_SCENARIO_ID } from "./scenario-selector";
import { DEFAULT_WEIGHTS, WeightSliders, normalizeWeights } from "./weight-sliders";
import { ResultsPanel } from "./results-panel";
import { ConstraintsPanel } from "./constraints-panel";
import { ComparePanel } from "./compare-panel";
import { ExportPanel } from "./export-panel";

type TabId = "results" | "constraints" | "compare" | "export";

const TAB_ITEMS = [
  { id: "results", label: "Ranked results" },
  { id: "constraints", label: "Site & program constraints" },
  { id: "compare", label: "Compare" },
  { id: "export", label: "Export" },
];

function parseWeightsParam(raw: string | null): Record<string, number> | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object") return parsed as Record<string, number>;
  } catch {
    // fall through
  }
  return null;
}

export function PrioritizeClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const scenarioId = searchParams.get("scenario") ?? "default_integrated_screen_v1";
  const isCustom = scenarioId === CUSTOM_SCENARIO_ID;
  const customWeights = parseWeightsParam(searchParams.get("weights")) ?? DEFAULT_WEIGHTS;
  const activeTab = (searchParams.get("tab") as TabId | null) ?? "results";
  const compareScenarioId = searchParams.get("compareScenario") ?? "";

  const updateParams = useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value === null) params.delete(key);
        else params.set(key, value);
      }
      router.push(`/prioritize?${params.toString()}`);
    },
    [router, searchParams],
  );

  const scenariosQuery = useQuery({
    queryKey: ["prioritize-scenario-labels"],
    queryFn: () => api.getScenarios(),
  });
  const scenarioLabels = Object.fromEntries(
    (scenariosQuery.data?.scenarios ?? []).map((s) => [s.scenario_id, s.label]),
  );

  const scenarioSelection = isCustom
    ? ({ kind: "custom" as const, weights: normalizeWeights(customWeights) })
    : ({ kind: "named" as const, scenarioId });

  return (
    <div className="mx-auto max-w-[var(--container-max)] px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
      <div className="max-w-3xl">
        <h1 className="text-2xl font-semibold text-[var(--color-text-primary)] sm:text-3xl">
          Identify health-equity priorities
        </h1>
        <p className="mt-1.5 text-sm text-[var(--color-text-secondary)]">
          A ranked screening tool, not a prediction or a guarantee that any specific intervention would help.
        </p>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
        <div className="order-2 space-y-5 lg:order-1">
          <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">
            Adjust what the screening emphasizes
          </h2>
          <ScenarioSelector
            selectedScenarioId={scenarioId}
            onSelect={(id) => updateParams({ scenario: id === "default_integrated_screen_v1" ? null : id, weights: null })}
          />
          {isCustom && (
            <WeightSliders
              weights={customWeights}
              onChange={(w) => updateParams({ weights: JSON.stringify(w) })}
            />
          )}
        </div>

        <div className="order-1 lg:order-2">
          <Tabs
            items={TAB_ITEMS}
            activeId={activeTab}
            onChange={(id) => updateParams({ tab: id === "results" ? null : id })}
            label="Prioritize sections"
          />

          <div className="mt-4">
            <TabPanel id="results" activeId={activeTab}>
              <ResultsPanel scenarioSelection={scenarioSelection} />
            </TabPanel>
            <TabPanel id="constraints" activeId={activeTab}>
              <ConstraintsPanel />
            </TabPanel>
            <TabPanel id="compare" activeId={activeTab}>
              <ComparePanelWrapper
                leftScenarioId={isCustom ? "default_integrated_screen_v1" : scenarioId}
                compareScenarioId={compareScenarioId}
                scenarioLabels={scenarioLabels}
                onSelectCompare={(id) => updateParams({ compareScenario: id || null })}
              />
            </TabPanel>
            <TabPanel id="export" activeId={activeTab}>
              <ExportPanel scenarioSelection={scenarioSelection} />
            </TabPanel>
          </div>
        </div>
      </div>
    </div>
  );
}

function ComparePanelWrapper({
  leftScenarioId,
  compareScenarioId,
  scenarioLabels,
  onSelectCompare,
}: {
  leftScenarioId: string;
  compareScenarioId: string;
  scenarioLabels: Record<string, string>;
  onSelectCompare: (id: string) => void;
}) {
  const options = Object.entries(scenarioLabels).filter(([id]) => id !== leftScenarioId);

  return (
    <div className="space-y-4">
      <label className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-medium text-[var(--color-text-primary)]">Compare against:</span>
        <select
          value={compareScenarioId}
          onChange={(e) => onSelectCompare(e.target.value)}
          className="rounded-[var(--radius-sm)] border border-[var(--color-border)] px-2 py-1"
        >
          <option value="">Choose a scenario to compare</option>
          {options.map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>
      </label>
      {compareScenarioId ? (
        <ComparePanel
          leftScenarioId={leftScenarioId}
          rightScenarioId={compareScenarioId}
          scenarioLabels={scenarioLabels}
        />
      ) : (
        <p className="text-sm text-[var(--color-text-secondary)]">
          Pick a second scenario above to see how the top priority places change.
        </p>
      )}
    </div>
  );
}
