import { describe, expect, it } from "vitest";
import { cleanDashes, cleanDeep } from "@/lib/text-clean";

describe("cleanDashes", () => {
  it("turns a spaced double hyphen before a lowercase clause into a comma", () => {
    expect(cleanDashes("Not implemented -- each estimate carries its own margin")).toBe(
      "Not implemented, each estimate carries its own margin",
    );
  });

  it("turns it into a colon before a capitalized title", () => {
    expect(cleanDashes("Uncertainty -- Health equity overview")).toBe("Uncertainty: Health equity overview");
  });

  it("handles em and en dashes, with or without spaces", () => {
    expect(cleanDashes("a place\u2014not a person")).toBe("a place, not a person");
    expect(cleanDashes("a place \u2013 not a person")).toBe("a place, not a person");
  });

  it("keeps number ranges as a plain hyphen", () => {
    expect(cleanDashes("2008\u20142024")).toBe("2008-2024");
    expect(cleanDashes("1,000 \u2013 8,000 residents")).toBe("1,000-8,000 residents");
  });

  it("leaves command-line flags, hyphenated words and identifiers alone", () => {
    expect(cleanDashes("run uv --package scc-health-api")).toBe("run uv --package scc-health-api");
    expect(cleanDashes("06085500100 and transit-hub candidates")).toBe("06085500100 and transit-hub candidates");
  });
});

describe("cleanDeep", () => {
  it("cleans nested strings and passes other values through", () => {
    const input = { a: ["x -- y", 3, null], b: { c: "p \u2014 Q" } };
    expect(cleanDeep(input)).toEqual({ a: ["x, y", 3, null], b: { c: "p: Q" } });
  });
});
