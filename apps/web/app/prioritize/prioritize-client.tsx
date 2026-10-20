"use client";

import { useCallback, useEffect, useState } from "react";
import { setQuery } from "@/lib/url-state";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Tabs, TabPanel } from "@scc-health/ui";
import { api } from "@/lib/api";
import { CUSTOM_SCENARIO_ID } from "./scenario-selector";
import { DEFAULT_WEIGHTS, normalizeWeights } from "./weight-sliders";
import { LensPicker } from "../map-home/lens-picker";
import { TaskPageHeader } from "../task-page-header";
import { ResultsPanel } from "./results-panel";
import { ConstraintsPanel } from "./constraints-panel";
import { ComparePanel } from "./compare-panel";
import { ExportPanel } from "./export-panel";

type TabId = "results" | "compare";

const TAB_ITEMS = [
  { id: "results", label: "Ranked areas" },
  { id: "compare", label: "Compare places" },
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
  const searchParams = useSearchParams();
  const [showConstraints, setShowConstraints] = useState(false);
  const [showDownload, setShowDownload] = useState(false);

  const scenarioId = searchParams.get("scenario") ?? "default_integrated_screen_v1";
  const isCustom = scenarioId === CUSTOM_SCENARIO_ID;
  const urlWeights = parseWeightsParam(searchParams.get("weights"));
  const [customRaw, setCustomRaw] = useState<Record<string, number>>(urlWeights ?? DEFAULT_WEIGHTS);
  const customWeights = urlWeights ?? DEFAULT_WEIGHTS;
  const activeTab = (searchParams.get("tab") as TabId | null) ?? "results";
  const compareScenarioId = searchParams.get("compareScenario") ?? "";

  const updateParams = useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value === null) params.delete(key);
        else params.set(key, value);
      }
      setQuery("/prioritize", params);
    },
    [searchParams],
  );

  // Sliders feel instant; the URL (and the ranking request) follows a moment later.
  useEffect(() => {
    if (!isCustom) return;
    const t = setTimeout(() => {
      const next = JSON.stringify(customRaw);
      if (next !== searchParams.get("weights")) {
        const params = new URLSearchParams(searchParams.toString());
        params.set("weights", next);
        setQuery("/prioritize", params, "replace");
      }
    }, 450);
    return () => clearTimeout(t);
  }, [customRaw, isCustom]);

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
    <div className="mx-auto max-w-[var(--container-max)] px-4 py-8 sm:px-6 lg:px-10 lg:py-12">
      <TaskPageHeader
        title="Find areas for closer review"
        purpose="See which census tracts show the highest overlapping screening concern under the selected view. This is a screening tool, not a prediction or a guarantee that any specific intervention would help."
      />

      <div className="mt-6 max-w-2xl rounded-[var(--radius-lg)] bg-[var(--color-surface)] p-5">
        <LensPicker
          scenarioId={scenarioId}
          onSelectNamed={(id) => updateParams({ scenario: id === "default_integrated_screen_v1" ? null : id, weights: null })}
          onSelectCustom={() => updateParams({ scenario: CUSTOM_SCENARIO_ID, weights: JSON.stringify(customRaw) })}
          customWeights={customRaw}
          onCustomChange={setCustomRaw}
        />
      </div>

      <div className="mt-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Tabs
            items={TAB_ITEMS}
            activeId={activeTab}
            onChange={(id) => updateParams({ tab: id === "results" ? null : id })}
            label="Prioritize sections"
          />
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            <button
              type="button"
              onClick={() => setShowConstraints((v) => !v)}
              aria-expanded={showConstraints}
              className="font-medium text-[var(--color-interactive)] hover:underline"
            >
              Add practical constraints
            </button>
            <button
              type="button"
              onClick={() => setShowDownload((v) => !v)}
              aria-expanded={showDownload}
              className="font-medium text-[var(--color-interactive)] hover:underline"
            >
              Download results
            </button>
          </div>
        </div>

        {showConstraints && (
          <div className="mt-4">
            <ConstraintsPanel />
          </div>
        )}
        {showDownload && (
          <div className="mt-4">
            <ExportPanel scenarioSelection={scenarioSelection} />
          </div>
        )}

        <div className="mt-4">
          <TabPanel id="results" activeId={activeTab}>
            <ResultsPanel scenarioSelection={scenarioSelection} />
          </TabPanel>
          <TabPanel id="compare" activeId={activeTab}>
            <ComparePanelWrapper
              leftScenarioId={isCustom ? "default_integrated_screen_v1" : scenarioId}
              compareScenarioId={compareScenarioId}
              scenarioLabels={scenarioLabels}
              onSelectCompare={(id) => updateParams({ compareScenario: id || null })}
            />
          </TabPanel>
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
          <option value="">Choose a focus area to compare</option>
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
          Pick a second focus area above to see how the top priority places change.
        </p>
      )}
    </div>
  );
}
