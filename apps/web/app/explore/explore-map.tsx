"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import { useQuery } from "@tanstack/react-query";
import { LoadingRegion, SkeletonText, ErrorState, CONCERN_SCALE, CONCERN_NO_DATA_COLOR } from "@scc-health/ui";
import { api, ApiError } from "@/lib/api";
import { isValidGeographyId, type SelectedGeography } from "./selection";

const FILL_LAYER = "tract-fill";
const LINE_LAYER = "tract-outline";
const SELECTED_LAYER = "tract-selected";
const NO_DATA_HATCH_LAYER = "tract-no-data-hatch";
const NO_DATA_HATCH_IMAGE = "no-data-hatch";
const PLACE_OUTLINE_SOURCE = "selected-place-boundary";
const PLACE_OUTLINE_LAYER = "selected-place-outline";

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

      const stopCount = CONCERN_SCALE.length;
      const stops: (string | number)[] = [];
      CONCERN_SCALE.forEach((color, i) => stops.push((i / (stopCount - 1)) * 100, color));

      map.addLayer({
        id: FILL_LAYER,
        type: "fill",
        source: "tracts",
        paint: {
          "fill-color": [
            "case",
            ["!=", ["get", "score"], null],
            ["interpolate", ["linear"], ["get", "score"], ...stops],
            CONCERN_NO_DATA_COLOR,
          ],
          "fill-opacity": 0.85,
        },
      });
      if (!map.hasImage(NO_DATA_HATCH_IMAGE)) {
        map.addImage(NO_DATA_HATCH_IMAGE, createNoDataHatchPattern());
      }
      map.addLayer({
        id: NO_DATA_HATCH_LAYER,
        type: "fill",
        source: "tracts",
        filter: ["==", ["get", "score"], null],
        paint: { "fill-pattern": NO_DATA_HATCH_IMAGE, "fill-opacity": 0.9 },
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
      {selected && selected.geographyType !== "tract" && (
        <p className="mt-2 text-xs text-[var(--color-text-secondary)]">
          The dashed outline shows {resolvedSelectedName}. Click any tract inside it to see that tract&rsquo;s
          score.
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
      <div className="flex items-center gap-1.5">
        <span>Lower concern</span>
        <div className="flex h-3 w-32 overflow-hidden rounded-full" role="img" aria-label="Color scale from lower concern (teal) to higher concern (red)">
          {CONCERN_SCALE.map((color) => (
            <span key={color} className="h-full flex-1" style={{ backgroundColor: color }} />
          ))}
        </div>
        <span>Higher concern</span>
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
