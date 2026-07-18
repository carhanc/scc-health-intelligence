"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import {
  Badge,
  StabilityBadge,
  DataModeBadge,
  DataTable,
  ErrorState,
  LoadingRegion,
  SkeletonText,
  EmptyState,
  Button,
  ScreeningScore,
  SCREENING_SCORE_LABEL,
} from "@scc-health/ui";
import { api, ApiError, type CustomDomainContribution, type StabilityLabel } from "@/lib/api";
import { domainLabel } from "@/lib/labels";
import { useTractNames } from "@/lib/use-tract-names";
import { UseInAdvocateButton } from "../use-in-advocate-button";

// The full ranked list is always 408 rows -- rendering all of them into
// the DOM by default (with no pagination or filter) is a real density
// problem verified live during the health-equity UX redesign (docs/
// design/health-equity-ux-redesign.md §3/§8). The API already returns
// rows sorted by score (desc, nulls last), so the top N by rank is a
// safe head-slice, not a re-sort -- full data remains one click and the
// existing sort/export controls away.
const DEFAULT_VISIBLE_COUNT = 25;

export interface RankedRow {
  tract_geoid_2020: string;
  score: number | null;
  coverage_fraction: number;
  domains_missing: string[];
  stability_label: StabilityLabel | null;
  domain_contributions: CustomDomainContribution[];
}

/** Ranked-geographies results table, shared by both a named scenario
 * (which carries real stability labels) and a custom weighting (which
 * does not -- has_uncertainty_data is always surfaced honestly rather
 * than omitted). */
export function ResultsPanel({
  scenarioSelection,
}: {
  scenarioSelection: { kind: "named"; scenarioId: string } | { kind: "custom"; weights: Record<string, number> };
}) {
  const [expandedTract, setExpandedTract] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const tractNames = useTractNames();

  const namedQuery = useQuery({
    queryKey: ["prioritize-named-scores", scenarioSelection.kind === "named" ? scenarioSelection.scenarioId : null],
    queryFn: () =>
      scenarioSelection.kind === "named"
        ? api.getScenarioScores(scenarioSelection.scenarioId, { limit: 408, order: "score_desc" })
        : Promise.reject(new Error("not a named scenario")),
    enabled: scenarioSelection.kind === "named",
    retry: 1,
  });

  const customQuery = useQuery({
    queryKey: ["prioritize-custom-scores", scenarioSelection.kind === "custom" ? scenarioSelection.weights : null],
    queryFn: () =>
      scenarioSelection.kind === "custom"
        ? api.computeCustomScore(scenarioSelection.weights)
        : Promise.reject(new Error("not a custom weighting")),
    enabled: scenarioSelection.kind === "custom",
    retry: 1,
  });

  const isLoading = scenarioSelection.kind === "named" ? namedQuery.isLoading : customQuery.isLoading;
  const isError = scenarioSelection.kind === "named" ? namedQuery.isError : customQuery.isError;
  const error = scenarioSelection.kind === "named" ? namedQuery.error : customQuery.error;

  const rows: RankedRow[] = useMemo(() => {
    if (scenarioSelection.kind === "named" && namedQuery.data) {
      return namedQuery.data.scores.map((s) => ({
        tract_geoid_2020: s.tract_geoid_2020,
        score: s.score,
        coverage_fraction: s.coverage_fraction,
        domains_missing: s.domains_missing,
        stability_label: s.stability_label,
        domain_contributions: [],
      }));
    }
    if (scenarioSelection.kind === "custom" && customQuery.data) {
      return customQuery.data.tracts.map((t) => ({
        tract_geoid_2020: t.tract_geoid_2020,
        score: t.score,
        coverage_fraction: t.coverage_fraction,
        domains_missing: t.domains_missing,
        stability_label: null,
        domain_contributions: t.domain_contributions,
      }));
    }
    return [];
  }, [scenarioSelection, namedQuery.data, customQuery.data]);

  const dataMode = namedQuery.data?.data_mode ?? customQuery.data?.data_mode;

  const explainRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (expandedTract) {
      explainRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [expandedTract]);

  if (isLoading) {
    return (
      <LoadingRegion label="Loading ranked results">
        <SkeletonText lines={8} />
      </LoadingRegion>
    );
  }
  if (isError) {
    return (
      <ErrorState
        title="Results unavailable"
        description={error instanceof ApiError ? error.message : "Couldn't load ranked results. Is the API running?"}
      />
    );
  }
  if (rows.length === 0) {
    return <EmptyState title="No results" description="No tracts are available for this weighting." />;
  }

  const scoredRows = rows.filter((r) => r.score !== null);
  const unscoredCount = rows.length - scoredRows.length;

  const columns: ColumnDef<RankedRow, unknown>[] = [
    {
      id: "rank",
      // Always this tract's position under the active weighting's score
      // ranking (rank 1 = highest screening concern) -- fixed to that
      // score order regardless of which column the table is currently
      // sorted by, since "rank" names a fact about the tract, not the
      // table's current row order. `rows` arrives from the API already
      // sorted score-descending (nulls last), so the original array
      // index is this stable score rank by construction.
      header: "Score rank",
      cell: ({ row }) => `#${row.index + 1}`,
    },
    {
      id: "tract",
      header: "Place",
      accessorFn: (r) => r.tract_geoid_2020,
      cell: ({ row }) => <span>{tractNames.get(row.original.tract_geoid_2020) ?? row.original.tract_geoid_2020}</span>,
    },
    {
      id: "score",
      header: SCREENING_SCORE_LABEL,
      accessorFn: (r) => r.score ?? -1,
      cell: ({ row }) => <ScreeningScore score={row.original.score} mode="compact" />,
    },
    {
      id: "coverage",
      header: "Data coverage",
      accessorFn: (r) => r.coverage_fraction,
      cell: ({ row }) => `${Math.round(row.original.coverage_fraction * 100)}%`,
    },
    ...(scenarioSelection.kind === "named"
      ? [
          {
            id: "stability",
            header: "Stability",
            cell: ({ row }: { row: { original: RankedRow } }) =>
              row.original.stability_label ? (
                <StabilityBadge label={row.original.stability_label} />
              ) : (
                <Badge tone="neutral">Not scored</Badge>
              ),
          } as ColumnDef<RankedRow, unknown>,
        ]
      : []),
    {
      id: "explain",
      header: "Why",
      cell: ({ row }) => (
        <button
          type="button"
          className="text-xs font-medium text-[var(--color-interactive)] hover:underline"
          aria-expanded={expandedTract === row.original.tract_geoid_2020}
          onClick={() =>
            setExpandedTract(
              expandedTract === row.original.tract_geoid_2020 ? null : row.original.tract_geoid_2020,
            )
          }
        >
          {expandedTract === row.original.tract_geoid_2020 ? "Hide drivers" : "Show drivers"}
        </button>
      ),
    },
  ];

  const expandedRow = rows.find((r) => r.tract_geoid_2020 === expandedTract);
  const visibleRows = showAll ? rows : rows.slice(0, DEFAULT_VISIBLE_COUNT);
  const isTruncated = !showAll && rows.length > DEFAULT_VISIBLE_COUNT;

  return (
    <div className="space-y-3">
      <p className="text-sm text-[var(--color-text-secondary)]">
        {scoredRows.length} of {rows.length} tracts have a {SCREENING_SCORE_LABEL.toLowerCase()} under this weighting.
        {unscoredCount > 0 && ` ${unscoredCount} tract(s) have too little data for this weighting and are excluded, not shown as zero.`}
        {dataMode && <> <DataModeBadge mode={dataMode} /></>}
      </p>
      {/* Blind usability review (docs/design/final-score-map-and-
          intuitiveness-review.md) found the 0-100 direction was only
          ever stated on the tract-detail page, not here where the score
          first appears as a sortable column -- restated here so rank #1
          is unambiguous without visiting another page. */}
      <p className="text-xs text-[var(--color-text-tertiary)]">
        Rank #1 is the tract with the highest screening concern. 0 = lower screening concern, 100 = higher.
      </p>

      {expandedRow && (
        <div ref={explainRef}>
          <ExplainCard
            row={expandedRow}
            name={tractNames.get(expandedRow.tract_geoid_2020) ?? null}
            scenarioId={scenarioSelection.kind === "named" ? scenarioSelection.scenarioId : null}
          />
        </div>
      )}

      <DataTable
        data={visibleRows}
        columns={columns}
        caption={`Ranked geographies by ${SCREENING_SCORE_LABEL.toLowerCase()}`}
        initialSorting={[{ id: "score", desc: true }]}
        getRowId={(r) => r.tract_geoid_2020}
      />

      <div className="flex items-center justify-between gap-3 text-sm text-[var(--color-text-secondary)]">
        <p>
          {isTruncated
            ? `Showing the top ${DEFAULT_VISIBLE_COUNT} of ${rows.length} tracts.`
            : `Showing all ${rows.length} tracts.`}
        </p>
        {rows.length > DEFAULT_VISIBLE_COUNT && (
          <Button variant="secondary" size="sm" onClick={() => setShowAll((v) => !v)}>
            {isTruncated ? `Show all ${rows.length}` : `Show top ${DEFAULT_VISIBLE_COUNT}`}
          </Button>
        )}
      </div>
    </div>
  );
}

function ExplainCard({
  row,
  name,
  scenarioId,
}: {
  row: RankedRow;
  name: string | null;
  scenarioId: string | null;
}) {
  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-sunken)] p-4">
      <h4 className="text-sm font-semibold text-[var(--color-text-primary)]">
        Why {name ?? row.tract_geoid_2020} ranked here
      </h4>
      {row.domain_contributions.length > 0 ? (
        <ul className="mt-2 space-y-1.5">
          {[...row.domain_contributions]
            .sort((a, b) => b.contribution - a.contribution)
            .map((c) => (
              <li key={c.domain} className="flex items-center justify-between text-xs">
                <span className="text-[var(--color-text-secondary)]">{domainLabel(c.domain)}</span>
                <span className="tabular-nums text-[var(--color-text-primary)]">
                  {c.domain_score.toFixed(0)} score &times; {Math.round(c.normalized_weight * 100)}% weight ={" "}
                  <strong className="font-semibold">{c.contribution.toFixed(1)} pts</strong>
                </span>
              </li>
            ))}
        </ul>
      ) : (
        <p className="mt-2 text-xs text-[var(--color-text-secondary)]">
          Domain-by-domain drivers for a named scenario are shown in Explore's full evidence view.
        </p>
      )}
      {row.domains_missing.length > 0 && (
        <p className="mt-2 text-xs text-[var(--color-caution-strong)]">
          Missing for this tract: {row.domains_missing.map(domainLabel).join(", ")} (weights were
          redistributed across the remaining factors, not treated as zero).
        </p>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Link
          href={`/explore?geography=tract&id=${encodeURIComponent(row.tract_geoid_2020)}${
            scenarioId ? `&scenario=${encodeURIComponent(scenarioId)}` : ""
          }`}
          className="text-xs font-medium text-[var(--color-interactive)] hover:underline"
        >
          View full sources &amp; evidence in Explore
        </Link>
        <UseInAdvocateButton
          geography={{
            geographyType: "tract",
            geoid: row.tract_geoid_2020,
            displayName: name ?? row.tract_geoid_2020,
          }}
          scenarioId={scenarioId ?? undefined}
        />
      </div>
    </div>
  );
}
