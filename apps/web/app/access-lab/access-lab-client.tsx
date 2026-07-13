"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import { SegmentedControl, Tabs, TabPanel } from "@scc-health/ui";
import { SearchPanel } from "../explore/search-panel";
import { parseSelectedGeographyFromParams, type SelectedGeography } from "../explore/selection";
import { AccessSummaryPanel } from "./access-summary-panel";
import { ResourceBrowser } from "./resource-browser";
import { GapPanel } from "./gap-panel";
import { OptimizerScenarios } from "./optimizer-scenarios";
import { CityDrillDown } from "./city-drill-down";

type Mode = "walk" | "drive";
type TabId = "summary" | "resources" | "gaps" | "scenarios";

const TAB_ITEMS = [
  { id: "summary", label: "Access summary" },
  { id: "resources", label: "Resource browser" },
  { id: "gaps", label: "Resource gaps" },
  { id: "scenarios", label: "Mobile-service scenarios" },
];

export function AccessLabClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const selected: SelectedGeography | null = parseSelectedGeographyFromParams(
    searchParams.get("geography"),
    searchParams.get("id"),
  );
  const mode: Mode = searchParams.get("mode") === "drive" ? "drive" : "walk";
  const activeTab = (searchParams.get("tab") as TabId | null) ?? "summary";

  const updateParams = useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value === null) params.delete(key);
        else params.set(key, value);
      }
      router.push(`/access-lab?${params.toString()}`);
    },
    [router, searchParams],
  );

  function handleGeographySelect(selection: SelectedGeography) {
    updateParams({ geography: selection.geographyType, id: selection.geoid });
  }

  return (
    <div className="mx-auto max-w-[var(--container-max)] px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
      <div className="max-w-3xl">
        <h1 className="text-2xl font-semibold text-[var(--color-text-primary)] sm:text-3xl">Access Lab</h1>
        <p className="mt-1.5 text-sm text-[var(--color-text-secondary)]">
          See how far a neighborhood is from care, by real walking and driving routes and by scheduled transit, and
          where a mobile clinic might help the most people. Distances and travel times are{" "}
          <strong className="font-semibold text-[var(--color-text-primary)]">modeled estimates</strong>, not
          guarantees -- and mobile-service scenarios describe a possible configuration to explore, not a decided
          plan.
        </p>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-4">
        <SegmentedControl
          label="Travel mode"
          value={mode}
          onChange={(value) => updateParams({ mode: value === "walk" ? null : value })}
          options={[
            { value: "walk", label: "Walking" },
            { value: "drive", label: "Driving" },
          ]}
        />
        <p className="text-xs text-[var(--color-text-secondary)]">
          Scheduled transit access is always shown alongside walking and driving.
        </p>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
        <div className="order-2 lg:order-1">
          <SearchPanel selected={selected} onSelect={handleGeographySelect} />
          {selected && selected.geographyType !== "tract" && (
            <CityDrillDown selected={selected} onSelect={handleGeographySelect} />
          )}
        </div>

        <div className="order-1 lg:order-2">
          <Tabs items={TAB_ITEMS} activeId={activeTab} onChange={(id) => updateParams({ tab: id === "summary" ? null : id })} label="Access Lab sections" />

          <div className="mt-4">
            <TabPanel id="summary" activeId={activeTab}>
              <AccessSummaryPanel
                tractGeoid={selected?.geographyType === "tract" ? selected.geoid : null}
                mode={mode}
              />
            </TabPanel>
            <TabPanel id="resources" activeId={activeTab}>
              <ResourceBrowser />
            </TabPanel>
            <TabPanel id="gaps" activeId={activeTab}>
              <GapPanel mode={mode} selectedTractGeoid={selected?.geographyType === "tract" ? selected.geoid : null} />
            </TabPanel>
            <TabPanel id="scenarios" activeId={activeTab}>
              <OptimizerScenarios />
            </TabPanel>
          </div>
        </div>
      </div>
    </div>
  );
}
