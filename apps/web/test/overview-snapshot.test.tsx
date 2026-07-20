import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CountywideSnapshot, PrioritySnapshot } from "@/app/overview-snapshot";
import { api, ApiError } from "@/lib/api";
import type { ScenarioScoresResponse, TractScenarioScore, RecommendationsResponse } from "@/lib/api";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    api: {
      ...actual.api,
      getScenarioScores: vi.fn(),
      getRecommendations: vi.fn(),
    },
  };
});

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

const scoresFixture: ScenarioScoresResponse = {
  scenario_id: "default_integrated_screen_v1",
  data_mode: "demo",
  total_tracts: 4,
  scores: [
    {
      tract_geoid_2020: "06085500100",
      scenario_id: "default_integrated_screen_v1",
      score: 80,
      coverage_fraction: 1,
      domains_missing: [],
      stability_label: "Robust",
      confidence_score: 0.9,
      monte_carlo_median: 80,
      monte_carlo_ci_lower: 75,
      monte_carlo_ci_upper: 85,
      monte_carlo_median_rank: 5,
      probability_top_decile: 0.9,
    },
    {
      tract_geoid_2020: "06085500200",
      scenario_id: "default_integrated_screen_v1",
      score: 40,
      coverage_fraction: 1,
      domains_missing: [],
      stability_label: "Moderately stable",
      confidence_score: 0.7,
      monte_carlo_median: 40,
      monte_carlo_ci_lower: 35,
      monte_carlo_ci_upper: 45,
      monte_carlo_median_rank: 200,
      probability_top_decile: 0.05,
    },
    {
      tract_geoid_2020: "06085500300",
      scenario_id: "default_integrated_screen_v1",
      // No score should never be treated as zero -- it must be excluded
      // from every count, not counted as "low concern".
      score: null,
      coverage_fraction: 0.1,
      domains_missing: ["Environmental burden"],
      stability_label: "Data-limited",
      confidence_score: null,
      monte_carlo_median: null,
      monte_carlo_ci_lower: null,
      monte_carlo_ci_upper: null,
      monte_carlo_median_rank: null,
      probability_top_decile: null,
    },
    {
      tract_geoid_2020: "06085500400",
      scenario_id: "default_integrated_screen_v1",
      score: 76,
      coverage_fraction: 1,
      domains_missing: [],
      stability_label: "Assumption-sensitive",
      confidence_score: 0.6,
      monte_carlo_median: 76,
      monte_carlo_ci_lower: 60,
      monte_carlo_ci_upper: 90,
      monte_carlo_median_rank: 8,
      probability_top_decile: 0.7,
    },
  ],
};

describe("CountywideSnapshot", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("counts only tracts with a non-null score, never treating a missing score as zero", async () => {
    vi.mocked(api.getScenarioScores).mockResolvedValueOnce(scoresFixture);
    renderWithClient(<CountywideSnapshot />);

    await waitFor(() => expect(screen.getByText("2")).toBeInTheDocument());
    // Two tracts scored >= 75 (80 and 76); the null-score tract must not
    // inflate or deflate this count.
    expect(screen.getByText(/tracts in the top quartile/)).toBeInTheDocument();
    expect(screen.getByText(/3 of 408 tracts scored/)).toBeInTheDocument();
    // Of the 2 high-concern tracts (80=Robust, 76=Assumption-sensitive),
    // only 1 is Robust -- the stability card must report "1 of 2", scoped
    // to the high-concern subset, not to all scored tracts.
    expect(screen.getByText("1 of 2")).toBeInTheDocument();
  });

  it("counts stability only within the high-concern subset, not across every scored tract (regression for the '7 vs 16' defect)", async () => {
    // A real bug shipped a "stable rankings" card computed by re-filtering
    // the FULL scored array for stability_label === "Robust", independent
    // of the high-concern filter -- the card's own copy ("of THOSE
    // rankings") implied a subset relationship the code never enforced.
    // This fixture includes a Robust tract that is NOT high-concern (C,
    // score 20) specifically so the old, buggy computation (which would
    // count it) and the fixed computation (which must not) disagree.
    const tracts: TractScenarioScore[] = [
      {
        tract_geoid_2020: "06085500100",
        scenario_id: "default_integrated_screen_v1",
        score: 80,
        coverage_fraction: 1,
        domains_missing: [],
        stability_label: "Robust",
        confidence_score: 0.9,
        monte_carlo_median: 80,
        monte_carlo_ci_lower: 75,
        monte_carlo_ci_upper: 85,
        monte_carlo_median_rank: 5,
        probability_top_decile: 0.9,
      },
      {
        tract_geoid_2020: "06085500200",
        scenario_id: "default_integrated_screen_v1",
        score: 76,
        coverage_fraction: 1,
        domains_missing: [],
        stability_label: "Assumption-sensitive",
        confidence_score: 0.5,
        monte_carlo_median: 76,
        monte_carlo_ci_lower: 55,
        monte_carlo_ci_upper: 90,
        monte_carlo_median_rank: 8,
        probability_top_decile: 0.6,
      },
      {
        // Robust, but NOT high-concern -- must not count toward the
        // "high-concern tracts that are stable" card.
        tract_geoid_2020: "06085500300",
        scenario_id: "default_integrated_screen_v1",
        score: 20,
        coverage_fraction: 1,
        domains_missing: [],
        stability_label: "Robust",
        confidence_score: 0.95,
        monte_carlo_median: 20,
        monte_carlo_ci_lower: 18,
        monte_carlo_ci_upper: 22,
        monte_carlo_median_rank: 380,
        probability_top_decile: 0.01,
      },
    ];
    vi.mocked(api.getScenarioScores).mockResolvedValueOnce({
      scenario_id: "default_integrated_screen_v1",
      data_mode: "demo",
      total_tracts: 3,
      scores: tracts,
    });
    renderWithClient(<CountywideSnapshot />);

    // High-concern count (score >= 75): tracts A and B => 2.
    await waitFor(() => expect(screen.getByText("2")).toBeInTheDocument());
    // Robust-AND-high-concern: only A => "1 of 2", never "2 of 2" (which
    // the old buggy computation -- counting Robust across all 3 tracts --
    // would have produced).
    expect(screen.getByText("1 of 2")).toBeInTheDocument();
    expect(screen.queryByText("2 of 2")).not.toBeInTheDocument();
  });

  it("shows a recoverable error state, not a blank or crashed section, when the API call fails", async () => {
    // The component retries once internally, so every call (not just the
    // first) must reject for the error state to ever be reached.
    vi.mocked(api.getScenarioScores).mockRejectedValue(new ApiError("Warehouse unavailable", 503));
    renderWithClient(<CountywideSnapshot />);

    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument(), { timeout: 5000 });
    expect(screen.getByRole("alert")).toHaveTextContent("Warehouse unavailable");
  });
});

describe("PrioritySnapshot", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("shows each recommendation's real countywide rank, not a hardcoded denominator", async () => {
    const recsFixture: RecommendationsResponse = {
      scenario_id: "default_integrated_screen_v1",
      data_mode: "demo",
      recommendations: [
        {
          scenario_id: "default_integrated_screen_v1",
          scenario_label: "Balanced overview",
          tract_geoid_2020: "06085500100",
          rank: 1,
          score: 80,
          coverage_fraction: 1,
          stability_label: "Robust",
          confidence_score: 0.9,
          assumptions: [],
          limitations: [],
          supporting_evidence: [
            { metric_id: "disability_rate", label: "Disability rate", raw_value: null, unit: "%", county_percentile: null, citation: "" },
          ],
          source_provenance: [],
        },
      ],
    };
    vi.mocked(api.getRecommendations).mockResolvedValueOnce(recsFixture);
    vi.mocked(api.getScenarioScores).mockResolvedValueOnce({
      scenario_id: "default_integrated_screen_v1",
      data_mode: "demo",
      total_tracts: 408,
      scores: [],
    });

    renderWithClient(<PrioritySnapshot />);

    await waitFor(() => expect(screen.getByText(/#1 of 408, county-relative/)).toBeInTheDocument());
  });
});
