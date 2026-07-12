"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Badge, FreshnessBadge, SkeletonText, StabilityBadge } from "@scc-health/ui";
import { api, ApiError } from "@/lib/api";

const DEFAULT_SCENARIO_ID = "default_integrated_screen_v1";
const HIGH_CONCERN_THRESHOLD = 75;

/** Countywide situation summary, built entirely from already-computed
 * Phase 4 analytics (no scoring/percentile math happens here -- this
 * component only counts and summarizes numbers the API already
 * finalized, per PLAN.md §7 "the frontend never computes a score"). */
export function CountywideSnapshot() {
  const scoresQuery = useQuery({
    queryKey: ["scenario-scores", DEFAULT_SCENARIO_ID, "all"],
    queryFn: () => api.getScenarioScores(DEFAULT_SCENARIO_ID, { limit: 408 }),
    retry: 1,
  });

  if (scoresQuery.isLoading) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="rounded-[var(--radius-lg)] border border-[var(--color-border)] p-4">
            <SkeletonText lines={2} />
          </div>
        ))}
      </div>
    );
  }

  if (scoresQuery.isError) {
    return (
      <p role="alert" className="text-sm text-[var(--color-alert)]">
        {scoresQuery.error instanceof ApiError
          ? `Countywide snapshot unavailable: ${scoresQuery.error.message}`
          : "Countywide snapshot is temporarily unavailable. Is the API running?"}
      </p>
    );
  }

  const scores = scoresQuery.data?.scores ?? [];
  const scored = scores.filter((s) => s.score !== null);
  const highConcernCount = scored.filter((s) => (s.score ?? 0) >= HIGH_CONCERN_THRESHOLD).length;
  const dataLimitedCount = scored.filter((s) => s.stability_label === "Data-limited").length;
  const robustCount = scored.filter((s) => s.stability_label === "Robust").length;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <SnapshotFact
        value={highConcernCount}
        label="tracts in the top quartile for overlapping concern"
        detail="Under the balanced, all-domains scenario. A high score flags a tract for closer review -- it is not a verdict."
      />
      <SnapshotFact
        value={robustCount}
        label="of those rankings are stable across tested assumptions"
        detail="Rank-stability is checked by re-scoring under randomized alternative priority weightings."
      />
      <SnapshotFact
        value={dataLimitedCount}
        label="tracts where data gaps limit confidence"
        detail="Missing or highly uncertain source data reduces confidence without being hidden."
      />
      <p className="col-span-full text-xs text-[var(--color-text-secondary)]">
        Source: Santa Clara Health Intelligence scoring engine, {scored.length} of 408 tracts
        scored under the &ldquo;Default integrated screen&rdquo; scenario.{" "}
        <Link href="/explore" className="text-[var(--color-interactive)] underline underline-offset-2">
          See these tracts on the map →
        </Link>
      </p>
    </div>
  );
}

function SnapshotFact({
  value,
  label,
  detail,
}: {
  value: number;
  label: string;
  detail: string;
}) {
  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <p className="text-3xl font-semibold tabular-nums text-[var(--color-text-primary)]">{value}</p>
      <p className="mt-1 text-sm text-[var(--color-text-secondary)]">{label}</p>
      <p className="mt-2 text-xs text-[var(--color-text-tertiary)]">{detail}</p>
    </div>
  );
}

export function PrioritySnapshot() {
  const recommendationsQuery = useQuery({
    queryKey: ["recommendations", DEFAULT_SCENARIO_ID, 3],
    queryFn: () => api.getRecommendations(DEFAULT_SCENARIO_ID, 3),
    retry: 1,
  });

  if (recommendationsQuery.isLoading) {
    return <SkeletonText lines={4} />;
  }
  if (recommendationsQuery.isError) {
    return (
      <p role="alert" className="text-sm text-[var(--color-alert)]">
        Priority snapshot is temporarily unavailable.
      </p>
    );
  }

  const recs = recommendationsQuery.data?.recommendations ?? [];
  if (recs.length === 0) {
    return (
      <p className="text-sm text-[var(--color-text-secondary)]">
        No scenario scores are available yet. Run the analytics pipeline to populate this view.
      </p>
    );
  }

  return (
    <div>
      <p className="text-sm text-[var(--color-text-secondary)]">
        Under the default, equally-weighted scenario, these tracts currently show the most
        overlapping concern countywide:
      </p>
      <ol className="mt-3 divide-y divide-[var(--color-border)] rounded-[var(--radius-lg)] border border-[var(--color-border)]">
        {recs.map((rec) => (
          <li key={rec.tract_geoid_2020} className="flex items-center justify-between gap-3 px-4 py-3">
            <div>
              <Link
                href={`/explore?geography=tract&id=${rec.tract_geoid_2020}&scenario=${DEFAULT_SCENARIO_ID}`}
                className="font-medium text-[var(--color-interactive)] underline-offset-2 hover:underline"
              >
                Tract {rec.tract_geoid_2020}
              </Link>
              <p className="text-xs text-[var(--color-text-secondary)]">
                Top driver: {rec.supporting_evidence[0]?.label ?? "see full breakdown"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {rec.stability_label && <StabilityBadge label={rec.stability_label} />}
              <Badge tone="neutral">
                {rec.score !== null ? `${Math.round(rec.score)}/100` : "no score"}
              </Badge>
            </div>
          </li>
        ))}
      </ol>
      <p className="mt-3 text-xs text-[var(--color-text-secondary)]">
        This is a county-relative screening ranking under one set of priorities -- not a
        certainty, and not the only possible answer.{" "}
        <Link href="/explore" className="text-[var(--color-interactive)] underline underline-offset-2">
          Explore the full ranking and change priorities →
        </Link>
      </p>
    </div>
  );
}

export function FreshnessSummary() {
  const sourcesQuery = useQuery({
    queryKey: ["sources"],
    queryFn: api.getSources,
    retry: 1,
  });

  if (sourcesQuery.isLoading) {
    return <SkeletonText lines={2} />;
  }
  if (sourcesQuery.isError) {
    return (
      <p role="alert" className="text-sm text-[var(--color-alert)]">
        Data status is temporarily unavailable.
      </p>
    );
  }

  const sources = sourcesQuery.data?.sources ?? [];
  const mode = sourcesQuery.data?.warehouse_data_mode ?? "unavailable";
  const stale = sources.filter((s) => s.freshness_state === "stale" || s.freshness_state === "lagged");
  const unavailable = sources.filter((s) => s.freshness_state === "unavailable");

  return (
    <div className="flex flex-wrap items-center gap-3 text-sm">
      <FreshnessBadge state={mode === "live" ? "newest_verified" : "intentional_older"} />
      <span className="text-[var(--color-text-secondary)]">
        {sources.length} data sources tracked
        {stale.length > 0 && `, ${stale.length} due for refresh`}
        {unavailable.length > 0 && `, ${unavailable.length} currently unavailable`}.
      </span>
      <Link href="/data" className="text-[var(--color-interactive)] underline underline-offset-2">
        View full data status →
      </Link>
    </div>
  );
}
