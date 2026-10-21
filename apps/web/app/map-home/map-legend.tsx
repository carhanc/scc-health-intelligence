"use client";

import { CONCERN_SCALE, CONCERN_NO_DATA_COLOR } from "@scc-health/ui";
import { getMapLayer, type MapLayerId } from "../explore/layers";

/** The map legend, styled as an overlay card. Wording is explicit because
 * color alone never carries the meaning. */
export function MapLegend({
  layerId,
  className = "",
  compact = false,
}: {
  layerId: MapLayerId;
  className?: string;
  /** Gradient and end labels only, for small screens. */
  compact?: boolean;
}) {
  const def = getMapLayer(layerId);
  const reversed = def.direction === "higher-better";
  const scale = reversed ? [...CONCERN_SCALE].reverse() : CONCERN_SCALE;
  const low = reversed ? "Less complete" : "Lower";
  const high = reversed ? "More complete" : "Higher";
  return (
    <div
      className={`rounded-[var(--radius-md)] bg-[var(--color-surface)] px-3.5 py-3 shadow-[var(--shadow-md)] ${className}`}
    >
      {!compact && <p className="text-xs font-semibold text-[var(--color-text-primary)]">{def.label}</p>}
      <div className={`${compact ? "" : "mt-2 "}flex h-2.5 w-44 overflow-hidden rounded-full`} role="img" aria-label={`Color scale from ${low.toLowerCase()} to ${high.toLowerCase()}`}>
        {scale.map((color, i) => (
          <span key={`${color}-${i}`} className="h-full flex-1" style={{ backgroundColor: color }} />
        ))}
      </div>
      <div className="mt-1 flex w-44 justify-between text-xs text-[var(--color-text-secondary)]">
        <span>{low}</span>
        <span>{high}</span>
      </div>
      {!compact && !reversed && (
        <p className="mt-1.5 max-w-44 text-xs text-[var(--color-text-tertiary)]">Compared with other neighborhoods</p>
      )}
      <div className={`mt-2 items-center gap-2 text-xs text-[var(--color-text-secondary)] ${compact ? "hidden" : "flex"}`}>
        <span
          aria-hidden="true"
          className="h-3 w-3 rounded-sm border border-[var(--color-border-strong)]"
          style={{
            backgroundColor: CONCERN_NO_DATA_COLOR,
            backgroundImage:
              "repeating-linear-gradient(45deg, transparent, transparent 2px, rgba(0,0,0,0.25) 2px, rgba(0,0,0,0.25) 3px)",
          }}
        />
        No score
      </div>
    </div>
  );
}
