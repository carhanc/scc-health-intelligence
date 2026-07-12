import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Badge, StabilityBadge, FreshnessBadge, DataModeBadge } from "@scc-health/ui";

describe("Badge", () => {
  it("renders its label text, never color alone, as the accessible content", () => {
    render(<Badge tone="alert">Overdue for refresh</Badge>);
    expect(screen.getByText("Overdue for refresh")).toBeInTheDocument();
  });
});

describe("StabilityBadge", () => {
  it.each([
    ["Robust", "holds up across nearly every"],
    ["Assumption-sensitive", "depends a lot on which priorities"],
    ["Data-limited", "less reliable than others"],
  ] as const)("renders %s with an explanatory title, not just a color", (label, expectedSubstring) => {
    render(<StabilityBadge label={label} />);
    const badge = screen.getByText(label);
    expect(badge.closest("span")).toHaveAttribute("title", expect.stringContaining(expectedSubstring));
  });
});

describe("FreshnessBadge", () => {
  it("labels a stale source as overdue in plain language", () => {
    render(<FreshnessBadge state="stale" />);
    expect(screen.getByText("Overdue for refresh")).toBeInTheDocument();
  });

  it("labels an unavailable source distinctly from a stale one", () => {
    render(<FreshnessBadge state="unavailable" />);
    expect(screen.getByText("Data unavailable")).toBeInTheDocument();
  });
});

describe("DataModeBadge", () => {
  it("distinguishes live, demo, and unavailable data explicitly in text", () => {
    const { rerender } = render(<DataModeBadge mode="live" />);
    expect(screen.getByText("Live data")).toBeInTheDocument();

    rerender(<DataModeBadge mode="demo" />);
    expect(screen.getByText("Demo snapshot")).toBeInTheDocument();

    rerender(<DataModeBadge mode="unavailable" />);
    expect(screen.getByText("Data unavailable")).toBeInTheDocument();
  });
});
