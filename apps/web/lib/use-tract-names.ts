"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "./api";

/**
 * A geoid -> human-readable tract name map for all 408 tracts, built
 * from the same `getAllTractBoundaries` call the Explore map already
 * uses (one request, not one per row) -- lets a large results table
 * avoid raw tract GEOIDs as its primary label without an N+1 request
 * pattern. Falls back to the raw GEOID only while loading or if a
 * lookup misses, never silently.
 */
export function useTractNames(): Map<string, string> {
  const query = useQuery({
    queryKey: ["all-tract-boundaries", "names-only"],
    queryFn: () => api.getAllTractBoundaries(),
    staleTime: 5 * 60 * 1000,
  });

  const map = new Map<string, string>();
  for (const feature of query.data?.features ?? []) {
    map.set(feature.properties.tract_geoid_2020, feature.properties.name);
  }
  return map;
}
