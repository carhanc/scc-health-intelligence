import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { PercentileBar } from "@scc-health/ui";

describe("PercentileBar", () => {
  it("never displays a percentile without a text description (never color/position-only)", () => {
    render(<PercentileBar percentile={82} label="Diabetes prevalence" />);
    expect(screen.getByRole("img", { name: /Diabetes prevalence: 82th percentile countywide/ })).toBeInTheDocument();
  });

  it("states plainly when no percentile is available, instead of showing an empty or zeroed bar", () => {
    render(<PercentileBar percentile={null} label="Air quality index" />);
    expect(screen.getByRole("img", { name: "Air quality index: no percentile available" })).toBeInTheDocument();
  });

  it("includes the comparison value in the same accessible description when provided", () => {
    render(
      <PercentileBar
        percentile={40}
        comparePercentile={75}
        label="Tract 06085500100"
        compareLabel="Tract 06085500200"
      />,
    );
    expect(
      screen.getByRole("img", {
        name: "Tract 06085500100: 40th percentile countywide. Tract 06085500200: 75th percentile.",
      }),
    ).toBeInTheDocument();
  });
});
