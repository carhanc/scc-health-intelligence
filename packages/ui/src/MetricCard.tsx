import type { ReactNode } from "react";

/** A single value + label + supporting detail card -- the shape Overview's
 * `SnapshotFact`, Access Lab's summary tiles, and Validate's source-status
 * tiles each independently hand-rolled slightly differently. One shared
 * component so the visual language (and any future change to it) stays
 * consistent everywhere a headline number appears
 * (docs/design/health-equity-ux-redesign.md §7). */
export function MetricCard({
  value,
  label,
  detail,
  direction,
  tone = "neutral",
}: {
  value: ReactNode;
  label: string;
  detail?: ReactNode;
  /** Optional short directionality note, e.g. "higher = more concern". */
  direction?: string;
  tone?: "neutral" | "caution" | "alert" | "success";
}) {
  const valueColor =
    tone === "alert"
      ? "text-[var(--color-alert)]"
      : tone === "caution"
        ? "text-[var(--color-caution-strong)]"
        : tone === "success"
          ? "text-[var(--color-success)]"
          : "text-[var(--color-text-primary)]";

  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <p className={`text-3xl font-semibold tabular-nums ${valueColor}`}>{value}</p>
      <p className="mt-1 text-sm text-[var(--color-text-secondary)]">{label}</p>
      {direction && <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">{direction}</p>}
      {detail && <p className="mt-2 text-xs text-[var(--color-text-tertiary)]">{detail}</p>}
    </div>
  );
}
