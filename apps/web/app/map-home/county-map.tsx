"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import { useQuery } from "@tanstack/react-query";
import {
  CONCERN_SCALE,
  CONCERN_NO_DATA_COLOR,
  FULL_CONCERN_DOMAIN,
  computeConcernDomain,
  concernBandFor,
  formatScreeningScore,
  type ConcernDomain,
} from "@scc-health/ui";
import { api, ApiError, type TractBoundaryFeatureProperties } from "@/lib/api";
import { isValidGeographyId, type SelectedGeography } from "../explore/selection";
import { getMapLayer, type MapLayerId } from "../explore/layers";

import { BASE_GEOMETRY_SCENARIO } from "./constants";

const FILL_LAYER = "tract-fill";
const LINE_LAYER = "tract-outline";
const HOVER_LAYER = "tract-hover";
const SELECTED_CASING_LAYER = "tract-selected-casing";
const SELECTED_LAYER = "tract-selected";
const NO_DATA_HATCH_LAYER = "tract-no-data-hatch";
const NO_DATA_HATCH_IMAGE = "no-data-hatch";
const PLACE_OUTLINE_SOURCE = "selected-place-boundary";
const PLACE_OUTLINE_LAYER = "selected-place-outline";
const INK = "#12241f";

/** OpenFreeMap's free, keyless "positron" style: a muted light basemap
 * whose low saturation lets the concern ramp carry the map. No API
 * key required (project rule: core functionality must work without paid
 * keys). Data (c) OpenStreetMap contributors, tiles (c) OpenFreeMap. */
const BASEMAP_STYLE_URL = "https://tiles.openfreemap.org/styles/positron";

/** First text layer of the basemap: every tract layer is inserted below it
 * so city, road and water labels stay readable above the choropleth. */
const BASEMAP_FIRST_LABEL_LAYER = "waterway_line_label";

export interface MapEdgePadding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

const DEFAULT_PADDING: MapEdgePadding = { top: 24, right: 24, bottom: 24, left: 24 };

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

/** Diagonal hatch so "no score" is structurally, not just chromatically,
 * different from the concern ramp (DEC-072: missing data must never look
 * like a real low score). */
function createNoDataHatchPattern(): ImageData {
  const size = 12;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = CONCERN_NO_DATA_COLOR;
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = "#a9b4b0";
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

/* MapLibre style expressions are untyped s-expression arrays. */
/* eslint-disable @typescript-eslint/no-explicit-any */
function valueExpression(layerId: MapLayerId): any {
  // coalesce keeps MapLibre's type checker quiet for tracts with no value;
  // those are painted with the no-data color by the surrounding "case".
  if (layerId === "confidence") return ["*", ["coalesce", ["get", "coverage_fraction"], 0], 100];
  if (layerId === "score") return ["coalesce", ["get", "score"], 0];
  return ["coalesce", ["get", `${layerId}_score`], 0];
}

function nullTestExpression(layerId: MapLayerId): any {
  if (layerId === "confidence") return ["get", "coverage_fraction"];
  if (layerId === "score") return ["get", "score"];
  return ["get", `${layerId}_score`];
}

function nullFilterExpression(layerId: MapLayerId): any {
  return ["==", nullTestExpression(layerId), null];
}

/** Every layer shares one green-to-red ramp: red always means more
 * concern. For the one "higher is better" layer (data confidence) the
 * ramp is reversed so a good value still lands on the green end. */
function fillColorExpression(layerId: MapLayerId, scoreDomain: ConcernDomain): any {
  const direction = getMapLayer(layerId).direction;
  const scale = direction === "higher-better" ? [...CONCERN_SCALE].reverse() : [...CONCERN_SCALE];
  // The overall score is a weighted blend and clusters mid-range, so its ramp
  // is stretched to the county's actual spread; the domain layers are already
  // percentiles spread over 0-100.
  const [lo, hi] = layerId === "score" ? scoreDomain : FULL_CONCERN_DOMAIN;
  const stops: (string | number)[] = [];
  scale.forEach((color, i) => stops.push(lo + (i / (scale.length - 1)) * (hi - lo), color));
  return [
    "case",
    ["!=", nullTestExpression(layerId), null],
    ["interpolate", ["linear"], valueExpression(layerId), ...stops],
    CONCERN_NO_DATA_COLOR,
  ];
}
/* eslint-enable @typescript-eslint/no-explicit-any */

function flattenCoordinates(geometry: GeoJSON.Geometry): [number, number][] {
  if (geometry.type === "Polygon") return geometry.coordinates.flat() as [number, number][];
  if (geometry.type === "MultiPolygon") return geometry.coordinates.flat(2) as [number, number][];
  return [];
}

function boundsOf(geometry: GeoJSON.Geometry): maplibregl.LngLatBounds {
  const bounds = new maplibregl.LngLatBounds();
  for (const [lng, lat] of flattenCoordinates(geometry)) bounds.extend([lng, lat]);
  return bounds;
}

interface HoverTip {
  geoid: string;
  name: string;
  value: number | null;
}

/**
 * The full-bleed county map. It fills whatever container it is placed in;
 * the page owns every overlay (panel, legend, layer picker) so this
 * component stays about the map alone.
 *
 * The map is a visual convenience: every tract it shows is also reachable
 * through search, the ranked list, and the sortable table, all of which
 * are fully keyboard and screen-reader operable.
 */
export function CountyMap({
  selected,
  onSelect,
  scores,
  activeLayer,
  hoveredGeoid,
  onHoverGeoid,
  edgePadding = DEFAULT_PADDING,
}: {
  selected: SelectedGeography | null;
  onSelect: (selection: SelectedGeography) => void;
  /** tract GEOID -> score under the active focus area. When omitted the
   * map paints the scores that came with the geometry. */
  scores?: Map<string, number | null> | null;
  activeLayer: MapLayerId;
  /** A tract highlighted from outside the map (hovering a list row). */
  hoveredGeoid?: string | null;
  /** Reports the tract under the cursor so the list can highlight its row. */
  onHoverGeoid?: (geoid: string | null) => void;
  /** Space covered by overlays; fitted views are centered in what's left. */
  edgePadding?: MapEdgePadding;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const fitCountyRef = useRef<(() => void) | null>(null);
  const initializedRef = useRef(false);
  const [mapReady, setMapReady] = useState(false);
  const [tip, setTip] = useState<HoverTip | null>(null);
  const [clickError, setClickError] = useState<string | null>(null);

  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const onHoverRef = useRef(onHoverGeoid);
  onHoverRef.current = onHoverGeoid;
  const scoresRef = useRef(scores);
  scoresRef.current = scores;
  const activeLayerRef = useRef(activeLayer);
  activeLayerRef.current = activeLayer;
  const paddingRef = useRef(edgePadding);
  paddingRef.current = edgePadding;
  const lastHoverRef = useRef<string | null>(null);

  const layerDef = getMapLayer(activeLayer);

  const boundariesQuery = useQuery({
    queryKey: ["tract-boundaries", BASE_GEOMETRY_SCENARIO],
    queryFn: () => api.getAllTractBoundaries(BASE_GEOMETRY_SCENARIO),
    retry: 1,
    staleTime: 5 * 60 * 1000,
  });

  const placeBoundaryQuery = useQuery({
    queryKey: ["geography-boundary", selected?.geographyType, selected?.geoid],
    queryFn: () => api.getGeographyBoundary(selected!.geographyType, selected!.geoid),
    enabled: !!selected && selected.geographyType !== "tract",
    staleTime: 5 * 60 * 1000,
  });

  const geojson = useMemo(() => {
    const data = boundariesQuery.data;
    if (!data) return null;
    return {
      type: "FeatureCollection" as const,
      features: data.features.map((f) => {
        if (!scores) return f;
        const override = scores.get(f.properties.tract_geoid_2020);
        return { ...f, properties: { ...f.properties, score: override ?? null } };
      }),
    };
  }, [boundariesQuery.data, scores]);

  const scoreDomain = useMemo(() => {
    const values: number[] = [];
    if (scores) scores.forEach((v) => v !== null && values.push(v));
    else
      boundariesQuery.data?.features.forEach((f) => {
        const v = (f.properties as { score?: number | null }).score;
        if (typeof v === "number") values.push(v);
      });
    return computeConcernDomain(values);
  }, [scores, boundariesQuery.data]);
  const scoreDomainRef = useRef(scoreDomain);
  scoreDomainRef.current = scoreDomain;

  function paddingFor(extra = 0) {
    const p = paddingRef.current;
    return { top: p.top + extra, right: p.right + extra, bottom: p.bottom + extra, left: p.left + extra };
  }

  /* Create the map once. */
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: BASEMAP_STYLE_URL,
      center: [-121.85, 37.25],
      zoom: 9,
      attributionControl: false,
      dragRotate: false,
      pitchWithRotate: false,
    });
    map.touchZoomRotate.disableRotation();
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");
    // `load` alone proved unreliable under React Strict Mode's double
    // mount with a remote style URL; `idle` and a synchronous check back
    // it up so readiness is detected via whichever fires first.
    const markReady = () => setMapReady(true);
    map.once("load", markReady);
    map.once("idle", markReady);
    if (map.isStyleLoaded()) markReady();
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      initializedRef.current = false;
    };
  }, []);

  /* Add the tract layers the first time geometry and style are both ready,
   * then only swap data afterwards. */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !geojson) return;

    const existing = map.getSource("tracts") as maplibregl.GeoJSONSource | undefined;
    if (existing) {
      existing.setData(geojson as GeoJSON.FeatureCollection);
      return;
    }
    if (initializedRef.current) return;
    initializedRef.current = true;

    map.addSource("tracts", { type: "geojson", data: geojson as GeoJSON.FeatureCollection, promoteId: "tract_geoid_2020" });
    const beforeId = map.getLayer(BASEMAP_FIRST_LABEL_LAYER) ? BASEMAP_FIRST_LABEL_LAYER : undefined;
    const layer = activeLayerRef.current;

    map.addLayer(
      {
        id: FILL_LAYER,
        type: "fill",
        source: "tracts",
        paint: {
          "fill-color": fillColorExpression(layer, scoreDomainRef.current),
          "fill-color-transition": { duration: prefersReducedMotion() ? 0 : 450, delay: 0 },
          "fill-opacity": 0.88,
        },
      },
      beforeId,
    );
    if (!map.hasImage(NO_DATA_HATCH_IMAGE)) map.addImage(NO_DATA_HATCH_IMAGE, createNoDataHatchPattern());
    map.addLayer(
      {
        id: NO_DATA_HATCH_LAYER,
        type: "fill",
        source: "tracts",
        filter: nullFilterExpression(layer),
        paint: { "fill-pattern": NO_DATA_HATCH_IMAGE, "fill-opacity": 0.9 },
      },
      beforeId,
    );
    map.addLayer(
      {
        id: LINE_LAYER,
        type: "line",
        source: "tracts",
        paint: {
          "line-color": "#ffffff",
          "line-opacity": 0.9,
          "line-width": ["interpolate", ["linear"], ["zoom"], 8, 0.3, 11, 0.7, 14, 1.4],
        },
      },
      beforeId,
    );
    map.addLayer({
      id: HOVER_LAYER,
      type: "line",
      source: "tracts",
      filter: ["==", ["get", "tract_geoid_2020"], "__none__"],
      paint: { "line-color": INK, "line-width": 2.2 },
    });
    // A white casing under the dark selection outline keeps it visible
    // over every ramp color, including the darkest.
    map.addLayer({
      id: SELECTED_CASING_LAYER,
      type: "line",
      source: "tracts",
      filter: ["==", ["get", "tract_geoid_2020"], "__none__"],
      paint: { "line-color": "#ffffff", "line-width": 7, "line-opacity": 0.95 },
    });
    map.addLayer({
      id: SELECTED_LAYER,
      type: "line",
      source: "tracts",
      filter: ["==", ["get", "tract_geoid_2020"], "__none__"],
      paint: { "line-color": INK, "line-width": 3 },
    });

    map.on("mousemove", FILL_LAYER, (e) => {
      const feature = e.features?.[0];
      if (!feature) return;
      map.getCanvas().style.cursor = "pointer";
      const props = feature.properties as unknown as TractBoundaryFeatureProperties;
      const geoid = props.tract_geoid_2020;
      if (tooltipRef.current) {
        const rect = map.getContainer().getBoundingClientRect();
        const x = Math.min(e.point.x + 14, rect.width - 190);
        const y = Math.max(e.point.y - 56, 8);
        tooltipRef.current.style.transform = `translate(${x}px, ${y}px)`;
      }
      if (lastHoverRef.current !== geoid) {
        lastHoverRef.current = geoid;
        const layerNow = getMapLayer(activeLayerRef.current);
        const override = scoresRef.current?.get(geoid);
        const value =
          activeLayerRef.current === "score" && scoresRef.current ? (override ?? null) : layerNow.getValue(props);
        setTip({ geoid, name: props.name, value });
        onHoverRef.current?.(geoid);
      }
    });
    map.on("mouseleave", FILL_LAYER, () => {
      map.getCanvas().style.cursor = "";
      lastHoverRef.current = null;
      setTip(null);
      onHoverRef.current?.(null);
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
        // A malformed or missing GEOID must never reach the profile API.
        setClickError("This tract's identifier is missing from the map data, so it can't be selected.");
      }
    });

    try {
      const bounds = new maplibregl.LngLatBounds();
      for (const feature of geojson.features) {
        for (const [lng, lat] of flattenCoordinates(feature.geometry)) bounds.extend([lng, lat]);
      }
      if (!bounds.isEmpty()) {
        map.fitBounds(bounds, { padding: paddingFor(), duration: 0 });
        fitCountyRef.current = () =>
          map.fitBounds(bounds, { padding: paddingFor(), duration: prefersReducedMotion() ? 0 : 700 });
      }
    } catch {
      // Unexpected geometry shape: keep the default center and zoom.
    }
  }, [mapReady, geojson]);

  /* Recolor when the layer changes (no new request: every layer's values
   * are already on each feature). */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !map.getLayer(FILL_LAYER)) return;
    map.setPaintProperty(FILL_LAYER, "fill-color", fillColorExpression(activeLayer, scoreDomain));
    map.setFilter(NO_DATA_HATCH_LAYER, nullFilterExpression(activeLayer));
  }, [activeLayer, mapReady, geojson, scoreDomain]);

  /* Focus: while a tract is selected, its neighbors recede so the selected
   * one reads clearly and the street labels underneath stay legible. */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !map.getLayer(FILL_LAYER)) return;
    const opacity =
      selected?.geographyType === "tract"
        ? ["case", ["==", ["get", "tract_geoid_2020"], selected.geoid], 0.92, 0.34]
        : 0.88;
    map.setPaintProperty(FILL_LAYER, "fill-opacity", opacity as maplibregl.ExpressionSpecification | number);
  }, [selected, mapReady, geojson]);

  /* Selected tract outline. */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !map.getLayer(SELECTED_LAYER)) return;
    const filter = ["==", ["get", "tract_geoid_2020"], selected?.geographyType === "tract" ? selected.geoid : "__none__"];
    map.setFilter(SELECTED_LAYER, filter as maplibregl.FilterSpecification);
    map.setFilter(SELECTED_CASING_LAYER, filter as maplibregl.FilterSpecification);
  }, [selected, mapReady, geojson]);

  /* Highlight from outside the map (list row hover). */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !map.getLayer(HOVER_LAYER)) return;
    map.setFilter(HOVER_LAYER, ["==", ["get", "tract_geoid_2020"], hoveredGeoid ?? "__none__"] as maplibregl.FilterSpecification);
  }, [hoveredGeoid, mapReady, geojson]);

  /* Fly to a selected tract. */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || selected?.geographyType !== "tract" || !boundariesQuery.data) return;
    const feature = boundariesQuery.data.features.find((f) => f.properties.tract_geoid_2020 === selected.geoid);
    if (!feature) return;
    const bounds = boundsOf(feature.geometry);
    if (!bounds.isEmpty()) {
      map.fitBounds(bounds, {
        padding: paddingFor(64),
        maxZoom: 13.2,
        duration: prefersReducedMotion() ? 0 : 900,
      });
    }
  }, [selected?.geoid, selected?.geographyType, mapReady, boundariesQuery.data]);

  /* Selecting nothing returns to the whole county. */
  const hadSelectionRef = useRef(false);
  useEffect(() => {
    if (selected) {
      hadSelectionRef.current = true;
      return;
    }
    if (hadSelectionRef.current) {
      hadSelectionRef.current = false;
      fitCountyRef.current?.();
    }
  }, [selected]);

  /* Outline and fit a selected city, district, ZIP area or county. */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const geometry = placeBoundaryQuery.data?.geojson.geometry;
    const source = map.getSource(PLACE_OUTLINE_SOURCE) as maplibregl.GeoJSONSource | undefined;
    if (!geometry || selected?.geographyType === "tract") {
      source?.setData({ type: "FeatureCollection", features: [] });
      return;
    }
    const feature: GeoJSON.Feature = { type: "Feature", properties: {}, geometry };
    if (source) {
      source.setData(feature);
    } else {
      map.addSource(PLACE_OUTLINE_SOURCE, { type: "geojson", data: feature });
      map.addLayer({
        id: PLACE_OUTLINE_LAYER,
        type: "line",
        source: PLACE_OUTLINE_SOURCE,
        paint: { "line-color": INK, "line-width": 3, "line-dasharray": [2, 1] },
      });
    }
    const bounds = boundsOf(geometry);
    if (!bounds.isEmpty()) map.fitBounds(bounds, { padding: paddingFor(40), duration: prefersReducedMotion() ? 0 : 700 });
  }, [mapReady, placeBoundaryQuery.data, selected?.geographyType]);

  /* The container can change size (panel opening, sheet detents). */
  useEffect(() => {
    const el = containerRef.current;
    const map = mapRef.current;
    if (!el || !map || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => map.resize());
    observer.observe(el);
    return () => observer.disconnect();
  }, [mapReady]);

  if (boundariesQuery.isError) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-[var(--color-surface-sunken)] p-6">
        <p role="alert" className="max-w-sm text-center text-sm text-[var(--color-text-secondary)]">
          The map couldn&rsquo;t load.{" "}
          {boundariesQuery.error instanceof ApiError ? boundariesQuery.error.message : "Is the API running?"} The
          ranked list and table still work.
        </p>
      </div>
    );
  }

  return (
    <div className="absolute inset-0">
      <div
        ref={containerRef}
        role="application"
        aria-label={`Map of Santa Clara County census tracts, shaded by ${layerDef.label.toLowerCase()}. The same data is available in the ranked list and the table.`}
        className="h-full w-full"
      />

      {boundariesQuery.isLoading && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-[var(--color-surface-sunken)]/70">
          <p className="rounded-full bg-[var(--color-surface)] px-4 py-2 text-sm text-[var(--color-text-secondary)] shadow-[var(--shadow-sm)]">
            Loading the map&hellip;
          </p>
        </div>
      )}

      <button
        type="button"
        onClick={() => fitCountyRef.current?.()}
        className="absolute right-[10px] top-[84px] rounded-[var(--radius-md)] bg-[var(--color-surface)] px-3 py-1.5 text-xs font-medium text-[var(--color-text-primary)] shadow-[var(--shadow-sm)] hover:bg-[var(--color-surface-sunken)]"
      >
        Reset view
      </button>

      {/* Cursor tooltip. Positioned imperatively on mousemove so tracking
          the cursor never re-renders React; content changes only when the
          tract under the cursor changes. */}
      <div
        ref={tooltipRef}
        aria-hidden="true"
        className="pointer-events-none absolute left-0 top-0 z-10"
        style={{ transform: "translate(-999px, -999px)" }}
      >
        {tip && (
          <div className="w-[180px] rounded-[var(--radius-md)] bg-[var(--color-text-primary)] px-3 py-2 text-white shadow-[var(--shadow-md)]">
            <p className="truncate text-sm font-medium">{tip.name}</p>
            <p className="mt-0.5 text-xs text-white/80">
              {tip.value === null ? (
                "No score here"
              ) : activeLayer === "score" || layerDef.direction === "higher-worse" ? (
                <>
                  <span className="font-semibold text-white">{formatScreeningScore(tip.value)}</span>/100
                  {" · "}
                  {concernBandFor(Math.round(tip.value)).label} concern
                </>
              ) : (
                <>
                  <span className="font-semibold text-white">{Math.round(tip.value)}%</span> data coverage
                </>
              )}
            </p>
          </div>
        )}
      </div>

      {clickError && (
        <p
          role="alert"
          className="absolute bottom-16 left-1/2 -translate-x-1/2 rounded-[var(--radius-md)] bg-[var(--color-alert-subtle)] px-3 py-2 text-xs text-[var(--color-alert)]"
        >
          {clickError}
        </p>
      )}
    </div>
  );
}
