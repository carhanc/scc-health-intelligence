"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { CUSTOM_SCENARIO_ID } from "../prioritize/scenario-selector";
import { TrustSignal } from "../trust-signal";
import type { SelectedGeography } from "../explore/selection";
import { LensPicker } from "./lens-picker";
import { PlaceSearch } from "./place-search";
import { RankedList } from "./ranked-list";
import type { FocusRow } from "./use-focus-scores";

/** The first state of the map page: one question, a way to answer it
 * (search, or pick what matters and look at the map), and a short list of
 * where to look first. */
export function BrowsePanel({
  scenarioId,
  rows,
  stale,
  names,
  hoveredGeoid,
  onHover,
  onSelect,
  onSelectNamed,
  onSelectCustom,
  customWeights,
  onCustomChange,
  onShowTable,
  advancedHref,
  autoFocusSearch,
}: {
  scenarioId: string;
  rows: FocusRow[];
  stale: boolean;
  names: Map<string, string>;
  hoveredGeoid: string | null;
  onHover: (geoid: string | null) => void;
  onSelect: (selection: SelectedGeography) => void;
  onSelectNamed: (id: string) => void;
  onSelectCustom: () => void;
  customWeights: Record<string, number>;
  onCustomChange: (weights: Record<string, number>) => void;
  onShowTable: () => void;
  advancedHref: string;
  autoFocusSearch: boolean;
}) {
  const isCustom = scenarioId === CUSTOM_SCENARIO_ID;
  // Starts closed; one click opens it right under the title.
  const [guideOpen, setGuideOpen] = useState(false);
  const scenariosQuery = useQuery({
    queryKey: ["scenarios"],
    queryFn: api.getScenarios,
    retry: 1,
    staleTime: 10 * 60 * 1000,
  });
  const domainsQuery = useQuery({
    queryKey: ["domains-registry"],
    queryFn: api.getDomains,
    retry: 1,
    staleTime: 10 * 60 * 1000,
  });

  const focusLabel = isCustom
    ? "your own weighting"
    : (scenariosQuery.data?.scenarios.find((s) => s.scenario_id === scenarioId)?.label ?? "the overall picture");
  const neighborhoods = names.size || rows.length || null;
  const indicators = domainsQuery.data ? domainsQuery.data.domains.reduce((n, d) => n + d.metrics.length, 0) : null;

  return (
    <div className="h-full overflow-y-auto px-5 pb-6 pt-6">
      <p aria-hidden="true" className="font-serif text-[1.75rem] font-medium leading-[1.15] tracking-tight text-[var(--color-text-primary)]">
        Where in Santa Clara County does health need the most support?
      </p>
      <p className="mt-3 text-sm text-[var(--color-text-secondary)]">
        {neighborhoods ? `${neighborhoods} neighborhoods` : "Every neighborhood"}, scored from{" "}
        {indicators ? `${indicators} public indicators` : "public data"}. Search, or click the map, to see why.
      </p>

      <details
        open={guideOpen}
        onToggle={(e) => setGuideOpen(e.currentTarget.open)}
        className="group mt-4 rounded-[var(--radius-md)] bg-[var(--color-surface-sunken)] px-4 py-3"
      >
        <summary className="cursor-pointer text-sm font-medium text-[var(--color-text-primary)]">
          How to read this map
        </summary>
        <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-[var(--color-text-secondary)]">
          <li>Green means lower overlapping need and red means higher, compared with the rest of the county. Hatched grey means no score.</li>
          <li>A higher score means a place deserves a closer look. It does not mean a worse community.</li>
          <li>This is screening, not causation. It shows where needs overlap, not what causes them or whether a specific program would fix them.</li>
          <li>Big rural areas stand out because census tracts are drawn by population, not size. A large patch can hold few people.</li>
          <li>Scores describe neighborhoods (census tracts), never individual people.</li>
        </ul>
      </details>

      <div className="mt-5">
        <PlaceSearch onSelect={onSelect} autoFocus={autoFocusSearch} />
      </div>

      <div className="mt-7">
        <LensPicker
          scenarioId={scenarioId}
          onSelectNamed={onSelectNamed}
          onSelectCustom={onSelectCustom}
          customWeights={customWeights}
          onCustomChange={onCustomChange}
        />
      </div>

      <section className="mt-8" aria-labelledby="look-first-heading">
        <h2 id="look-first-heading" className="font-sans text-base font-semibold text-[var(--color-text-primary)]">
          Where to look first
        </h2>
        <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
          Highest overlapping concern under {focusLabel}. Hover a row to find it on the map.
        </p>
        <div className="mt-2">
          <RankedList
            rows={rows}
            names={names}
            hoveredGeoid={hoveredGeoid}
            onHover={onHover}
            stale={stale}
            onSelect={(geoid, name) =>
              onSelect({ geographyType: "tract", geoid, displayName: name, source: "table" })
            }
          />
        </div>
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-sm">
          <button type="button" onClick={onShowTable} className="font-medium text-[var(--color-interactive)] hover:underline">
            See all {neighborhoods ?? ""} as a table
          </button>
          <Link href={advancedHref} className="font-medium text-[var(--color-interactive)] hover:underline">
            Advanced ranking tools
          </Link>
        </div>
      </section>


      <div className="mt-8">
        <TrustSignal />
      </div>
    </div>
  );
}
