"use client";

import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { Badge, DataModeBadge, DataTable, ErrorState, LoadingRegion, SkeletonText } from "@scc-health/ui";
import { api, ApiError, type TractUtilization, type ZipObservedEncounters } from "@/lib/api";
import { crosswalkQualityLabel, pattypeGroupLabel, rateReliabilityLabel } from "@/lib/labels";
import { useTractNames } from "@/lib/use-tract-names";
import { UseInAdvocateButton } from "../use-in-advocate-button";

/**
 * Geographic view: two DISTINCT, never-merged tables -- real observed
 * ZIP-level counts (native HCAI geography), and a modeled tract-level
 * allocation clearly labeled with its method and a reliability flag.
 * "Access vs. utilization" and "high-use" flags live here too since they
 * are both computed at the tract level from the same modeled table.
 */
export function GeographicPanel() {
  return (
    <div className="space-y-8">
      <TractSection />
      <ZipSection />
    </div>
  );
}

function TractSection() {
  const tractNames = useTractNames();
  const query = useQuery({
    queryKey: ["utilization-tracts"],
    queryFn: () => api.getTractUtilizationList({ order: "rate_desc", limit: 408 }),
    retry: 1,
  });

  if (query.isLoading) {
    return (
      <LoadingRegion label="Loading tract-level modeled utilization">
        <SkeletonText lines={6} />
      </LoadingRegion>
    );
  }
  if (query.isError) {
    return (
      <ErrorState
        title="Tract-level data unavailable"
        description={query.error instanceof ApiError ? query.error.message : "Couldn't load tract-level utilization."}
      />
    );
  }
  if (!query.data) return null;

  const withRate = query.data.tracts.filter((t) => t.modeled_ed_rate_per_1000 !== null);
  const reliable = withRate.filter((t) => t.rate_reliability === "plausible_range");
  const lowReliability = withRate.filter((t) => t.rate_reliability === "low_reliability");

  // A simple, disclosed 90th-percentile threshold among the reliable
  // (plausible_range) tracts only -- a low-reliability tract's inflated
  // rate must never inflate this threshold or be flagged "high-use" off
  // an estimate we've already said not to trust.
  const sortedReliableRates = reliable
    .map((t) => t.modeled_ed_rate_per_1000 as number)
    .sort((a, b) => a - b);
  const highUseThreshold: number | null =
    sortedReliableRates.length > 0
      ? (sortedReliableRates[Math.floor(sortedReliableRates.length * 0.9)] ?? null)
      : null;

  const columns: ColumnDef<TractUtilization, unknown>[] = [
    {
      id: "tract",
      header: "Tract",
      accessorFn: (t) => t.tract_geoid_2020,
      cell: ({ row }) => tractNames.get(row.original.tract_geoid_2020) ?? row.original.tract_geoid_2020,
    },
    {
      accessorKey: "modeled_ed_rate_per_1000",
      header: "Modeled ED visits per 1,000 residents",
      cell: (info) => {
        const v = info.getValue() as number | null;
        return v !== null ? v.toFixed(0) : "Not available";
      },
    },
    {
      accessorKey: "e2sfca_hospital_drive_access_score",
      header: "Hospital access score (drive)",
      cell: (info) => {
        const v = info.getValue() as number | null;
        return v !== null ? v.toFixed(3) : "Not available";
      },
    },
    {
      accessorKey: "rate_reliability",
      header: "Estimate reliability",
      cell: (info) => {
        const v = info.getValue() as string | null;
        if (!v) return "Not available";
        return (
          <Badge tone={v === "low_reliability" ? "alert" : "success"} title={rateReliabilityLabel(v)}>
            {rateReliabilityLabel(v)}
          </Badge>
        );
      },
    },
    {
      accessorKey: "crosswalk_quality",
      header: "Allocation confidence",
      cell: (info) => {
        const v = info.getValue() as string | null;
        return v ? crosswalkQualityLabel(v) : "Not available";
      },
    },
    {
      id: "high_use",
      header: "High modeled use",
      accessorFn: (t) =>
        highUseThreshold !== null &&
        t.rate_reliability === "plausible_range" &&
        (t.modeled_ed_rate_per_1000 ?? 0) >= highUseThreshold
          ? 1
          : 0,
      cell: ({ row }) =>
        highUseThreshold !== null &&
        row.original.rate_reliability === "plausible_range" &&
        (row.original.modeled_ed_rate_per_1000 ?? 0) >= highUseThreshold ? (
          <Badge tone="caution" title={`At or above the 90th percentile among reliable estimates (${highUseThreshold.toFixed(0)} per 1,000)`}>
            Top 10% modeled use
          </Badge>
        ) : (
          ""
        ),
    },
    {
      id: "advocate",
      header: "Advocate",
      cell: ({ row }) => (
        <UseInAdvocateButton
          geography={{
            geographyType: "tract",
            geoid: row.original.tract_geoid_2020,
            displayName: tractNames.get(row.original.tract_geoid_2020) ?? row.original.tract_geoid_2020,
          }}
          label="Use"
        />
      ),
    },
  ];

  return (
    <section>
      <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">Geographic view -- modeled by tract</h2>
      <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
        HCAI only publishes emergency-department patient-origin data by ZIP code, never by census
        tract. This table shows a <strong className="font-semibold text-[var(--color-text-primary)]">modeled allocation</strong>{" "}
        down to the tract level, built by spreading each ZIP&apos;s real observed encounter count
        across its overlapping tracts by land area -- an approximation, not a directly observed
        count. {reliable.length} of {withRate.length} tracts have a plausible estimate;{" "}
        {lowReliability.length} have a flagged, unreliable estimate because area-based allocation
        breaks down for a few large, sparsely-populated tracts. <DataModeBadge mode={query.data.data_mode} />
      </p>

      <div className="mt-3">
        <DataTable
          data={query.data.tracts}
          columns={columns}
          caption="Modeled emergency-department utilization and hospital access by tract"
          initialSorting={[{ id: "modeled_ed_rate_per_1000", desc: true }]}
          getRowId={(t) => t.tract_geoid_2020}
        />
      </div>
    </section>
  );
}

function ZipSection() {
  const query = useQuery({
    queryKey: ["utilization-zips"],
    queryFn: () => api.getZipObserved(),
    retry: 1,
  });

  if (query.isLoading) {
    return (
      <LoadingRegion label="Loading ZIP-level observed data">
        <SkeletonText lines={6} />
      </LoadingRegion>
    );
  }
  if (query.isError) {
    return (
      <ErrorState
        title="ZIP-level data unavailable"
        description={query.error instanceof ApiError ? query.error.message : "Couldn't load ZIP-level utilization."}
      />
    );
  }
  if (!query.data) return null;

  const columns: ColumnDef<ZipObservedEncounters, unknown>[] = [
    { accessorKey: "patient_zip", header: "Patient ZIP code" },
    {
      accessorKey: "pattype_group",
      header: "Encounter type",
      cell: (info) => pattypeGroupLabel(info.getValue() as string),
    },
    {
      accessorKey: "encounters",
      header: "Encounters (2024)",
      cell: (info) => (info.getValue() as number).toLocaleString(),
    },
  ];

  return (
    <section>
      <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
        Geographic view -- observed by patient ZIP code
      </h2>
      <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
        {query.data.total_observed_encounters.toLocaleString()} real, observed 2024 emergency-department
        encounters among Santa Clara County residents, by the patient&apos;s own ZIP code -- HCAI&apos;s
        actual published geography, before any allocation to tracts.{" "}
        <DataModeBadge mode={query.data.data_mode} />
      </p>

      <div className="mt-3">
        <DataTable
          data={query.data.zips}
          columns={columns}
          caption="Observed emergency-department encounters by patient ZIP code"
          initialSorting={[{ id: "encounters", desc: true }]}
          getRowId={(z) => `${z.patient_zip}-${z.pattype_group}`}
        />
      </div>
    </section>
  );
}
