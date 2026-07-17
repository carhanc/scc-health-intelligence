import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import {
  PageIntro,
  PlainLanguageDefinition,
  MetricCard,
  MetricDirectionLabel,
  RankContext,
  ComparisonDelta,
  BackendWakeState,
  HowCalculatedDisclosure,
  GuidedNextStep,
  MobileBottomSheet,
  GlossaryTerm,
} from "@scc-health/ui";

describe("PageIntro", () => {
  it("renders the title as an h1 and the description below it", () => {
    render(<PageIntro title="Explore">Find a city, district, or census tract.</PageIntro>);
    expect(screen.getByRole("heading", { level: 1, name: "Explore" })).toBeInTheDocument();
    expect(screen.getByText("Find a city, district, or census tract.")).toBeInTheDocument();
  });
});

describe("PlainLanguageDefinition", () => {
  it("pairs the term with its definition in visible text, not a tooltip", () => {
    render(<PlainLanguageDefinition term="Modeled estimate">A calculated travel time, not a measured one.</PlainLanguageDefinition>);
    expect(screen.getByText("Modeled estimate:")).toBeInTheDocument();
    expect(screen.getByText("A calculated travel time, not a measured one.")).toBeInTheDocument();
  });
});

describe("MetricCard", () => {
  it("renders value, label, direction, and detail together", () => {
    render(
      <MetricCard value={7} label="tracts in the top quartile" direction="Higher = more concern" detail="Under the balanced scenario." />,
    );
    expect(screen.getByText("7")).toBeInTheDocument();
    expect(screen.getByText("tracts in the top quartile")).toBeInTheDocument();
    expect(screen.getByText("Higher = more concern")).toBeInTheDocument();
    expect(screen.getByText("Under the balanced scenario.")).toBeInTheDocument();
  });
});

describe("MetricDirectionLabel", () => {
  it("renders the exact phrasing for each direction", () => {
    const { rerender } = render(<MetricDirectionLabel direction="higher-is-more-concern" />);
    expect(screen.getByText("Higher = more concern")).toBeInTheDocument();
    rerender(<MetricDirectionLabel direction="higher-is-better" />);
    expect(screen.getByText("Higher = better")).toBeInTheDocument();
    rerender(<MetricDirectionLabel direction="lower-is-better" />);
    expect(screen.getByText("Lower = better")).toBeInTheDocument();
  });
});

describe("RankContext", () => {
  it("always states the denominator", () => {
    render(<RankContext rank={1} total={408} />);
    expect(screen.getByText("#1 of 408, county-relative")).toBeInTheDocument();
  });

  it("shows the uncertainty range only when it differs from the point rank", () => {
    render(<RankContext rank={1} total={408} rangeLow={1} rangeHigh={3} />);
    expect(screen.getByText(/\(range #1-3\)/)).toBeInTheDocument();

    render(<RankContext rank={5} total={408} rangeLow={5} rangeHigh={5} />);
    expect(screen.queryByText(/range #5-5/)).not.toBeInTheDocument();
  });
});

describe("ComparisonDelta", () => {
  it("states 'Same as' when there is no difference", () => {
    render(<ComparisonDelta value={0} baselineLabel="county median" />);
    expect(screen.getByText("Same as county median")).toBeInTheDocument();
  });

  it("shows a signed value against the baseline label", () => {
    render(<ComparisonDelta value={12} baselineLabel="county median" unit="pts" />);
    expect(screen.getByText(/\+12pts vs\. county median/)).toBeInTheDocument();
  });

  it("treats a negative delta as more concerning when higher normally means more concern", () => {
    render(<ComparisonDelta value={-12} baselineLabel="county median" higherIsMoreConcern={false} unit="pts" />);
    // lower value + higherIsMoreConcern=false => this delta IS more concerning
    const el = screen.getByText(/-12pts vs\. county median/);
    expect(el.className).toContain("caution");
  });
});

describe("BackendWakeState", () => {
  it("renders nothing when not loading", () => {
    const { container } = render(<BackendWakeState isLoading={false} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows an ordinary loading skeleton before the delay threshold elapses", () => {
    render(<BackendWakeState isLoading delayMs={4000} />);
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.queryByText(/waking up/)).not.toBeInTheDocument();
  });

  it("switches to the wake message after the delay, and never claims a precise duration", async () => {
    vi.useFakeTimers();
    render(<BackendWakeState isLoading delayMs={1000} onRetry={vi.fn()} />);
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByText("The data service is waking up")).toBeInTheDocument();
    const message = screen.getByText(/first load may take up to a couple of minutes/);
    expect(message.textContent).not.toMatch(/\d+\s*(second|minute)s?\b.*\bexactly|precisely/i);
    vi.useRealTimers();
  });

  it("calls onRetry when the Retry button is clicked", async () => {
    vi.useFakeTimers();
    const onRetry = vi.fn();
    render(<BackendWakeState isLoading delayMs={100} onRetry={onRetry} />);
    await act(async () => {
      vi.advanceTimersByTime(100);
    });
    vi.useRealTimers();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});

describe("HowCalculatedDisclosure", () => {
  it("renders as a native details/summary disclosure with fixed label", () => {
    render(<HowCalculatedDisclosure>Uses the domain weights for this scenario.</HowCalculatedDisclosure>);
    expect(screen.getByText("How is this calculated?")).toBeInTheDocument();
    expect(screen.getByText("Uses the domain weights for this scenario.")).toBeInTheDocument();
  });
});

describe("GuidedNextStep", () => {
  it("renders the prompt and the next-step children", () => {
    render(
      <GuidedNextStep prompt="What would you like to do next?">
        <a href="/advocate">Use in Advocate</a>
        <a href="/copilot">Ask Copilot about this tract</a>
      </GuidedNextStep>,
    );
    expect(screen.getByText("What would you like to do next?")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Use in Advocate" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ask Copilot about this tract" })).toBeInTheDocument();
  });
});

describe("MobileBottomSheet", () => {
  it("passes its title through to the underlying dialog", () => {
    render(
      <MobileBottomSheet open={false} onClose={vi.fn()} title="Tract 06085503112">
        <p>Score details</p>
      </MobileBottomSheet>,
    );
    expect(screen.getByText("Tract 06085503112")).toBeInTheDocument();
  });
});

describe("GlossaryTerm", () => {
  it("shows its definition on focus, not hover-only", () => {
    render(<GlossaryTerm definition="A county-relative screening score.">combined concern score</GlossaryTerm>);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    fireEvent.focus(screen.getByText("combined concern score"));
    expect(screen.getByRole("tooltip")).toHaveTextContent("A county-relative screening score.");
  });
});
