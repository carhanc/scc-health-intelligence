"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable, StabilityBadge, LoadingRegion, SkeletonText, ErrorState } from "@scc-health/ui";
import { api, ApiError, type TractScenarioScore } from "@/lib/api";
import { isValidGeographyId, type SelectedGeography } from "./selection";

/**
 * Everything shown on the map is also available here, sortable and fully
 * keyboard-operable -- the required accessible alternative to the map
 * (docs/01 §5.9, acceptance §13). Same data source as the map (the same
 * scenario-scores query), so the two views never disagree.
 */
export function ExploreTable({
  scenarioId,
  selectedTractId,
  onSelectTract,
}: {
  scenarioId: string;
  selectedTractId: string | null;
  onSelectTract: (selection: SelectedGeography) => void;
}) {
  const scoresQuery = useQuery({
    queryKey: ["scenario-scores", scenarioId, "table"],
    queryFn: () => api.getScenarioScores(scenarioId, { limit: 408 }),
    retry: 1,
  });

  const columns = useMemo<ColumnDef<TractScenarioScore, unknown>[]>(
    () => [
      {
        accessorKey: "tract_geoid_2020",
        header: "Tract GEOID",
        cell: (info) => <span className="tabular-nums">{info.getValue() as string}</span>,
      },
      {
        accessorKey: "score",
        header: "Score (0-100)",
        cell: (info) => {
          const value = info.getValue() as number | null;
          return value !== null ? Math.round(value) : "No score";
        },
      },
      {
        accessorKey: "coverage_fraction",
        header: "Data coverage",
        cell: (info) => `${Math.round((info.getValue() as number) * 100)}%`,
      },
      {
        accessorKey: "stability_label",
        header: "Rank stability",
        cell: (info) => {
          const label = info.getValue() as TractScenarioScore["stability_label"];
          return label ? <StabilityBadge label={label} /> : "Not available";
        },
      },
      {
        accessorKey: "probability_top_decile",
        header: "Chance in top 10% countywide",
        cell: (info) => {
          const value = info.getValue() as number | null;
          return value !== null ? `${Math.round(value * 100)}%` : "Not available";
        },
      },
    ],
    [],
  );

  if (scoresQuery.isLoading) {
    return (
      <LoadingRegion label="Loading tract table">
        <SkeletonText lines={6} />
      </LoadingRegion>
    );
  }
  if (scoresQuery.isError) {
    return (
      <ErrorState
        title="Table unavailable"
        description={
          scoresQuery.error instanceof ApiError
            ? scoresQuery.error.message
            : "Couldn't load scenario scores. Is the API running?"
        }
      />
    );
  }

  const rows = scoresQuery.data?.scores ?? [];

  return (
    <DataTable
      data={rows}
      columns={columns}
      caption={`All ${rows.length} Santa Clara County census tracts, scored under the current scenario, sortable by any column.`}
      initialSorting={[{ id: "score", desc: true }]}
      getRowId={(row) => row.tract_geoid_2020}
      selectedRowId={selectedTractId ?? undefined}
      onRowSelect={(row) => {
        if (!isValidGeographyId("tract", row.tract_geoid_2020)) return;
        onSelectTract({
          geographyType: "tract",
          geoid: row.tract_geoid_2020,
          displayName: `Tract ${row.tract_geoid_2020}`,
          source: "table",
        });
      }}
      emptyMessage="No scored tracts are available for this scenario yet."
    />
  );
}
