"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { SkeletonText } from "@scc-health/ui";
import { SearchPanel } from "./search-panel";
import { ExploreTable } from "./explore-table";
import { GeographyDetail } from "./geography-detail";
import { ComparisonPanel } from "./comparison-panel";
import { parseSelectedGeographyFromParams, type SelectedGeography } from "./selection";
import { FocusPicker } from "../focus-picker";
import { WeightBreakdown } from "../weight-breakdown";
import { CUSTOM_SCENARIO_ID } from "../prioritize/scenario-selector";
import { DEFAULT_WEIGHTS } from "../prioritize/weight-sliders";

const DEFAULT_SCENARIO_ID = "default_integrated_screen_v1";

// MapLibre touches window/canvas at module load time -- must stay
// client-only. Only loaded once the browse view actually needs it (a
// tract is not yet selected), never while a full profile is open.
const ExploreMap = dynamic(() => import("./explore-map").then((m) => m.ExploreMap), {
  ssr: false,
  loading: () => (
    <div className="flex h-[420px] w-full items-center justify-center rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface-sunken)]">
      <SkeletonText lines={2} className="w-48" />
    </div>
  ),
});

type BrowseView = "map" | "table";

/** Explore's job is to understand ONE place deeply -- browsing/ranking
 * every tract at once is Prioritize's job, not this page's. The map is
 * the visual way to find that one place: it shows exactly the same
 * scores as the current screening view above it (never a different
 * calculation), and clicking a tract opens the same full profile a
 * search or table row would. It stays scoped to the "browsing" state --
 * once a tract is selected, the page shows that tract's full profile
 * instead of competing with it for space, with a clear way back to
 * browsing. */
export function ExploreClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [showChangeView, setShowChangeView] = useState(false);
  // "See county priorities" on Overview deep-links straight to the
  // ranked table (?tab=table); every other entry point defaults to the
  // map, which is the primary way to find one place.
  const [browseView, setBrowseView] = useState<BrowseView>(
    searchParams.get("tab") === "table" ? "table" : "map",
  );

  const selected: SelectedGeography | null = parseSelectedGeographyFromParams(
    searchParams.get("geography"),
    searchParams.get("id"),
  );
  const scenarioId = searchParams.get("scenario") ?? DEFAULT_SCENARIO_ID;
  const isCustom = scenarioId === CUSTOM_SCENARIO_ID;
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

  function handleGeographySelect(selection: SelectedGeography) {
    updateParams({ geography: selection.geographyType, id: selection.geoid, compare: null });
  }

  function handleClearSelection() {
    updateParams({ geography: null, id: null, compare: null });
  }

  const activeScenario = scenariosQuery.data?.scenarios.find((s) => s.scenario_id === scenarioId);
  const currentViewLabel = isCustom ? "Custom view" : (activeScenario?.label ?? "Health equity overview");

  return (
    <div className="mx-auto max-w-[var(--container-max)] px-4 py-4 sm:px-6 lg:px-8 lg:py-5">
      <h1 className="text-xl font-semibold text-[var(--color-text-primary)] sm:text-2xl">Explore health equity</h1>
      <p className="mt-1 max-w-2xl text-sm text-[var(--color-text-secondary)]">
        Choose a community to see its screening score and exactly what drives it, with every number sourced.
      </p>

      {/* SCREENING VIEW -- collapsed by default (matches Prioritize's own
          "Adjust priorities" pattern, so this control looks and behaves
          the same everywhere it appears) with the active view's real
          weighting always visible next to it, not behind a click. Every
          tract's score below uses this weighting -- there is exactly one
          place on this page that states the numbers, not two. */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface-sunken)] p-3">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-[var(--color-text-secondary)]">Screening view:</span>
          <span className="font-medium text-[var(--color-text-primary)]">{currentViewLabel}</span>
          <button
            type="button"
            onClick={() => setShowChangeView((v) => !v)}
            aria-expanded={showChangeView}
            className="font-medium text-[var(--color-interactive)] hover:underline"
          >
            {showChangeView ? "Hide" : "Change view"}
          </button>
        </div>
        {activeScenario && !isCustom && (
          <div className="w-full sm:w-auto sm:min-w-[280px]">
            <WeightBreakdown weights={activeScenario.weights} compact />
          </div>
        )}
      </div>

      {showChangeView && (
        <div className="mt-3 max-w-2xl rounded-[var(--radius-lg)] border border-[var(--color-border)] p-4">
          <FocusPicker
            selectedScenarioId={scenarioId}
            onSelect={(id) => {
              updateParams({ scenario: id === DEFAULT_SCENARIO_ID ? null : id });
              setShowChangeView(false);
            }}
            customWeights={DEFAULT_WEIGHTS}
            onCustomWeightsChange={() => {
              // Explore's per-tract driver detail (raw values, percentiles,
              // citations) only exists for the 8 precomputed named
              // scenarios -- a custom weighting has no equivalent
              // metric-level data to show here honestly. Prioritize
              // already supports full custom weighting with a real,
              // recomputed ranked list, so that's where "Create a custom
              // focus" sends the user instead of faking support for it here.
              router.push("/prioritize");
            }}
          />
          <p className="mt-3 text-xs text-[var(--color-text-secondary)]">
            Want to set your own weights and see how rankings change?{" "}
            <Link href="/prioritize" className="text-[var(--color-interactive)] underline underline-offset-2">
              Adjust priorities in Prioritize →
            </Link>
          </p>
        </div>
      )}

      <div className="mt-5">
        <SearchPanel selected={selected} onSelect={handleGeographySelect} compact={!!selected} />
      </div>

      {selected ? (
        <div className="mt-4">
          <GeographyDetail
            selected={selected}
            scenarioId={scenarioId}
            onCompare={() => updateParams({ compare: "1" })}
            onClearSelection={handleClearSelection}
            onSelect={handleGeographySelect}
          />
          {comparing && selected.geographyType === "tract" && (
            <div className="mt-4">
              <ComparisonPanel
                baseTractGeoid={selected.geoid}
                scenarioId={scenarioId}
                onClose={() => updateParams({ compare: null })}
              />
            </div>
          )}
        </div>
      ) : (
        <div className="mt-4">
          <GeographyDetail
            selected={null}
            scenarioId={scenarioId}
            onCompare={() => updateParams({ compare: "1" })}
            onClearSelection={handleClearSelection}
            onSelect={handleGeographySelect}
          />
          <div className="mt-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">Or browse all 408 tracts</h2>
              <div
                role="group"
                aria-label="Browse view"
                className="flex overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border)] text-xs"
              >
                <button
                  type="button"
                  onClick={() => setBrowseView("map")}
                  aria-pressed={browseView === "map"}
                  className={`px-3 py-1.5 font-medium ${
                    browseView === "map"
                      ? "bg-[var(--color-interactive)] text-[var(--color-text-on-interactive)]"
                      : "bg-[var(--color-surface)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-sunken)]"
                  }`}
                >
                  Map
                </button>
                <button
                  type="button"
                  onClick={() => setBrowseView("table")}
                  aria-pressed={browseView === "table"}
                  className={`border-l border-[var(--color-border)] px-3 py-1.5 font-medium ${
                    browseView === "table"
                      ? "bg-[var(--color-interactive)] text-[var(--color-text-on-interactive)]"
                      : "bg-[var(--color-surface)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-sunken)]"
                  }`}
                >
                  Table
                </button>
              </div>
            </div>
            {browseView === "map" ? (
              <div className="mt-2.5">
                <p className="mb-2 text-xs text-[var(--color-text-secondary)]">
                  Shaded by <strong className="font-medium text-[var(--color-text-primary)]">{currentViewLabel}</strong>
                  &rsquo;s score (same weighting shown above) &mdash; click any tract to open its full profile. A
                  fully keyboard- and screen-reader-operable table with the same data is available in{" "}
                  <button
                    type="button"
                    onClick={() => setBrowseView("table")}
                    className="text-[var(--color-interactive)] underline underline-offset-2"
                  >
                    Table view
                  </button>
                  .
                </p>
                <ExploreMap scenarioId={scenarioId} selected={selected} onSelect={handleGeographySelect} />
              </div>
            ) : (
              <div className="mt-2.5">
                <ExploreTable
                  scenarioId={scenarioId}
                  selectedTractId={null}
                  onSelectTract={handleGeographySelect}
                />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
