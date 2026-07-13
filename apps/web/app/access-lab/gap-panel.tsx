"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge, Card, DataModeBadge, ErrorState, LoadingRegion, PercentileBar, SkeletonText } from "@scc-health/ui";
import { api, ApiError } from "@/lib/api";
import { categoryLabel, gapClassificationLabel } from "@/lib/labels";

const CLASSIFICATION_TONE: Record<string, "alert" | "caution" | "neutral" | "success"> = {
  priority_gap: "alert",
  need_met: "success",
  low_priority: "neutral",
  well_served: "success",
};

const CATEGORY_OPTIONS = ["hospital", "clinic"] as const;

/**
 * Association/overlap only, never causal (CLAUDE.md's non-negotiable
 * rule): this classification means "this tract's estimated health-burden
 * percentile and measured accessibility percentile both fall in the
 * flagged range," nothing about why, and nothing about what adding a
 * resource would change.
 */
export function GapPanel({
  mode,
  selectedTractGeoid,
}: {
  mode: "walk" | "drive";
  selectedTractGeoid: string | null;
}) {
  const [category, setCategory] = useState<(typeof CATEGORY_OPTIONS)[number]>("clinic");

  const query = useQuery({
    queryKey: ["access-gaps", mode, category],
    queryFn: () => api.getResourceGaps(mode, category),
    retry: 1,
  });

  const counts = useMemo(() => {
    if (!query.data) return null;
    const tally: Record<string, number> = {};
    for (const r of query.data.results) {
      tally[r.classification] = (tally[r.classification] ?? 0) + 1;
    }
    return tally;
  }, [query.data]);

  const selectedResult = query.data?.results.find((r) => r.tract_geoid_2020 === selectedTractGeoid) ?? null;

  return (
    <div className="space-y-4">
      <Card>
        <h2 className="text-base font-semibold text-[var(--color-text-primary)]">
          Where estimated health need and measured access overlap
        </h2>
        <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
          Compares each tract&apos;s health-burden percentile (Phase 4) against its measured resource-access
          percentile ({mode === "walk" ? "walking" : "driving"} access considering both nearby services and local
          demand). This shows where the two overlap -- it does not establish that low access causes worse health
          outcomes, or that adding a resource would improve them.
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-[var(--color-text-primary)]">Resource type</span>
          {CATEGORY_OPTIONS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCategory(c)}
              aria-pressed={category === c}
              className="rounded-full border border-[var(--color-border)] px-3 py-1 text-sm font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-sunken)] aria-[pressed=true]:border-[var(--color-interactive)] aria-[pressed=true]:bg-[var(--color-interactive-subtle)] aria-[pressed=true]:text-[var(--color-interactive-hover)]"
            >
              {categoryLabel(c)}
            </button>
          ))}
        </div>

        {query.isLoading && (
          <LoadingRegion label="Loading resource-gap results">
            <SkeletonText lines={4} />
          </LoadingRegion>
        )}
        {query.isError && (
          <ErrorState
            title="Resource-gap results unavailable"
            description={
              query.error instanceof ApiError
                ? query.error.message
                : "Couldn't load resource-gap results. Is the API running?"
            }
          />
        )}
        {query.data && counts && (
          <div className="mt-4">
            <p className="text-xs text-[var(--color-text-secondary)]">
              <DataModeBadge mode={query.data.data_mode} /> · {query.data.results.length} of 408 tracts
            </p>
            <dl className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {["priority_gap", "need_met", "low_priority", "well_served"].map((label) => (
                <div key={label} className="rounded-[var(--radius-md)] border border-[var(--color-border)] p-2.5">
                  <dt className="text-xs text-[var(--color-text-secondary)]">{gapClassificationLabel(label)}</dt>
                  <dd className="mt-1 text-lg font-semibold text-[var(--color-text-primary)]">
                    {counts[label] ?? 0}
                    <span className="ml-1 text-xs font-normal text-[var(--color-text-tertiary)]">tracts</span>
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        )}
      </Card>

      {selectedTractGeoid && (
        <Card>
          <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">Selected tract</h3>
          {selectedResult ? (
            <div className="mt-2">
              <Badge tone={CLASSIFICATION_TONE[selectedResult.classification] ?? "neutral"}>
                {gapClassificationLabel(selectedResult.classification)}
              </Badge>
              <div className="mt-3 space-y-3">
                <div>
                  <p className="text-xs text-[var(--color-text-secondary)]">
                    Estimated health-burden percentile:{" "}
                    <span className="font-medium text-[var(--color-text-primary)]">
                      {Math.round(selectedResult.need_percentile)}th of 100 countywide
                    </span>
                  </p>
                  <PercentileBar
                    percentile={selectedResult.need_percentile}
                    label="Estimated health-burden percentile"
                  />
                </div>
                <div>
                  <p className="text-xs text-[var(--color-text-secondary)]">
                    Measured {categoryLabel(category).toLowerCase()} access percentile:{" "}
                    <span className="font-medium text-[var(--color-text-primary)]">
                      {Math.round(selectedResult.access_percentile)}th of 100 countywide
                    </span>
                  </p>
                  <PercentileBar
                    percentile={selectedResult.access_percentile}
                    label={`Measured ${categoryLabel(category).toLowerCase()} access percentile`}
                  />
                </div>
              </div>
            </div>
          ) : (
            <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
              This tract is not included in the current resource-gap results (missing a health-burden or access
              score).
            </p>
          )}
        </Card>
      )}
    </div>
  );
}
