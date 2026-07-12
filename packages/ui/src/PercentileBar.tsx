/** A horizontal 0-100 percentile bar with a marker for the primary value
 * and an optional marker for a comparison value. Always paired with a
 * visible numeric label (docs/01 §5.7: "Do not display percentiles
 * without raw values") -- this component never carries meaning that
 * isn't also stated in text somewhere in the caller. */
export function PercentileBar({
  percentile,
  comparePercentile,
  label,
  compareLabel,
}: {
  percentile: number | null;
  comparePercentile?: number | null;
  label: string;
  compareLabel?: string;
}) {
  if (percentile === null) {
    return (
      <div
        role="img"
        aria-label={`${label}: no percentile available`}
        className="h-2 w-full rounded-full bg-[var(--color-neutral-subtle)]"
      />
    );
  }

  const description =
    comparePercentile != null && compareLabel
      ? `${label}: ${Math.round(percentile)}th percentile countywide. ${compareLabel}: ${Math.round(comparePercentile)}th percentile.`
      : `${label}: ${Math.round(percentile)}th percentile countywide.`;

  return (
    <div role="img" aria-label={description} className="relative h-2 w-full rounded-full bg-[var(--color-neutral-subtle)]">
      <div
        aria-hidden="true"
        className="absolute top-1/2 h-3.5 w-1.5 -translate-y-1/2 rounded-full bg-[var(--color-interactive)]"
        style={{ left: `calc(${Math.min(100, Math.max(0, percentile))}% - 3px)` }}
      />
      {comparePercentile != null && (
        <div
          aria-hidden="true"
          className="absolute top-1/2 h-3.5 w-1.5 -translate-y-1/2 rounded-full border-2 border-[var(--color-caution)] bg-[var(--color-surface)]"
          style={{ left: `calc(${Math.min(100, Math.max(0, comparePercentile))}% - 3px)` }}
        />
      )}
    </div>
  );
}
