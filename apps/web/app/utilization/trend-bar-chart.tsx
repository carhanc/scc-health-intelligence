import type { ReactNode } from "react";

/** A small, dependency-free SVG bar chart -- the current stack has no
 * chart library installed, and one real series does not justify adding
 * one (docs/design/product-wide-flow-simplification-research.md
 * "PERFORMANCE"). Every value plotted is a real, already-fetched
 * encounter count; suppressed years are shown as a labeled gap in the
 * bar, never interpolated or plotted as zero. The full breakdown table
 * remains the accessible alternative right below this chart. */
export function TrendBarChart({
  title,
  unit,
  points,
  sourceNote,
}: {
  title: string;
  unit: string;
  points: { year: number; value: number | null; suppressed: boolean }[];
  sourceNote: ReactNode;
}) {
  const width = 640;
  const height = 200;
  const padding = { top: 12, right: 12, bottom: 28, left: 44 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;

  const maxValue = Math.max(1, ...points.map((p) => p.value ?? 0));
  const barGap = 4;
  const barWidth = points.length > 0 ? plotWidth / points.length - barGap : 0;

  return (
    <figure className="rounded-[var(--radius-lg)] border border-[var(--color-border)] p-4">
      <figcaption>
        <p className="text-sm font-semibold text-[var(--color-text-primary)]">{title}</p>
        <p className="text-xs text-[var(--color-text-secondary)]">
          Unit: {unit} · {sourceNote}
        </p>
      </figcaption>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`${title}, by year. The exact values are in the table below this chart.`}
        className="mt-2 h-auto w-full"
      >
        <line
          x1={padding.left}
          y1={padding.top}
          x2={padding.left}
          y2={height - padding.bottom}
          stroke="var(--color-border)"
        />
        <line
          x1={padding.left}
          y1={height - padding.bottom}
          x2={width - padding.right}
          y2={height - padding.bottom}
          stroke="var(--color-border)"
        />
        {points.map((p, i) => {
          const x = padding.left + i * (barWidth + barGap);
          if (p.suppressed || p.value === null) {
            return (
              <g key={p.year}>
                <text
                  x={x + barWidth / 2}
                  y={height - padding.bottom - 6}
                  textAnchor="middle"
                  fontSize="9"
                  fill="var(--color-text-tertiary)"
                >
                  n/a
                </text>
                <text
                  x={x + barWidth / 2}
                  y={height - 10}
                  textAnchor="middle"
                  fontSize="9"
                  fill="var(--color-text-tertiary)"
                >
                  {p.year}
                </text>
              </g>
            );
          }
          const barHeight = (p.value / maxValue) * plotHeight;
          return (
            <g key={p.year}>
              <rect
                x={x}
                y={height - padding.bottom - barHeight}
                width={Math.max(barWidth, 1)}
                height={barHeight}
                fill="var(--color-interactive)"
              />
              <text
                x={x + barWidth / 2}
                y={height - 10}
                textAnchor="middle"
                fontSize="9"
                fill="var(--color-text-tertiary)"
              >
                {p.year}
              </text>
            </g>
          );
        })}
      </svg>
    </figure>
  );
}
