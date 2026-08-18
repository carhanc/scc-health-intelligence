import { domainLabel } from "@/lib/labels";

/**
 * Shows a screening view's real domain weights as a row of labeled bars,
 * one per domain, sorted by weight descending. This is the direct answer
 * to "is this weighting arbitrary?" -- a Health Advocacy Commission review
 * found that named scenarios (including the recommended default) never
 * showed their actual numbers anywhere, only a one-sentence qualitative
 * blurb, which read as an unexplained black box. Accepts weights on any
 * consistent scale (API scenarios use 0-1, the slider UI uses 0-100) --
 * always normalizes to a percentage of the total so callers never need to
 * pre-normalize. Never color-only: every bar is paired with its own
 * visible percentage, matching PercentileBar's same rule.
 */
export function WeightBreakdown({
  weights,
  compact = false,
}: {
  weights: Record<string, number>;
  compact?: boolean;
}) {
  const total = Object.values(weights).reduce((sum, v) => sum + v, 0);
  if (total <= 0) return null;

  const rows = Object.entries(weights)
    .map(([domain, value]) => ({ domain, pct: (value / total) * 100 }))
    .sort((a, b) => b.pct - a.pct);

  const summary = rows.map((r) => `${domainLabel(r.domain)} ${Math.round(r.pct)}%`).join(", ");

  return (
    <div
      role="img"
      aria-label={`Weighting: ${summary}`}
      className={compact ? "space-y-1" : "space-y-1.5"}
    >
      {rows.map((r) => (
        <div key={r.domain} aria-hidden="true" className="flex items-center gap-2">
          <span
            className={`w-[46%] shrink-0 text-[var(--color-text-secondary)] ${compact ? "text-xs" : "text-sm"}`}
          >
            {domainLabel(r.domain)}
          </span>
          <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--color-neutral-subtle)]">
            <span
              className="block h-full rounded-full bg-[var(--color-interactive)]"
              style={{ width: `${Math.max(2, r.pct)}%` }}
            />
          </span>
          <span
            className={`w-9 shrink-0 text-right tabular-nums text-[var(--color-text-secondary)] ${
              compact ? "text-xs" : "text-sm"
            }`}
          >
            {Math.round(r.pct)}%
          </span>
        </div>
      ))}
    </div>
  );
}
