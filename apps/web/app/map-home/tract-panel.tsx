"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import {
  Button,
  DataModeBadge,
  Dialog,
  GuidedNextStep,
  LoadingRegion,
  PercentileBar,
  ScreeningScore,
  SkeletonText,
  StabilityBadge,
  TabPanel,
  Tabs,
  concernColorFor,
} from "@scc-health/ui";
import { api, type CustomDomainContribution, type MetricContribution, type SourceStatusEntry } from "@/lib/api";
import { domainLabel } from "@/lib/labels";
import { useSourcesById } from "@/lib/use-sources";
import { UseInAdvocateButton } from "../use-in-advocate-button";
import { SourceCitationLine } from "../source-citation";
import { CitedValue } from "../cited-value";
import { formatMetricValue } from "../metric-format";

import { domainComparisonPhrase } from "../explore/layers";
import { ComparisonPanel } from "../explore/comparison-panel";
import {
  CopyLinkButton,
  DomainDisclosure,
  DriverRow,
  EvidenceContent,
  GeographyLoadError,
  ScoreSummary,
} from "../explore/geography-detail";
import { ClampedText } from "./clamped-text";
import { CountyStrip } from "./county-strip";
import { BASE_GEOMETRY_SCENARIO } from "./constants";
import type { FocusRow } from "./use-focus-scores";

type TractTab = "why" | "numbers" | "sure";

const TABS: { id: TractTab; label: string }[] = [
  { id: "why", label: "Reasons" },
  { id: "numbers", label: "Numbers" },
  { id: "sure", label: "Confidence" },
];

/**
 * A neighborhood, in layers: the plain-language answer first (score, where
 * it sits among all 408, the top reasons with their sources), then every
 * number behind it, then how much to trust it. Nothing the earlier long
 * profile showed is gone; it is organized so a first-time reader can stop
 * after the first screen and a skeptical one can keep going.
 */
export function TractPanel({
  tractGeoid,
  scenarioId,
  focusRows,
  comparing,
  onCompare,
  onCloseCompare,
  onBack,
}: {
  tractGeoid: string;
  scenarioId: string;
  focusRows: FocusRow[];
  comparing: boolean;
  onCompare: () => void;
  onCloseCompare: () => void;
  onBack: () => void;
}) {
  const [tab, setTab] = useState<TractTab>("why");
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const sourcesById = useSourcesById();

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
  const boundariesQuery = useQuery({
    queryKey: ["tract-boundaries", BASE_GEOMETRY_SCENARIO],
    queryFn: () => api.getAllTractBoundaries(BASE_GEOMETRY_SCENARIO),
    retry: 1,
    staleTime: 5 * 60 * 1000,
  });
  const domainsRegistryQuery = useQuery({
    queryKey: ["domains-registry"],
    queryFn: api.getDomains,
    retry: 1,
    staleTime: 10 * 60 * 1000,
  });

  if (profileQuery.isLoading || explainQuery.isLoading) {
    return (
      <div className="px-5 pt-4">
        <BackButton onBack={onBack} />
        <div className="mt-6">
          <LoadingRegion label="Loading tract profile">
            <SkeletonText lines={8} />
          </LoadingRegion>
        </div>
      </div>
    );
  }
  if (profileQuery.isError || explainQuery.isError) {
    return (
      <div className="px-5 pt-4">
        <BackButton onBack={onBack} />
        <div className="mt-4">
          <GeographyLoadError
            geographyLabel="census tract"
            identifier={tractGeoid}
            error={profileQuery.error ?? explainQuery.error}
            onRetry={() => {
              profileQuery.refetch();
              explainQuery.refetch();
            }}
            onClearSelection={onBack}
          />
        </div>
      </div>
    );
  }

  const profile = profileQuery.data;
  const explanation = explainQuery.data;
  if (!profile || !explanation) return null;

  const totalTracts = boundariesQuery.data?.features.length ?? null;

  // Ranked by CONTRIBUTION (percentile x this focus area's weight for that
  // metric), not raw percentile: under unequal weightings a metric with the
  // top percentile can matter less than a moderate one in a heavier domain.
  const rankedMetrics = explanation.domains
    .flatMap((d) => d.metrics)
    .filter((m) => m.contribution !== null)
    .sort((a, b) => (b.contribution ?? 0) - (a.contribution ?? 0));
  const meanContribution =
    rankedMetrics.length > 0 ? rankedMetrics.reduce((sum, m) => sum + (m.contribution ?? 0), 0) / rankedMetrics.length : 0;

  const presentMetricIds = new Set(rankedMetrics.map((m) => m.metric_id));
  const missingMetrics = (domainsRegistryQuery.data?.domains ?? [])
    .filter((d) => explanation.domains.some((ed) => ed.domain === d.domain))
    .flatMap((d) => d.metrics)
    .filter((m) => !presentMetricIds.has(m.metric_id));

  const mc = explanation.monte_carlo;
  const comparisonPercentile =
    mc?.median_rank != null && totalTracts != null && totalTracts > 1
      ? Math.round(((totalTracts - mc.median_rank) / (totalTracts - 1)) * 100)
      : null;

  const stripValues = focusRows.map((r) => r.score).filter((v): v is number => v !== null);
  const supervisor = profile.supervisor_district ? `Supervisor District ${profile.supervisor_district}` : null;

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-6 pt-4">
        <div className="flex items-center justify-between gap-3">
          <BackButton onBack={onBack} />
          <CopyLinkButton />
        </div>

        <h2 className="mt-4 text-2xl font-medium leading-tight text-[var(--color-text-primary)]">
          {/* The visible title is the tract's friendly name; the 11-digit
              ID stays one line below, labeled, for anyone who needs it. */}
          <span className="sr-only">Tract {profile.tract_geoid_2020}: </span>
          {profile.name_long}
        </h2>
        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-[var(--color-text-secondary)]">
          <span>Tract ID {profile.tract_geoid_2020}</span>
          {supervisor && <span>&middot; {supervisor}</span>}
          <DataModeBadge mode={profile.data_mode} />
        </p>

        <div className="mt-5">
          <ScreeningScore
            score={explanation.score}
            comparisonPercentile={comparisonPercentile}
            totalTracts={totalTracts}
            scenarioLabel={explanation.scenario_label}
          />
        </div>

        {explanation.stability_label && explanation.score !== null && (
          <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-[var(--color-text-secondary)]">
            <span>How steady is this ranking?</span>
            <StabilityBadge label={explanation.stability_label} />
          </p>
        )}

        {stripValues.length > 0 && explanation.score !== null && (
          <div className="mt-5">
            <CountyStrip
              values={stripValues}
              value={explanation.score}
              label={
                comparisonPercentile !== null
                  ? `Where this neighborhood sits among ${stripValues.length}: higher than ${comparisonPercentile} percent.`
                  : "Where this neighborhood sits among all neighborhoods."
              }
            />
          </div>
        )}

        <p className="mt-4 text-sm text-[var(--color-text-secondary)]">
          A screening signal for closer review, not a diagnosis or a cause. {" "}
          <span className="text-[var(--color-text-tertiary)]">Scored under {explanation.scenario_label}.</span>
        </p>

        {comparing && (
          <div className="mt-5">
            <ComparisonPanel baseTractGeoid={tractGeoid} scenarioId={scenarioId} onClose={onCloseCompare} />
          </div>
        )}

        <div className="mt-6">
          <Tabs
            items={TABS}
            activeId={tab}
            onChange={(id) => setTab(id as TractTab)}
            label="Neighborhood detail"
          />
          <div className="pt-5">
            <TabPanel id="why" activeId={tab}>
              {rankedMetrics.length > 0 && (
                <section>
                  <h3 className="text-base font-semibold text-[var(--color-text-primary)]">What is shaping this score</h3>
                  <ul className="mt-3 space-y-5" aria-label="Top factors shaping this profile">
                    {rankedMetrics.slice(0, 3).map((m) => (
                      <ReasonRow key={m.metric_id} metric={m} sourcesById={sourcesById} />
                    ))}
                  </ul>
                </section>
              )}

              <section className="mt-8">
                <h3 className="text-base font-semibold text-[var(--color-text-primary)]">Across the five areas</h3>
                <ul className="mt-3 space-y-3">
                  {explanation.domains.map((d) => (
                    <li key={d.domain} className="flex items-center gap-3 text-sm">
                      <span className="w-[42%] shrink-0 text-[var(--color-text-primary)]">{domainLabel(d.domain)}</span>
                      <span className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--color-neutral-subtle)]">
                        {d.domain_score !== null && (
                          <span
                            className="block h-full rounded-full"
                            style={{ width: `${Math.max(3, d.domain_score)}%`, backgroundColor: concernColorFor(d.domain_score) }}
                          />
                        )}
                      </span>
                      <span className="w-10 shrink-0 text-right tabular-nums text-[var(--color-text-secondary)]">
                        {d.domain_score !== null ? Math.round(d.domain_score) : "No data"}
                      </span>
                    </li>
                  ))}
                </ul>
                {explanation.domains_missing.length > 0 && (
                  <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
                    Not enough data for: {explanation.domains_missing.map(domainLabel).join(", ")}.
                  </p>
                )}
                <button
                  type="button"
                  onClick={() => setTab("numbers")}
                  className="mt-3 text-sm font-medium text-[var(--color-interactive)] hover:underline"
                >
                  See every number behind these &rarr;
                </button>
              </section>

              <div className="mt-8">
                <GuidedNextStep prompt="What would you like to do next?">
                  <Link
                    href={`/copilot?geography=tract&id=${profile.tract_geoid_2020}&name=${encodeURIComponent(profile.name_long)}&scenario=${scenarioId}`}
                    className="text-[var(--color-interactive)] underline underline-offset-2"
                  >
                    Ask Copilot about this tract
                  </Link>
                  <Link href="/prioritize" className="text-[var(--color-interactive)] underline underline-offset-2">
                    See its full countywide ranking
                  </Link>
                  <Link
                    href={`/access-lab?geography=tract&id=${profile.tract_geoid_2020}&name=${encodeURIComponent(profile.name_long)}`}
                    className="text-[var(--color-interactive)] underline underline-offset-2"
                  >
                    See its access to care
                  </Link>
                </GuidedNextStep>
              </div>
            </TabPanel>

            <TabPanel id="numbers" activeId={tab}>
              <h3 className="text-base font-semibold text-[var(--color-text-primary)]">
                Conditions that may shape health equity here
              </h3>
              <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                Open a row for its exact metrics, raw values and sources. Click any value to open its original source.
              </p>
              <div className="mt-3 space-y-2">
                {explanation.domains.map((d) => (
                  <DomainDisclosure key={d.domain} domain={d} sourcesById={sourcesById} />
                ))}
              </div>

              <details className="group mt-5">
                <summary className="cursor-pointer text-sm font-medium text-[var(--color-interactive)] hover:underline">
                  See all factors, ranked by how much each adds to the score
                </summary>
                <ul className="mt-3 space-y-3 border-t border-[var(--color-border)] pt-3">
                  {rankedMetrics.map((m) => (
                    <DriverRow
                      key={m.metric_id}
                      metric={m}
                      isStrongDriver={(m.contribution ?? 0) >= meanContribution * 1.5}
                      sourcesById={sourcesById}
                    />
                  ))}
                </ul>
                {missingMetrics.length > 0 && (
                  <div className="mt-3 rounded-[var(--radius-md)] border border-dashed border-[var(--color-border-strong)] p-3">
                    <p className="text-sm font-medium text-[var(--color-text-secondary)]">Insufficient data</p>
                    <p className="mt-1 text-sm text-[var(--color-text-tertiary)]">
                      No data for this tract: {missingMetrics.map((m) => m.label).join(", ")}. Not counted as zero or
                      averaged in from elsewhere. Simply left out of this score.
                    </p>
                  </div>
                )}
              </details>

              <button
                type="button"
                onClick={() => setEvidenceOpen(true)}
                className="mt-5 text-sm font-medium text-[var(--color-interactive)] underline underline-offset-2"
              >
                View sources &amp; evidence
              </button>
            </TabPanel>

            <TabPanel id="sure" activeId={tab}>
              <div className="flex flex-wrap items-center gap-3 text-sm">
                {explanation.stability_label && <StabilityBadge label={explanation.stability_label} />}
                {explanation.data_confidence && (
                  <span className="text-[var(--color-text-secondary)]">
                    Data confidence: {Math.round(explanation.data_confidence.confidence_score * 100)}%
                  </span>
                )}
              </div>
              <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
                Stability asks whether this neighborhood stays near the top if priorities were weighted differently.
                Confidence asks how complete and precise the underlying data is. They are separate questions.
              </p>

              <details className="group mt-5 rounded-[var(--radius-md)] bg-[var(--color-surface-sunken)] p-4">
                <summary className="cursor-pointer text-sm font-medium text-[var(--color-text-primary)]">
                  How this was calculated
                </summary>
                <ScoreSummary explanation={explanation} totalTracts={totalTracts} />
              </details>
              <details className="group mt-3 rounded-[var(--radius-md)] bg-[var(--color-surface-sunken)] p-4">
                <summary className="cursor-pointer text-sm font-medium text-[var(--color-text-primary)]">
                  What this result does not mean
                </summary>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-[var(--color-text-secondary)]">
                  <li>It is not a diagnosis of this tract or the people who live there.</li>
                  <li>It does not prove that any factor shown here causes any other.</li>
                  <li>It does not by itself determine eligibility for any funding or program.</li>
                  <li>Community context and lived experience are still necessary to act on this information.</li>
                </ul>
              </details>
              <button
                type="button"
                onClick={() => setEvidenceOpen(true)}
                className="mt-5 text-sm font-medium text-[var(--color-interactive)] underline underline-offset-2"
              >
                View sources &amp; evidence
              </button>
            </TabPanel>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-[var(--color-border)] bg-[var(--color-surface)] px-5 py-3">
        <UseInAdvocateButton
          geography={{ geographyType: "tract", geoid: profile.tract_geoid_2020, displayName: profile.name_long }}
          scenarioId={scenarioId}
          sourcePage="Map"
        />
        <Button variant="secondary" size="sm" onClick={onCompare}>
          Compare
        </Button>
      </div>

      <Dialog open={evidenceOpen} onClose={() => setEvidenceOpen(false)} title="Sources and evidence" variant="side">
        <EvidenceContent explanation={explanation} sourcesById={sourcesById} />
      </Dialog>
    </div>
  );
}

export function BackButton({ onBack }: { onBack: () => void }) {
  return (
    <button
      type="button"
      onClick={onBack}
      className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
    >
      <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4" fill="none">
        <path d="M12 5l-5 5 5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      Back to the county
    </button>
  );
}

/** One of the top reasons behind a score: what it is, its real value
 * (linked to its source), where it falls among all tracts, and the source. */
function ReasonRow({
  metric,
  sourcesById,
}: {
  metric: MetricContribution;
  sourcesById: Map<string, SourceStatusEntry>;
}) {
  return (
    <li>
      <p className="text-base font-medium leading-snug text-[var(--color-text-primary)]">{metric.label}</p>
      <p className="mt-0.5 text-base font-semibold tabular-nums text-[var(--color-text-primary)]">
        {metric.raw_value !== null ? (
          <CitedValue sourceId={metric.source_id} sourcesById={sourcesById}>
            {formatMetricValue(metric.raw_value, metric.unit)}
          </CitedValue>
        ) : (
          "No data"
        )}
      </p>
      <div className="mt-2">
        <PercentileBar percentile={metric.percentile} label={`${metric.label} county percentile`} />
      </div>
      {metric.percentile !== null && (
        <p className="mt-2 text-sm font-medium text-[var(--color-text-secondary)]">
          {domainComparisonPhrase(metric.percentile)}
        </p>
      )}
      <ClampedText className="mt-1">{metric.plain_language_definition}</ClampedText>
      <p className="mt-1 text-sm text-[var(--color-text-tertiary)]">
        <SourceCitationLine sourceId={metric.source_id} fallbackText={metric.citation} sourcesById={sourcesById} />
      </p>
    </li>
  );
}

/** Shown when the focus area is a custom weighting. The API computes a
 * custom combined score and its five domain contributions on demand, but the
 * metric-level breakdown (raw values, percentiles, citations) is
 * precomputed only for the named focus areas, so this says so plainly and
 * offers the way to see the detail. */
export function CustomTractPanel({
  tractGeoid,
  focusRows,
  contributions,
  onBack,
  onSwitchToNamed,
}: {
  tractGeoid: string;
  focusRows: FocusRow[];
  contributions: CustomDomainContribution[] | null;
  onBack: () => void;
  onSwitchToNamed: () => void;
}) {
  const profileQuery = useQuery({
    queryKey: ["tract-profile", tractGeoid],
    queryFn: () => api.getTractProfile(tractGeoid),
    retry: 1,
  });
  const row = focusRows.find((r) => r.geoid === tractGeoid) ?? null;
  const total = focusRows.length;
  const percentile = row && total > 1 ? Math.round(((total - row.rank) / (total - 1)) * 100) : null;
  const values = focusRows.map((r) => r.score).filter((v): v is number => v !== null);

  return (
    <div className="h-full overflow-y-auto px-5 pb-6 pt-4">
      <BackButton onBack={onBack} />
      <h2 className="mt-4 text-2xl font-medium leading-tight text-[var(--color-text-primary)]">
        {profileQuery.data?.name_long ?? `Tract ${tractGeoid}`}
      </h2>
      <p className="mt-1 text-sm text-[var(--color-text-secondary)]">Tract ID {tractGeoid}</p>

      <div className="mt-5">
        <ScreeningScore
          score={row?.score ?? null}
          comparisonPercentile={percentile}
          totalTracts={total || null}
          scenarioLabel="your own weighting"
        />
      </div>
      {row?.score != null && values.length > 0 && (
        <div className="mt-5">
          <CountyStrip values={values} value={row.score} label="Where this neighborhood sits among all neighborhoods." />
        </div>
      )}

      {contributions && (
        <section className="mt-7">
          <h3 className="text-base font-semibold text-[var(--color-text-primary)]">How your weighting adds up here</h3>
          <ul className="mt-3 space-y-3">
            {[...contributions]
              .sort((a, b) => b.contribution - a.contribution)
              .map((c) => (
                <li key={c.domain} className="flex items-center gap-3 text-sm">
                  <span className="w-[42%] shrink-0 text-[var(--color-text-primary)]">{domainLabel(c.domain)}</span>
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--color-neutral-subtle)]">
                    <span
                      className="block h-full rounded-full"
                      style={{ width: `${Math.max(3, c.domain_score)}%`, backgroundColor: concernColorFor(c.domain_score) }}
                    />
                  </span>
                  <span className="w-10 shrink-0 text-right tabular-nums text-[var(--color-text-secondary)]">
                    {Math.round(c.domain_score)}
                  </span>
                </li>
              ))}
          </ul>
        </section>
      )}

      <p className="mt-6 text-sm text-[var(--color-text-secondary)]">
        The exact metrics, sources and uncertainty ranges are computed for the named focus areas, not for a custom
        weighting. A screening signal for closer review, not a diagnosis or a cause.
      </p>
      <Button variant="secondary" size="sm" className="mt-3" onClick={onSwitchToNamed}>
        See the full detail under Health equity overview
      </Button>
    </div>
  );
}

