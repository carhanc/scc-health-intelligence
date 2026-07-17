"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Card, DataModeBadge, ErrorState, LoadingRegion, MetricCard, SkeletonText } from "@scc-health/ui";
import { api, ApiError, type FreshnessState } from "@/lib/api";

/**
 * Plain-language summary of data coverage -- the full source-by-source
 * detail (publisher, vintage, license, live table preview) already
 * exists on the Data page; this panel summarizes and links out rather
 * than duplicating that 300+ line explorer.
 */
export function CoveragePanel() {
  const query = useQuery({
    queryKey: ["validate-coverage"],
    queryFn: () => api.getSources(),
    retry: 1,
  });

  if (query.isLoading) {
    return (
      <LoadingRegion label="Loading data coverage">
        <SkeletonText lines={5} />
      </LoadingRegion>
    );
  }
  if (query.isError) {
    return (
      <ErrorState
        title="Coverage summary unavailable"
        description={query.error instanceof ApiError ? query.error.message : "Couldn't load source status."}
      />
    );
  }
  if (!query.data) return null;

  const counts: Record<FreshnessState, number> = {
    newest_verified: 0,
    intentional_older: 0,
    lagged: 0,
    stale: 0,
    draft: 0,
    unavailable: 0,
  };
  for (const s of query.data.sources) counts[s.freshness_state]++;

  const unavailable = query.data.sources.filter((s) => s.freshness_state === "unavailable");

  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--color-text-secondary)]">
        This platform draws on {query.data.sources.length} published data sources. In plain terms: most sources are
        current and were published on their normal schedule; a source flagged &quot;overdue for refresh&quot; or
        &quot;unavailable&quot; is disclosed here, not silently missing from the numbers you see elsewhere.
      </p>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <MetricCard label="Recently checked" value={counts.newest_verified} tone="success" />
        <MetricCard label="On normal schedule" value={counts.intentional_older} tone="neutral" />
        <MetricCard label="Refresh due soon" value={counts.lagged} tone="caution" />
        <MetricCard label="Overdue for refresh" value={counts.stale} tone="alert" />
        <MetricCard label="Draft (not used)" value={counts.draft} tone="alert" />
        <MetricCard label="Unavailable" value={counts.unavailable} tone="alert" />
      </div>

      {unavailable.length > 0 && (
        <Card>
          <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">Currently unavailable sources</h2>
          <ul className="mt-2 space-y-1 text-sm text-[var(--color-text-secondary)]">
            {unavailable.map((s) => (
              <li key={s.source_id}>{s.publisher} -- {s.source_id}</li>
            ))}
          </ul>
        </Card>
      )}

      <p className="text-sm">
        <Link href="/data" className="font-medium text-[var(--color-interactive)] hover:underline">
          See every source, its publisher, vintage, license, and a live preview of its data on the Data page
        </Link>
        . <DataModeBadge mode={query.data.warehouse_data_mode} />
      </p>
    </div>
  );
}
