"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import {
  Badge,
  StabilityBadge,
  DataModeBadge,
  PercentileBar,
  Dialog,
  Button,
  LoadingRegion,
  SkeletonText,
  ErrorState,
  EmptyState,
  GuidedNextStep,
} from "@scc-health/ui";
import {
  api,
  ApiError,
  type ScoreExplanationResponse,
  type DomainContributionDetail,
} from "@/lib/api";
import type { SelectedGeography } from "./selection";
import { domainLabel } from "@/lib/labels";
import { UseInAdvocateButton } from "../use-in-advocate-button";

export function GeographyDetail({
  selected,
  scenarioId,
  onCompare,
  onClearSelection,
  onSelect,
}: {
  selected: SelectedGeography | null;
  scenarioId: string;
  onCompare: () => void;
  onClearSelection: () => void;
  /** Lets a city/district summary's "highest-concern tracts" list drill
   * down into an individual tract, reusing the same canonical selection
   * entry point as the map/table/search (Phase 6.5). */
  onSelect: (selection: SelectedGeography) => void;
}) {
  if (!selected) {
    return (
      <EmptyState
        title="No place selected yet"
        description="Search for a city, district, or tract, or click a tract on the map, to see its health, access, and resource profile."
      />
    );
  }
  if (selected.geographyType === "tract") {
    return (
      <TractDetail
        tractGeoid={selected.geoid}
        scenarioId={scenarioId}
        onCompare={onCompare}
        onClearSelection={onClearSelection}
      />
    );
  }
  if (selected.geographyType === "place") {
    return (
      <PlaceDetail
        placeGeoid={selected.geoid}
        scenarioId={scenarioId}
        onClearSelection={onClearSelection}
        onSelect={onSelect}
      />
    );
  }
  if (selected.geographyType === "supervisor_district") {
    return (
      <DistrictDetail
        districtNumber={Number(selected.geoid)}
        scenarioId={scenarioId}
        onClearSelection={onClearSelection}
        onSelect={onSelect}
      />
    );
  }
  return (
    <EmptyState
      title={selected.geographyType === "zcta" ? "ZIP-code area selected" : "County selected"}
      description="Scores are calculated per census tract, not for a whole ZIP-code area or county at once. Search for a tract inside this area, or use the map, to see scores and drivers."
    />
  );
}

/** A truthful, non-jargon error for a failed geography lookup -- the raw
 * API detail (which may reference internal identifiers) stays behind a
 * disclosure, never the primary message (Phase 5 hotfix). */
function GeographyLoadError({
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

const SCORE_BANDS: { min: number; label: string }[] = [
  { min: 75, label: "high combined concern" },
  { min: 50, label: "moderate-to-high combined concern" },
  { min: 25, label: "moderate-to-low combined concern" },
  { min: 0, label: "lower combined concern" },
];

function scoreBandLabel(score: number): string {
  return SCORE_BANDS.find((band) => score >= band.min)?.label ?? "combined concern";
}

function TractDetail({
  tractGeoid,
  scenarioId,
  onCompare,
  onClearSelection,
}: {
  tractGeoid: string;
  scenarioId: string;
  onCompare: () => void;
  onClearSelection: () => void;
}) {
  const [evidenceOpen, setEvidenceOpen] = useState(false);

  const profileQuery = useQuery({
    queryKey: ["tract-profile", tractGeoid],
    queryFn: () => api.getTractProfile(tractGeoid),
    retry: 1,
  });
  const explainQuery = useQuery({
    queryKey: ["explain-score", scenarioId, tractGeoid],
    queryFn: () => api.explainScore(scenarioId, tractGeoid),
    retry: 1,
  });

  if (profileQuery.isLoading || explainQuery.isLoading) {
    return (
      <LoadingRegion label="Loading tract profile">
        <SkeletonText lines={8} />
      </LoadingRegion>
    );
  }
  if (profileQuery.isError || explainQuery.isError) {
    return (
      <GeographyLoadError
        geographyLabel="census tract"
        identifier={tractGeoid}
        error={profileQuery.error ?? explainQuery.error}
        onRetry={() => {
          profileQuery.refetch();
          explainQuery.refetch();
        }}
        onClearSelection={onClearSelection}
      />
    );
  }

  const profile = profileQuery.data;
  const explanation = explainQuery.data;
  if (!profile || !explanation) return null;

  const topDomain = [...explanation.domains]
    .filter((d) => d.domain_score !== null)
    .sort((a, b) => (b.domain_score ?? 0) - (a.domain_score ?? 0))[0];

  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">Tract {profile.tract_geoid_2020}</h2>
          <p className="text-sm text-[var(--color-text-secondary)]">
            {profile.name_long} · <DataModeBadge mode={profile.data_mode} />
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={onCompare}>
          Compare
        </Button>
      </div>

      {/* A. Plain-language summary */}
      <p className="mt-3 rounded-[var(--radius-md)] bg-[var(--color-surface-sunken)] p-3 text-sm text-[var(--color-text-primary)]">
        {explanation.score !== null ? (
          <>
            Under the <strong>{explanation.scenario_label}</strong> scenario, this tract shows{" "}
            <strong>{scoreBandLabel(explanation.score)}</strong> relative to the rest of Santa Clara County
            {topDomain ? (
              <>
                , driven mainly by <strong>{domainLabel(topDomain.domain)}</strong>
              </>
            ) : null}
            .
          </>
        ) : (
          "There isn't enough data to compute a combined score for this tract under this scenario."
        )}
      </p>

      {/* C. Scenario score */}
      <ScoreSummary explanation={explanation} />

      {/* D + E. Domain breakdown / driver decomposition */}
      <div className="mt-6">
        <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">What's driving this score</h3>
        <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
          Every domain below can be expanded to see the exact metrics, raw values, and sources behind it.
        </p>
        <div className="mt-3 space-y-2">
          {explanation.domains.map((domain) => (
            <DomainDisclosure key={domain.domain} domain={domain} />
          ))}
        </div>
        {explanation.domains_missing.length > 0 && (
          <p className="mt-2 text-xs text-[var(--color-text-secondary)]">
            Not enough data was available for: {explanation.domains_missing.map(domainLabel).join(", ")}.
          </p>
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" onClick={() => setEvidenceOpen(true)}>
          View sources &amp; evidence
        </Button>
        <UseInAdvocateButton
          geography={{
            geographyType: "tract",
            geoid: profile.tract_geoid_2020,
            displayName: `Tract ${profile.tract_geoid_2020}`,
          }}
          scenarioId={scenarioId}
        />
      </div>

      <GuidedNextStep prompt="What would you like to do next?">
        <Link href="/copilot" className="text-[var(--color-interactive)] underline underline-offset-2">
          Ask Copilot about this tract
        </Link>
        <Link href="/prioritize" className="text-[var(--color-interactive)] underline underline-offset-2">
          See its full countywide ranking
        </Link>
      </GuidedNextStep>

      <Dialog open={evidenceOpen} onClose={() => setEvidenceOpen(false)} title="Sources and evidence" variant="side">
        <EvidenceContent explanation={explanation} />
      </Dialog>
    </div>
  );
}

function ScoreSummary({ explanation }: { explanation: ScoreExplanationResponse }) {
  const mc = explanation.monte_carlo;
  return (
    <div className="mt-4 rounded-[var(--radius-lg)] border border-[var(--color-border)] p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-3xl font-semibold tabular-nums text-[var(--color-text-primary)]">
            {explanation.score !== null ? Math.round(explanation.score) : "—"}
            <span className="text-base font-normal text-[var(--color-text-secondary)]">/100</span>
          </p>
          <p className="text-xs text-[var(--color-text-secondary)]">Combined concern score, this scenario only</p>
        </div>
        {explanation.stability_label && <StabilityBadge label={explanation.stability_label} />}
      </div>

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
            <dt className="text-xs text-[var(--color-text-secondary)]">Countywide rank (of 408)</dt>
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

      <p className="mt-3 text-xs text-[var(--color-text-secondary)]">
        This is a county-relative screening score, not a prediction or a causal claim. A high score means this
        tract's profile warrants a closer look under this scenario's priorities -- it does not mean any specific
        program or intervention would fix it.
      </p>
    </div>
  );
}

function DomainDisclosure({ domain }: { domain: DomainContributionDetail }) {
  return (
    <details className="group rounded-[var(--radius-md)] border border-[var(--color-border)] p-3 open:pb-3">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
        <span className="text-sm font-medium text-[var(--color-text-primary)]">{domainLabel(domain.domain)}</span>
        <span className="flex items-center gap-2">
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
      </summary>
      <div className="mt-3 space-y-3 border-t border-[var(--color-border)] pt-3">
        {domain.metrics.map((metric) => (
          <div key={metric.metric_id}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="font-medium text-[var(--color-text-primary)]">{metric.label}</span>
              <span className="tabular-nums text-[var(--color-text-secondary)]">
                {metric.raw_value !== null ? `${metric.raw_value.toLocaleString()} ${metric.unit}` : "No data"}
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
          </div>
        ))}
      </div>
    </details>
  );
}

function EvidenceContent({ explanation }: { explanation: ScoreExplanationResponse }) {
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
                    {metric.raw_value !== null ? `${metric.raw_value.toLocaleString()} ${metric.unit}` : "No data"}
                  </td>
                  <td className="py-1.5 text-[var(--color-text-secondary)]">{metric.citation}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

function PlaceDetail({
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

function DistrictDetail({
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
