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

/** Five-class sequential concern ramp (lowest -> highest) for the Explore
 * map choropleth and any other place-level "combined concern" indicator.
 * Supersedes DEC-072's teal-to-red gradient (see DEC-090): green to red,
 * with lightness falling from yellow to deep red so the order survives
 * red-green color blindness (adjacent-step deltaE >= 16 under simulated
 * deuteranopia). Pair with explicit "Lower/Higher concern" legend text and a
 * non-color cue wherever it appears. Keep in sync with
 * apps/web/app/globals.css's --concern-scale-* properties. */
export const CONCERN_SCALE = [
  "#a8d98c", // lowest concern: soft green
  "#f1e08a", // low-moderate: pale yellow
  "#f2a950", // moderate: amber
  "#d4533a", // elevated: red-orange
  "#7f1a2c", // highest concern: deep red
] as const;

/** Distinct gray fill for tracts with no score for the current
 * scenario -- never part of the concern scale, never a shade that
 * could be mistaken for "lowest concern." Pair with a hatch pattern in
 * the actual map paint layer so absence is structurally, not just
 * chromatically, distinct. */
export const CONCERN_NO_DATA_COLOR = "#cfd6d3";

export const COLOR = {
  background: "#f4f6f4",
  surface: "#ffffff",
  surfaceSunken: "#e9edea",
  textPrimary: "#12241f",
  textSecondary: "#3f514b",
  textTertiary: "#566761",
  border: "#dce1de",
  borderStrong: "#b9c2be",
  interactive: "#0f5f57",
  interactiveHover: "#0b4740",
  interactiveSubtle: "#e0eeeb",
  accent: "#e8892b",
  accentStrong: "#9a4a0a",
  caution: "#b8720a",
  cautionSubtle: "#fbefd9",
  alert: "#b3261e",
  alertSubtle: "#fbe9e8",
  success: "#2a6a3c",
  successSubtle: "#e4f1e7",
  neutral: "#5d6d68",
  neutralSubtle: "#e9edea",
} as const;

/** Builds a MapLibre GL `interpolate` color-expression stop array for a
 * 0-100 concern percentile using the concern gradient above. */
export function scoreColorExpression(
  propertyExpression: unknown[],
  domain: ConcernDomain = FULL_CONCERN_DOMAIN,
): (string | number | unknown[])[] {
  const stopCount = CONCERN_SCALE.length;
  const stops: (string | number)[] = [];
  CONCERN_SCALE.forEach((color, i) => {
    stops.push(domain[0] + (i / (stopCount - 1)) * (domain[1] - domain[0]), color);
  });
  return ["interpolate", ["linear"], propertyExpression, ...stops];
}

/** The [low, high] values that map to the two ends of the ramp. */
export type ConcernDomain = readonly [number, number];
export const FULL_CONCERN_DOMAIN: ConcernDomain = [0, 100];

/** The ramp's end points for a set of composite scores: the 2nd and 98th
 * percentile, so the full green-to-red range shows up across the county
 * instead of every tract landing mid-ramp. Colors then mean "lower or
 * higher than other neighborhoods", which is what the legend says. */
export function computeConcernDomain(values: readonly number[]): ConcernDomain {
  const sorted = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (sorted.length < 10) return FULL_CONCERN_DOMAIN;
  const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(q * (sorted.length - 1))))]!;
  const lo = at(0.02);
  const hi = Math.max(at(0.98), lo + 10);
  return [lo, hi];
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

/** The ramp color for a 0-100 concern value, linearly interpolated between
 * CONCERN_SCALE stops exactly as the map's fill expression does, so a tick,
 * chip or bar drawn with it always matches the tract's color on the map. */
export function concernColorFor(value: number, domain: ConcernDomain = FULL_CONCERN_DOMAIN): string {
  const steps = CONCERN_SCALE.length - 1;
  const span = Math.max(1e-9, domain[1] - domain[0]);
  const t01 = Math.min(1, Math.max(0, (value - domain[0]) / span));
  const pos = t01 * steps;
  const i = Math.min(steps - 1, Math.floor(pos));
  const t = pos - i;
  const a = hexToRgb(CONCERN_SCALE[i]!);
  const b = hexToRgb(CONCERN_SCALE[i + 1]!);
  const mix = (k: number) => Math.round(a[k]! + (b[k]! - a[k]!) * t);
  return `rgb(${mix(0)}, ${mix(1)}, ${mix(2)})`;
}
