import { describe, expect, it } from "vitest";
import {
  crosswalkQualityLabel,
  dispositionKeyLabel,
  languageKeyLabel,
  payerKeyLabel,
  pattypeGroupLabel,
  rateReliabilityLabel,
  stabilityLabelDescription,
} from "@/lib/labels";

describe("pattypeGroupLabel", () => {
  it("converts both known ED encounter groups to plain language", () => {
    expect(pattypeGroupLabel("ed_only")).toBe("Seen in the ED, not admitted");
    expect(pattypeGroupLabel("inpatient_from_ed")).toBe("Seen in the ED, then admitted");
  });

  it("humanizes an unrecognized group rather than showing it raw", () => {
    expect(pattypeGroupLabel("some_new_group")).not.toContain("_");
  });
});

describe("crosswalkQualityLabel", () => {
  it("converts the known crosswalk quality tier to plain language", () => {
    expect(crosswalkQualityLabel("moderate_confidence_crosswalk")).toBe("Moderate-confidence area-based estimate");
  });
});

describe("rateReliabilityLabel", () => {
  it("distinguishes plausible from low-reliability estimates", () => {
    expect(rateReliabilityLabel("plausible_range")).toBe("Within a plausible range");
    expect(rateReliabilityLabel("low_reliability")).toContain("Unreliable");
  });
});

describe("stabilityLabelDescription", () => {
  it("returns a real explanation for every known stability label", () => {
    for (const label of ["Robust", "Moderately stable", "Assumption-sensitive"]) {
      const description = stabilityLabelDescription(label);
      expect(description).not.toBe(label);
      expect(description.length).toBeGreaterThan(10);
    }
  });

  it("falls back to the raw label for an unrecognized stability value rather than throwing", () => {
    expect(stabilityLabelDescription("Something new")).toBe("Something new");
  });
});

describe("dispositionKeyLabel / payerKeyLabel / languageKeyLabel", () => {
  it("never return a raw snake_case key for a known value", () => {
    expect(dispositionKeyLabel("routine_discharge")).not.toContain("_");
    expect(payerKeyLabel("self_pay_or_uninsured")).not.toContain("_");
    expect(languageKeyLabel("all_other_languages")).not.toContain("_");
  });
});
