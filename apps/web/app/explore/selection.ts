import type { GeographyType } from "@/lib/api";

/**
 * The one selected-geography model shared by the map, table, search,
 * comparison, and URL state (Phase 5 hotfix). Before this existed, the map
 * and table each invented their own ad hoc selection callback shape, and a
 * parameter-count mismatch between them let the map silently pass the
 * literal string "tract" as if it were a GEOID -- see DECISIONS.md
 * "Phase 5 hotfix: map tract selection" for the full root-cause writeup.
 * Every selection entry point must build one of these and nothing else.
 */
export type SelectionSource = "map" | "table" | "search" | "comparison" | "url";

export interface SelectedGeography {
  geographyType: GeographyType;
  /** Canonical identifier -- for tracts, the 11-character 2020 Census
   * GEOID with its leading zero preserved. Never a display label, never
   * the geography type itself. */
  geoid: string;
  displayName: string;
  source: SelectionSource;
}

const SANTA_CLARA_COUNTY_FIPS = "06085";
const TRACT_GEOID_PATTERN = /^\d{11}$/;
const PLACE_GEOID_PATTERN = /^\d{7}$/;
const COUNTY_OR_ZCTA_PATTERN = /^\d{5}$/;
const SUPERVISOR_DISTRICT_PATTERN = /^[1-5]$/;

/**
 * True only for a well-formed, in-county canonical GEOID for the given
 * geography type. Rejects the geography-type literal itself, display
 * labels with punctuation (e.g. "5033.21"), and out-of-county tracts --
 * exactly the malformed inputs that must never reach an API call.
 */
export function isValidGeographyId(geographyType: GeographyType, id: string | null | undefined): id is string {
  if (!id) return false;
  switch (geographyType) {
    case "tract":
      return TRACT_GEOID_PATTERN.test(id) && id.startsWith(SANTA_CLARA_COUNTY_FIPS);
    case "place":
      return PLACE_GEOID_PATTERN.test(id);
    case "zcta":
    case "county":
      return COUNTY_OR_ZCTA_PATTERN.test(id);
    case "supervisor_district":
      return SUPERVISOR_DISTRICT_PATTERN.test(id);
    default:
      return false;
  }
}

/**
 * Reconstructs a SelectedGeography from the `geography`/`id` URL params
 * (shareable-state round trip). A malformed or hand-edited URL -- e.g. an
 * unsupported geography type, or an id that fails validation -- yields no
 * selection at all rather than a half-formed one that would reach the API.
 */
export function parseSelectedGeographyFromParams(
  geographyTypeParam: string | null,
  geoidParam: string | null,
): SelectedGeography | null {
  const geographyType = geographyTypeParam as GeographyType | null;
  if (!geographyType || !isValidGeographyId(geographyType, geoidParam)) return null;
  return { geographyType, geoid: geoidParam, displayName: geoidParam, source: "url" };
}
