// Real, existing priority scenarios (apps/api's /api/v1/scenarios), reframed
// as a plain-language "focus" picker shared by every page that lets someone
// choose a screening lens (Advocate, Prioritize, Copilot -- see FocusPicker
// in ./focus-picker.tsx). No internal words like "Scenario," "Priority
// lens," "Screening configuration," or "Weighting" appear in the picker
// itself -- selectedScenarioId (the real backend scenario_id) is completely
// unchanged internally.

/** The default, recommended scenario -- always shown first and pre-
 * highlighted, so a user who doesn't want to think about this can just
 * keep moving. */
export const RECOMMENDED_FOCUS_ID = "default_integrated_screen_v1";

/** A handful of the real scenarios shown directly, before "See more focus
 * areas" -- chosen as the most broadly recognizable topics, not a
 * ranking of importance. The remaining real scenarios are still fully
 * available, just behind the disclosure. */
export const COMMON_FOCUS_IDS = [
  "coverage_navigation_v1",
  "diabetes_prevention_v1",
  "mobile_transit_care_v1",
];

/** One short, plain-language sentence per real scenario_id, shown under
 * its label on the focus picker -- independent of (and shorter than) the
 * backend's own `description` field, which is written for the Prioritize
 * page's denser context. */
export const FOCUS_BLURBS: Record<string, string> = {
  default_integrated_screen_v1:
    "A balanced view of health needs, access barriers, community resources, and local conditions.",
  diabetes_prevention_v1: "Diabetes and related chronic-disease burden, plus what makes prevention harder.",
  mobile_transit_care_v1: "Mobility barriers and where transit-linked or mobile care could help.",
  coverage_navigation_v1: "Insurance coverage and getting people connected to care.",
  older_adult_support_v1: "Needs and access barriers that especially affect older adults.",
  behavioral_health_access_v1: "Access to mental health and substance-use care.",
  food_access_v1: "Access to healthy, affordable food.",
  environmental_burden_priority_v1: "Environmental conditions that affect health.",
};

/** A focus area a user might reasonably look for that this platform does
 * not yet score at the tract level -- kept as a real, explained
 * "unavailable" option rather than silently omitted or faked with an
 * unrelated weighting under a misleading label (CLAUDE.md: "a failed
 * source must produce a visible unavailable state, a logged reason, and
 * a documented fallback"; DECISIONS.md DEC-027). Shown by FocusPicker
 * only under "See more focus areas," never as a permanent dominant
 * block -- the unavailability is disclosed when someone looks for it,
 * not forced on everyone before they've asked. */
export const UNAVAILABLE_FOCUS_AREAS = [
  {
    id: "language_access",
    label: "Language access",
    reason:
      "No tract-level language-barrier data source is currently scored, so this platform cannot build this focus area without reweighting unrelated factors under a misleading label. Coverage and navigation or a custom focus are the closest available substitutes.",
  },
];
