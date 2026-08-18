"use client";

import { useQuery } from "@tanstack/react-query";
import { api, type SourceStatusEntry } from "./api";

/**
 * A source_id -> full SourceStatusEntry map (publisher, landing_page,
 * vintage, freshness) built from the same manifest-level source list the
 * Data page already renders -- one shared request, not one per metric.
 * Lets any page resolve a metric's real source_id (already present on
 * MetricContribution) into a clickable publisher link and a freshness
 * badge, instead of only the free-text citation sentence. Callers should
 * fall back to the plain citation string while this is loading or on a
 * lookup miss -- both are complete, honest citations on their own, so
 * there is no bad/misleading intermediate state to guard against.
 */
export function useSourcesById(): Map<string, SourceStatusEntry> {
  const query = useQuery({
    queryKey: ["sources", "by-id"],
    queryFn: () => api.getSources(),
    staleTime: 5 * 60 * 1000,
  });

  const map = new Map<string, SourceStatusEntry>();
  for (const entry of query.data?.sources ?? []) {
    // A real, disclosed manifest duplicate (two sources share one
    // source_id, apps/web/app/data/data-explorer.tsx's SourceRow comment)
    // -- first entry wins here since a citation lookup needs exactly one
    // publisher/link per id, not a list; the duplicate itself remains
    // fully visible, undisguised, on the Data page.
    if (!map.has(entry.source_id)) map.set(entry.source_id, entry);
  }
  return map;
}
