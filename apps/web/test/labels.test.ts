import { describe, expect, it } from "vitest";
import { domainLabel } from "@/lib/labels";

describe("domainLabel", () => {
  it("converts every known raw domain key to its plain-language label", () => {
    expect(domainLabel("health_burden")).toBe("Health needs");
    expect(domainLabel("access_barriers")).toBe("Access barriers");
    expect(domainLabel("environmental_burden")).toBe("Environmental conditions");
    expect(domainLabel("resource_accessibility")).toBe("Community resources");
    expect(domainLabel("workforce_shortage")).toBe("Workforce shortage");
  });

  it("never returns a raw snake_case string for a known domain", () => {
    for (const key of ["health_burden", "access_barriers", "environmental_burden", "resource_accessibility", "workforce_shortage"]) {
      expect(domainLabel(key)).not.toContain("_");
    }
  });

  it("humanizes an unrecognized domain key rather than showing it raw", () => {
    expect(domainLabel("future_new_domain")).toBe("Future new domain");
  });
});
