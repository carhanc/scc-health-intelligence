"use client";

import { domainLabel } from "@/lib/labels";

const DOMAINS = [
  "health_burden",
  "access_barriers",
  "environmental_burden",
  "resource_accessibility",
  "workforce_shortage",
];

export const DEFAULT_WEIGHTS: Record<string, number> = Object.fromEntries(
  DOMAINS.map((d) => [d, 20]),
);

/** Normalizes a raw (not-necessarily-summing-to-100) slider state into a
 * weight vector that sums to exactly 1.0 -- this is the ONLY place a
 * custom weighting is turned into API-ready weights, so "weights always
 * sum correctly" holds no matter what the sliders show mid-drag. */
export function normalizeWeights(raw: Record<string, number>): Record<string, number> {
  const total = Object.values(raw).reduce((sum, v) => sum + v, 0);
  if (total <= 0) {
    return Object.fromEntries(DOMAINS.map((d) => [d, 1 / DOMAINS.length]));
  }
  return Object.fromEntries(DOMAINS.map((d) => [d, (raw[d] ?? 0) / total]));
}

/**
 * Custom domain-weighting sliders. Each slider is a relative weight (not
 * required to sum to 100 while adjusting) -- the "Applied weight" readout
 * next to each one always shows the normalized percentage that will
 * actually be used, computed live from all five sliders, so a reader
 * never sees a set of numbers that look like they should sum to 100 but
 * don't (docs' "weights always sum correctly" requirement).
 */
export function WeightSliders({
  weights,
  onChange,
}: {
  weights: Record<string, number>;
  onChange: (weights: Record<string, number>) => void;
}) {
  const normalized = normalizeWeights(weights);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
          Custom priority weighting
        </h3>
        <button
          type="button"
          onClick={() => onChange({ ...DEFAULT_WEIGHTS })}
          className="text-xs font-medium text-[var(--color-interactive)] hover:underline"
        >
          Reset to equal weights
        </button>
      </div>
      <p className="text-xs text-[var(--color-text-secondary)]">
        Move each slider to say how much this factor should matter. The percentages on the right
        always add up to 100% -- moving one slider changes how much every factor counts relative to
        the others, it does not need to be adjusted by hand.
      </p>

      <div className="space-y-4">
        {DOMAINS.map((domain) => (
          <div key={domain}>
            <div className="flex items-center justify-between text-sm">
              <label htmlFor={`weight-${domain}`} className="font-medium text-[var(--color-text-primary)]">
                {domainLabel(domain)}
              </label>
              <span
                className="tabular-nums text-[var(--color-text-secondary)]"
                aria-hidden="true"
              >
                {Math.round((normalized[domain] ?? 0) * 100)}%
              </span>
            </div>
            <input
              id={`weight-${domain}`}
              type="range"
              min={0}
              max={100}
              step={1}
              value={weights[domain] ?? 0}
              onChange={(e) => onChange({ ...weights, [domain]: Number(e.target.value) })}
              aria-valuetext={`${Math.round((normalized[domain] ?? 0) * 100)} percent`}
              className="mt-1 w-full accent-[var(--color-interactive)]"
            />
          </div>
        ))}
      </div>

      <p className="text-xs text-[var(--color-text-tertiary)]" role="status">
        Applied weights: {DOMAINS.map((d) => `${domainLabel(d)} ${Math.round((normalized[d] ?? 0) * 100)}%`).join(", ")}.
        Total: 100%.
      </p>
    </div>
  );
}
