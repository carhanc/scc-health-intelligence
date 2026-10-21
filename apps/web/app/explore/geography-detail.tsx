"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import {
  Badge,
  DataModeBadge,
  PercentileBar,
  Button,
  LoadingRegion,
  SkeletonText,
  ErrorState,
  MetricDirectionLabel,
  formatScreeningScore,
  SCREENING_SCORE_LABEL,
} from "@scc-health/ui";
import {
  api,
  ApiError,
  type ScoreExplanationResponse,
  type DomainContributionDetail,
  type MetricContribution,
  type SourceStatusEntry,
} from "@/lib/api";
import type { SelectedGeography } from "./selection";
import { domainLabel } from "@/lib/labels";
import { UseInAdvocateButton } from "../use-in-advocate-button";
import { SourceCitationLine } from "../source-citation";
import { CitedValue } from "../cited-value";
import { formatMetricValue } from "../metric-format";

import { concernBandLabel, domainComparisonPhrase } from "./layers";

/** A truthful, non-jargon error for a failed geography lookup -- the raw
 * API detail (which may reference internal identifiers) stays behind a
 * disclosure, never the primary message (Phase 5 hotfix). */
export function GeographyLoadError({
  geographyLabel,
  identifier,
  error,
  onRetry,
  onClearSelection,
}: {
  geographyLabel: string;
  identifier: string;
  error: unknown;
  onRetry: () => void;
  onClearSelection: () => void;
}) {
  return (
    <ErrorState
      title="We couldn't load this place"
      description={
        <>
          <p>
            We couldn&rsquo;t load {geographyLabel} {identifier}.
          </p>
          <details className="mt-2">
            <summary className="cursor-pointer text-xs text-[var(--color-text-tertiary)]">
              Technical details
            </summary>
            <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">
              {error instanceof ApiError ? error.message : "Is the API running?"}
            </p>
          </details>
        </>
      }
      action={{ label: "Retry", onClick: onRetry }}
      secondaryAction={{ label: "Clear selection", onClick: onClearSelection }}
    />
  );
}

export function DriverRow({
  metric,
  isStrongDriver,
  sourcesById,
}: {
  metric: MetricContribution;
  isStrongDriver: boolean;
  sourcesById: Map<string, SourceStatusEntry>;
}) {
  return (
    <li className="rounded-[var(--radius-md)] border border-[var(--color-border)] p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <span className="text-sm font-medium text-[var(--color-text-primary)]">{metric.label}</span>
        <Badge tone={isStrongDriver ? "interactive" : "neutral"}>
          {isStrongDriver ? "Strong driver" : "Contributor"}
        </Badge>
      </div>
      <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
        {metric.raw_value !== null ? (
          <CitedValue sourceId={metric.source_id} sourcesById={sourcesById}>
            {formatMetricValue(metric.raw_value, metric.unit)}
          </CitedValue>
        ) : (
          "No data"
        )}
        {metric.percentile !== null && (
          <>
            {" "}
            · higher than <span className="tabular-nums">{Math.round(metric.percentile)}%</span> of county tracts
          </>
        )}
      </p>
      <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">
        Contributed <span className="tabular-nums">{(metric.contribution ?? 0).toFixed(1)}</span> of this tract's
        score points ({Math.round(metric.effective_weight * 100)}% of this scenario's weight for this tract).
      </p>
      <p className="mt-1 text-xs text-[var(--color-text-secondary)]">{metric.plain_language_definition}</p>
      {metric.limitations && (
        <p className="mt-0.5 text-xs text-[var(--color-text-tertiary)]">Limitation: {metric.limitations}</p>
      )}
      <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">
        <SourceCitationLine sourceId={metric.source_id} fallbackText={metric.citation} sourcesById={sourcesById} />
      </p>
    </li>
  );
}

export function CopyLinkButton() {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="secondary"
      size="sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(window.location.href);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          // Clipboard API unavailable (e.g. insecure context) -- the URL
          // is already shareable by copying it from the address bar, so
          // this failing silently doesn't block the underlying task.
        }
      }}
    >
      {copied ? "Link copied" : "Copy link"}
    </Button>
  );
}

export function ScoreSummary({
  explanation,
  totalTracts,
}: {
  explanation: ScoreExplanationResponse;
  totalTracts: number | null;
}) {
  const mc = explanation.monte_carlo;
  const dc = explanation.data_confidence;
  return (
    <div className="mt-4 rounded-[var(--radius-lg)] border border-[var(--color-border)] p-4">
      {/* Stability is already shown once, above the fold, in the
          compact confidence line, not repeated here to avoid the
          exact badge and title text appearing twice on the same page. */}
      <p className="text-3xl font-semibold tabular-nums text-[var(--color-text-primary)]">
        {formatScreeningScore(explanation.score)}
        <span className="text-base font-normal text-[var(--color-text-secondary)]">/100</span>
      </p>
      <p className="text-xs text-[var(--color-text-secondary)]">
        {SCREENING_SCORE_LABEL}, this scenario only: the same figure shown above, recomputed here with its exact inputs.
      </p>

      <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-xs text-[var(--color-text-secondary)]">Data coverage</dt>
          <dd className="tabular-nums">{Math.round(explanation.coverage_fraction * 100)}%</dd>
        </div>
        {mc && (
          <div>
            <dt className="text-xs text-[var(--color-text-secondary)]">Likely range (uncertainty)</dt>
            <dd className="tabular-nums">
              {mc.ci_lower !== null && mc.ci_upper !== null
                ? `${Math.round(mc.ci_lower)} - ${Math.round(mc.ci_upper)}`
                : "Not available"}
            </dd>
          </div>
        )}
        {mc?.median_rank !== null && mc?.median_rank !== undefined && (
          <div>
            <dt className="text-xs text-[var(--color-text-secondary)]">
              Countywide rank{totalTracts !== null ? ` (of ${totalTracts})` : ""}
            </dt>
            <dd className="tabular-nums">
              #{Math.round(mc.median_rank)}
              {mc.rank_ci_lower !== null && mc.rank_ci_upper !== null && (
                <span className="text-[var(--color-text-secondary)]">
                  {" "}
                  (range #{Math.round(mc.rank_ci_lower)}-{Math.round(mc.rank_ci_upper)})
                </span>
              )}
            </dd>
          </div>
        )}
        {mc?.probability_top_decile !== null && mc?.probability_top_decile !== undefined && (
          <div>
            <dt className="text-xs text-[var(--color-text-secondary)]">Chance it's in the top 10% countywide</dt>
            <dd className="tabular-nums">{Math.round(mc.probability_top_decile * 100)}%</dd>
          </div>
        )}
      </dl>

      {dc && (
        <p className="mt-3 text-xs text-[var(--color-text-secondary)]">
          Stability and confidence are two different questions: stability is how much this tract's{" "}
          <em>rank</em> shifts if priorities were weighted differently; confidence ({Math.round(dc.confidence_score * 100)}%) is
          how complete and precise the underlying data itself is. A tract can be rank-stable and still
          data-limited if confidence falls below the platform's threshold.{" "}
          <Link href="/validate" className="text-[var(--color-interactive)] underline underline-offset-2">
            See full methodology
          </Link>
          .
        </p>
      )}

      <p className="mt-3 text-xs text-[var(--color-text-secondary)]">
        A high score means this tract&rsquo;s profile warrants a closer look under this scenario&rsquo;s
        priorities; it does not mean any specific program or intervention would fix it.
      </p>
    </div>
  );
}

export function DomainDisclosure({
  domain,
  sourcesById,
}: {
  domain: DomainContributionDetail;
  sourcesById: Map<string, SourceStatusEntry>;
}) {
  return (
    <details className="group rounded-[var(--radius-md)] border border-[var(--color-border)] p-3 open:pb-3">
      <summary className="cursor-pointer list-none">
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm font-medium text-[var(--color-text-primary)]">{domainLabel(domain.domain)}</span>
          <span className="flex items-center gap-2">
            <span className="text-xs text-[var(--color-text-tertiary)]">
              {Math.round(domain.configured_weight * 100)}% of this scenario
            </span>
            {domain.domain_score !== null ? (
              <span className="tabular-nums text-sm text-[var(--color-text-secondary)]">
                {Math.round(domain.domain_score)}/100
              </span>
            ) : (
              <Badge tone="neutral">No data</Badge>
            )}
            <span aria-hidden="true" className="text-xs text-[var(--color-text-tertiary)] group-open:rotate-180">
              ▼
            </span>
          </span>
        </div>
        {/* Visible collapsed, not just when expanded -- this row alone
            replaces the always-open "Domain summary" list this component
            used to duplicate (removing that list was the fix; this line
            is why removing it didn't lose the at-a-glance value it gave). */}
        {domain.domain_score !== null && (
          <div className="mt-1.5">
            <PercentileBar percentile={domain.domain_score} label={`${domainLabel(domain.domain)} county percentile`} />
            <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
              {domainComparisonPhrase(domain.domain_score)}
            </p>
          </div>
        )}
      </summary>
      {domain.domain_score !== null && (
        <p className="mt-2 text-xs text-[var(--color-text-secondary)]">
          {concernBandLabel(domain.domain_score, domainLabel(domain.domain).toLowerCase())}, county-relative.{" "}
          <MetricDirectionLabel direction="higher-is-more-concern" />
        </p>
      )}
      <div className="mt-3 space-y-3 border-t border-[var(--color-border)] pt-3">
        {domain.metrics.map((metric) => (
          <div key={metric.metric_id}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="font-medium text-[var(--color-text-primary)]">{metric.label}</span>
              <span className="tabular-nums text-[var(--color-text-secondary)]">
                {metric.raw_value !== null ? (
                  <CitedValue sourceId={metric.source_id} sourcesById={sourcesById}>
                    {formatMetricValue(metric.raw_value, metric.unit)}
                  </CitedValue>
                ) : (
                  "No data"
                )}
              </span>
            </div>
            <PercentileBar
              percentile={metric.percentile}
              label={`${metric.label} county percentile`}
            />
            <p className="mt-1 text-xs text-[var(--color-text-secondary)]">{metric.plain_language_definition}</p>
            {metric.limitations && (
              <p className="mt-0.5 text-xs text-[var(--color-text-tertiary)]">Limitation: {metric.limitations}</p>
            )}
            <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">
              <SourceCitationLine
                sourceId={metric.source_id}
                fallbackText={metric.citation}
                sourcesById={sourcesById}
              />
            </p>
          </div>
        ))}
      </div>
    </details>
  );
}

export function EvidenceContent({
  explanation,
  sourcesById,
}: {
  explanation: ScoreExplanationResponse;
  sourcesById: Map<string, SourceStatusEntry>;
}) {
  return (
    <div className="space-y-5">
      <p className="text-sm text-[var(--color-text-secondary)]">
        Every metric used in this score, with its source and the exact value observed for this tract.
      </p>
      {explanation.domains.map((domain) => (
        <div key={domain.domain}>
          <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">{domainLabel(domain.domain)}</h3>
          <table className="mt-2 w-full border-collapse text-left text-xs">
            <caption className="sr-only">{domainLabel(domain.domain)} metric sources</caption>
            <thead>
              <tr className="border-b border-[var(--color-border)] text-[var(--color-text-secondary)]">
                <th scope="col" className="py-1.5 pr-2 font-medium">
                  Metric
                </th>
                <th scope="col" className="py-1.5 pr-2 font-medium">
                  Value
                </th>
                <th scope="col" className="py-1.5 font-medium">
                  Source
                </th>
              </tr>
            </thead>
            <tbody>
              {domain.metrics.map((metric) => (
                <tr key={metric.metric_id} className="border-b border-[var(--color-border)]">
                  <td className="py-1.5 pr-2">{metric.label}</td>
                  <td className="py-1.5 pr-2 tabular-nums">
                    {metric.raw_value !== null ? (
                      <CitedValue sourceId={metric.source_id} sourcesById={sourcesById}>
                        {formatMetricValue(metric.raw_value, metric.unit)}
                      </CitedValue>
                    ) : (
                      "No data"
                    )}
                  </td>
                  <td className="py-1.5 text-[var(--color-text-secondary)]">
                    <SourceCitationLine
                      sourceId={metric.source_id}
                      fallbackText={metric.citation}
                      sourcesById={sourcesById}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

export function PlaceDetail({
  placeGeoid,
  scenarioId,
  onClearSelection,
  onSelect,
}: {
  placeGeoid: string;
  scenarioId: string;
  onClearSelection: () => void;
  onSelect: (selection: SelectedGeography) => void;
}) {
  const query = useQuery({
    queryKey: ["place-profile", placeGeoid],
    queryFn: () => api.getPlaceProfile(placeGeoid),
    retry: 1,
  });
  const topTractsQuery = useQuery({
    queryKey: ["place-top-concern-tracts", placeGeoid, scenarioId],
    queryFn: () => api.getPlaceTopConcernTracts(placeGeoid, scenarioId, 5),
    retry: 1,
  });
  if (query.isLoading) {
    return (
      <LoadingRegion label="Loading place profile">
        <SkeletonText lines={4} />
      </LoadingRegion>
    );
  }
  if (query.isError || !query.data) {
    return (
      <GeographyLoadError
        geographyLabel="place"
        identifier={placeGeoid}
        error={query.error}
        onRetry={() => query.refetch()}
        onClearSelection={onClearSelection}
      />
    );
  }
  const profile = query.data;
  return (
    <div>
      <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">{profile.name_long}</h2>
      <p className="text-sm text-[var(--color-text-secondary)]">
        Place ID {profile.place_geoid} · <DataModeBadge mode={profile.data_mode} />
      </p>
      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-xs text-[var(--color-text-secondary)]">Land area</dt>
          <dd>{(profile.area_land_sqm / 1_000_000).toFixed(2)} km²</dd>
        </div>
        <div>
          <dt className="text-xs text-[var(--color-text-secondary)]">Census tracts inside this city</dt>
          <dd>{profile.tract_count}</dd>
        </div>
      </dl>

      <div className="mt-3">
        <UseInAdvocateButton
          geography={{ geographyType: "place", geoid: profile.place_geoid, displayName: profile.name_long }}
          scenarioId={scenarioId}
          sourcePage="Map"
        />
      </div>

      <div className="mt-5">
        <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
          Highest-concern areas in {profile.name_long}
        </h3>
        {topTractsQuery.isLoading && (
          <LoadingRegion label="Loading highest-concern tracts">
            <SkeletonText lines={3} />
          </LoadingRegion>
        )}
        {topTractsQuery.isError && (
          <p role="alert" className="mt-2 text-sm text-[var(--color-alert)]">
            Couldn&apos;t load the highest-concern tracts for this city.
          </p>
        )}
        {topTractsQuery.data && topTractsQuery.data.tracts.length === 0 && (
          <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
            No scored tracts are available for the current priorities yet.
          </p>
        )}
        {topTractsQuery.data && topTractsQuery.data.tracts.length > 0 && (
          <ul className="mt-2 divide-y divide-[var(--color-border)] rounded-[var(--radius-md)] border border-[var(--color-border)]">
            {topTractsQuery.data.tracts.map((t, i) => (
              <li key={t.tract_geoid_2020}>
                <button
                  type="button"
                  onClick={() =>
                    onSelect({
                      geographyType: "tract",
                      geoid: t.tract_geoid_2020,
                      displayName: t.name_long,
                      source: "drill_down",
                    })
                  }
                  className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-[var(--color-surface-sunken)] focus-visible:bg-[var(--color-surface-sunken)]"
                >
                  <span>
                    <span className="tabular-nums text-[var(--color-text-tertiary)]">#{i + 1}</span>{" "}
                    {t.name_long}
                  </span>
                  <span className="font-semibold text-[var(--color-text-primary)]">{Math.round(t.score)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-xs text-[var(--color-text-secondary)]">
          Ranked by combined concern score under the current priorities (higher = more concern). Select a tract
          above for its full score breakdown, or search for any other tract inside {profile.name_long} directly.
        </p>
      </div>
    </div>
  );
}

export function DistrictDetail({
  districtNumber,
  scenarioId,
  onClearSelection,
  onSelect,
}: {
  districtNumber: number;
  scenarioId: string;
  onClearSelection: () => void;
  onSelect: (selection: SelectedGeography) => void;
}) {
  const query = useQuery({
    queryKey: ["district-profile", districtNumber],
    queryFn: () => api.getSupervisorDistrictProfile(districtNumber),
    retry: 1,
  });
  const topTractsQuery = useQuery({
    queryKey: ["district-top-concern-tracts", districtNumber, scenarioId],
    queryFn: () => api.getDistrictTopConcernTracts(districtNumber, scenarioId, 5),
    retry: 1,
  });
  if (query.isLoading) {
    return (
      <LoadingRegion label="Loading district profile">
        <SkeletonText lines={4} />
      </LoadingRegion>
    );
  }
  if (query.isError || !query.data) {
    return (
      <GeographyLoadError
        geographyLabel="supervisor district"
        identifier={String(districtNumber)}
        error={query.error}
        onRetry={() => query.refetch()}
        onClearSelection={onClearSelection}
      />
    );
  }
  const profile = query.data;
  return (
    <div>
      <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
        Supervisor District {profile.district_number}
      </h2>
      <p className="text-sm text-[var(--color-text-secondary)]">
        Supervisor {profile.supervisor_name} · <DataModeBadge mode={profile.data_mode} />
      </p>
      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-xs text-[var(--color-text-secondary)]">Area</dt>
          <dd>{profile.area_sq_miles.toFixed(1)} sq mi</dd>
        </div>
        <div>
          <dt className="text-xs text-[var(--color-text-secondary)]">Tracts assigned</dt>
          <dd>{profile.tract_count}</dd>
        </div>
      </dl>

      <div className="mt-3">
        <UseInAdvocateButton
          geography={{
            geographyType: "supervisor_district",
            geoid: String(profile.district_number),
            displayName: `Supervisor District ${profile.district_number}`,
          }}
          scenarioId={scenarioId}
          sourcePage="Map"
        />
      </div>

      <div className="mt-5">
        <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
          Highest-concern areas in District {profile.district_number}
        </h3>
        {topTractsQuery.isLoading && (
          <LoadingRegion label="Loading highest-concern tracts">
            <SkeletonText lines={3} />
          </LoadingRegion>
        )}
        {topTractsQuery.isError && (
          <p role="alert" className="mt-2 text-sm text-[var(--color-alert)]">
            Couldn&apos;t load the highest-concern tracts for this district.
          </p>
        )}
        {topTractsQuery.data && topTractsQuery.data.tracts.length === 0 && (
          <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
            No scored tracts are available for the current priorities yet.
          </p>
        )}
        {topTractsQuery.data && topTractsQuery.data.tracts.length > 0 && (
          <ul className="mt-2 divide-y divide-[var(--color-border)] rounded-[var(--radius-md)] border border-[var(--color-border)]">
            {topTractsQuery.data.tracts.map((t, i) => (
              <li key={t.tract_geoid_2020}>
                <button
                  type="button"
                  onClick={() =>
                    onSelect({
                      geographyType: "tract",
                      geoid: t.tract_geoid_2020,
                      displayName: t.name_long,
                      source: "drill_down",
                    })
                  }
                  className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-[var(--color-surface-sunken)] focus-visible:bg-[var(--color-surface-sunken)]"
                >
                  <span>
                    <span className="tabular-nums text-[var(--color-text-tertiary)]">#{i + 1}</span>{" "}
                    {t.name_long}
                  </span>
                  <span className="font-semibold text-[var(--color-text-primary)]">{Math.round(t.score)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-xs text-[var(--color-text-secondary)]">
          Ranked by combined concern score under the current priorities (higher = more concern). Select a tract
          above for its full score breakdown, or search for any other tract inside this district directly.
        </p>
      </div>
    </div>
  );
}
