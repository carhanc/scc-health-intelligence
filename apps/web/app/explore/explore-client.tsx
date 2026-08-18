"use client";

import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { SegmentedControl, SkeletonText, ScreeningScore } from "@scc-health/ui";
import { api, type TractBoundaryFeatureProperties } from "@/lib/api";
import { useMediaQuery } from "@/lib/use-media-query";
import { SearchPanel } from "./search-panel";
import { ExploreTable } from "./explore-table";
import { GeographyDetail, MobileSelectedSheet } from "./geography-detail";
import { ComparisonPanel } from "./comparison-panel";
import { parseSelectedGeographyFromParams, type SelectedGeography } from "./selection";
import { MAP_LAYERS } from "./layers";
import { WeightBreakdown } from "../weight-breakdown";

const ExploreMap = dynamic(() => import("./explore-map").then((m) => m.ExploreMap), {
  ssr: false,
  loading: () => <SkeletonText lines={6} className="h-[480px]" />,
});

const DEFAULT_SCENARIO_ID = "default_integrated_screen_v1";

export function ExploreClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Matches the lg breakpoint the sidebar+map grid itself activates at
  // (1024px, see the grid comment below) -- below it, a selected
  // geography opens in a bottom sheet instead of the inline sidebar
  // profile, since the tall inline panel is what pushed the map far down
  // the page on mobile before the first redesign pass (fixed for the
  // *search box* then; the *selected-profile* panel had the same
  // underlying "very long single column" problem, addressed there and
  // preserved here). The two-surface sidebar+map layout (vs. the prior
  // three-column one) needs only one fixed-width column, so it can
  // activate at a narrower breakpoint than before -- more devices get
  // the map-dominant desktop experience, not just very wide screens.
  const isDesktopLayout = useMediaQuery("(min-width: 1024px)");

  // Lifted from ExploreMap so the sidebar's "Quick preview" can render
  // hovered-tract data while nothing is selected -- in that state the
  // map itself stays completely unobscured (no floating hover card),
  // per docs/design/final-score-map-and-intuitiveness-review.md's
  // hover/selection interaction model.
  const [hoveredTract, setHoveredTract] = useState<TractBoundaryFeatureProperties | null>(null);

  // Only a well-formed, in-county canonical GEOID is ever treated as a
  // real selection -- this is what stops a malformed or hand-edited URL
  // from reaching the profile API (Phase 5 hotfix: see selection.ts).
  const selected: SelectedGeography | null = parseSelectedGeographyFromParams(
    searchParams.get("geography"),
    searchParams.get("id"),
  );
  const scenarioId = searchParams.get("scenario") ?? DEFAULT_SCENARIO_ID;
  const view = (searchParams.get("tab") as "map" | "table" | null) ?? "map";
  const comparing = searchParams.get("compare") === "1";

  const scenariosQuery = useQuery({
    queryKey: ["scenarios"],
    queryFn: api.getScenarios,
    retry: 1,
    staleTime: 10 * 60 * 1000,
  });

  const updateParams = useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value === null) params.delete(key);
        else params.set(key, value);
      }
      router.push(`/explore?${params.toString()}`);
    },
    [router, searchParams],
  );

  // The one canonical selection entry point -- map, table, and search all
  // call this with the same SelectedGeography shape, so they can never
  // again disagree about what a "selection" is (Phase 5 hotfix).
  function handleGeographySelect(selection: SelectedGeography) {
    updateParams({ geography: selection.geographyType, id: selection.geoid, compare: null });
  }

  function handleClearSelection() {
    updateParams({ geography: null, id: null, compare: null });
  }

  const activeScenario = scenariosQuery.data?.scenarios.find((s) => s.scenario_id === scenarioId);

  return (
    <div className="mx-auto max-w-[var(--container-max)] px-4 py-4 sm:px-6 lg:px-8 lg:py-5">
      {/* Compact header -- a page title, the scenario picker (this is the
          one control that changes the computed score itself, so it
          belongs at page level, not buried in the sidebar), and the
          Map/Table toggle, in place of the prior six stacked
          label+control+description rows a user had to read past before
          any map content appeared (docs/design/
          health-equity-product-consolidation.md §2/§7). */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-[var(--color-text-primary)] sm:text-2xl">Explore health equity</h1>
        <SegmentedControl
          label="View"
          value={view}
          onChange={(value) => updateParams({ tab: value === "map" ? null : value })}
          options={[
            { value: "map", label: "Map" },
            { value: "table", label: "Table" },
          ]}
        />
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1">
        <label className="flex items-center gap-2 text-sm">
          <span className="font-medium text-[var(--color-text-primary)]">Screening view</span>
          <select
            value={scenarioId}
            onChange={(e) => updateParams({ scenario: e.target.value })}
            className="rounded-[var(--radius-md)] border border-[var(--color-border)] px-2.5 py-1.5 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-focus-ring)]"
          >
            {scenariosQuery.data?.scenarios.map((s) => (
              <option key={s.scenario_id} value={s.scenario_id}>
                {s.label}
              </option>
            ))}
            {!scenariosQuery.data && <option value={scenarioId}>Health equity overview</option>}
          </select>
        </label>
        {activeScenario && (
          <p className="text-xs text-[var(--color-text-secondary)]">{activeScenario.description}</p>
        )}
      </div>

      {/* Connects "the view I picked" to "why the map and every score
          look the way they do" -- a Health Advocacy Commission review
          found no copy anywhere made this link explicit, and the
          screening view's actual weighting was never shown alongside the
          control that picks it. */}
      {activeScenario && (
        <div className="mt-2 max-w-sm rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-sunken)] p-3">
          <p className="text-xs text-[var(--color-text-secondary)]">
            The map colors and every tract&rsquo;s score below use {activeScenario.label}&rsquo;s weighting,
            shown here:
          </p>
          <div className="mt-2">
            <WeightBreakdown weights={activeScenario.weights} compact />
          </div>
        </div>
      )}

      {/* Two surfaces, not three: a sidebar (search + guide, or search +
          selected profile) and the map, which now gets the large
          majority of the horizontal space instead of a narrow middle
          column (docs/design/health-equity-product-consolidation.md §4).
          The sidebar needs real width for the selected profile's driver
          rows to stay legible, so this activates at lg (1024px) --
          narrower than the prior 3-column layout could, since there's
          only one fixed-width column now, not two. */}
      <div className="mt-4 grid grid-cols-1 gap-5 lg:grid-cols-[380px_minmax(0,1fr)]">
        <div className="order-1 lg:max-h-[calc(100vh-200px)] lg:overflow-y-auto lg:pr-1">
          <SearchPanel selected={selected} onSelect={handleGeographySelect} compact={!!selected} />
          {!selected && view === "map" && (
            <div className="mt-4">
              <QuickPreview properties={hoveredTract} />
            </div>
          )}
          {isDesktopLayout ? (
            <div className="mt-4">
              <GeographyDetail
                selected={selected}
                scenarioId={scenarioId}
                onCompare={() => updateParams({ compare: "1" })}
                onClearSelection={handleClearSelection}
                onSelect={handleGeographySelect}
              />
            </div>
          ) : null}
          {comparing && selected?.geographyType === "tract" && (
            <div className="mt-4">
              <ComparisonPanel
                baseTractGeoid={selected.geoid}
                scenarioId={scenarioId}
                onClose={() => updateParams({ compare: null })}
              />
            </div>
          )}
        </div>

        <div className="order-2">
          {view === "map" ? (
            <ExploreMap
              scenarioId={scenarioId}
              selected={selected}
              onSelect={handleGeographySelect}
              onHoverChange={setHoveredTract}
            />
          ) : (
            <ExploreTable
              scenarioId={scenarioId}
              selectedTractId={selected?.geographyType === "tract" ? selected.geoid : null}
              onSelectTract={handleGeographySelect}
            />
          )}
        </div>
      </div>

      {/* Below lg, the sidebar's selected-profile content moves into the
          mobile bottom sheet instead of the scrolling column above (same
          split point the mobile-sheet pass already validated); this
          renders in normal document flow, after the map, matching the
          existing mobile interaction (map first, collapsed bar beneath
          it, full profile on demand). */}
      {!isDesktopLayout && (
        <div className="mt-4">
          <MobileSelectedSheet
            selected={selected}
            scenarioId={scenarioId}
            onCompare={() => updateParams({ compare: "1" })}
            onClearSelection={handleClearSelection}
            onSelect={handleGeographySelect}
          />
        </div>
      )}
    </div>
  );
}

/** The no-selection hover surface: hovering a tract on the map updates
 * this sidebar panel instead of a floating card over the map itself, so
 * the map stays completely unobscured while nothing is selected
 * (docs/design/final-score-map-and-intuitiveness-review.md's hover
 * interaction model -- chosen over a full floating inspector after
 * comparing both against a hybrid used once something *is* selected,
 * see TinyHoverCallout in explore-map.tsx). Contains only what's needed
 * for a first glance: name, the canonical score, concern band, top two
 * domains, a confidence flag when coverage is thin, and a prompt toward
 * the full profile -- never the complete driver analysis, which stays
 * one click away. */
function QuickPreview({ properties }: { properties: TractBoundaryFeatureProperties | null }) {
  if (!properties) {
    return (
      <div className="rounded-[var(--radius-lg)] border border-dashed border-[var(--color-border)] px-4 py-3 text-sm text-[var(--color-text-secondary)]">
        Quick preview -- point at a shaded tract on the map to see its screening score here.
      </div>
    );
  }

  const topDomains = MAP_LAYERS.filter((l) => l.id !== "score" && l.id !== "confidence")
    .map((l) => ({ label: l.label, value: l.getValue(properties) }))
    .filter((d): d is { label: string; value: number } => d.value !== null)
    .sort((a, b) => b.value - a.value)
    .slice(0, 2);

  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-tertiary)]">Quick preview</p>
      <p className="mt-1 truncate text-sm font-semibold text-[var(--color-text-primary)]">{properties.name}</p>
      {properties.score !== null ? (
        <>
          <ScreeningScore score={properties.score} mode="compact" className="mt-1" />
          {topDomains.length > 0 && (
            <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
              Top factors: {topDomains.map((d) => d.label.toLowerCase()).join(", ")}
            </p>
          )}
          {properties.coverage_fraction !== null && properties.coverage_fraction < 0.7 && (
            <p className="mt-1 text-xs text-[var(--color-caution-strong)]">Limited data for this tract</p>
          )}
        </>
      ) : (
        <p className="mt-1 text-sm text-[var(--color-text-secondary)]">No score for this scenario</p>
      )}
      <p className="mt-2 text-xs text-[var(--color-text-tertiary)]">Select the tract for its full profile.</p>
    </div>
  );
}
