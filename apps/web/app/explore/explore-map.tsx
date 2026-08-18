"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import { useQuery } from "@tanstack/react-query";
import { LoadingRegion, SkeletonText, ErrorState, CONCERN_SCALE, CONCERN_NO_DATA_COLOR, ScreeningScore } from "@scc-health/ui";
import { api, ApiError, type TractBoundaryFeatureProperties } from "@/lib/api";
import { isValidGeographyId, type SelectedGeography } from "./selection";
import { MAP_LAYERS, getMapLayer, concernBandLabel, type MapLayerId } from "./layers";

const FILL_LAYER = "tract-fill";
const LINE_LAYER = "tract-outline";
const SELECTED_LAYER = "tract-selected";
const NO_DATA_HATCH_LAYER = "tract-no-data-hatch";
const NO_DATA_HATCH_IMAGE = "no-data-hatch";
const PLACE_OUTLINE_SOURCE = "selected-place-boundary";
const PLACE_OUTLINE_LAYER = "selected-place-outline";

/** OpenFreeMap's free, keyless, OSM-derived "positron" style -- a muted
 * light basemap (roads, water, county/city context, and place labels)
 * chosen specifically because its low-saturation palette keeps the
 * concern-gradient choropleth legible on top of it (docs/design/
 * final-score-map-and-intuitiveness-review.md §2). No API key or paid
 * tier required (CLAUDE.md: "core functionality must work without paid
 * API keys"); self-hostable if this ever needs to move in-house. Data is
 * © OpenStreetMap contributors, tiles © OpenFreeMap / OpenMapTiles --
 * attributed via the map's own AttributionControl below, not omitted. */
const BASEMAP_STYLE_URL = "https://tiles.openfreemap.org/styles/positron";

/** The basemap's own first symbol (text/label) layer. Every tract-fill,
 * hatch, outline, and selection layer is inserted with `beforeId` set to
 * this id so city/road/water labels always render above the choropleth
 * instead of being covered by it -- verified against the fetched style
 * (55 layers; `waterway_line_label` is the first of five `place`-source
 * symbol layers including `label_city`/`label_town`, min-zoom 3-9, so
 * major cities are already labeled at county zoom without needing a
 * separate custom label layer). If OpenFreeMap ever changes this layer
 * id, `addLayer(..., beforeId)` silently falls back to "on top of
 * everything" (MapLibre's documented behavior for an unknown beforeId
 * is to throw, so this is guarded at the call site instead). */
const BASEMAP_FIRST_LABEL_LAYER = "waterway_line_label";

/** A diagonal-hatch tile so "no score for this scenario" reads as
 * structurally distinct from the concern gradient, not just one shade
 * lighter than "lowest concern" (DEC-072 -- missing data must never
 * visually resemble a real low score). */
function createNoDataHatchPattern(): ImageData {
  const size = 12;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = CONCERN_NO_DATA_COLOR;
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = "#b8b0a2";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, size);
  ctx.lineTo(size, 0);
  ctx.moveTo(-size / 2, size / 2);
  ctx.lineTo(size / 2, -size / 2);
  ctx.moveTo(size / 2, size * 1.5);
  ctx.lineTo(size * 1.5, size / 2);
  ctx.stroke();
  return ctx.getImageData(0, 0, size, size);
}

/** The raw MapLibre value expression for a given layer -- "confidence"
 * is the only derived one (coverage_fraction as a 0-1 fraction, scaled
 * to the same 0-100 range every other layer already uses). */
function layerValueExpression(layerId: MapLayerId): any {  // eslint-disable-line @typescript-eslint/no-explicit-any -- MapLibre style expressions are untyped s-expression arrays
  if (layerId === "confidence") return ["*", ["get", "coverage_fraction"], 100];
  if (layerId === "score") return ["get", "score"];
  return ["get", `${layerId}_score`];
}

/** The expression used to test "is this layer's value missing for this
 * tract" -- always the raw property, before any confidence-layer scaling
 * (multiplying null by 100 would still be null, but testing the raw
 * property directly is clearer and matches every other layer). */
function layerNullTestExpression(layerId: MapLayerId): any {  // eslint-disable-line @typescript-eslint/no-explicit-any
  if (layerId === "confidence") return ["get", "coverage_fraction"];
  if (layerId === "score") return ["get", "score"];
  return ["get", `${layerId}_score`];
}

function buildNullFilterExpression(layerId: MapLayerId): any {  // eslint-disable-line @typescript-eslint/no-explicit-any
  return ["==", layerNullTestExpression(layerId), null];
}

/** Builds the `fill-color` case expression for a layer. Every layer
 * shares the same concern gradient (DEC-072) so "red always means more
 * concerning, teal always means less" holds across every layer -- for a
 * "higher-better" layer (only Data confidence today) the gradient is
 * reversed so a high value (good) still lands on the teal end, never
 * inverting what the colors themselves mean. */
function buildFillColorExpression(layerId: MapLayerId): any {  // eslint-disable-line @typescript-eslint/no-explicit-any
  const direction = getMapLayer(layerId).direction;
  const scale = direction === "higher-better" ? [...CONCERN_SCALE].reverse() : CONCERN_SCALE;
  const stopCount = scale.length;
  const stops: (string | number)[] = [];
  scale.forEach((color, i) => stops.push((i / (stopCount - 1)) * 100, color));
  return [
    "case",
    ["!=", layerNullTestExpression(layerId), null],
    ["interpolate", ["linear"], layerValueExpression(layerId), ...stops],
    CONCERN_NO_DATA_COLOR,
  ];
}

/**
 * The choropleth shows only the platform's own tract polygons and place
 * labels -- no external basemap tiles (DEC-040). This keeps the map fully
 * keyless and avoids visual noise unrelated to the scored geography. The
 * map is a visual convenience; the DataTable in the table view carries the
 * same data in a fully keyboard- and screen-reader-operable form (docs/01
 * §5.9), so the map itself is not required to be feature-by-feature
 * keyboard operable.
 */
export function ExploreMap({
  scenarioId,
  selected,
  onSelect,
  onHoverChange,
  compact = false,
}: {
  scenarioId: string;
  selected: SelectedGeography | null;
  onSelect: (selection: SelectedGeography) => void;
  /** Lifts hover state to the parent so the no-selection sidebar can
   * render a "Quick preview" there instead of a floating map card
   * (docs/design/final-score-map-and-intuitiveness-review.md's hover
   * interaction model -- the map itself stays completely unobscured
   * while nothing is selected). */
  onHoverChange?: (properties: TractBoundaryFeatureProperties | null) => void;
  /** A shorter, docked form used once a tract is selected -- the map
   * stays mounted (not swapped for the profile) so the click-to-zoom
   * animation and the selected-tract outline are actually visible,
   * instead of the map unmounting the instant a tract is picked. */
  compact?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const fitBoundsRef = useRef<(() => void) | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [activeLayer, setActiveLayer] = useState<MapLayerId>("score");
  const [hoverInfo, setHoverInfo] = useState<TractBoundaryFeatureProperties | null>(null);
  // Which screen quadrant the cursor is in when hovering -- the hover
  // card renders in the *opposite* quadrant so it never sits on top of
  // the polygon actually being inspected (docs/design/
  // health-equity-product-consolidation.md's "collision-aware hover
  // inspector" requirement). Recomputed only on mousemove over the fill
  // layer, not on every animation frame.
  const [hoverQuadrant, setHoverQuadrant] = useState<"tl" | "tr" | "bl" | "br">("br");
  const [clickError, setClickError] = useState<string | null>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const onHoverChangeRef = useRef(onHoverChange);
  onHoverChangeRef.current = onHoverChange;
  const layerDef = getMapLayer(activeLayer);

  const boundariesQuery = useQuery({
    queryKey: ["tract-boundaries", scenarioId],
    queryFn: () => api.getAllTractBoundaries(scenarioId),
    retry: 1,
    staleTime: 5 * 60 * 1000,
  });

  // A city, district, ZIP-code area, or county has no single point on the
  // map -- without this, a user who searches "Sunnyvale" gets a profile
  // card but no way to see where Sunnyvale's tracts actually are, so they
  // can never get from "found the city" to "found its leading concerns."
  // Fetches the same boundary endpoint the old per-geography profile page
  // already used, only for non-tract selections.
  const placeBoundaryQuery = useQuery({
    queryKey: ["geography-boundary", selected?.geographyType, selected?.geoid],
    queryFn: () => api.getGeographyBoundary(selected!.geographyType, selected!.geoid),
    enabled: !!selected && selected.geographyType !== "tract",
    staleTime: 5 * 60 * 1000,
  });

  // `selected.displayName` is only ever a real name for the single render
  // right after an in-app search click -- once the URL round-trips (which
  // happens on every selection, since `selected` is always re-derived from
  // URL params, not kept from the click event), `parseSelectedGeographyFromParams`
  // has no name to fall back on except the raw GEOID. Resolving the real
  // name here, from the same profile endpoints the detail panel already
  // calls, fixes a real defect found during Phase 6.5 verification: the
  // outline caption showed a raw place GEOID ("0668000") instead of "San
  // Jose city" on every single place/district selection, not just
  // URL-shared links.
  const placeNameQuery = useQuery({
    queryKey: ["geography-display-name", selected?.geographyType, selected?.geoid],
    queryFn: async () => {
      if (selected?.geographyType === "place") {
        const profile = await api.getPlaceProfile(selected.geoid);
        return profile.name_long;
      }
      if (selected?.geographyType === "supervisor_district") {
        const profile = await api.getSupervisorDistrictProfile(Number(selected.geoid));
        return `District ${profile.district_number} (${profile.supervisor_name})`;
      }
      return null;
    },
    enabled: !!selected && (selected.geographyType === "place" || selected.geographyType === "supervisor_district"),
    staleTime: 5 * 60 * 1000,
  });
  const resolvedSelectedName = placeNameQuery.data ?? selected?.displayName ?? "the selected area";

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: BASEMAP_STYLE_URL,
      center: [-121.85, 37.25],
      zoom: 9,
      attributionControl: false,
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    // Real map data requires real attribution. OpenFreeMap's vector tile
    // source already reports its own "OpenFreeMap © OpenMapTiles Data
    // from OpenStreetMap" credit via the tile source's own metadata, so a
    // plain AttributionControl (compact, so it collapses to an "i" icon
    // rather than competing with the map controls) picks that up
    // automatically -- adding a second, hand-written credit string here
    // duplicated it verbatim instead of supplementing it.
    map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");
    // `load` alone proved unreliable under React Strict Mode's dev-only
    // double mount/cleanup/mount cycle once the style became a remote
    // URL (fetching a style over the network, then getting torn down
    // mid-fetch by Strict Mode's throwaway first pass, appears to leave
    // that map instance's `load` promise chain from ever resolving even
    // though the second, real instance still renders tiles correctly) --
    // `idle` (fires whenever the map has no pending style/tile work left)
    // and a synchronous `isStyleLoaded()` check both back it up so
    // readiness is detected via whichever signal actually fires first.
    const markReady = () => setMapReady(true);
    map.once("load", markReady);
    map.once("idle", markReady);
    if (map.isStyleLoaded()) markReady();
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !boundariesQuery.data) return;

    const geojson = {
      type: "FeatureCollection" as const,
      features: boundariesQuery.data.features,
    };

    const existing = map.getSource("tracts") as maplibregl.GeoJSONSource | undefined;
    if (existing) {
      existing.setData(geojson as GeoJSON.FeatureCollection);
    } else {
      map.addSource("tracts", { type: "geojson", data: geojson as GeoJSON.FeatureCollection });

      // Every tract layer is inserted *below* the basemap's own first
      // label layer, so city/road/water names always render on top of
      // the choropleth instead of being covered by it (the reported "just
      // colored polygons, not a real map" problem). Falls back to "on
      // top" only if the basemap's layer id is ever missing (defensive;
      // MapLibre throws on an unknown beforeId rather than ignoring it).
      const beforeId = map.getLayer(BASEMAP_FIRST_LABEL_LAYER) ? BASEMAP_FIRST_LABEL_LAYER : undefined;

      map.addLayer(
        {
          id: FILL_LAYER,
          type: "fill",
          source: "tracts",
          paint: {
            "fill-color": buildFillColorExpression("score"),
            "fill-opacity": 0.75,
          },
        },
        beforeId,
      );
      if (!map.hasImage(NO_DATA_HATCH_IMAGE)) {
        map.addImage(NO_DATA_HATCH_IMAGE, createNoDataHatchPattern());
      }
      map.addLayer(
        {
          id: NO_DATA_HATCH_LAYER,
          type: "fill",
          source: "tracts",
          filter: buildNullFilterExpression("score"),
          paint: { "fill-pattern": NO_DATA_HATCH_IMAGE, "fill-opacity": 0.85 },
        },
        beforeId,
      );
      map.addLayer(
        {
          id: LINE_LAYER,
          type: "line",
          source: "tracts",
          paint: { "line-color": "#ffffff", "line-width": 0.5 },
        },
        beforeId,
      );
      // The selected-tract outline is deliberately appended last (no
      // beforeId) -- it must stay visually distinct even where a city or
      // road label sits over the same tract, per this pass's map
      // acceptance criteria ("selected boundaries remain visible around
      // labels").
      map.addLayer({
        id: SELECTED_LAYER,
        type: "line",
        source: "tracts",
        filter: ["==", ["get", "tract_geoid_2020"], "__none__"],
        paint: { "line-color": "#1e2933", "line-width": 3 },
      });

      map.on("mousemove", FILL_LAYER, (e) => {
        map.getCanvas().style.cursor = "pointer";
        const feature = e.features?.[0];
        if (feature) {
          const properties = feature.properties as unknown as TractBoundaryFeatureProperties;
          setHoverInfo(properties);
          onHoverChangeRef.current?.(properties);
          const rect = map.getContainer().getBoundingClientRect();
          const xFrac = (e.point.x) / rect.width;
          const yFrac = (e.point.y) / rect.height;
          // Render in the quadrant diagonally opposite the cursor.
          setHoverQuadrant(`${yFrac < 0.5 ? "b" : "t"}${xFrac < 0.5 ? "r" : "l"}` as "tl" | "tr" | "bl" | "br");
        }
      });
      map.on("mouseleave", FILL_LAYER, () => {
        map.getCanvas().style.cursor = "";
        setHoverInfo(null);
        onHoverChangeRef.current?.(null);
      });
      map.on("click", FILL_LAYER, (e) => {
        const feature = e.features?.[0];
        const geoid = feature?.properties?.tract_geoid_2020;
        const name = feature?.properties?.name;
        if (isValidGeographyId("tract", geoid)) {
          setClickError(null);
          onSelectRef.current({
            geographyType: "tract",
            geoid,
            displayName: typeof name === "string" && name ? name : `Tract ${geoid}`,
            source: "map",
          });
        } else {
          // A malformed or missing GEOID must never reach the profile API
          // -- this is exactly the class of bug that let the literal
          // string "tract" get sent as an identifier in the past.
          setClickError("This tract's identifier is missing from the map data, so it can't be selected.");
        }
      });

      try {
        const bounds = new maplibregl.LngLatBounds();
        for (const feature of geojson.features) {
          const coords = flattenCoordinates(feature.geometry);
          for (const [lng, lat] of coords) bounds.extend([lng, lat]);
        }
        if (!bounds.isEmpty()) {
          map.fitBounds(bounds, { padding: 24, duration: 0 });
          // Captured once, reused by the "Reset view" control -- refitting
          // the same countywide bounds is a pure map-state reset, no new
          // request (the geometry is already the loaded source's data).
          fitBoundsRef.current = () => map.fitBounds(bounds, { padding: 24, duration: 300 });
        }
      } catch {
        // geometry shape unexpected; keep default center/zoom
      }
    }
  }, [mapReady, boundariesQuery.data]);

  // The map container's height changes (full <-> compact) when a tract
  // is selected/cleared -- MapLibre's own ResizeObserver normally
  // catches this, but an explicit resize() is a cheap, defensive
  // guarantee the canvas never renders stretched after that CSS change.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    map.resize();
  }, [compact, mapReady]);

  // Switching the active layer repaints the already-loaded source with a
  // different fill-color/filter expression -- no new network request,
  // since every layer's values are already present on each feature from
  // the one boundaries fetch (docs/design/explore-health-equity-research.md
  // §10, DEC-073).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !map.getLayer(FILL_LAYER)) return;
    map.setPaintProperty(FILL_LAYER, "fill-color", buildFillColorExpression(activeLayer));
    map.setFilter(NO_DATA_HATCH_LAYER, buildNullFilterExpression(activeLayer));
  }, [activeLayer, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !map.getLayer(SELECTED_LAYER)) return;
    map.setFilter(SELECTED_LAYER, [
      "==",
      ["get", "tract_geoid_2020"],
      selected?.geographyType === "tract" ? selected.geoid : "__none__",
    ]);
  }, [selected, mapReady]);

  // Pan/zoom to a selected tract -- covers selection via search or the
  // table, where the tract may be nowhere near the map's current view.
  // A tract selected by clicking the map is already in view, so this is
  // a no-op zoom-to-self in that case (still harmless).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || selected?.geographyType !== "tract" || !boundariesQuery.data) return;
    const feature = boundariesQuery.data.features.find(
      (f) => f.properties.tract_geoid_2020 === selected.geoid,
    );
    if (!feature) return;
    const bounds = new maplibregl.LngLatBounds();
    for (const [lng, lat] of flattenCoordinates(feature.geometry)) bounds.extend([lng, lat]);
    // A generous padding looks better on a wide map, but the middle
    // column can be as narrow as ~210px at some in-range viewport widths
    // (e.g. 1280px, where the 3-column layout has just activated) --
    // fixed 120px padding on each side can then exceed the available
    // canvas and trigger MapLibre's "cannot fit" warning. 40px keeps a
    // sensible margin at any width the map column actually renders at.
    if (!bounds.isEmpty()) map.fitBounds(bounds, { padding: 40, maxZoom: 14, duration: 400 });
  }, [selected?.geoid, selected?.geographyType, mapReady, boundariesQuery.data]);

  // Pan/zoom to a selected place/district/ZCTA/county's real boundary,
  // and outline it so the user can see exactly which tracts fall inside
  // it and click one to see its concerns (Explore usability task:
  // "find a city and identify its leading concerns").
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    const geometry = placeBoundaryQuery.data?.geojson.geometry;
    const existingSource = map.getSource(PLACE_OUTLINE_SOURCE) as maplibregl.GeoJSONSource | undefined;

    if (!geometry) {
      existingSource?.setData({ type: "FeatureCollection", features: [] });
      return;
    }

    const feature: GeoJSON.Feature = { type: "Feature", properties: {}, geometry };
    if (existingSource) {
      existingSource.setData(feature as GeoJSON.Feature);
    } else {
      map.addSource(PLACE_OUTLINE_SOURCE, { type: "geojson", data: feature as GeoJSON.Feature });
      map.addLayer({
        id: PLACE_OUTLINE_LAYER,
        type: "line",
        source: PLACE_OUTLINE_SOURCE,
        paint: { "line-color": "#1e2933", "line-width": 3, "line-dasharray": [2, 1] },
      });
    }

    const bounds = new maplibregl.LngLatBounds();
    for (const [lng, lat] of flattenCoordinates(geometry)) bounds.extend([lng, lat]);
    if (!bounds.isEmpty()) map.fitBounds(bounds, { padding: 40, duration: 400 });
  }, [mapReady, placeBoundaryQuery.data]);

  if (boundariesQuery.isError) {
    return (
      <ErrorState
        title="Map unavailable"
        description={
          boundariesQuery.error instanceof ApiError
            ? boundariesQuery.error.message
            : "Couldn't load tract boundaries. Is the API running?"
        }
      />
    );
  }

  const selectedFeature =
    selected?.geographyType === "tract"
      ? boundariesQuery.data?.features.find((f) => f.properties.tract_geoid_2020 === selected.geoid)
      : undefined;
  const selectedConcernValue = selectedFeature ? layerDef.getValue(selectedFeature.properties) : null;

  return (
    <div className="relative">
      {/* The map itself is the primary surface (docs/design/
          health-equity-product-consolidation.md §4) -- it fills the
          available height rather than a small fixed box, while staying
          bounded so a shorter laptop screen never has to scroll inside
          the map to find its own legend/controls. */}
      <div
        className={
          compact
            ? "relative h-[280px] w-full sm:h-[320px]"
            : "relative h-[calc(100vh-260px)] min-h-[480px] max-h-[820px] w-full"
        }
      >
        {boundariesQuery.isLoading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center rounded-[var(--radius-lg)] bg-[var(--color-surface)]">
            <LoadingRegion label="Loading map data">
              <SkeletonText lines={3} className="w-48" />
            </LoadingRegion>
          </div>
        )}
        <div
          ref={containerRef}
          role="application"
          aria-label={`Map of Santa Clara County census tracts, shaded by ${layerDef.label.toLowerCase()}. A fully accessible table with the same data is available in the table view.`}
          className="h-full w-full rounded-[var(--radius-lg)] border border-[var(--color-border)]"
        />

        {/* Compact floating layer control -- a full-width label/select/
            description row above the map (the prior layout) cost real
            vertical space the map itself should have. */}
        <div className="absolute left-3 top-3 z-10 max-w-[200px] rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)]/95 px-2.5 py-2 shadow-[var(--shadow-sm)] backdrop-blur-sm">
          <label className="flex flex-col gap-1 text-xs">
            <span className="font-medium text-[var(--color-text-primary)]">Map view</span>
            <select
              value={activeLayer}
              onChange={(e) => setActiveLayer(e.target.value as MapLayerId)}
              className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-1.5 py-1 text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-focus-ring)]"
            >
              {MAP_LAYERS.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.label}
                </option>
              ))}
            </select>
          </label>
          <p className="mt-1 text-[11px] leading-snug text-[var(--color-text-secondary)]">{layerDef.description}</p>
        </div>

        {/* Reset view -- pairs with MapLibre's own zoom controls
            (top-right); a distinct, always-reachable "back to the whole
            county" affordance, not just repeated scroll-to-zoom-out. */}
        <button
          type="button"
          onClick={() => fitBoundsRef.current?.()}
          className="absolute right-3 top-[92px] z-10 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)]/95 px-2.5 py-1.5 text-xs font-medium text-[var(--color-text-primary)] shadow-[var(--shadow-sm)] backdrop-blur-sm hover:bg-[var(--color-surface-sunken)]"
        >
          Reset view
        </button>

        {/* Two different hover treatments depending on selection state
            (docs/design/final-score-map-and-intuitiveness-review.md's
            hover/selection interaction model, chosen after evaluating a
            sidebar-docked preview, a full collision-aware floating
            inspector, and this hybrid against each other):
            - No selection: the map stays *completely* unobscured -- no
              floating card at all. Hover data is instead lifted to the
              sidebar's "Quick preview" via onHoverChange, which is the
              primary comprehension surface in this state.
            - A tract is selected: hovering a *different* tract must not
              erase the selected profile sitting in the sidebar, so a
              small, non-interactive, name-plus-concern-band-only callout
              (deliberately smaller than the old always-on hover card)
              previews the hovered tract right on the map instead. */}
        {selected?.geographyType === "tract" && hoverInfo && hoverInfo.tract_geoid_2020 !== selected.geoid && (
          <TinyHoverCallout properties={hoverInfo} layerDef={layerDef} quadrant={hoverQuadrant} />
        )}
        {selected?.geographyType === "tract" && (!hoverInfo || hoverInfo.tract_geoid_2020 === selected.geoid) && (
          <SelectedMapCallout
            geoid={selected.geoid}
            displayName={selected.displayName}
            concernValue={selectedConcernValue}
            layerDef={layerDef}
          />
        )}
      </div>

      {clickError && (
        <p role="alert" className="mt-2 text-xs text-[var(--color-alert)]">
          {clickError}
        </p>
      )}
      {selected && selected.geographyType !== "tract" && (
        <p className="mt-2 text-xs text-[var(--color-text-secondary)]">
          The dashed outline shows {resolvedSelectedName}. Click any tract inside it to see that tract&rsquo;s
          score.
        </p>
      )}
      <MapLegend layerDef={layerDef} />
    </div>
  );
}

const QUADRANT_POSITION: Record<"tl" | "tr" | "bl" | "br", string> = {
  tl: "left-3 top-3",
  tr: "right-3 top-3",
  bl: "left-3 bottom-3",
  br: "right-3 bottom-3",
};

/** A genuinely tiny, non-interactive callout previewing a *hovered*
 * tract while a *different* tract is selected (docs/design/final-score-
 * map-and-intuitiveness-review.md's hover/selection interaction model).
 * Deliberately much smaller than the old always-on hover card it
 * replaces -- with a profile already open in the sidebar, this only
 * needs to answer "what's this other tract roughly like," not repeat
 * the sidebar's job. Renders in whichever map corner is diagonally
 * opposite the cursor (`quadrant`) so it never sits on top of the
 * polygon being inspected. `aria-hidden` + `pointer-events-none` since
 * it's decorative and duplicates data already reachable via the
 * accessible table. */
function TinyHoverCallout({
  properties,
  layerDef,
  quadrant,
}: {
  properties: TractBoundaryFeatureProperties;
  layerDef: ReturnType<typeof getMapLayer>;
  quadrant: "tl" | "tr" | "bl" | "br";
}) {
  const value = layerDef.getValue(properties);
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute z-10 max-w-[180px] rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1.5 text-xs shadow-[var(--shadow-md)] ${QUADRANT_POSITION[quadrant]}`}
    >
      <p className="truncate font-semibold text-[var(--color-text-primary)]">{properties.name}</p>
      {/* The score layer shows the actual 0-100 value (safe -- it's the
          same `properties.score` the sidebar's `explanation.score` reads,
          not a second computation of it). No *percentile* or *rank*
          number appears here on any layer -- see docs/methods/screening-
          score-interpretation.md §9 for why only one canonical percentile
          source exists, and it's not this one. */}
      {value !== null ? (
        layerDef.id === "score" ? (
          <ScreeningScore score={value} mode="compact" />
        ) : (
          <p className="text-[var(--color-text-secondary)]">{concernBandLabel(value, layerDef.label.toLowerCase())}</p>
        )
      ) : (
        <p className="text-[var(--color-text-secondary)]">No score for this scenario</p>
      )}
    </div>
  );
}

/** A minimal, persistent callout for the currently *selected* tract --
 * similar in purpose (not appearance) to Tree Equity Score's selected-
 * score map bubble: a quick "what am I looking at" anchor while the
 * user is panning/zooming, without duplicating the sidebar's full
 * profile. Hidden while a hover card is showing (both anchor to map
 * corners; only one needs to be visible at a time).
 *
 * Shows the canonical 0-100 score itself only when the active map layer
 * *is* the composite score -- that value comes from the same
 * `properties.score` field the sidebar's `explanation.score` reads (both
 * trace back to the same `analytics.scenario_scores.score` row for this
 * tract/scenario, docs/methods/screening-score-interpretation.md), so
 * there is no risk of it disagreeing with the sidebar the way the
 * deterministic map-rank percentile did (that number was removed
 * entirely, not just hidden here -- see MapHoverCard's comment). For any
 * other layer (a single domain, or confidence) this shows only the
 * concern band, since a domain percentile is a different statistic from
 * the screening score and must never be labeled as if it were one. */
function SelectedMapCallout({
  geoid,
  displayName,
  concernValue,
  layerDef,
}: {
  geoid: string;
  displayName: string;
  concernValue: number | null;
  layerDef: ReturnType<typeof getMapLayer>;
}) {
  return (
    <div className="pointer-events-none absolute bottom-3 left-3 z-10 max-w-[220px] rounded-[var(--radius-md)] border border-[var(--color-interactive)] bg-[var(--color-surface)] px-3 py-2 text-xs shadow-[var(--shadow-md)]">
      <p className="truncate font-semibold text-[var(--color-text-primary)]">{displayName || `Tract ${geoid}`}</p>
      {layerDef.id === "score" ? (
        <ScreeningScore score={concernValue} mode="compact" />
      ) : (
        <p className="text-[var(--color-text-secondary)]">
          {concernValue !== null ? capitalize(concernBandLabel(concernValue, layerDef.label.toLowerCase())) : "Selected"}
        </p>
      )}
    </div>
  );
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function MapLegend({ layerDef }: { layerDef: ReturnType<typeof getMapLayer> }) {
  const scale = layerDef.direction === "higher-better" ? [...CONCERN_SCALE].reverse() : CONCERN_SCALE;
  const lowLabel = layerDef.direction === "higher-better" ? "Lower confidence" : "Lower concern";
  const highLabel = layerDef.direction === "higher-better" ? "Higher confidence" : "Higher concern";
  return (
    <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-[var(--color-text-secondary)]">
      <span className="font-medium text-[var(--color-text-primary)]">{layerDef.label}:</span>
      <div className="flex items-center gap-1.5">
        <span>{lowLabel}</span>
        <div
          className="flex h-3 w-32 overflow-hidden rounded-full"
          role="img"
          aria-label={`Color scale from ${lowLabel.toLowerCase()} (teal) to ${highLabel.toLowerCase()} (red)`}
        >
          {scale.map((color, i) => (
            <span key={`${color}-${i}`} className="h-full flex-1" style={{ backgroundColor: color }} />
          ))}
        </div>
        <span>{highLabel}</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span
          aria-hidden="true"
          className="h-3 w-3 rounded-sm border border-[var(--color-border-strong)]"
          style={{
            backgroundColor: CONCERN_NO_DATA_COLOR,
            backgroundImage:
              "repeating-linear-gradient(45deg, transparent, transparent 2px, rgba(0,0,0,0.25) 2px, rgba(0,0,0,0.25) 3px)",
          }}
        />
        <span>No score for this scenario</span>
      </div>
    </div>
  );
}

function flattenCoordinates(geometry: GeoJSON.Geometry): [number, number][] {
  if (geometry.type === "Polygon") {
    return geometry.coordinates.flat() as [number, number][];
  }
  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates.flat(2) as [number, number][];
  }
  return [];
}
