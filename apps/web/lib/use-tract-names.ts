"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "./api";

// Shared with the map (BASE_GEOMETRY_SCENARIO in app/map-home/county-map.tsx):
// one cached request provides tract geometry, names and base scores for the
// whole app instead of a second ~3 MB download just for names.
const BASE_GEOMETRY_SCENARIO = "default_integrated_screen_v1";

/**
 * A geoid -> human-readable tract name map for all 408 tracts. Lets a large
 * results table avoid raw tract GEOIDs as its primary label without an N+1
 * request pattern. Falls back to the raw GEOID only while loading or if a
 * lookup misses, never silently.
 */
export function useTractNames(): Map<string, string> {
  const query = useQuery({
    queryKey: ["tract-boundaries", BASE_GEOMETRY_SCENARIO],
    queryFn: () => api.getAllTractBoundaries(BASE_GEOMETRY_SCENARIO),
    staleTime: 5 * 60 * 1000,
  });

  const map = new Map<string, string>();
  for (const feature of query.data?.features ?? []) {
    map.set(feature.properties.tract_geoid_2020, feature.properties.name);
  }
  return map;
}
