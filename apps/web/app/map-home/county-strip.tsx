"use client";

import { useMemo } from "react";
import { computeConcernDomain, concernColorFor } from "@scc-health/ui";

/**
 * All of the county's neighborhoods as thin ticks, lowest score to highest,
 * colored with the same ramp as the map, with the selected neighborhood
 * marked. It answers "how unusual is this place?" at a glance, and the
 * sentence next to it always says the same thing in words.
 */
export function CountyStrip({
  values,
  value,
  label,
}: {
  /** Every tract's score under the active focus (any order). */
  values: number[];
  value: number | null;
  label: string;
}) {
  const sorted = useMemo(() => [...values].sort((a, b) => a - b), [values]);
  const domain = useMemo(() => computeConcernDomain(sorted), [sorted]);
  const n = sorted.length;
  if (n === 0 || value === null) return null;

  // Position = how many neighborhoods score strictly lower.
  const below = sorted.filter((v) => v < value).length;
  const pos = n > 1 ? (below / (n - 1)) * 100 : 50;

  return (
    <figure className="m-0">
      <div className="relative" role="img" aria-label={label}>
        <svg
          viewBox={`0 0 ${n} 24`}
          preserveAspectRatio="none"
          shapeRendering="crispEdges"
          className="block h-6 w-full overflow-hidden rounded-[3px]"
          aria-hidden="true"
        >
          {sorted.map((v, i) => (
            <rect key={i} x={i} y={0} width={1.05} height={24} fill={concernColorFor(v, domain)} />
          ))}
        </svg>
        <span
          aria-hidden="true"
          className="absolute -top-1.5 h-9 w-[3px] -translate-x-1/2 rounded-full bg-[var(--color-text-primary)] shadow-[0_0_0_2px_#fff]"
          style={{ left: `${Math.min(99, Math.max(1, pos))}%` }}
        />
      </div>
      <figcaption className="mt-2 flex justify-between text-xs text-[var(--color-text-secondary)]">
        <span>Lowest of {n}</span>
        <span>Highest</span>
      </figcaption>
    </figure>
  );
}
