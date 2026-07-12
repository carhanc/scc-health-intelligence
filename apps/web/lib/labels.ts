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
