import { describe, expect, it } from "vitest";
import { DEFAULT_WEIGHTS, normalizeWeights } from "@/app/prioritize/weight-sliders";

describe("normalizeWeights", () => {
  it("always sums to (approximately) 1.0, regardless of raw slider values", () => {
    const raw = { health_burden: 37, access_barriers: 12, environmental_burden: 90, resource_accessibility: 5, workforce_shortage: 61 };
    const normalized = normalizeWeights(raw);
    const total = Object.values(normalized).reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(1.0, 9);
  });

  it("splits evenly when every raw value is equal", () => {
    const normalized = normalizeWeights(DEFAULT_WEIGHTS);
    for (const value of Object.values(normalized)) {
      expect(value).toBeCloseTo(0.2, 9);
    }
  });

  it("falls back to an equal split rather than dividing by zero when every raw value is zero", () => {
    const raw = { health_burden: 0, access_barriers: 0, environmental_burden: 0, resource_accessibility: 0, workforce_shortage: 0 };
    const normalized = normalizeWeights(raw);
    const values = Object.values(normalized);
    expect(values.every((v) => Number.isFinite(v))).toBe(true);
    expect(values.reduce((a, b) => a + b, 0)).toBeCloseTo(1.0, 9);
  });

  it("preserves relative proportions between domains", () => {
    const raw = { health_burden: 80, access_barriers: 20, environmental_burden: 0, resource_accessibility: 0, workforce_shortage: 0 };
    const normalized = normalizeWeights(raw);
    expect(normalized.health_burden).toBeCloseTo(0.8, 9);
    expect(normalized.access_barriers).toBeCloseTo(0.2, 9);
  });
});
