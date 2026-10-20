"use client";

import { setQuery } from "@/lib/url-state";
import { useSearchParams } from "next/navigation";
import { useCallback } from "react";
import { SegmentedControl, Tabs, TabPanel } from "@scc-health/ui";
import { SearchPanel } from "../explore/search-panel";
import { parseSelectedGeographyFromParams, type SelectedGeography } from "../explore/selection";
import { useTractNames } from "@/lib/use-tract-names";
import { TaskPageHeader } from "../task-page-header";
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

/** "Understand access to care" -- a place-first flow: search only until
 * a community is chosen, then travel mode and the access summary appear
 * together as the result, with the remaining sub-explorations (resource
 * browser, resource gaps, mobile-service scenarios) reachable as
 * secondary tabs below it, not permanently visible before there is
 * anything to show in them (docs/design/product-wide-flow-
 * simplification-research.md "ACCESS LAB"). */
export function AccessLabClient() {
  const searchParams = useSearchParams();

  // parseSelectedGeographyFromParams only ever knows the raw GEOID (a
  // URL round-trip loses whatever real label the search result or city
  // drill-down originally carried) -- a real bug found live: after
  // selecting "Census Tract 5001," the compact context bar and the
  // Advocate handoff both silently fell back to the raw GEOID the
  // instant the URL updated. A `name` param carries the real label
  // through the same navigation, the same pattern already used for
  // Copilot's cross-page arrival.
  const parsedSelected: SelectedGeography | null = parseSelectedGeographyFromParams(
    searchParams.get("geography"),
    searchParams.get("id"),
  );
  const nameParam = searchParams.get("name");
  // A link without a name (a shared URL, the header search) still reads as
  // "Census Tract 5001.00", never the bare 11-digit ID.
  const tractNames = useTractNames();
  const knownName =
    parsedSelected?.geographyType === "tract" ? tractNames.get(parsedSelected.geoid) : undefined;
  const selected: SelectedGeography | null = parsedSelected
    ? { ...parsedSelected, displayName: nameParam ?? knownName ?? parsedSelected.displayName }
    : null;
  const mode: Mode = searchParams.get("mode") === "drive" ? "drive" : "walk";
  const activeTab = (searchParams.get("tab") as TabId | null) ?? "summary";
  const tractGeoid = selected?.geographyType === "tract" ? selected.geoid : null;

  const updateParams = useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value === null) params.delete(key);
        else params.set(key, value);
      }
      setQuery("/access-lab", params);
    },
    [searchParams],
  );

  function handleGeographySelect(selection: SelectedGeography) {
    updateParams({ geography: selection.geographyType, id: selection.geoid, name: selection.displayName });
  }

  return (
    <div className="mx-auto max-w-[var(--container-max)] px-4 py-8 sm:px-6 lg:px-10 lg:py-12">
      <TaskPageHeader
        title="Understand access to care"
        purpose="Choose a community to see modeled travel to healthcare and essential resources."
      />
      <details className="mt-2 max-w-2xl text-xs text-[var(--color-text-secondary)]">
        <summary className="cursor-pointer font-medium text-[var(--color-interactive)]">
          How access is modeled
        </summary>
        <p className="mt-2">
          Distances and travel times come from real walking and driving street-network routing and the
          published weekday transit schedule, not straight-line estimates or real-time arrivals.
          Mobile-service scenarios describe a possible configuration to explore, not a decided plan.
        </p>
      </details>
      <p className="mt-2 max-w-2xl text-xs text-[var(--color-text-tertiary)]">
        Travel times are modeled estimates, not guarantees.
      </p>

      {!selected ? (
        <div className="mt-6 max-w-[520px] space-y-4">
          <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
            Which community would you like to explore?
          </h2>
          <SearchPanel selected={selected} onSelect={handleGeographySelect} showMapHint={false} />
        </div>
      ) : (
        <div className="mt-6 max-w-[880px] space-y-5">
          <p className="flex flex-wrap items-center gap-2 text-sm text-[var(--color-text-secondary)]">
            <span className="font-medium text-[var(--color-text-primary)]">{selected.displayName}</span>
            <button
              type="button"
              onClick={() => updateParams({ geography: null, id: null, name: null, mode: null, tab: null })}
              className="font-medium text-[var(--color-interactive)] hover:underline"
            >
              Change
            </button>
          </p>

          {selected.geographyType !== "tract" ? (
            <CityDrillDown selected={selected} onSelect={handleGeographySelect} />
          ) : (
            <>
              <div>
                <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
                  How are people traveling?
                </h2>
                <div className="mt-3 flex flex-wrap items-center gap-4">
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
                    Scheduled transit access is shown for every mode.
                  </p>
                </div>
              </div>

              {tractGeoid && (
                <AccessSummaryPanel tractGeoid={tractGeoid} displayName={selected.displayName} mode={mode} />
              )}

              <div>
                <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">More about this community</h2>
                <div className="mt-3">
                  <Tabs
                    items={TAB_ITEMS.slice(1)}
                    activeId={activeTab === "summary" ? "resources" : activeTab}
                    onChange={(id) => updateParams({ tab: id })}
                    label="Access Lab secondary sections"
                  />
                  <div className="mt-4">
                    <TabPanel id="resources" activeId={activeTab === "summary" ? "resources" : activeTab}>
                      <ResourceBrowser />
                    </TabPanel>
                    <TabPanel id="gaps" activeId={activeTab}>
                      <GapPanel mode={mode} selectedTractGeoid={tractGeoid} />
                    </TabPanel>
                    <TabPanel id="scenarios" activeId={activeTab}>
                      <OptimizerScenarios />
                    </TabPanel>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
