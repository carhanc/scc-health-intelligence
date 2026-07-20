/** Makes a metric's directionality explicit instead of implicit --
 * "higher = more concern" or "higher = better" next to any number whose
 * direction isn't self-evident from its name alone. */
export function MetricDirectionLabel({ direction }: { direction: "higher-is-more-concern" | "higher-is-better" | "lower-is-better" }) {
  const text =
    direction === "higher-is-more-concern"
      ? "Higher = more concern"
      : direction === "higher-is-better"
        ? "Higher = better"
        : "Lower = better";
  return <span className="text-xs text-[var(--color-text-tertiary)]">{text}</span>;
}
