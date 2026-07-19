"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { LoadingRegion, SkeletonText } from "@scc-health/ui";
import { api, type TopConcernTract } from "@/lib/api";
import type { SelectedGeography } from "../explore/selection";

// Access Lab has no scenario picker of its own (unlike Explore) -- this
// drill-down reuses Explore's own default scenario purely to identify
// which tracts to surface for further Access Lab drill-down, not as an
// Access Lab-specific priority judgment. Labeled as such in the UI so it
// is never confused with a scenario Access Lab itself computed.
const DEFAULT_SCENARIO_ID = "default_integrated_screen_v1";

/**
 * Phase 6.5: when a city or supervisor district is selected in Access
 * Lab (whose per-tract network/transit/E2SFCA data has no direct
 * city-level equivalent), this lets a user drill down into a specific
 * tract instead of being told to go back to Explore. Reuses the same
 * canonical SelectedGeography entry point as every other selection
 * source in the product.
 */
export function CityDrillDown({
  selected,
  onSelect,
}: {
  selected: SelectedGeography;
  onSelect: (selection: SelectedGeography) => void;
}) {
  const isPlace = selected.geographyType === "place";
  const isDistrict = selected.geographyType === "supervisor_district";

  const placeQuery = useQuery({
    queryKey: ["access-lab-place-top-concern-tracts", selected.geoid],
    queryFn: () => api.getPlaceTopConcernTracts(selected.geoid, DEFAULT_SCENARIO_ID, 5),
    enabled: isPlace,
    retry: 1,
  });
  const districtQuery = useQuery({
    queryKey: ["access-lab-district-top-concern-tracts", selected.geoid],
    queryFn: () => api.getDistrictTopConcernTracts(Number(selected.geoid), DEFAULT_SCENARIO_ID, 5),
    enabled: isDistrict,
    retry: 1,
  });
  // `selected.displayName` is only a real name for the instant right
  // after an in-app search click -- every selection is re-derived from
  // URL params on render, which has no name to fall back on except the
  // raw GEOID (a real defect found and fixed the same way in
  // explore-map.tsx's outline caption during this same verification pass).
  const nameQuery = useQuery({
    queryKey: ["access-lab-geography-display-name", selected.geographyType, selected.geoid],
    queryFn: async () => {
      if (isPlace) return (await api.getPlaceProfile(selected.geoid)).name_long;
      if (isDistrict) {
        const p = await api.getSupervisorDistrictProfile(Number(selected.geoid));
        return `District ${p.district_number} (${p.supervisor_name})`;
      }
      return null;
    },
    enabled: isPlace || isDistrict,
    retry: 1,
  });

  if (!isPlace && !isDistrict) {
    return (
      <p className="mt-3 text-sm text-[var(--color-text-secondary)]">
        Access Lab currently shows results by census tract. Search for a tract number, or{" "}
        <Link href="/explore" className="text-[var(--color-interactive)] underline underline-offset-2">
          pick a place on the map in Explore
        </Link>{" "}
        and choose a tract within it.
      </p>
    );
  }

  const query = isPlace ? placeQuery : districtQuery;
  const label = nameQuery.data ?? selected.displayName;

  return (
    <div className="mt-3">
      <p className="text-sm text-[var(--color-text-secondary)]">
        Access Lab shows results by census tract. Select a tract in {label} below to see its travel-time and
        transit-access summary.
      </p>
      {query.isLoading && (
        <LoadingRegion label={`Loading tracts in ${label}`}>
          <SkeletonText lines={3} />
        </LoadingRegion>
      )}
      {query.isError && (
        <p role="alert" className="mt-2 text-sm text-[var(--color-alert)]">
          Couldn&apos;t load tracts for {label}.
        </p>
      )}
      {query.data && query.data.tracts.length === 0 && (
        <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
          No scored tracts are available to rank yet. Search for a tract number directly instead.
        </p>
      )}
      {query.data && query.data.tracts.length > 0 && (
        <>
          <ul className="mt-2 divide-y divide-[var(--color-border)] rounded-[var(--radius-md)] border border-[var(--color-border)]">
            {query.data.tracts.map((t: TopConcernTract) => (
              <li key={t.tract_geoid_2020}>
                <button
                  type="button"
                  onClick={() =>
                    onSelect({
                      geographyType: "tract",
                      geoid: t.tract_geoid_2020,
                      displayName: t.name_long,
                      source: "drill_down",
                    })
                  }
                  className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-[var(--color-surface-sunken)] focus-visible:bg-[var(--color-surface-sunken)]"
                >
                  {t.name_long}
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-[var(--color-text-tertiary)]">
            Tracts shown are the highest estimated-concern areas under Explore&apos;s default balanced-priorities
            view, used here only to suggest a starting point.
          </p>
        </>
      )}
    </div>
  );
}
