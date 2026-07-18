import { describe, expect, it } from "vitest";
import { MAP_LAYERS, getMapLayer, isMapLayerId, concernBandLabel } from "@/app/explore/layers";
import type { TractBoundaryFeatureProperties } from "@/lib/api";

const baseProps: TractBoundaryFeatureProperties = {
  tract_geoid_2020: "06085500100",
  name: "Test tract",
  score: 80,
  coverage_fraction: 0.9,
  stability_label: "Robust",
  health_burden_score: 60,
  access_barriers_score: 40,
  environmental_burden_score: 20,
  resource_accessibility_score: null,
  workforce_shortage_score: 100,
};

describe("MAP_LAYERS", () => {
  it("defines exactly the composite score, 5 domains, and data confidence -- no invented layer", () => {
    const ids = MAP_LAYERS.map((l) => l.id);
    expect(ids).toEqual([
      "score",
      "health_burden",
      "access_barriers",
      "environmental_burden",
      "resource_accessibility",
      "workforce_shortage",
      "confidence",
    ]);
  });

  it("reads each layer's value from real, already-present feature properties", () => {
    expect(getMapLayer("score").getValue(baseProps)).toBe(80);
    expect(getMapLayer("health_burden").getValue(baseProps)).toBe(60);
    expect(getMapLayer("resource_accessibility").getValue(baseProps)).toBeNull();
    // Confidence is coverage_fraction scaled to the same 0-100 range every
    // other layer uses, not a fraction shown inconsistently.
    expect(getMapLayer("confidence").getValue(baseProps)).toBe(90);
  });

  it("only the confidence layer is 'higher-better' -- every concern layer is 'higher-worse'", () => {
    const nonConfidence = MAP_LAYERS.filter((l) => l.id !== "confidence");
    expect(nonConfidence.every((l) => l.direction === "higher-worse")).toBe(true);
    expect(getMapLayer("confidence").direction).toBe("higher-better");
  });
});

describe("isMapLayerId", () => {
  it("accepts every real layer id and rejects anything else", () => {
    for (const layer of MAP_LAYERS) {
      expect(isMapLayerId(layer.id)).toBe(true);
    }
    expect(isMapLayerId("not_a_real_layer")).toBe(false);
    expect(isMapLayerId(null)).toBe(false);
  });
});

describe("concernBandLabel", () => {
  it("labels a value by its own raw magnitude, regardless of what the number means", () => {
    expect(concernBandLabel(90, "combined concern")).toBe("high combined concern");
    expect(concernBandLabel(10, "combined concern")).toBe("lower combined concern");
  });

  it("never inverts the band word for a higher-better noun -- a high coverage value is genuinely 'high confidence' in plain language, not 'lower confidence' read backwards", () => {
    // Inverting the word (not just the map color) here would produce
    // backwards, confusing copy: "90% coverage" is unambiguously *good*
    // and must read as "high confidence," never "lower confidence."
    // Direction only ever changes which color a value maps to
    // (buildFillColorExpression in explore-map.tsx), never this label.
    expect(concernBandLabel(90, "confidence")).toBe("high confidence");
    expect(concernBandLabel(10, "confidence")).toBe("lower confidence");
  });
});
