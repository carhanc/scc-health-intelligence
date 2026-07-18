/** The single canonical presentation of the 0-100 health equity
 * screening score -- the composite, scenario-weighted number traced and
 * documented in docs/methods/screening-score-interpretation.md. Every
 * surface that shows this score to a person (Explore sidebar, the
 * selected-tract map callout, Prioritize rows, Compare, Advocate
 * evidence, exports) renders it through this component or its
 * `formatScreeningScore`/`concernBandFor` helpers, so the same
 * underlying float is never rounded or labeled two different ways in
 * two different places (docs/design/final-score-map-and-intuitiveness-
 * review.md).
 *
 * "Health equity screening score" is the label used everywhere -- never
 * the bare, easily-misread "Health Equity Score" -- because the number is
 * a screening/prioritization signal, not a direct measurement or ranking
 * of a community's health equity. */
export const SCREENING_SCORE_LABEL = "Health equity screening score";

export type ConcernBand = "high" | "moderate-to-high" | "moderate-to-low" | "lower";

const CONCERN_BANDS: { min: number; band: ConcernBand; label: string }[] = [
  { min: 75, band: "high", label: "High" },
  { min: 50, band: "moderate-to-high", label: "Moderate-to-high" },
  { min: 25, band: "moderate-to-low", label: "Moderate-to-low" },
  { min: 0, band: "lower", label: "Lower" },
];

/** The one place a raw 0-100 value is thresholded into a concern band --
 * shared by the map legend/fill, the headline, and every domain row so a
 * given number is always described with the same word. */
export function concernBandFor(value: number): { band: ConcernBand; label: string } {
  const found = CONCERN_BANDS.find((b) => value >= b.min) ?? CONCERN_BANDS[CONCERN_BANDS.length - 1]!;
  return { band: found.band, label: found.label };
}

/** `noun` names what's being described ("overlapping screening concern",
 * "access-barrier concern", ...) -- kept for callers (map hover/callout)
 * that want a short inline phrase rather than the full headline layout. */
export function concernBandLabel(value: number, noun: string): string {
  return `${concernBandFor(value).label.toLowerCase()} ${noun}`;
}

/** The one formatter for the score's display value. Always the nearest
 * integer -- the full-precision float remains available in exports and
 * the "How this was calculated" disclosure, explicitly labeled as the
 * underlying precise value, never shown as a second competing headline
 * number (docs/methods/screening-score-interpretation.md §7). */
export function formatScreeningScore(score: number | null): string {
  return score === null ? "—" : String(Math.round(score));
}

/** The one canonical public comparison sentence. `comparisonPercentile`
 * must be the Monte-Carlo-derived median-rank percentile, not a fresh
 * client-side sort of raw scores (docs/methods/screening-score-
 * interpretation.md §9 -- this is the specific "82% vs 83%" trust
 * problem an earlier usability review caught and fixed). */
export function screeningComparisonSentence(
  comparisonPercentile: number | null,
  totalTracts: number | null,
): string | null {
  if (comparisonPercentile === null || totalTracts === null) return null;
  // At the very top of the county ranking (including a tie for #1), a
  // literal "higher than 100% of tracts" reads as "higher than every
  // tract, including itself" -- two independent blind usability reviews
  // both flagged this exact ceiling phrasing as confusing/suspicious-
  // looking. The underlying statistic (Monte Carlo median-rank
  // percentile) is unchanged; only the sentence at the boundary changes.
  if (comparisonPercentile >= 99) {
    return `Among the highest screening concern of any tract in the county, out of ${totalTracts} Santa Clara County tracts`;
  }
  return `Higher screening concern than ${comparisonPercentile}% of ${totalTracts} Santa Clara County tracts`;
}

export interface ScreeningScoreProps {
  score: number | null;
  /** Monte-Carlo-derived comparison percentile -- see `screeningComparisonSentence`. */
  comparisonPercentile?: number | null;
  totalTracts?: number | null;
  /** The active screening view's display label, e.g. "Health equity overview". */
  scenarioLabel?: string | null;
  /** compact: small inline chip (map callout, hover preview, table cell).
   *  full: the dominant headline treatment (selected-tract profile).
   *  print: plain-text single line (exports, decision memo, print view). */
  mode?: "compact" | "full" | "print";
  /** Shown only when score is null -- e.g. "not enough data under this scenario". */
  missingReason?: string;
  className?: string;
}

function accessibleName({
  score,
  comparisonPercentile,
  totalTracts,
  scenarioLabel,
  missingReason,
}: Pick<ScreeningScoreProps, "score" | "comparisonPercentile" | "totalTracts" | "scenarioLabel" | "missingReason">): string {
  if (score === null) {
    return `${SCREENING_SCORE_LABEL}: not available${missingReason ? `, ${missingReason}` : ""}.`;
  }
  // Same rounded-value rule as the visual band above -- the accessible
  // name must never claim a different band than what's visually shown.
  const band = concernBandFor(Math.round(score));
  const comparison = screeningComparisonSentence(comparisonPercentile ?? null, totalTracts ?? null);
  return (
    `${SCREENING_SCORE_LABEL}: ${formatScreeningScore(score)} of 100, ${band.label.toLowerCase()} overlapping screening concern.` +
    (comparison ? ` ${comparison}${scenarioLabel ? ` under ${scenarioLabel}` : ""}.` : "") +
    ` Higher score means more overlapping screening concern, not a worse or unhealthier community.`
  );
}

export function ScreeningScore({
  score,
  comparisonPercentile = null,
  totalTracts = null,
  scenarioLabel = null,
  mode = "full",
  missingReason,
  className = "",
}: ScreeningScoreProps) {
  const formatted = formatScreeningScore(score);
  // The concern band is computed from the same *rounded* value shown as
  // the headline number, not the raw float -- otherwise two tracts that
  // both visibly display "75" could land in different bands (one at a
  // raw 74.6, one at 75.4), which independent blind usability review
  // caught as a real "same number, different label" trust problem.
  const band = score !== null ? concernBandFor(Math.round(score)) : null;
  const comparison = screeningComparisonSentence(comparisonPercentile, totalTracts);
  const name = accessibleName({ score, comparisonPercentile, totalTracts, scenarioLabel, missingReason });

  if (mode === "print") {
    return (
      <span role="img" aria-label={name} className={className}>
        {SCREENING_SCORE_LABEL}: {formatted}/100
        {band ? ` (${band.label} overlapping concern)` : ""}
        {scenarioLabel ? `, ${scenarioLabel}` : ""}
      </span>
    );
  }

  if (mode === "compact") {
    return (
      <span role="img" aria-label={name} className={`inline-flex items-baseline gap-1.5 ${className}`}>
        <span className="text-base font-semibold tabular-nums text-[var(--color-text-primary)]">{formatted}</span>
        <span className="text-xs text-[var(--color-text-tertiary)]">/100</span>
        {band && <span className="text-xs text-[var(--color-text-secondary)]">· {band.label} concern</span>}
      </span>
    );
  }

  // full mode -- the dominant headline treatment.
  return (
    <div role="img" aria-label={name} className={className}>
      <div className="flex items-baseline gap-2">
        <span className="text-4xl font-bold tabular-nums text-[var(--color-text-primary)] sm:text-[2.75rem]">
          {formatted}
        </span>
        <span className="text-lg text-[var(--color-text-tertiary)]">/100</span>
      </div>
      <p className="mt-0.5 text-xs font-semibold uppercase tracking-wide text-[var(--color-interactive)]">
        {SCREENING_SCORE_LABEL}
      </p>
      {score === null ? (
        <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
          {missingReason ?? "There isn't enough data to compute a combined score for this tract under this scenario."}
        </p>
      ) : (
        <>
          <p className="mt-2 text-lg font-semibold text-[var(--color-text-primary)]">
            {band!.label} overlapping screening concern
          </p>
          {comparison && (
            <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
              {comparison}
              {scenarioLabel ? ` under ${scenarioLabel}.` : "."}
            </p>
          )}
          <p className="mt-2 text-xs text-[var(--color-text-tertiary)]">
            0 = lower screening concern · 100 = higher screening concern
          </p>
        </>
      )}
    </div>
  );
}
