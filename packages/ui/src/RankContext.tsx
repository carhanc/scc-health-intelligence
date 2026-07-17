/** Standardizes "#N of TOTAL, county-relative" phrasing -- Explore,
 * Prioritize, and Overview's recommendations list each phrased this
 * slightly differently before this component existed. Always states the
 * denominator, never a bare rank number (docs/design/content-style-guide.md:
 * every numeric answer needs its universe made explicit). */
export function RankContext({
  rank,
  total,
  rangeLow,
  rangeHigh,
}: {
  rank: number;
  total: number;
  /** Optional uncertainty range on the rank itself, e.g. "#1-3". */
  rangeLow?: number;
  rangeHigh?: number;
}) {
  const rangeText =
    rangeLow !== undefined && rangeHigh !== undefined && (rangeLow !== rank || rangeHigh !== rank)
      ? ` (range #${rangeLow}-${rangeHigh})`
      : "";
  return (
    <span className="text-xs text-[var(--color-text-secondary)]">
      #{rank} of {total}, county-relative{rangeText}
    </span>
  );
}
