// Plain-language display labels for identifiers the API returns in their
// internal, snake_case form (e.g. domain keys like "workforce_shortage").
// The API intentionally keeps these keys stable/technical since they are
// also used as object keys and join columns; this module is the single
// place that converts them to the reader-facing phrasing used throughout
// Explore, matching docs/01_UX_UI_SPEC.md §5.4's suggested domain names.

const DOMAIN_LABELS: Record<string, string> = {
  health_burden: "Health burden",
  access_barriers: "Access barriers",
  environmental_burden: "Environmental burden",
  resource_accessibility: "Resource accessibility",
  workforce_shortage: "Workforce shortage",
};

/** Converts a raw domain key to its plain-language label. Falls back to a
 * generic humanization (underscores to spaces, capitalized) for any
 * domain not yet in the table above, so a newly added domain is never
 * shown as raw snake_case even before this file is updated for it. */
export function domainLabel(domain: string): string {
  return DOMAIN_LABELS[domain] ?? humanize(domain);
}

function humanize(raw: string): string {
  const spaced = raw.replace(/_/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

// --- Phase 6 Access Lab plain-language labels ---
// Per docs/08's UI content standard: internal method names, solver/model
// terms, and category keys must never appear verbatim to a reader without
// statistical training. This is the single place those conversions live
// for the Access Lab, matching this file's existing domainLabel() pattern.

const CATEGORY_LABELS: Record<string, string> = {
  hospital: "Hospitals",
  clinic: "Clinics and health centers",
  food_retailer: "Food / SNAP retailers",
  transit_hub: "Transit stops",
};

export function categoryLabel(category: string): string {
  return CATEGORY_LABELS[category] ?? humanize(category);
}

const METHOD_LABELS: Record<string, string> = {
  osm_network_walk: "Real walking-route distance",
  osm_network_drive: "Real driving-route distance",
  straight_line_screening: "Straight-line distance (screening estimate, not a real route)",
  scheduled_transit_access_proxy: "Scheduled transit access (published schedule, not real-time)",
  e2sfca_gaussian_decay: "Access considering both nearby services and local demand",
  resource_gap_tercile_overlap: "Where high estimated need and low measured access overlap",
  network_distance_precomputed: "Real network-route distance",
};

/** Converts an internal method/model label (e.g. "osm_network_walk",
 * "e2sfca_gaussian_decay") into the plain-language phrase a reader
 * without statistical training should see instead. Never render a raw
 * method string directly in the UI -- always pass it through this. */
export function methodLabel(method: string): string {
  return METHOD_LABELS[method] ?? humanize(method);
}

const SERVICE_LEVEL_LABELS: Record<string, string> = {
  frequent: "Frequent scheduled service",
  regular: "Regular scheduled service",
  infrequent: "Infrequent scheduled service",
  minimal: "Minimal scheduled service",
  none: "No scheduled service found nearby",
};

export function serviceLevelLabel(level: string): string {
  return SERVICE_LEVEL_LABELS[level] ?? humanize(level);
}

const CAPACITY_TYPE_LABELS: Record<string, string> = {
  real_capacity: "Based on real reported capacity (licensed beds)",
  count_proxy: "Based on number of facilities (capacity data not available)",
};

export function capacityTypeLabel(capacityType: string): string {
  return CAPACITY_TYPE_LABELS[capacityType] ?? humanize(capacityType);
}

const GAP_CLASSIFICATION_LABELS: Record<string, string> = {
  priority_gap: "High estimated need, low measured access",
  need_met: "High estimated need, high measured access",
  low_priority: "Low estimated need, low measured access",
  well_served: "Low estimated need, high measured access",
};

export function gapClassificationLabel(classification: string): string {
  return GAP_CLASSIFICATION_LABELS[classification] ?? humanize(classification);
}
