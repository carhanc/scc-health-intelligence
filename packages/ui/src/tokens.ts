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

/** Single-hue sequential scale (light -> dark) for concern-percentile
 * choropleths. Never red/green -- red is reserved for genuine alerts,
 * never an ordinary high percentile (docs/01_UX_UI_SPEC.md §2/§18). */
export const MAP_SEQUENTIAL_SCALE = [
  "#eef6f6",
  "#cfe6e6",
  "#a3cfd0",
  "#6fb3b5",
  "#3d9396",
  "#0b6e75",
  "#063f43",
] as const;

/** Distinct neutral fill for tracts with no score for the current
 * scenario -- never part of the sequential scale, never zero. */
export const MAP_NO_DATA_COLOR = "#e4e0d8";

export const COLOR = {
  background: "#faf9f7",
  surface: "#ffffff",
  surfaceSunken: "#f2efe9",
  textPrimary: "#1e2933",
  textSecondary: "#4b5a67",
  textTertiary: "#6b7885",
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
 * 0-100 concern percentile using the sequential scale above. */
export function scoreColorExpression(
  propertyExpression: unknown[],
): (string | number | unknown[])[] {
  const stopCount = MAP_SEQUENTIAL_SCALE.length;
  const stops: (string | number)[] = [];
  MAP_SEQUENTIAL_SCALE.forEach((color, i) => {
    stops.push((i / (stopCount - 1)) * 100, color);
  });
  return ["interpolate", ["linear"], propertyExpression, ...stops];
}
