"use client";

import { OptimizerScenarios } from "../access-lab/optimizer-scenarios";

/**
 * "Constraints" in Prioritize reuses the exact same precomputed,
 * disclosed mobile-clinic siting scenarios Access Lab already shows
 * (analytics.optimization_runs) -- no live OR-Tools solving is exposed
 * through the API (the established DEC-022/DEC-051 boundary), so this
 * panel presents site-count, distance-threshold, and equity-constraint
 * variations as pre-vetted, transparent scenarios rather than an
 * interactive solver. Reused directly rather than rebuilt, so a single
 * tested component stays the source of truth for both pages.
 */
export function ConstraintsPanel() {
  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--color-text-secondary)]">
        These scenarios explore how many new mobile-service sites, at what distance threshold, and
        with or without an equity requirement, could reach the most health-burden-weighted
        population -- the same modeled planning scenarios shown in the Access Lab. Site-count,
        distance, and equity constraints are varied across scenarios rather than freely adjustable,
        so every result shown here reflects a specific, disclosed, pre-vetted combination of
        assumptions.
      </p>
      <OptimizerScenarios />
    </div>
  );
}
