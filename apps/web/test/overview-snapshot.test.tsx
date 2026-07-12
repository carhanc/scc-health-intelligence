import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CountywideSnapshot } from "@/app/overview-snapshot";
import { api, ApiError } from "@/lib/api";
import type { ScenarioScoresResponse } from "@/lib/api";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    api: {
      ...actual.api,
      getScenarioScores: vi.fn(),
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
