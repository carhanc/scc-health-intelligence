import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ExploreTable } from "@/app/explore/explore-table";
import { api } from "@/lib/api";
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
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

const fixture: ScenarioScoresResponse = {
  scenario_id: "default_integrated_screen_v1",
  data_mode: "demo",
  total_tracts: 1,
  scores: [
    {
      tract_geoid_2020: "06085503304",
      scenario_id: "default_integrated_screen_v1",
      score: 71.8,
      coverage_fraction: 1,
      domains_missing: [],
      stability_label: "Robust",
      confidence_score: 0.9,
      monte_carlo_median: 71.8,
      monte_carlo_ci_lower: 65,
      monte_carlo_ci_upper: 78,
      monte_carlo_median_rank: 40,
      probability_top_decile: 0.4,
    },
  ],
};

describe("ExploreTable row selection", () => {
  it("selecting a row builds the canonical SelectedGeography with the row's real GEOID, not a placeholder", async () => {
    vi.mocked(api.getScenarioScores).mockResolvedValueOnce(fixture);
    const onSelectTract = vi.fn();
    renderWithClient(
      <ExploreTable scenarioId="default_integrated_screen_v1" selectedTractId={null} onSelectTract={onSelectTract} />,
    );

    const cell = await waitFor(() => screen.getByText("06085503304"));
    const row = cell.closest("tr");
    if (!row) throw new Error("row not found");
    fireEvent.click(row);

    expect(onSelectTract).toHaveBeenCalledWith({
      geographyType: "tract",
      geoid: "06085503304",
      displayName: "Tract 06085503304",
      source: "table",
    });
    // The exact defect this regression guards against: the geoid must
    // never be the literal geography-type string.
    expect(onSelectTract).not.toHaveBeenCalledWith(expect.objectContaining({ geoid: "tract" }));
  });

  it("is keyboard-operable: Enter on a focused row selects it, same as a click", async () => {
    vi.mocked(api.getScenarioScores).mockResolvedValueOnce(fixture);
    const onSelectTract = vi.fn();
    renderWithClient(
      <ExploreTable scenarioId="default_integrated_screen_v1" selectedTractId={null} onSelectTract={onSelectTract} />,
    );

    const cell = await waitFor(() => screen.getByText("06085503304"));
    const row = cell.closest("tr");
    if (!row) throw new Error("row not found");
    fireEvent.keyDown(row, { key: "Enter" });

    expect(onSelectTract).toHaveBeenCalledWith(
      expect.objectContaining({ geographyType: "tract", geoid: "06085503304", source: "table" }),
    );
  });
});
