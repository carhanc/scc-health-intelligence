"use client";

import { useMemo } from "react";
import { computeConcernDomain, concernColorFor } from "@scc-health/ui";
import type { FocusRow } from "./use-focus-scores";

/** "Where to look first": the highest-scoring neighborhoods under the
 * current focus. Hovering or focusing a row outlines that tract on the map,
 * and hovering a tract on the map highlights its row here. */
export function RankedList({
  rows,
  names,
  limit = 8,
  hoveredGeoid,
  onHover,
  onSelect,
  stale,
}: {
  rows: FocusRow[];
  names: Map<string, string>;
  limit?: number;
  hoveredGeoid: string | null;
  onHover: (geoid: string | null) => void;
  onSelect: (geoid: string, name: string) => void;
  /** Rows are from the previous focus while the next one loads. */
  stale?: boolean;
}) {
  const domain = useMemo(
    () => computeConcernDomain(rows.map((r) => r.score).filter((v): v is number => v !== null)),
    [rows],
  );
  const top = rows.filter((r) => r.score !== null).slice(0, limit);
  if (top.length === 0) return null;

  return (
    <ol className={`divide-y divide-[var(--color-border)] transition-opacity ${stale ? "opacity-60" : ""}`}>
      {top.map((r) => {
        const name = names.get(r.geoid) ?? r.geoid;
        const hovered = hoveredGeoid === r.geoid;
        return (
          <li key={r.geoid}>
            <button
              type="button"
              onClick={() => onSelect(r.geoid, name)}
              onMouseEnter={() => onHover(r.geoid)}
              onMouseLeave={() => onHover(null)}
              onFocus={() => onHover(r.geoid)}
              onBlur={() => onHover(null)}
              className={`flex w-full items-center gap-3 py-2.5 pr-1 text-left transition-colors ${
                hovered ? "bg-[var(--color-interactive-subtle)]" : "hover:bg-[var(--color-surface-sunken)]"
              }`}
            >
              <span className="w-6 shrink-0 text-right text-sm tabular-nums text-[var(--color-text-tertiary)]">
                {r.rank}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-[var(--color-text-primary)]">{name}</span>
                {r.stability && (
                  <span className="block truncate text-xs text-[var(--color-text-secondary)]">{r.stability}</span>
                )}
              </span>
              <span className="flex shrink-0 items-center gap-2">
                <span
                  aria-hidden="true"
                  className="h-3.5 w-3.5 rounded-[3px]"
                  style={{ backgroundColor: concernColorFor(r.score ?? 0, domain) }}
                />
                <span className="w-7 text-right text-sm font-semibold tabular-nums text-[var(--color-text-primary)]">
                  {Math.round(r.score ?? 0)}
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
