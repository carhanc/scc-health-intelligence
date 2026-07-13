"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { Badge, DataTable, DataModeBadge, ErrorState, LoadingRegion, SkeletonText } from "@scc-health/ui";
import { api, ApiError, type FacilitySummary } from "@/lib/api";
import { categoryLabel } from "@/lib/labels";

const CATEGORIES = ["hospital", "clinic", "food_retailer", "transit_hub"] as const;

/**
 * The accessible, sortable, keyboard-operable alternative to a resource
 * map (docs/01 §5.9, acceptance §13) -- and the primary resource-browsing
 * view this session, since building a full custom facility-marker map
 * layer was out of proportion to the remaining Phase 6 time budget (see
 * TASKS.md's Phase 6 UI note). Every facility shown here carries its
 * real source lineage, deduplication status, and coordinate quality.
 */
export function ResourceBrowser() {
  const [category, setCategory] = useState<string>("hospital");

  const query = useQuery({
    queryKey: ["access-facilities", category],
    queryFn: () => api.getFacilities(category),
    retry: 1,
  });

  const columns = useMemo<ColumnDef<FacilitySummary, unknown>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Name",
        cell: (info) => <span className="font-medium">{info.getValue() as string}</span>,
      },
      {
        accessorKey: "address",
        header: "Address",
        cell: (info) => {
          const row = info.row.original;
          return [row.address, row.city].filter(Boolean).join(", ") || "Not available";
        },
      },
      {
        accessorKey: "is_official",
        header: "Source",
        cell: (info) =>
          (info.getValue() as boolean) ? (
            <Badge tone="interactive">Official source</Badge>
          ) : (
            <Badge tone="neutral">Supplemental source</Badge>
          ),
      },
      {
        accessorKey: "n_contributing_sources",
        header: "Matched across sources",
        cell: (info) => {
          const n = info.getValue() as number;
          return n > 1 ? `${n} sources agree` : "1 source";
        },
      },
      {
        accessorKey: "coordinate_quality",
        header: "Location quality",
        cell: (info) => {
          const value = info.getValue() as string;
          if (value === "valid") return <Badge tone="success">Verified location</Badge>;
          if (value === "missing") return <Badge tone="caution">No coordinates</Badge>;
          return <Badge tone="caution">Location outside expected area</Badge>;
        },
      },
    ],
    [],
  );

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        {CATEGORIES.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setCategory(c)}
            aria-pressed={category === c}
            className="rounded-full border border-[var(--color-border)] px-3 py-1.5 text-sm font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-sunken)] aria-[pressed=true]:border-[var(--color-interactive)] aria-[pressed=true]:bg-[var(--color-interactive-subtle)] aria-[pressed=true]:text-[var(--color-interactive-hover)]"
          >
            {categoryLabel(c)}
            {query.data?.category_counts[c] !== undefined && (
              <span className="ml-1.5 tabular-nums text-[var(--color-text-tertiary)]">
                ({query.data.category_counts[c]})
              </span>
            )}
          </button>
        ))}
      </div>

      <p className="mt-3 text-xs text-[var(--color-text-secondary)]">
        Observed facility locations and published attributes from official sources (HCAI, HRSA, USDA SNAP, VTA
        GTFS) and one County-published supplemental layer, deduplicated across sources. Does not confirm current
        capacity, appointment availability, insurance acceptance, or language access.
      </p>

      <div className="mt-3">
        {query.isLoading && (
          <LoadingRegion label="Loading resources">
            <SkeletonText lines={6} />
          </LoadingRegion>
        )}
        {query.isError && (
          <ErrorState
            title="Resource list unavailable"
            description={
              query.error instanceof ApiError
                ? query.error.message
                : "Couldn't load the resource inventory. Is the API running?"
            }
          />
        )}
        {query.data && (
          <>
            <p className="mb-2 text-xs text-[var(--color-text-secondary)]">
              <DataModeBadge mode={query.data.data_mode} />
            </p>
            <DataTable
              data={query.data.facilities}
              columns={columns}
              caption={`${query.data.facilities.length} ${categoryLabel(category).toLowerCase()} in Santa Clara County, sortable by any column.`}
              getRowId={(row) => row.canonical_resource_id}
              emptyMessage="No facilities found in this category."
            />
          </>
        )}
      </div>
    </div>
  );
}
