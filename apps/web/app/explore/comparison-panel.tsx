"use client";

import { useId, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button, LoadingRegion, SkeletonText, ErrorState, PercentileBar, ScreeningScore } from "@scc-health/ui";
import { api, ApiError } from "@/lib/api";
import { SearchPanel } from "./search-panel";
import type { SelectedGeography } from "./selection";
import { domainLabel } from "@/lib/labels";

/**
 * Compares two tracts side by side using the same already-computed
 * explainScore data the single-tract view uses -- no client-side score
 * math, only differencing of final numbers (raw diff, percentile diff).
 */
export function ComparisonPanel({
  baseTractGeoid,
  scenarioId,
  onClose,
}: {
  baseTractGeoid: string;
  scenarioId: string;
  onClose: () => void;
}) {
  const [compareSelection, setCompareSelection] = useState<SelectedGeography | null>(null);
  const headingId = useId();

  return (
    <section aria-labelledby={headingId} className="rounded-[var(--radius-lg)] border border-[var(--color-border)] p-4">
      <div className="flex items-center justify-between">
        <h3 id={headingId} className="text-sm font-semibold text-[var(--color-text-primary)]">
          Compare with another place
        </h3>
        <Button variant="ghost" size="sm" onClick={onClose}>
          Close comparison
        </Button>
      </div>

      {!compareSelection || compareSelection.geographyType !== "tract" ? (
        <div className="mt-3">
          <p className="text-xs text-[var(--color-text-secondary)]">
            Comparisons work between two census tracts, since scores are calculated at the tract level. Search for a
            tract to compare against.
          </p>
          <div className="mt-2">
            <SearchPanel
              selected={compareSelection}
              onSelect={(selection) => setCompareSelection(selection)}
            />
          </div>
        </div>
      ) : (
        <ComparisonResult
          tractA={baseTractGeoid}
          tractB={compareSelection.geoid}
          scenarioId={scenarioId}
          onReset={() => setCompareSelection(null)}
        />
      )}
    </section>
  );
}

function ComparisonResult({
  tractA,
  tractB,
  scenarioId,
  onReset,
}: {
  tractA: string;
  tractB: string;
  scenarioId: string;
  onReset: () => void;
}) {
  const queryA = useQuery({
    queryKey: ["explain-score", scenarioId, tractA],
    queryFn: () => api.explainScore(scenarioId, tractA),
    retry: 1,
  });
  const queryB = useQuery({
    queryKey: ["explain-score", scenarioId, tractB],
    queryFn: () => api.explainScore(scenarioId, tractB),
    retry: 1,
  });

  if (queryA.isLoading || queryB.isLoading) {
    return (
      <LoadingRegion label="Loading comparison">
        <SkeletonText lines={5} className="mt-3" />
      </LoadingRegion>
    );
  }
  if (queryA.isError || queryB.isError || !queryA.data || !queryB.data) {
    const error = queryA.error ?? queryB.error;
    return (
      <ErrorState
        title="Couldn't load this comparison"
        description={error instanceof ApiError ? error.message : "Is the API running?"}
      />
    );
  }

  const a = queryA.data;
  const b = queryB.data;
  const scoreDiff = a.score !== null && b.score !== null ? Math.round(a.score - b.score) : null;

  const uncertaintyOverlaps =
    a.monte_carlo && b.monte_carlo && a.monte_carlo.ci_lower !== null && b.monte_carlo.ci_upper !== null
      ? !(a.monte_carlo.ci_lower > b.monte_carlo.ci_upper || b.monte_carlo.ci_lower! > a.monte_carlo.ci_upper!)
      : null;

  return (
    <div className="mt-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-[var(--color-text-secondary)]">
          Comparing tract {tractA} with tract {tractB}
        </p>
        <Button variant="ghost" size="sm" onClick={onReset}>
          Choose a different tract
        </Button>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-4 text-sm">
        <div>
          <p className="font-medium text-[var(--color-text-primary)]">Tract {tractA}</p>
          <ScreeningScore score={a.score} mode="compact" />
        </div>
        <div>
          <p className="font-medium text-[var(--color-text-primary)]">Tract {tractB}</p>
          <ScreeningScore score={b.score} mode="compact" />
        </div>
      </div>

      {scoreDiff !== null && (
        <p className="mt-3 text-sm text-[var(--color-text-primary)]">
          Tract {tractA} scores <strong>{Math.abs(scoreDiff)} points {scoreDiff >= 0 ? "higher" : "lower"}</strong>{" "}
          than tract {tractB} under this scenario.
          {uncertaintyOverlaps !== null && (
            <>
              {" "}
              {uncertaintyOverlaps
                ? "Their likely-range estimates overlap, so this difference may not be reliable."
                : "Their likely-range estimates do not overlap, so this difference is unlikely to be due to uncertainty alone."}
            </>
          )}
        </p>
      )}

      <div className="mt-4 space-y-3">
        <h4 className="text-sm font-semibold text-[var(--color-text-primary)]">Domain-by-domain comparison</h4>
        {a.domains.map((domainA) => {
          const domainB = b.domains.find((d) => d.domain === domainA.domain);
          return (
            <div key={domainA.domain}>
              <p className="text-xs font-medium text-[var(--color-text-primary)]">{domainLabel(domainA.domain)}</p>
              <div className="mt-1 grid grid-cols-2 gap-3">
                <PercentileBar
                  percentile={
                    domainA.domain_score !== null && domainA.domain_score !== undefined ? domainA.domain_score : null
                  }
                  label={`Tract ${tractA} ${domainLabel(domainA.domain)}`}
                />
                <PercentileBar
                  percentile={
                    domainB?.domain_score !== null && domainB?.domain_score !== undefined
                      ? domainB.domain_score
                      : null
                  }
                  label={`Tract ${tractB} ${domainLabel(domainA.domain)}`}
                />
              </div>
            </div>
          );
        })}
      </div>

      <p className="mt-4 text-xs text-[var(--color-text-secondary)]">
        This comparison reflects one scenario's priorities and is county-relative, not a causal or predictive claim.
      </p>
    </div>
  );
}
