"use client";

import { useQuery } from "@tanstack/react-query";
import { Card, DataModeBadge, ErrorState, LoadingRegion, SkeletonText } from "@scc-health/ui";
import { api, ApiError } from "@/lib/api";
import { useTractNames } from "@/lib/use-tract-names";

/**
 * Compares two named scenarios (or one named + a custom weighting) side
 * by side: same 408 tracts, two different priority lenses, so a reader
 * can see what changes and why -- reuses `getScenarioScores`/
 * `computeCustomScore`, never recomputes a score client-side.
 */
export function ComparePanel({
  leftScenarioId,
  rightScenarioId,
  scenarioLabels,
}: {
  leftScenarioId: string;
  rightScenarioId: string;
  scenarioLabels: Record<string, string>;
}) {
  const tractNames = useTractNames();

  const leftQuery = useQuery({
    queryKey: ["prioritize-compare", leftScenarioId],
    queryFn: () => api.getScenarioScores(leftScenarioId, { limit: 408, order: "score_desc" }),
    retry: 1,
  });
  const rightQuery = useQuery({
    queryKey: ["prioritize-compare", rightScenarioId],
    queryFn: () => api.getScenarioScores(rightScenarioId, { limit: 408, order: "score_desc" }),
    retry: 1,
  });

  if (leftQuery.isLoading || rightQuery.isLoading) {
    return (
      <LoadingRegion label="Loading comparison">
        <SkeletonText lines={8} />
      </LoadingRegion>
    );
  }
  const error = leftQuery.error ?? rightQuery.error;
  if (leftQuery.isError || rightQuery.isError) {
    return (
      <ErrorState
        title="Comparison unavailable"
        description={error instanceof ApiError ? error.message : "Couldn't load one or both scenarios."}
      />
    );
  }
  if (!leftQuery.data || !rightQuery.data) return null;

  const leftTop10 = new Set(leftQuery.data.scores.slice(0, 10).map((s) => s.tract_geoid_2020));
  const rightTop10 = new Set(rightQuery.data.scores.slice(0, 10).map((s) => s.tract_geoid_2020));
  const inBoth = [...leftTop10].filter((t) => rightTop10.has(t));
  const onlyLeft = [...leftTop10].filter((t) => !rightTop10.has(t));
  const onlyRight = [...rightTop10].filter((t) => !leftTop10.has(t));

  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--color-text-secondary)]">
        Comparing the top 10 highest-priority tracts under <strong className="font-medium">{scenarioLabels[leftScenarioId] ?? leftScenarioId}</strong> versus{" "}
        <strong className="font-medium">{scenarioLabels[rightScenarioId] ?? rightScenarioId}</strong>.{" "}
        <DataModeBadge mode={leftQuery.data.data_mode} />
      </p>

      <Card>
        <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
          {inBoth.length} of the top 10 places appear under both priorities
        </h3>
        <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
          {inBoth.length >= 7
            ? "This is a robust set of priority places -- the ranking does not depend heavily on which of these two priorities is used."
            : inBoth.length >= 4
              ? "About half the top places carry over -- some priority places are shared, but the choice of scenario meaningfully changes the picture."
              : "Few places carry over -- the choice of scenario substantially changes which places rank highest."}
        </p>
      </Card>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <ComparisonColumn title={`Top 10 in both`} tracts={inBoth} tractNames={tractNames} />
        <ComparisonColumn title={`Only in ${scenarioLabels[leftScenarioId] ?? "the first scenario"}`} tracts={onlyLeft} tractNames={tractNames} />
      </div>
      <ComparisonColumn title={`Only in ${scenarioLabels[rightScenarioId] ?? "the second scenario"}`} tracts={onlyRight} tractNames={tractNames} />
    </div>
  );
}

function ComparisonColumn({
  title,
  tracts,
  tractNames,
}: {
  title: string;
  tracts: string[];
  tractNames: Map<string, string>;
}) {
  return (
    <Card>
      <h4 className="text-sm font-semibold text-[var(--color-text-primary)]">{title}</h4>
      {tracts.length === 0 ? (
        <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">None.</p>
      ) : (
        <ul className="mt-2 space-y-1 text-sm">
          {tracts.map((t) => (
            <li key={t} className="text-[var(--color-text-secondary)]">
              {tractNames.get(t) ?? t}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
