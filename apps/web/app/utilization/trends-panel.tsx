"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { Badge, DataModeBadge, DataTable, ErrorState, LoadingRegion, SkeletonText } from "@scc-health/ui";
import { api, ApiError, type CountyTrendPoint } from "@/lib/api";

const BREAKDOWNS = [
  { id: "disposition", label: "Disposition" },
  { id: "race_group", label: "Race group" },
  { id: "sex", label: "Sex" },
  { id: "expected_payer", label: "Expected payer" },
];

/**
 * County-level trends over time (2008-2024): the one HCAI product that
 * IS a genuine, real time series -- native to county of residence
 * (Santa Clara is the only county in this file, since it's already
 * filtered to county residents), never allocated to a smaller
 * geography. Suppressed cells are shown as a labeled gap, never a
 * plotted/interpolated zero.
 */
export function TrendsPanel() {
  const [breakdown, setBreakdown] = useState("disposition");

  const query = useQuery({
    queryKey: ["utilization-county-trends", breakdown],
    queryFn: () => api.getCountyTrends(breakdown),
    retry: 1,
  });

  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--color-text-secondary)]">
        Real, observed Santa Clara County emergency-department encounter counts by year, 2008-2024,
        native to the county as a whole -- not allocated to any smaller geography.
      </p>

      <div className="flex flex-wrap gap-2">
        {BREAKDOWNS.map((b) => (
          <button
            key={b.id}
            type="button"
            onClick={() => setBreakdown(b.id)}
            aria-pressed={breakdown === b.id}
            className={`rounded-full border px-3 py-1 text-sm font-medium ${
              breakdown === b.id
                ? "border-[var(--color-interactive)] bg-[var(--color-interactive-subtle)] text-[var(--color-interactive-hover)]"
                : "border-[var(--color-border)] text-[var(--color-text-secondary)] hover:border-[var(--color-border-strong)]"
            }`}
          >
            {b.label}
          </button>
        ))}
      </div>

      {query.isLoading && (
        <LoadingRegion label="Loading trend data">
          <SkeletonText lines={6} />
        </LoadingRegion>
      )}
      {query.isError && (
        <ErrorState
          title="Trend data unavailable"
          description={query.error instanceof ApiError ? query.error.message : "Couldn't load county ED trends."}
        />
      )}
      {query.data && <TrendsTable points={query.data.points} dataMode={query.data.data_mode} />}
    </div>
  );
}

function TrendsTable({
  points,
  dataMode,
}: {
  points: CountyTrendPoint[];
  dataMode: "live" | "demo";
}) {
  const suppressedCount = points.filter((p) => p.is_suppressed).length;

  const columns: ColumnDef<CountyTrendPoint, unknown>[] = [
    {
      accessorKey: "category_value",
      header: "Category",
      // HCAI's own source CSVs mix "Left Against Medical Advice" (spaces)
      // with "Not_Defined_Elsewhere" (underscores) in the same column --
      // an inconsistency in the published data, not this platform's
      // labeling. Normalizing underscores to spaces for display only
      // (never touches the underlying value) keeps every row readable.
      cell: (info) => (info.getValue() as string).replace(/_/g, " "),
    },
    { accessorKey: "service_year", header: "Year" },
    {
      accessorKey: "encounters",
      header: "Encounters",
      cell: ({ row }) =>
        row.original.is_suppressed ? (
          <Badge tone="neutral" title={row.original.suppression_annotation_desc ?? "Suppressed for privacy"}>
            Suppressed (small count)
          </Badge>
        ) : (
          (row.original.encounters?.toLocaleString() ?? "Not available")
        ),
    },
  ];

  return (
    <div className="space-y-2">
      <p className="text-xs text-[var(--color-text-tertiary)]">
        {points.length} data points. {suppressedCount > 0 && `${suppressedCount} suppressed for small-number privacy (shown as a labeled gap, never zero).`}{" "}
        <DataModeBadge mode={dataMode} />
      </p>
      <DataTable
        data={points}
        columns={columns}
        caption="Santa Clara County emergency-department encounters by year"
        initialSorting={[{ id: "service_year", desc: true }]}
        getRowId={(p) => `${p.category_value}-${p.service_year}`}
      />
    </div>
  );
}
