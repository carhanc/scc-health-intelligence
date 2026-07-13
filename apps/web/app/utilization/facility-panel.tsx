"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import {
  Badge,
  Card,
  DataModeBadge,
  DataTable,
  ErrorState,
  LoadingRegion,
  SkeletonText,
} from "@scc-health/ui";
import { api, ApiError, type UtilFacilitySummary } from "@/lib/api";
import { dispositionKeyLabel, languageKeyLabel, payerKeyLabel } from "@/lib/labels";

/**
 * Facility view: real, observed HCAI ED-characteristics data for every
 * Santa Clara County facility that reports (9 facilities, 2024) --
 * licensed-bed band, disposition/payer/language breakdowns. All figures
 * here are OBSERVED, not modeled or allocated.
 */
export function FacilityPanel() {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const listQuery = useQuery({
    queryKey: ["utilization-facilities"],
    queryFn: () => api.getUtilizationFacilities(),
    retry: 1,
  });

  if (listQuery.isLoading) {
    return (
      <LoadingRegion label="Loading facilities">
        <SkeletonText lines={6} />
      </LoadingRegion>
    );
  }
  if (listQuery.isError) {
    return (
      <ErrorState
        title="Facilities unavailable"
        description={
          listQuery.error instanceof ApiError
            ? listQuery.error.message
            : "Couldn't load facility data. Is the API running?"
        }
      />
    );
  }
  if (!listQuery.data) return null;

  const columns: ColumnDef<UtilFacilitySummary, unknown>[] = [
    { accessorKey: "facility_name", header: "Facility" },
    { accessorKey: "city", header: "City" },
    {
      accessorKey: "licensed_bed_band",
      header: "Licensed beds (band)",
      cell: (info) => (info.getValue() as string | null) ?? "Not reported",
    },
    {
      accessorKey: "er_service_level",
      header: "ER service level",
      cell: (info) => (info.getValue() as string | null) ?? "Not reported",
    },
    {
      accessorKey: "trauma_center_level",
      header: "Trauma center level",
      cell: (info) => (info.getValue() as string | null) ?? "Not a designated trauma center",
    },
    {
      accessorKey: "total_ed_encounters",
      header: "Total ED encounters (2024)",
      cell: (info) => {
        const v = info.getValue() as number | null;
        return v !== null ? v.toLocaleString() : "Not available";
      },
    },
  ];

  const selected = listQuery.data.facilities.find((f) => f.oshpd_id === selectedId);

  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--color-text-secondary)]">
        Real, observed 2024 emergency-department characteristics reported by each Santa Clara
        County facility to HCAI. Select a row to see its payer mix, disposition pattern, and
        language breakdown. <DataModeBadge mode={listQuery.data.data_mode} />
      </p>
      <p className="text-xs text-[var(--color-text-tertiary)]">
        &quot;Licensed beds&quot; and &quot;total ED encounters&quot; are shown side by side as a
        capacity-versus-demand comparison -- this is not an occupancy rate or an over-capacity
        claim, since no public data reports actual bed-day usage. For each facility&apos;s real
        travel-time catchment and how it overlaps neighboring facilities&apos; service areas, see
        the Access Lab.
      </p>

      <DataTable
        data={listQuery.data.facilities}
        columns={columns}
        caption="Emergency-department characteristics by facility"
        getRowId={(f) => f.oshpd_id}
        selectedRowId={selectedId ?? undefined}
        onRowSelect={(f) => setSelectedId(f.oshpd_id === selectedId ? null : f.oshpd_id)}
        initialSorting={[{ id: "total_ed_encounters", desc: true }]}
      />

      {selected && <FacilityDetail oshpdId={selected.oshpd_id} />}
    </div>
  );
}

function FacilityDetail({ oshpdId }: { oshpdId: string }) {
  const query = useQuery({
    queryKey: ["utilization-facility-detail", oshpdId],
    queryFn: () => api.getUtilizationFacilityDetail(oshpdId),
    retry: 1,
  });

  if (query.isLoading) {
    return (
      <LoadingRegion label="Loading facility detail">
        <SkeletonText lines={5} />
      </LoadingRegion>
    );
  }
  if (query.isError || !query.data) {
    return <ErrorState title="Facility detail unavailable" description="Couldn't load this facility's breakdown." />;
  }

  const { facility, breakdown } = query.data;

  return (
    <Card>
      <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">{facility.facility_name}</h3>
      <p className="mt-0.5 text-xs text-[var(--color-text-secondary)]">
        {facility.city} -- {facility.total_ed_encounters?.toLocaleString() ?? "unknown"} ED encounters in 2024
        (observed, not modeled).
      </p>

      <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <BreakdownList title="Payer mix" entries={breakdown.payer_mix} labelFn={payerKeyLabel} />
        <BreakdownList title="Disposition" entries={breakdown.disposition} labelFn={dispositionKeyLabel} />
        <BreakdownList title="Language" entries={breakdown.language} labelFn={languageKeyLabel} />
      </div>

      <p className="mt-3 text-xs text-[var(--color-text-tertiary)]">
        A blank value means that cell was suppressed in the source for small-number privacy
        protection, not that the true count is zero.
      </p>
    </Card>
  );
}

function BreakdownList({
  title,
  entries,
  labelFn,
}: {
  title: string;
  entries: Record<string, number | null>;
  labelFn: (key: string) => string;
}) {
  const items = Object.entries(entries).sort(([, a], [, b]) => (b ?? -1) - (a ?? -1));
  return (
    <div>
      <h4 className="text-xs font-semibold text-[var(--color-text-primary)]">{title}</h4>
      <ul className="mt-1.5 space-y-1">
        {items.map(([key, value]) => (
          <li key={key} className="flex items-center justify-between text-xs">
            <span className="text-[var(--color-text-secondary)]">{labelFn(key)}</span>
            {value !== null ? (
              <span className="tabular-nums text-[var(--color-text-primary)]">{value.toLocaleString()}</span>
            ) : (
              <Badge tone="neutral">Suppressed</Badge>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
