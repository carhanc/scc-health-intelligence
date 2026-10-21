"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Dialog } from "@scc-health/ui";
import { useMediaQuery } from "@/lib/use-media-query";
import { useTractNames } from "@/lib/use-tract-names";
import { CUSTOM_SCENARIO_ID } from "../prioritize/scenario-selector";
import { DEFAULT_WEIGHTS, normalizeWeights } from "../prioritize/weight-sliders";
import { parseSelectedGeographyFromParams, type SelectedGeography } from "../explore/selection";
import { ExploreTable } from "../explore/explore-table";
import { DistrictDetail, PlaceDetail } from "../explore/geography-detail";
import { MAP_LAYERS, type MapLayerId } from "../explore/layers";
import { BrowsePanel } from "./browse-panel";
import { MapLegend } from "./map-legend";
import { BackButton, CustomTractPanel, TractPanel } from "./tract-panel";
import { setQuery } from "@/lib/url-state";
import { AboutBadge } from "./about-badge";
import { useFocusScores } from "./use-focus-scores";

// MapLibre touches window/canvas at module load, so it stays client-only.
const CountyMap = dynamic(() => import("./county-map").then((m) => m.CountyMap), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 flex items-center justify-center bg-[var(--color-surface-sunken)]">
      <p className="rounded-full bg-[var(--color-surface)] px-4 py-2 text-sm text-[var(--color-text-secondary)] shadow-[var(--shadow-sm)]">
        Loading the map&hellip;
      </p>
    </div>
  ),
});

const DEFAULT_SCENARIO_ID = "default_integrated_screen_v1";

function parseWeightsParam(raw: string | null): Record<string, number> | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object") return parsed as Record<string, number>;
  } catch {
    // fall through
  }
  return null;
}

type Detent = "peek" | "half" | "full";
/** The collapsed bottom sheet: 312px on a normal phone, shorter on a landscape
 * phone so it never swallows the map. */
const PEEK_MAX_PX = 312;
const PEEK_MIN_PX = 150;

/**
 * The home page and the whole "where is need highest, and why" job: a
 * full-bleed map with one panel beside it. The panel is a single place that
 * changes state (browse, then neighborhood) instead of several things
 * stacking and pushing each other down. On phones the same panel is a
 * bottom sheet with three heights you can drag between; the map stays
 * usable behind it.
 */
export function MapWorkspace() {
  const searchParams = useSearchParams();
  const isDesktop = useMediaQuery("(min-width: 1024px)");

  const selected = parseSelectedGeographyFromParams(searchParams.get("geography"), searchParams.get("id"));
  const scenarioId = searchParams.get("scenario") ?? DEFAULT_SCENARIO_ID;
  const isCustom = scenarioId === CUSTOM_SCENARIO_ID;
  const comparing = searchParams.get("compare") === "1";
  const focusSearch = searchParams.get("search") === "1";

  const [layer, setLayer] = useState<MapLayerId>("score");
  const [hovered, setHovered] = useState<string | null>(null);
  const [tableOpen, setTableOpen] = useState(false);

  /* Custom weights live in state so sliders feel instant; the URL follows
   * a moment later so the view stays shareable without flooding history. */
  const [customRaw, setCustomRaw] = useState<Record<string, number>>(
    () => parseWeightsParam(searchParams.get("weights")) ?? DEFAULT_WEIGHTS,
  );
  const customNormalized = useMemo(() => normalizeWeights(customRaw), [customRaw]);

  const updateParams = useCallback(
    (updates: Record<string, string | null>, replace = false) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value === null) params.delete(key);
        else params.set(key, value);
      }
      setQuery("/", params, replace ? "replace" : "push");
    },
    [searchParams],
  );

  useEffect(() => {
    if (!isCustom) return;
    const t = setTimeout(() => {
      const next = JSON.stringify(customRaw);
      if (next !== searchParams.get("weights")) updateParams({ weights: next }, true);
    }, 450);
    return () => clearTimeout(t);
  }, [customRaw, isCustom]);

  const names = useTractNames();
  const focus = useFocusScores(scenarioId, customNormalized);

  function select(selection: SelectedGeography) {
    updateParams({ geography: selection.geographyType, id: selection.geoid, compare: null, search: null });
  }
  function clearSelection() {
    updateParams({ geography: null, id: null, compare: null, search: null });
  }
  function selectNamed(id: string) {
    updateParams({ scenario: id === DEFAULT_SCENARIO_ID ? null : id, weights: null });
  }
  function selectCustom() {
    updateParams({ scenario: CUSTOM_SCENARIO_ID, weights: JSON.stringify(customRaw) });
  }
  function backToNamed() {
    updateParams({ scenario: null, weights: null });
  }

  /* Escape returns from a neighborhood to the whole county, unless a dialog
   * (which handles Escape itself) is open. */
  useEffect(() => {
    if (!selected) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || tableOpen || document.querySelector("dialog[open]")) return;
      const target = e.target as HTMLElement | null;
      if (target && ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName)) return;
      clearSelection();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, tableOpen]);

  /* Mobile bottom sheet. */
  const [detent, setDetent] = useState<Detent>("peek");
  const [vh, setVh] = useState(800);
  const [dragH, setDragH] = useState<number | null>(null);
  const dragRef = useRef<{ startY: number; startH: number; moved: boolean } | null>(null);

  useEffect(() => {
    const onResize = () => setVh(window.innerHeight);
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const heights = useMemo(() => {
    const avail = vh - 64;
    const peek = Math.max(PEEK_MIN_PX, Math.min(PEEK_MAX_PX, Math.round(avail * 0.5)));
    return { peek, half: Math.max(peek + 40, Math.round(avail * 0.55)), full: avail - 12 } as Record<Detent, number>;
  }, [vh]);

  // A new selection opens the sheet to the summary; going back collapses it.
  const selectedKey = selected ? `${selected.geographyType}:${selected.geoid}` : "";
  useEffect(() => {
    setDetent(selectedKey ? "half" : "peek");
  }, [selectedKey]);
  useEffect(() => {
    if (focusSearch) setDetent("full");
  }, [focusSearch]);

  const sheetH = dragH ?? heights[detent];

  function onHandleDown(e: React.PointerEvent<HTMLButtonElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { startY: e.clientY, startH: sheetH, moved: false };
  }
  function onHandleMove(e: React.PointerEvent<HTMLButtonElement>) {
    const d = dragRef.current;
    if (!d) return;
    const delta = d.startY - e.clientY;
    if (Math.abs(delta) > 4) d.moved = true;
    setDragH(Math.min(heights.full, Math.max(heights.peek, d.startH + delta)));
  }
  function onHandleUp() {
    const d = dragRef.current;
    dragRef.current = null;
    if (!d) return;
    if (!d.moved) {
      setDragH(null);
      setDetent((cur) => (cur === "peek" ? "half" : cur === "half" ? "full" : "peek"));
      return;
    }
    const h = dragH ?? d.startH;
    const nearest = (Object.keys(heights) as Detent[]).reduce((best, k) =>
      Math.abs(heights[k] - h) < Math.abs(heights[best] - h) ? k : best,
    );
    setDragH(null);
    setDetent(nearest);
  }

  const edgePadding = isDesktop
    ? { top: 72, right: 72, bottom: 56, left: 440 + 16 + 40 }
    : { top: 72, right: 24, bottom: sheetH + 24, left: 24 };

  const advancedHref = isCustom
    ? `/prioritize?scenario=${CUSTOM_SCENARIO_ID}&weights=${encodeURIComponent(JSON.stringify(customRaw))}`
    : `/prioritize?scenario=${scenarioId}`;

  let panel: React.ReactNode;
  if (!selected) {
    panel = (
      <BrowsePanel
        scenarioId={scenarioId}
        rows={focus.rows}
        stale={focus.isStale}
        names={names}
        hoveredGeoid={hovered}
        onHover={setHovered}
        onSelect={select}
        onSelectNamed={selectNamed}
        onSelectCustom={selectCustom}
        customWeights={customRaw}
        onCustomChange={setCustomRaw}
        onShowTable={() => setTableOpen(true)}
        advancedHref={advancedHref}
        autoFocusSearch={focusSearch}
      />
    );
  } else if (selected.geographyType === "tract") {
    panel = isCustom ? (
      <CustomTractPanel
        tractGeoid={selected.geoid}
        focusRows={focus.rows}
        contributions={focus.contributions?.get(selected.geoid) ?? null}
        onBack={clearSelection}
        onSwitchToNamed={backToNamed}
      />
    ) : (
      <TractPanel
        tractGeoid={selected.geoid}
        scenarioId={scenarioId}
        focusRows={focus.rows}
        comparing={comparing}
        onCompare={() => updateParams({ compare: "1" })}
        onCloseCompare={() => updateParams({ compare: null })}
        onBack={clearSelection}
      />
    );
  } else {
    const namedScenario = isCustom ? DEFAULT_SCENARIO_ID : scenarioId;
    panel = (
      <div className="h-full overflow-y-auto px-5 pb-6 pt-4">
        <BackButton onBack={clearSelection} />
        <div className="mt-4">
          {selected.geographyType === "place" && (
            <PlaceDetail
              placeGeoid={selected.geoid}
              scenarioId={namedScenario}
              onClearSelection={clearSelection}
              onSelect={select}
            />
          )}
          {selected.geographyType === "supervisor_district" && (
            <DistrictDetail
              districtNumber={Number(selected.geoid)}
              scenarioId={namedScenario}
              onClearSelection={clearSelection}
              onSelect={select}
            />
          )}
          {(selected.geographyType === "zcta" || selected.geographyType === "county") && (
            <p className="text-sm text-[var(--color-text-secondary)]">
              Scores are calculated per census tract, not for a whole {selected.geographyType === "zcta" ? "ZIP area" : "county"}.
              Search for a tract inside this area, or click the map, to see scores and reasons.
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      className="relative w-full overflow-hidden bg-[var(--color-surface-sunken)]"
      style={{ height: "calc(100dvh - var(--topbar-height))" }}
    >
      <h1 className="sr-only">Where in Santa Clara County does health need the most support?</h1>

      <CountyMap
        selected={selected}
        onSelect={select}
        scores={focus.scoreMap}
        activeLayer={layer}
        hoveredGeoid={hovered}
        onHoverGeoid={setHovered}
        edgePadding={edgePadding}
      />

      {/* Map controls sit beside the panel, never under it. */}
      <div className="absolute left-3 top-3 z-10 lg:left-[calc(440px+2rem)] lg:top-4">
        <label className="flex items-center gap-2 rounded-full bg-[var(--color-surface)] py-1.5 pl-4 pr-2 text-sm shadow-[var(--shadow-md)]">
          <span className="text-[var(--color-text-secondary)]">Color by</span>
          <select
            aria-label="Color the map by"
            value={layer}
            onChange={(e) => setLayer(e.target.value as MapLayerId)}
            className="max-w-[min(16rem,calc(100vw-11rem))] cursor-pointer rounded-full bg-transparent py-1 pr-1 text-sm font-medium text-[var(--color-text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-focus-ring)]"
          >
            {MAP_LAYERS.map((l) => (
              <option key={l.id} value={l.id}>
                {l.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div
        className={`absolute z-10 hidden sm:block lg:bottom-9 ${
          // On a short landscape screen the right edge is taken by the map buttons,
          // so the legend sits beside the "Who built this?" button instead.
          !isDesktop && vh < 600 ? "left-[11.5rem]" : "right-3"
        }`}
        style={isDesktop ? undefined : { bottom: sheetH + 12 }}
      >
        <MapLegend layerId={layer} compact={!isDesktop && vh < 600} />
      </div>
      {/* The map page has no footer, so credit and site links live in this small button. */}
      <AboutBadge
        className="absolute left-3 z-10 lg:bottom-9 lg:left-[calc(440px+2rem)]"
        style={isDesktop ? undefined : { bottom: sheetH + 12 }}
      />
      {/* On phones the legend only appears on the county view; once something is
          selected the sheet carries the score and the map needs the room. */}
      {!selected && (
        <div className="absolute left-3 top-[3.75rem] z-10 sm:hidden">
          <MapLegend layerId={layer} compact />
        </div>
      )}

      <aside
        aria-label="Neighborhood explorer"
        className="absolute inset-x-0 bottom-0 z-20 flex h-[var(--sheet-h)] flex-col overflow-hidden rounded-t-[1.25rem] bg-[var(--color-surface)] shadow-[var(--shadow-lg)] transition-[height] duration-300 ease-out data-[dragging=true]:transition-none lg:inset-x-auto lg:bottom-4 lg:left-4 lg:top-4 lg:h-auto lg:w-[440px] lg:rounded-[var(--radius-lg)]"
        style={{ ["--sheet-h" as string]: `${sheetH}px` }}
        data-dragging={dragH !== null}
      >
        <button
          type="button"
          aria-label="Resize panel"
          onPointerDown={onHandleDown}
          onPointerMove={onHandleMove}
          onPointerUp={onHandleUp}
          onPointerCancel={onHandleUp}
          className="flex h-6 w-full shrink-0 cursor-grab touch-none items-center justify-center active:cursor-grabbing lg:hidden"
        >
          <span aria-hidden="true" className="h-1 w-10 rounded-full bg-[var(--color-border-strong)]" />
        </button>
        <div key={selectedKey || "browse"} className="animate-panel-in min-h-0 flex-1">
          {panel}
        </div>
      </aside>

      <Dialog open={tableOpen} onClose={() => setTableOpen(false)} title="All neighborhoods, as a table" variant="wide">
        {/* Mounted only while open: the table is 408 rows and its own request. */}
        {!tableOpen ? null : isCustom ? (
          <p className="text-sm text-[var(--color-text-secondary)]">
            The sortable table is available for the named focus areas. For your own weighting, the{" "}
            <Link href={advancedHref} className="text-[var(--color-interactive)] underline underline-offset-2">
              advanced ranking tools
            </Link>{" "}
            show every neighborhood ranked.
          </p>
        ) : (
          <ExploreTable
            scenarioId={scenarioId}
            selectedTractId={null}
            onSelectTract={(sel) => {
              setTableOpen(false);
              select(sel);
            }}
          />
        )}
      </Dialog>
    </div>
  );
}
