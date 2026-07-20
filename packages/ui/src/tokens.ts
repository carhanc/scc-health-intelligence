// Design tokens for contexts that need literal values (MapLibre paint
// expressions, SVG chart fills) rather than a CSS custom property --
// keep every value here in sync with apps/web/app/globals.css's
// `--chart-*` / `--map-scale-*` declarations (cross-referenced by comment
// in both files). CSS custom properties remain the source of truth for
// everything renderable as a class name; this file exists only because
// MapLibre GL JS style expressions require literal color strings.

/** Okabe-Ito colorblind-safe qualitative palette, 6 colors. */
export const CHART_PALETTE = [
  "#0072b2", // blue
  "#e69f00", // orange
  "#009e73", // bluish green
  "#cc79a7", // reddish purple
  "#56b4e9", // sky blue
  "#d55e00", // vermillion
] as const;

/** Five-stop concern gradient (lowest -> highest) for the Explore map
 * choropleth and any other place-level "combined concern" indicator
 * (DEC-072, docs/design/health-equity-ux-redesign.md §6). This is a
 * deliberate reversal of an earlier single-hue "never red/green" rule
 * -- see DEC-072 for the guardrails that replace it (explicit
 * "Higher/Lower concern" legend text, non-color redundant cues on every
 * use, this red kept as a distinct token from COLOR.alert). Keep in
 * sync with apps/web/app/globals.css's --concern-scale-* properties. */
export const CONCERN_SCALE = [
  "#1a5c4a", // lowest concern
  "#6a9b7f", // low-moderate
  "#d8cfa8", // moderate (warm neutral)
  "#e08f3c", // elevated
  "#c0392b", // highest concern
] as const;

/** Distinct gray fill for tracts with no score for the current
 * scenario -- never part of the concern scale, never a shade that
 * could be mistaken for "lowest concern." Pair with a hatch pattern in
 * the actual map paint layer so absence is structurally, not just
 * chromatically, distinct. */
export const CONCERN_NO_DATA_COLOR = "#d9d4cc";

export const COLOR = {
  background: "#faf9f7",
  surface: "#ffffff",
  surfaceSunken: "#f2efe9",
  textPrimary: "#1e2933",
  textSecondary: "#4b5a67",
  textTertiary: "#5c6874",
  border: "#d9d4cc",
  borderStrong: "#b8b0a2",
  interactive: "#0b6e75",
  interactiveHover: "#085158",
  interactiveSubtle: "#e3f0f0",
  caution: "#b8720a",
  cautionSubtle: "#fbf0dc",
  alert: "#b3261e",
  alertSubtle: "#fbe9e8",
  success: "#2f6b3a",
  successSubtle: "#e7f2e8",
  neutral: "#6b7885",
  neutralSubtle: "#eceae5",
} as const;

/** Builds a MapLibre GL `interpolate` color-expression stop array for a
 * 0-100 concern percentile using the concern gradient above. */
export function scoreColorExpression(
  propertyExpression: unknown[],
): (string | number | unknown[])[] {
  const stopCount = CONCERN_SCALE.length;
  const stops: (string | number)[] = [];
  CONCERN_SCALE.forEach((color, i) => {
    stops.push((i / (stopCount - 1)) * 100, color);
  });
  return ["interpolate", ["linear"], propertyExpression, ...stops];
}
