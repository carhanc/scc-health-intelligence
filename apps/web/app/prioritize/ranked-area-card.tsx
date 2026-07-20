"use client";

import Link from "next/link";
import { ScreeningScore, StabilityBadge } from "@scc-health/ui";
import type { StabilityLabel } from "@/lib/api";
import { domainLabel, stabilityLabelDescription } from "@/lib/labels";
import { UseInAdvocateButton } from "../use-in-advocate-button";

export interface RankedAreaCardData {
  rank: number;
  tractGeoid: string;
  name: string;
  score: number | null;
  coverageFraction: number;
  stabilityLabel: StabilityLabel | null;
  /** Real top-2 domain drivers when available -- from the decision-memo
   * endpoint for a named scenario, or bundled per-tract for a custom
   * weighting. Omitted (not fabricated) when genuinely unavailable. */
  topFactors: { domain: string; contribution: number }[] | null;
  showCoverage: boolean;
  scenarioId: string | null;
}

/** One concise ranked-area result -- the default way to see "the
 * highest screening concern," replacing a 408-row table as the first
 * thing shown (docs/design/product-wide-flow-simplification-research.md
 * "PRIORITIZE"). The full sortable table remains available via "View
 * all 408 tracts," for advanced inspection. */
export function RankedAreaCard({ area }: { area: RankedAreaCardData }) {
  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-[var(--color-text-primary)]">
            #{area.rank} {area.name}
          </p>
          <div className="mt-1">
            <ScreeningScore score={area.score} mode="compact" />
          </div>
        </div>
        {area.stabilityLabel && (
          <div className="text-right">
            <StabilityBadge label={area.stabilityLabel} />
            <p className="mt-1 max-w-[220px] text-xs text-[var(--color-text-secondary)]">
              {stabilityLabelDescription(area.stabilityLabel)}
            </p>
          </div>
        )}
      </div>

      {area.topFactors && area.topFactors.length > 0 && (
        <p className="mt-2 text-xs text-[var(--color-text-secondary)]">
          Top factors:{" "}
          {area.topFactors
            .slice(0, 2)
            .map((f) => domainLabel(f.domain))
            .join(", ")}
        </p>
      )}

      {area.showCoverage && (
        <p className="mt-1 text-xs text-[var(--color-caution-strong)]">
          Data coverage: {Math.round(area.coverageFraction * 100)}% (some factors are missing for this area)
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Link
          href={`/explore?geography=tract&id=${encodeURIComponent(area.tractGeoid)}${
            area.scenarioId ? `&scenario=${encodeURIComponent(area.scenarioId)}` : ""
          }`}
          className="text-xs font-medium text-[var(--color-interactive)] hover:underline"
        >
          View area
        </Link>
        <UseInAdvocateButton
          geography={{ geographyType: "tract", geoid: area.tractGeoid, displayName: area.name }}
          scenarioId={area.scenarioId ?? undefined}
          sourcePage="Prioritize"
        />
      </div>
    </div>
  );
}
