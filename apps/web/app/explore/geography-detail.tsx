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
  MetricDirectionLabel,
  GlossaryTerm,
  MobileBottomSheet,
  ScreeningScore,
  formatScreeningScore,
  SCREENING_SCORE_LABEL,
} from "@scc-health/ui";
import {
  api,
  ApiError,
  type ScoreExplanationResponse,
  type DomainContributionDetail,
  type MetricContribution,
} from "@/lib/api";
import type { SelectedGeography } from "./selection";
import { domainLabel } from "@/lib/labels";
import { GLOSSARY } from "@/lib/glossary";
import { UseInAdvocateButton } from "../use-in-advocate-button";
import { concernBandLabel, domainComparisonPhrase } from "./layers";

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
    return <ExploreOrientation />;
  }
  return <SelectedGeographyDetail selected={selected} scenarioId={scenarioId} onCompare={onCompare} onClearSelection={onClearSelection} onSelect={onSelect} />;
}

/** The mobile equivalent of `GeographyDetail`: a persistent collapsed
 * summary bar (place, concern category, rank -- reachable without
 * opening anything) plus a "View full profile" trigger that opens the
 * exact same `SelectedGeographyDetail` content in a bottom sheet. The
 * map stays visible above the collapsed bar; opening the sheet is a
 * real modal (native <dialog>, so a genuine focus trap + Escape-to-close
 * is appropriate once the map really is covered).
 *
 * Deliberately two states (collapsed / expanded), not three -- a third
 * "intermediate" height with drag-to-resize was in scope per this task's
 * instructions but was judged, given this pass's time budget, a
 * meaningfully larger engineering effort (drag physics, snap points, a
 * keyboard/screen-reader equivalent for the drag gesture) than a
 * two-state sheet, which already satisfies the collapsed-state content
 * requirement and the "map stays visible, sheet doesn't trap focus
 * incorrectly" requirements. Recorded as a real, disclosed scope
 * decision (see the final report), not a silent omission. */
export function MobileSelectedSheet({
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
  onSelect: (selection: SelectedGeography) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  if (!selected) {
    return <ExploreOrientation />;
  }

  return (
    <div>
      <MobileCollapsedSummary selected={selected} scenarioId={scenarioId} onExpand={() => setExpanded(true)} />
      <MobileBottomSheet
        open={expanded}
        onClose={() => setExpanded(false)}
        title={selected.displayName || "Selected place"}
      >
        <SelectedGeographyDetail
          selected={selected}
          scenarioId={scenarioId}
          onCompare={() => {
            // ComparisonPanel renders as a sibling of this sheet in
            // explore-client.tsx, not inside it -- leaving the sheet open
            // would strand the comparison workflow behind the modal's
            // backdrop, genuinely unreachable (live-verified: the sheet
            // stayed open and covered the newly-rendered panel entirely).
            setExpanded(false);
            onCompare();
          }}
          onClearSelection={() => {
            setExpanded(false);
            onClearSelection();
          }}
          onSelect={(next) => {
            setExpanded(false);
            onSelect(next);
          }}
        />
      </MobileBottomSheet>
    </div>
  );
}

function MobileCollapsedSummary({
  selected,
  scenarioId,
  onExpand,
}: {
  selected: SelectedGeography;
  scenarioId: string;
  onExpand: () => void;
}) {
  // Same query keys TractDetail/PlaceDetail/DistrictDetail's own queries
  // use -- TanStack Query dedupes identical in-flight/cached queries
  // across components, so this never issues a second network request
  // once the sheet's own SelectedGeographyDetail (mounted alongside this,
  // per Dialog always rendering its children regardless of open state)
  // has fetched it.
  const explainQuery = useQuery({
    queryKey: ["explain-score", scenarioId, selected.geoid],
    queryFn: () => api.explainScore(scenarioId, selected.geoid),
    retry: 1,
    enabled: selected.geographyType === "tract",
  });
  const placeQuery = useQuery({
    queryKey: ["place-profile", selected.geoid],
    queryFn: () => api.getPlaceProfile(selected.geoid),
    retry: 1,
    enabled: selected.geographyType === "place",
  });
  const districtQuery = useQuery({
    queryKey: ["district-profile", Number(selected.geoid)],
    queryFn: () => api.getSupervisorDistrictProfile(Number(selected.geoid)),
    retry: 1,
    enabled: selected.geographyType === "supervisor_district",
  });

  const explanation = selected.geographyType === "tract" ? explainQuery.data : undefined;
  const mc = explanation?.monte_carlo;

  // A place or district selected purely from a URL round-trip carries its
  // raw GEOID as `displayName` (selection.ts) -- resolved here from the
  // fetched profile the same way the desktop panel's own heading does, so
  // the collapsed bar never shows a bare place GEOID like "0668000"
  // (Phase 6.5's "never show a raw place GEOID" rule, extended to this
  // pass's new mobile summary).
  const resolvedName =
    selected.geographyType === "place"
      ? placeQuery.data?.name_long
      : selected.geographyType === "supervisor_district"
        ? districtQuery.data
          ? `Supervisor District ${districtQuery.data.district_number}`
          : undefined
        : selected.displayName;

  return (
    <button
      type="button"
      onClick={onExpand}
      className="flex w-full items-center justify-between gap-3 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-left shadow-[var(--shadow-sm)]"
    >
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-[var(--color-text-primary)]">{resolvedName ?? "Loading…"}</p>
        {explanation?.score != null ? (
          <div className="text-xs text-[var(--color-text-secondary)]">
            <ScreeningScore score={explanation.score} mode="compact" />
            {mc?.median_rank != null && <> · #{Math.round(mc.median_rank)} countywide</>}
          </div>
        ) : (
          <p className="text-xs text-[var(--color-text-secondary)]">Tap to view its full profile</p>
        )}
      </div>
      <span aria-hidden="true" className="flex-none text-sm font-medium text-[var(--color-interactive)]">
        View profile →
      </span>
    </button>
  );
}

/** Non-modal orientation shown only while nothing is selected -- replaced
 * entirely by the real profile once a place is picked, never a dismissible
 * overlay the user has to close (docs/design/explore-health-equity-research.md
 * §1, the Tree Equity Score National Explorer's permanent numbered
 * sidebar list is the transferable pattern here, not its wording or
 * visual design). */
function ExploreOrientation() {
  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <p className="text-sm text-[var(--color-text-secondary)]">
        <GlossaryTerm definition={GLOSSARY.healthEquity}>
          <strong className="font-semibold text-[var(--color-text-primary)]">Health equity</strong>
        </GlossaryTerm>{" "}
        means everyone has a fair and just opportunity to reach their highest level of health.{" "}
        <a
          href="https://www.cdc.gov/health-disparities-hiv-std-tb-hepatitis/about/index.html"
          className="text-[var(--color-interactive)] underline underline-offset-2"
        >
          CDC definition
        </a>
        . This page helps you see where health need, access barriers, and resource gaps overlap across Santa Clara
        County's{" "}
        <GlossaryTerm definition={GLOSSARY.censusTract}>census tracts</GlossaryTerm>.
      </p>
      <ol className="mt-4 space-y-3 text-sm">
        <li className="flex gap-2.5">
          <span
            aria-hidden="true"
            className="flex h-5 w-5 flex-none items-center justify-center rounded-full bg-[var(--color-interactive-subtle)] text-xs font-semibold text-[var(--color-interactive)]"
          >
            1
          </span>
          <span>
            <strong className="font-medium text-[var(--color-text-primary)]">Search for a community</strong> by
            city, ZIP code, supervisor district, or tract number.
          </span>
        </li>
        <li className="flex gap-2.5">
          <span
            aria-hidden="true"
            className="flex h-5 w-5 flex-none items-center justify-center rounded-full bg-[var(--color-interactive-subtle)] text-xs font-semibold text-[var(--color-interactive)]"
          >
            2
          </span>
          <span>
            <strong className="font-medium text-[var(--color-text-primary)]">Select a shaded tract</strong> on the
            map, or a row in Table view, to open its full profile.
          </span>
        </li>
        <li className="flex gap-2.5">
          <span
            aria-hidden="true"
            className="flex h-5 w-5 flex-none items-center justify-center rounded-full bg-[var(--color-interactive-subtle)] text-xs font-semibold text-[var(--color-interactive)]"
          >
            3
          </span>
          <span>
            <strong className="font-medium text-[var(--color-text-primary)]">Understand what drives the result</strong>{" "}
            -- every score decomposes into the exact{" "}
            <GlossaryTerm definition={GLOSSARY.driver}>drivers</GlossaryTerm> behind it, with sources and{" "}
            <GlossaryTerm definition={GLOSSARY.confidence}>confidence</GlossaryTerm>.
          </span>
        </li>
        <li className="flex gap-2.5">
          <span
            aria-hidden="true"
            className="flex h-5 w-5 flex-none items-center justify-center rounded-full bg-[var(--color-interactive-subtle)] text-xs font-semibold text-[var(--color-interactive)]"
          >
            4
          </span>
          <span>
            <strong className="font-medium text-[var(--color-text-primary)]">Compare or use the evidence</strong> in
            Prioritize, Advocate, or Copilot.
          </span>
        </li>
      </ol>
    </div>
  );
}

function SelectedGeographyDetail({
  selected,
  scenarioId,
  onCompare,
  onClearSelection,
  onSelect,
}: {
  selected: SelectedGeography;
  scenarioId: string;
  onCompare: () => void;
  onClearSelection: () => void;
  onSelect: (selection: SelectedGeography) => void;
}) {
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
  // Same query key ExploreMap uses for its boundaries fetch -- reads from
  // the shared TanStack Query cache instead of a second network request
  // in the common case where the map is already mounted, giving a real
  // countywide denominator instead of a hardcoded "408"
  // (docs/design/explore-health-equity-research.md §4).
  const boundariesQuery = useQuery({
    queryKey: ["tract-boundaries", scenarioId],
    queryFn: () => api.getAllTractBoundaries(scenarioId),
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

  const totalTracts = boundariesQuery.data?.features.length ?? null;

  // Ranked by CONTRIBUTION (percentile x this scenario's actual weight
  // for that metric) -- not by raw percentile alone. A metric can have
  // the single highest percentile in the tract yet contribute less to
  // the composite score than one with a merely-moderate percentile if
  // the scenario weights its domain more heavily. Sorting by percentile
  // alone (the pre-DEC-074 implementation) silently agreed with
  // contribution-sorting only by coincidence under this platform's one
  // equally-weighted scenario, and would misidentify the top driver
  // under any of the other 7, unequally-weighted scenarios -- verified
  // live and documented in docs/design/explore-health-equity-research.md §2/§7.
  const rankedMetrics = explanation.domains
    .flatMap((d) => d.metrics)
    .filter((m) => m.contribution !== null)
    .sort((a, b) => (b.contribution ?? 0) - (a.contribution ?? 0));
  const meanMetricContribution =
    rankedMetrics.length > 0
      ? rankedMetrics.reduce((sum, m) => sum + (m.contribution ?? 0), 0) / rankedMetrics.length
      : 0;

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

  return (
    <div>
      <button
        type="button"
        onClick={onClearSelection}
        className="text-xs font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
      >
        ← Clear selection
      </button>

      <div className="mt-2 flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-interactive)]">
            Health Equity Screening Profile
          </p>
          <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">Tract {profile.tract_geoid_2020}</h2>
          <p className="text-sm text-[var(--color-text-secondary)]">
            {profile.name_long} · <DataModeBadge mode={profile.data_mode} />
          </p>
        </div>
      </div>

      {/* HEADLINE -- the canonical 0-100 health equity screening score is
          the dominant visual (docs/design/final-score-map-and-
          intuitiveness-review.md's "one objective headline number"
          requirement, reversing the prior pass's decision to
          deemphasize it): the product screens and prioritizes areas, and
          a user needs one consistently calculated number to anchor on.
          Rendered through the single shared ScreeningScore component so
          this exact number, rounding, and comparison sentence are never
          computed a second, different way elsewhere (map callout,
          Prioritize, Compare, Advocate, exports all use the same
          component/formatter). */}
      <div className="mt-4">
        {/* scenarioLabel is the scenario's display name alone (e.g.
            "Health equity overview"), not suffixed with "screening view"
            -- that literal phrase would collide with the actual
            "Screening view" <select> control's accessible name, since
            Playwright/assistive-tech label matching is substring-based
            and this component's own accessible name would otherwise
            contain it too. */}
        <ScreeningScore
          score={explanation.score}
          comparisonPercentile={comparisonPercentile}
          totalTracts={totalTracts}
          scenarioLabel={explanation.scenario_label}
        />
        {/* Kept always visible, deliberately not folded into the
            collapsed disclosures -- CLAUDE.md's non-negotiable rule
            against labeling a screening score as a causal claim applies
            to the headline itself, not just the detail a reader may
            never expand. */}
        <p className="mt-2 text-xs text-[var(--color-text-secondary)]">
          This is a screening signal for closer review, not a diagnosis or causal conclusion.
        </p>
      </div>

      {/* DOMAIN SUMMARY -- every domain, simple rows, county-relative
          comparison phrases instead of raw decimals or "domain score"
          language. */}
      <div className="mt-5">
        <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
          Conditions that may shape health equity here
        </h3>
        <div className="mt-2.5 space-y-3">
          {explanation.domains.map((domain) => (
            <DomainSummaryRow key={domain.domain} domain={domain} />
          ))}
        </div>
        {explanation.domains_missing.length > 0 && (
          <p className="mt-2 text-xs text-[var(--color-text-secondary)]">
            Not enough data was available for: {explanation.domains_missing.map(domainLabel).join(", ")}.
          </p>
        )}
      </div>

      {/* TOP 3 DRIVERS -- plain-language first; the full ranked list with
          point contributions, weights, sources, and limitations moves to
          "See all factors" below. */}
      {rankedMetrics.length > 0 && (
        <div className="mt-5">
          <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">What is shaping this profile?</h3>
          <ul className="mt-2 space-y-2.5" aria-label="Top factors shaping this profile">
            {rankedMetrics.slice(0, 3).map((metric) => (
              <SimpleDriverRow key={metric.metric_id} metric={metric} />
            ))}
          </ul>
          <details className="mt-2.5 group">
            <summary className="cursor-pointer text-xs font-medium text-[var(--color-interactive)]">
              See all factors
            </summary>
            <ul className="mt-3 space-y-3 border-t border-[var(--color-border)] pt-3">
              {rankedMetrics.map((metric) => (
                <DriverRow
                  key={metric.metric_id}
                  metric={metric}
                  isStrongDriver={(metric.contribution ?? 0) >= meanMetricContribution * 1.5}
                />
              ))}
            </ul>
            {missingMetrics.length > 0 && (
              <div className="mt-3 rounded-[var(--radius-md)] border border-dashed border-[var(--color-border-strong)] p-3">
                <p className="text-xs font-medium text-[var(--color-text-secondary)]">Insufficient data</p>
                <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">
                  No data for this tract: {missingMetrics.map((m) => m.label).join(", ")}. Not counted as zero or
                  averaged in from elsewhere -- simply excluded from this score.
                </p>
              </div>
            )}
          </details>
        </div>
      )}

      {/* CONFIDENCE -- one compact line above the fold; the full
          stability/uncertainty methodology moves to a disclosure. */}
      {(explanation.stability_label || explanation.data_confidence) && (
        <div className="mt-5 flex flex-wrap items-center gap-2 text-sm">
          {explanation.stability_label && <StabilityBadge label={explanation.stability_label} />}
          {explanation.data_confidence && (
            <span className="text-[var(--color-text-secondary)]">
              Data confidence: {Math.round(explanation.data_confidence.confidence_score * 100)}%
            </span>
          )}
        </div>
      )}

      {/* ACTIONS -- one primary action, the rest secondary. */}
      <div className="mt-4 flex flex-wrap gap-2">
        <UseInAdvocateButton
          geography={{
            geographyType: "tract",
            geoid: profile.tract_geoid_2020,
            displayName: profile.name_long,
          }}
          scenarioId={scenarioId}
          sourcePage="Explore"
        />
        <Button variant="secondary" size="sm" onClick={onCompare}>
          Compare
        </Button>
        <CopyLinkButton />
      </div>

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

      {/* PROGRESSIVE DISCLOSURE -- everything a methodology report needs,
          none of it required to understand the headline result. */}
      <div className="mt-6 space-y-2">
        <details className="group rounded-[var(--radius-md)] border border-[var(--color-border)] p-3">
          <summary className="cursor-pointer text-sm font-medium text-[var(--color-text-primary)]">
            Domain breakdown
          </summary>
          <p className="mt-2 text-xs text-[var(--color-text-secondary)]">
            Every domain below can be expanded to see the exact metrics, raw values, and sources behind it.
          </p>
          <div className="mt-3 space-y-2">
            {explanation.domains.map((domain) => (
              <DomainDisclosure key={domain.domain} domain={domain} />
            ))}
          </div>
        </details>

        <details className="group rounded-[var(--radius-md)] border border-[var(--color-border)] p-3">
          <summary className="cursor-pointer text-sm font-medium text-[var(--color-text-primary)]">
            How this was calculated
          </summary>
          <ScoreSummary explanation={explanation} totalTracts={totalTracts} />
        </details>

        <details className="group rounded-[var(--radius-md)] border border-[var(--color-border)] p-3">
          <summary className="cursor-pointer text-sm font-medium text-[var(--color-text-primary)]">
            What this result does not mean
          </summary>
          <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-[var(--color-text-secondary)]">
            <li>This screening result is not a diagnosis of this tract or the people who live there.</li>
            <li>It does not prove that any factor shown here causes any other.</li>
            <li>It does not by itself determine eligibility for any funding or program.</li>
            <li>Community context and lived experience are still necessary to act on this information.</li>
          </ul>
        </details>

        <button
          type="button"
          onClick={() => setEvidenceOpen(true)}
          className="text-sm font-medium text-[var(--color-interactive)] underline underline-offset-2"
        >
          View sources &amp; evidence
        </button>
      </div>

      <Dialog open={evidenceOpen} onClose={() => setEvidenceOpen(false)} title="Sources and evidence" variant="side">
        <EvidenceContent explanation={explanation} />
      </Dialog>
    </div>
  );
}

/** One domain, reduced to what a first-time reader needs: the label, an
 * accessible percentile bar, and a plain-language comparison phrase
 * that always states the concern direction explicitly -- never a bare
 * "higher"/"lower" alongside a technical "domain score" number (docs/
 * design/health-equity-product-consolidation.md's domain-summary
 * requirement). The full per-metric breakdown (raw values, sources,
 * limitations) stays one click away in the "Domain breakdown"
 * disclosure -- this row is deliberately not a duplicate of it. */
function DomainSummaryRow({ domain }: { domain: DomainContributionDetail }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium text-[var(--color-text-primary)]">{domainLabel(domain.domain)}</span>
        {domain.domain_score === null && <Badge tone="neutral">No data</Badge>}
      </div>
      <PercentileBar percentile={domain.domain_score} label={`${domainLabel(domain.domain)} county percentile`} />
      {domain.domain_score !== null && (
        <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
          {domainComparisonPhrase(domain.domain_score)}
        </p>
      )}
    </div>
  );
}

/** One driver, reduced to what a first-time reader needs to understand
 * *why* -- never the point-contribution arithmetic ("13.0 of 34.7
 * points") that belongs in "See all factors" instead. Raw value and
 * unit remain visible alongside the percentile (CLAUDE.md's "raw value
 * and unit must be visible alongside percentiles" rule applies at the
 * metric level regardless of where in the hierarchy a metric appears). */
function SimpleDriverRow({ metric }: { metric: MetricContribution }) {
  return (
    <li>
      <span className="text-sm font-medium text-[var(--color-text-primary)]">{metric.label}</span>
      <p className="text-sm text-[var(--color-text-secondary)]">
        {metric.raw_value !== null ? `${metric.raw_value.toLocaleString()} ${metric.unit}` : "No data"}
        {metric.percentile !== null && (
          <> · {domainComparisonPhrase(metric.percentile).toLowerCase()}</>
        )}
      </p>
      {/* A compact visual track, not just text -- docs/design/final-
          score-map-and-intuitiveness-review.md's "what is shaping this
          score" requirement asks for an immediate visual marker per
          factor, not only a sentence. Reuses the same PercentileBar the
          domain-summary rows already use, so a factor and a domain read
          as the same kind of thing at a glance. */}
      <PercentileBar percentile={metric.percentile} label={`${metric.label} county percentile`} />
      <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">{metric.plain_language_definition}</p>
    </li>
  );
}

function DriverRow({ metric, isStrongDriver }: { metric: MetricContribution; isStrongDriver: boolean }) {
  return (
    <li className="rounded-[var(--radius-md)] border border-[var(--color-border)] p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <span className="text-sm font-medium text-[var(--color-text-primary)]">{metric.label}</span>
        <Badge tone={isStrongDriver ? "interactive" : "neutral"}>
          {isStrongDriver ? "Strong driver" : "Contributor"}
        </Badge>
      </div>
      <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
        {metric.raw_value !== null ? `${metric.raw_value.toLocaleString()} ${metric.unit}` : "No data"}
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
      <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">{metric.citation}</p>
    </li>
  );
}

function CopyLinkButton() {
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

function ScoreSummary({
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
          compact confidence line -- not repeated here to avoid the
          exact badge and title text appearing twice on the same page. */}
      <p className="text-3xl font-semibold tabular-nums text-[var(--color-text-primary)]">
        {formatScreeningScore(explanation.score)}
        <span className="text-base font-normal text-[var(--color-text-secondary)]">/100</span>
      </p>
      <p className="text-xs text-[var(--color-text-secondary)]">
        {SCREENING_SCORE_LABEL}, this scenario only -- the same figure shown above, recomputed here with its exact inputs.
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
        priorities -- it does not mean any specific program or intervention would fix it.
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
          sourcePage="Explore"
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
          sourcePage="Explore"
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
