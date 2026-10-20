"use client";

import Link from "next/link";
import { useSourceEntries } from "@/lib/use-sources";
import type { FreshnessState } from "@scc-health/ui";

// Same grouping used on Validate/Data (coverage-panel.tsx, data-explorer.tsx).
const AVAILABLE_STATES: FreshnessState[] = ["newest_verified", "intentional_older"];

/** A real "can I trust this?" signal reachable from every page. Computed
 * from the same source list Validate and Data render, never a separate
 * summary; renders nothing while that list is still loading rather than a
 * placeholder or a guess. */
export function TrustSignal({ className = "" }: { className?: string }) {
  const sources = useSourceEntries();
  if (sources.length === 0) return null;

  const availableCount = sources.filter((s) => AVAILABLE_STATES.includes(s.freshness_state)).length;
  // Anything not available and current (overdue or unavailable) counts against "all current".
  const allCurrent = availableCount === sources.length;

  return (
    <Link
      href="/data"
      className={`inline-flex items-center gap-2 rounded-[var(--radius-sm)] text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-interactive)] ${className}`}
    >
      <span
        aria-hidden="true"
        className={`h-2 w-2 shrink-0 rounded-full ${allCurrent ? "bg-[var(--color-success)]" : "bg-[var(--color-caution)]"}`}
      />
      <span>
        {allCurrent
          ? `All ${sources.length} data sources current`
          : `${availableCount} of ${sources.length} sources current`}
        <span className="ml-1 underline underline-offset-2">See sources</span>
      </span>
    </Link>
  );
}
