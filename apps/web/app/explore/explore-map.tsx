"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import { useQuery } from "@tanstack/react-query";
import { LoadingRegion, SkeletonText, ErrorState, MAP_SEQUENTIAL_SCALE, MAP_NO_DATA_COLOR } from "@scc-health/ui";
import { api, ApiError } from "@/lib/api";
import { isValidGeographyId, type SelectedGeography } from "./selection";

const FILL_LAYER = "tract-fill";
const LINE_LAYER = "tract-outline";
const SELECTED_LAYER = "tract-selected";

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
}: {
  scenarioId: string;
  selected: SelectedGeography | null;
  onSelect: (selection: SelectedGeography) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [hoverInfo, setHoverInfo] = useState<{ name: string; score: number | null } | null>(null);
  const [clickError, setClickError] = useState<string | null>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  const boundariesQuery = useQuery({
    queryKey: ["tract-boundaries", scenarioId],
    queryFn: () => api.getAllTractBoundaries(scenarioId),
    retry: 1,
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: {
        version: 8,
        sources: {},
        layers: [
          { id: "bg", type: "background", paint: { "background-color": "#eceae5" } },
        ],
      },
      center: [-121.85, 37.25],
      zoom: 9,
      attributionControl: false,
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    map.on("load", () => setMapReady(true));
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

      const stopCount = MAP_SEQUENTIAL_SCALE.length;
      const stops: (string | number)[] = [];
      MAP_SEQUENTIAL_SCALE.forEach((color, i) => stops.push((i / (stopCount - 1)) * 100, color));

      map.addLayer({
        id: FILL_LAYER,
        type: "fill",
        source: "tracts",
        paint: {
          "fill-color": [
            "case",
            ["!=", ["get", "score"], null],
            ["interpolate", ["linear"], ["get", "score"], ...stops],
            MAP_NO_DATA_COLOR,
          ],
          "fill-opacity": 0.85,
        },
      });
      map.addLayer({
        id: LINE_LAYER,
        type: "line",
        source: "tracts",
        paint: { "line-color": "#ffffff", "line-width": 0.5 },
      });
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
          setHoverInfo({
            name: feature.properties?.name ?? "Unknown tract",
            score: feature.properties?.score ?? null,
          });
        }
      });
      map.on("mouseleave", FILL_LAYER, () => {
        map.getCanvas().style.cursor = "";
        setHoverInfo(null);
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
        if (!bounds.isEmpty()) map.fitBounds(bounds, { padding: 24, duration: 0 });
      } catch {
        // geometry shape unexpected; keep default center/zoom
      }
    }
  }, [mapReady, boundariesQuery.data]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !map.getLayer(SELECTED_LAYER)) return;
    map.setFilter(SELECTED_LAYER, [
      "==",
      ["get", "tract_geoid_2020"],
      selected?.geographyType === "tract" ? selected.geoid : "__none__",
    ]);
  }, [selected, mapReady]);

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

  return (
    <div className="relative">
      {boundariesQuery.isLoading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-[var(--color-surface)]">
          <LoadingRegion label="Loading map data">
            <SkeletonText lines={3} className="w-48" />
          </LoadingRegion>
        </div>
      )}
      <div
        ref={containerRef}
        role="application"
        aria-label="Map of Santa Clara County census tracts, shaded by combined concern score. A fully accessible table with the same data is available in the table view."
        className="h-[480px] w-full rounded-[var(--radius-lg)] border border-[var(--color-border)] sm:h-[560px]"
      />
      {clickError && (
        <p role="alert" className="mt-2 text-xs text-[var(--color-alert)]">
          {clickError}
        </p>
      )}
      {hoverInfo && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-3 z-10 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-xs shadow-[var(--shadow-md)]"
        >
          <p className="font-semibold text-[var(--color-text-primary)]">{hoverInfo.name}</p>
          <p className="text-[var(--color-text-secondary)]">
            {hoverInfo.score !== null ? `Score: ${Math.round(hoverInfo.score)}/100` : "No score for this scenario"}
          </p>
        </div>
      )}
      <MapLegend />
    </div>
  );
}

function MapLegend() {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-[var(--color-text-secondary)]">
      <span className="font-medium text-[var(--color-text-primary)]">Combined concern:</span>
      <div className="flex items-center gap-1">
        <span>Lower</span>
        <div className="flex h-3 w-28 overflow-hidden rounded-full">
          {MAP_SEQUENTIAL_SCALE.map((color) => (
            <span key={color} className="h-full flex-1" style={{ backgroundColor: color }} />
          ))}
        </div>
        <span>Higher</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span
          aria-hidden="true"
          className="h-3 w-3 rounded-sm"
          style={{ backgroundColor: MAP_NO_DATA_COLOR }}
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
