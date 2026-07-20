"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Card, DataModeBadge, ErrorState, LoadingRegion, MetricCard, SkeletonText } from "@scc-health/ui";
import { api, ApiError, type FreshnessState } from "@/lib/api";

const AVAILABLE_STATES: FreshnessState[] = ["newest_verified", "intentional_older"];
const NEEDS_ATTENTION_STATES: FreshnessState[] = ["lagged", "stale"];
const UNAVAILABLE_STATES: FreshnessState[] = ["draft", "unavailable"];

/**
 * Plain-language answer to "Can I trust what I'm seeing?" -- three
 * grouped statuses (Available and current / Needs attention /
 * Unavailable) instead of six equal-sized cards, and a group is only
 * shown when it actually has a source in it (docs/design/product-wide-
 * flow-simplification-research.md "VALIDATE": "0 draft sources" doesn't
 * deserve a dominant card if draft sources are never used). The full
 * source-by-source detail (publisher, vintage, license, live table
 * preview) already exists on the Data page; this panel summarizes and
 * links out rather than duplicating that explorer.
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
  const sum = (states: FreshnessState[]) => states.reduce((total, s) => total + counts[s], 0);

  const availableCount = sum(AVAILABLE_STATES);
  const needsAttentionCount = sum(NEEDS_ATTENTION_STATES);
  const unavailableCount = sum(UNAVAILABLE_STATES);
  const unavailableSources = query.data.sources.filter((s) => UNAVAILABLE_STATES.includes(s.freshness_state));

  return (
    <div className="space-y-4">
      <h2 className="text-base font-semibold text-[var(--color-text-primary)]">Can I trust what I&apos;m seeing?</h2>
      <p className="text-sm text-[var(--color-text-secondary)]">
        This platform draws on {query.data.sources.length} published data sources. Most are current and were
        published on their normal schedule; anything overdue for refresh or unavailable is disclosed below,
        not silently missing from the numbers you see elsewhere.
      </p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {availableCount > 0 && (
          <MetricCard label="Available and current" value={availableCount} tone="success" />
        )}
        {needsAttentionCount > 0 && (
          <MetricCard label="Needs attention" value={needsAttentionCount} tone="caution" />
        )}
        {unavailableCount > 0 && <MetricCard label="Unavailable" value={unavailableCount} tone="alert" />}
      </div>

      {unavailableSources.length > 0 && (
        <Card>
          <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">Currently unavailable sources</h3>
          <ul className="mt-2 space-y-1 text-sm text-[var(--color-text-secondary)]">
            {unavailableSources.map((s) => (
              <li key={s.source_id}>
                <span className="font-medium text-[var(--color-text-primary)]">{s.publisher}</span>{" "}
                <code className="text-xs text-[var(--color-text-tertiary)]">{s.source_id}</code>
              </li>
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
