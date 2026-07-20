import type { DomainKey, TractBoundaryFeatureProperties } from "@/lib/api";
import { concernBandLabel } from "@scc-health/ui";

export { concernBandLabel };

export type MapLayerId = "score" | DomainKey | "confidence";

export interface MapLayerDef {
  id: MapLayerId;
  label: string;
  /** One sentence, shown in the layer switcher and the legend. */
  description: string;
  /** "higher-worse": a higher value means more concern (every domain and
   * the composite score). "higher-better": a higher value is the good
   * direction (confidence/coverage) -- the color scale is reversed for
   * this direction so red still consistently means "more concerning"
   * across every layer, never "green = universally healthy" for one
   * layer and "green = bad" for another. */
  direction: "higher-worse" | "higher-better";
  /** Reads this layer's 0-100 value from an already-fetched tract
   * boundary feature -- every layer is derived from data already present
   * in the single boundaries payload, so switching layers never issues a
   * new network request (docs/design/explore-health-equity-research.md §10). */
  getValue: (properties: TractBoundaryFeatureProperties) => number | null;
}

export const MAP_LAYERS: MapLayerDef[] = [
  {
    id: "score",
    label: "Overall screening concern",
    description: "The combined concern score across all weighted domains, under the active scenario.",
    direction: "higher-worse",
    getValue: (p) => p.score,
  },
  {
    id: "health_burden",
    label: "Health needs",
    description: "Chronic disease, disability, and general health status measures, county-relative.",
    direction: "higher-worse",
    getValue: (p) => p.health_burden_score,
  },
  {
    id: "access_barriers",
    label: "Access barriers",
    description: "Insurance coverage, transportation, housing, and food insecurity, county-relative.",
    direction: "higher-worse",
    getValue: (p) => p.access_barriers_score,
  },
  {
    id: "environmental_burden",
    label: "Environmental conditions",
    description: "Pollution burden and population vulnerability (CalEnviroScreen), county-relative.",
    direction: "higher-worse",
    getValue: (p) => p.environmental_burden_score,
  },
  {
    id: "resource_accessibility",
    label: "Community resources",
    description: "Modeled distance to the nearest clinical care, county-relative.",
    direction: "higher-worse",
    getValue: (p) => p.resource_accessibility_score,
  },
  {
    id: "workforce_shortage",
    label: "Workforce shortage",
    description: "Health-professional shortage designation and intensity, county-relative.",
    direction: "higher-worse",
    getValue: (p) => p.workforce_shortage_score,
  },
  {
    id: "confidence",
    label: "Data confidence",
    description: "How complete the underlying data is for the combined score, under the active scenario.",
    direction: "higher-better",
    getValue: (p) => (p.coverage_fraction !== null ? p.coverage_fraction * 100 : null),
  },
];

export function getMapLayer(id: MapLayerId): MapLayerDef {
  return MAP_LAYERS.find((l) => l.id === id) ?? MAP_LAYERS[0]!;
}

export function isMapLayerId(value: string | null): value is MapLayerId {
  return !!value && MAP_LAYERS.some((l) => l.id === value);
}

/** A short, direction-explicit comparison sentence for a single domain
 * row in the simplified selected-profile summary (docs/design/
 * health-equity-product-consolidation.md's domain-summary requirement)
 * -- always states plainly that a higher value means more concern,
 * never a bare "higher"/"lower" a reader has to guess the meaning of.
 * Every band names "concern" explicitly, including the middle band --
 * two independent cold usability reviews both flagged the earlier
 * "Near the county middle" (no "concern" word) as ambiguous about
 * whether that was a good or a bad thing. */
export function domainComparisonPhrase(percentile: number): string {
  if (percentile >= 75) return "Higher concern than most county tracts";
  if (percentile >= 50) return "Somewhat higher concern than the county middle";
  if (percentile >= 25) return "Near typical concern for the county";
  return "Lower concern than most county tracts";
}
