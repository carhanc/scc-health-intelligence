"use client";

import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { SegmentedControl, SkeletonText } from "@scc-health/ui";
import { api } from "@/lib/api";
import { SearchPanel } from "./search-panel";
import { ExploreTable } from "./explore-table";
import { GeographyDetail } from "./geography-detail";
import { ComparisonPanel } from "./comparison-panel";
import { parseSelectedGeographyFromParams, type SelectedGeography } from "./selection";

const ExploreMap = dynamic(() => import("./explore-map").then((m) => m.ExploreMap), {
  ssr: false,
  loading: () => <SkeletonText lines={6} className="h-[480px]" />,
});

const DEFAULT_SCENARIO_ID = "default_integrated_screen_v1";

export function ExploreClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Only a well-formed, in-county canonical GEOID is ever treated as a
  // real selection -- this is what stops a malformed or hand-edited URL
  // from reaching the profile API (Phase 5 hotfix: see selection.ts).
  const selected: SelectedGeography | null = parseSelectedGeographyFromParams(
    searchParams.get("geography"),
    searchParams.get("id"),
  );
  const scenarioId = searchParams.get("scenario") ?? DEFAULT_SCENARIO_ID;
  const view = (searchParams.get("tab") as "map" | "table" | null) ?? "map";
  const comparing = searchParams.get("compare") === "1";

  const scenariosQuery = useQuery({
    queryKey: ["scenarios"],
    queryFn: api.getScenarios,
    retry: 1,
    staleTime: 10 * 60 * 1000,
  });

  const updateParams = useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value === null) params.delete(key);
        else params.set(key, value);
      }
      router.push(`/explore?${params.toString()}`);
    },
    [router, searchParams],
  );

  // The one canonical selection entry point -- map, table, and search all
  // call this with the same SelectedGeography shape, so they can never
  // again disagree about what a "selection" is (Phase 5 hotfix).
  function handleGeographySelect(selection: SelectedGeography) {
    updateParams({ geography: selection.geographyType, id: selection.geoid, compare: null });
  }

  function handleClearSelection() {
    updateParams({ geography: null, id: null, compare: null });
  }

  return (
    <div className="mx-auto max-w-[var(--container-max)] px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
      <div className="max-w-3xl">
        <h1 className="text-2xl font-semibold text-[var(--color-text-primary)] sm:text-3xl">Explore</h1>
        <p className="mt-1.5 text-sm text-[var(--color-text-secondary)]">
          Find a city, district, or census tract, see its health, access, and resource picture, and understand why
          it ranks the way it does.
        </p>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-sm">
          <span className="font-medium text-[var(--color-text-primary)]">Priorities</span>
          <select
            value={scenarioId}
            onChange={(e) => updateParams({ scenario: e.target.value })}
            className="rounded-[var(--radius-md)] border border-[var(--color-border)] px-2.5 py-1.5 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-focus-ring)]"
          >
            {scenariosQuery.data?.scenarios.map((s) => (
              <option key={s.scenario_id} value={s.scenario_id}>
                {s.label}
              </option>
            ))}
            {!scenariosQuery.data && <option value={scenarioId}>Default integrated screen</option>}
          </select>
        </label>
        {scenariosQuery.data && (
          <p className="text-xs text-[var(--color-text-secondary)]">
            {scenariosQuery.data.scenarios.find((s) => s.scenario_id === scenarioId)?.description}
          </p>
        )}
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <SegmentedControl
          label="View"
          value={view}
          onChange={(value) => updateParams({ tab: value === "map" ? null : value })}
          options={[
            { value: "map", label: "Map" },
            { value: "table", label: "Table" },
          ]}
        />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-[320px_minmax(0,1fr)_380px]">
        <div className="order-2 lg:order-1">
          <SearchPanel selected={selected} onSelect={handleGeographySelect} />
        </div>

        <div className="order-1 lg:order-2">
          {view === "map" ? (
            <ExploreMap scenarioId={scenarioId} selected={selected} onSelect={handleGeographySelect} />
          ) : (
            <ExploreTable
              scenarioId={scenarioId}
              selectedTractId={selected?.geographyType === "tract" ? selected.geoid : null}
              onSelectTract={handleGeographySelect}
            />
          )}
        </div>

        <div className="order-3">
          <GeographyDetail
            selected={selected}
            scenarioId={scenarioId}
            onCompare={() => updateParams({ compare: "1" })}
            onClearSelection={handleClearSelection}
          />
          {comparing && selected?.geographyType === "tract" && (
            <div className="mt-4">
              <ComparisonPanel
                baseTractGeoid={selected.geoid}
                scenarioId={scenarioId}
                onClose={() => updateParams({ compare: null })}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
