import { describe, expect, it } from "vitest";
import { isValidGeographyId, parseSelectedGeographyFromParams } from "@/app/explore/selection";

describe("isValidGeographyId", () => {
  it("accepts a well-formed, in-county 11-digit tract GEOID", () => {
    expect(isValidGeographyId("tract", "06085500100")).toBe(true);
  });

  it("preserves and requires the leading zero -- a 10-digit number is not a valid tract GEOID", () => {
    expect(isValidGeographyId("tract", "6085500100")).toBe(false);
  });

  it("rejects the literal geography-type string, not just empty input", () => {
    // Regression test: this exact string was silently sent to the tract
    // profile API in place of a real GEOID (Phase 5 map-selection defect).
    expect(isValidGeographyId("tract", "tract")).toBe(false);
  });

  it("rejects a short display label such as a tract's human-readable suffix", () => {
    expect(isValidGeographyId("tract", "5033.21")).toBe(false);
  });

  it("rejects a tract GEOID outside Santa Clara County", () => {
    expect(isValidGeographyId("tract", "06001400100")).toBe(false);
  });

  it("rejects null, undefined, and empty identifiers", () => {
    expect(isValidGeographyId("tract", null)).toBe(false);
    expect(isValidGeographyId("tract", undefined)).toBe(false);
    expect(isValidGeographyId("tract", "")).toBe(false);
  });

  it("validates place, county/zcta, and supervisor-district id shapes independently of the tract rule", () => {
    expect(isValidGeographyId("place", "0668000")).toBe(true);
    expect(isValidGeographyId("place", "tract")).toBe(false);
    expect(isValidGeographyId("county", "06085")).toBe(true);
    expect(isValidGeographyId("zcta", "95110")).toBe(true);
    expect(isValidGeographyId("supervisor_district", "3")).toBe(true);
    expect(isValidGeographyId("supervisor_district", "9")).toBe(false);
  });
});

describe("parseSelectedGeographyFromParams (URL round trip)", () => {
  it("reconstructs a valid tract selection from shareable-URL params", () => {
    expect(parseSelectedGeographyFromParams("tract", "06085500100")).toEqual({
      geographyType: "tract",
      geoid: "06085500100",
      displayName: "06085500100",
      source: "url",
    });
  });

  it("returns no selection when the geography param is missing", () => {
    expect(parseSelectedGeographyFromParams(null, "06085500100")).toBeNull();
  });

  it("returns no selection when the id param is missing", () => {
    expect(parseSelectedGeographyFromParams("tract", null)).toBeNull();
  });

  it("returns no selection for an unsupported geography type, instead of passing it through blindly", () => {
    expect(parseSelectedGeographyFromParams("neighborhood", "06085500100")).toBeNull();
  });

  it("returns no selection when the id fails validation for its geography type (the hotfix regression case)", () => {
    expect(parseSelectedGeographyFromParams("tract", "tract")).toBeNull();
  });
});
