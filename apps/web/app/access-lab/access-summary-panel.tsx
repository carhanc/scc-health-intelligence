"use client";

import { useQuery } from "@tanstack/react-query";
import { Badge, Card, DataModeBadge, EmptyState, ErrorState, LoadingRegion, SkeletonText } from "@scc-health/ui";
import { api, ApiError } from "@/lib/api";
import { categoryLabel, methodLabel, serviceLevelLabel } from "@/lib/labels";
import { UseInAdvocateButton } from "../use-in-advocate-button";

function formatDistance(miles: number | null): string {
  if (miles === null) return "Not available";
  return `${miles.toFixed(1)} mi`;
}

function formatDuration(minutes: number | null): string {
  if (minutes === null) return "Not available";
  if (minutes < 60) return `${Math.round(minutes)} min`;
  return `${Math.round((minutes / 60) * 10) / 10} hr`;
}

export function AccessSummaryPanel({
  tractGeoid,
  mode,
}: {
  tractGeoid: string | null;
  mode: "walk" | "drive";
}) {
  const query = useQuery({
    queryKey: ["access-tract-summary", tractGeoid],
    queryFn: () => api.getTractAccessSummary(tractGeoid as string),
    enabled: tractGeoid !== null,
    retry: 1,
  });

  if (!tractGeoid) {
    return (
      <EmptyState
        title="No tract selected yet"
        description="Search for a census tract on the left to see its modeled travel distance to the nearest hospitals, clinics, and transit stop."
      />
    );
  }

  if (query.isLoading) {
    return (
      <LoadingRegion label="Loading access summary">
        <SkeletonText lines={8} />
      </LoadingRegion>
    );
  }

  if (query.isError) {
    return (
      <ErrorState
        title="We couldn't load this tract's access summary"
        description={
          query.error instanceof ApiError
            ? query.error.message
            : "Access Lab data is temporarily unavailable. Is the API running, and has `run_access_metrics_pipeline` been run?"
        }
      />
    );
  }

  if (!query.data) return null;
  const { data } = query;
  const relevantResults = data.network_results.filter((r) => r.mode === mode);

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-[var(--color-text-primary)]">
            Nearest clinical care -- {mode === "walk" ? "walking" : "driving"}
          </h2>
          <DataModeBadge mode={data.data_mode} />
        </div>
        <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
          Modeled from real street-network routing, not a straight-line estimate. Describes this tract&apos;s
          largest-population sub-area (block group {data.representative_block_group_geoid}, population{" "}
          {data.representative_population.toLocaleString()} of {data.n_block_groups_in_tract} sub-areas in this
          tract) -- a real, specific location, not an average.
        </p>
        <dl className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {relevantResults.map((r) => (
            <div key={r.category} className="rounded-[var(--radius-md)] border border-[var(--color-border)] p-3">
              <dt className="text-sm font-medium text-[var(--color-text-primary)]">{categoryLabel(r.category)}</dt>
              {r.status === "routed" ? (
                <dd className="mt-1">
                  <span className="text-lg font-semibold text-[var(--color-text-primary)]">
                    {formatDistance(r.distance_miles)}
                  </span>
                  <span className="ml-2 text-sm text-[var(--color-text-secondary)]">
                    ({formatDuration(r.duration_minutes)})
                  </span>
                  <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">{methodLabel(r.method)}</p>
                </dd>
              ) : (
                <dd className="mt-1">
                  <Badge tone="caution">Not reachable within the modeled search area</Badge>
                  <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">{r.unavailable_reason}</p>
                </dd>
              )}
            </div>
          ))}
        </dl>
      </Card>

      <Card>
        <h2 className="text-base font-semibold text-[var(--color-text-primary)]">Scheduled transit access</h2>
        <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
          Based on the published weekday (Monday) 7am-7pm schedule, not real-time arrivals or a guaranteed
          departure.
        </p>
        {data.transit_result.status === "routed" ? (
          <dl className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <dt className="text-xs text-[var(--color-text-secondary)]">Nearest walkable stop</dt>
              <dd className="text-sm font-medium text-[var(--color-text-primary)]">
                {data.transit_result.nearest_stop_name} ({formatDistance(data.transit_result.walk_distance_miles)}{" "}
                walk)
              </dd>
            </div>
            <div>
              <dt className="text-xs text-[var(--color-text-secondary)]">Scheduled frequency</dt>
              <dd className="text-sm font-medium text-[var(--color-text-primary)]">
                {data.transit_result.service_level && serviceLevelLabel(data.transit_result.service_level)}
                {data.transit_result.headway_minutes !== null && (
                  <span className="text-[var(--color-text-secondary)]">
                    {" "}
                    (about every {Math.round(data.transit_result.headway_minutes)} min)
                  </span>
                )}
              </dd>
            </div>
          </dl>
        ) : (
          <div className="mt-3">
            <Badge tone="caution">No transit stop found within the modeled walking search area</Badge>
          </div>
        )}
      </Card>

      <UseInAdvocateButton
        geography={{ geographyType: "tract", geoid: tractGeoid, displayName: `Tract ${tractGeoid}` }}
      />
    </div>
  );
}
