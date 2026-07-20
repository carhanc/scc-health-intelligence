/** A computed "+12 vs. county median" style delta, replacing raw
 * side-by-side numbers a reader would otherwise have to subtract
 * themselves (Explore's comparison panel, Prioritize's compare panel).
 * Direction-aware: whether a positive delta reads as "more concern" or
 * "less concern" depends on the metric, so the caller supplies it rather
 * than this component guessing from the sign alone. */
export function ComparisonDelta({
  value,
  baselineLabel,
  higherIsMoreConcern = true,
  unit = "",
}: {
  value: number;
  baselineLabel: string;
  higherIsMoreConcern?: boolean;
  unit?: string;
}) {
  if (value === 0) {
    return (
      <span className="text-xs text-[var(--color-text-secondary)]">Same as {baselineLabel}</span>
    );
  }
  const isMoreConcerning = higherIsMoreConcern ? value > 0 : value < 0;
  const tone = isMoreConcerning ? "text-[var(--color-caution-strong)]" : "text-[var(--color-success)]";
  const sign = value > 0 ? "+" : "";
  return (
    <span className={`text-xs font-medium tabular-nums ${tone}`}>
      {sign}
      {value}
      {unit} vs. {baselineLabel}
    </span>
  );
}
