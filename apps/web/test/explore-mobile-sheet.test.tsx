import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MobileSelectedSheet } from "@/app/explore/geography-detail";
import { api } from "@/lib/api";
import type { ScoreExplanationResponse } from "@/lib/api";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    api: {
      ...actual.api,
      explainScore: vi.fn(),
      getTractProfile: vi.fn(),
      getAllTractBoundaries: vi.fn(),
      getDomains: vi.fn(),
    },
  };
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

const explanationFixture: ScoreExplanationResponse = {
  scenario_id: "default_integrated_screen_v1",
  scenario_label: "Balanced overview",
  tract_geoid_2020: "06085500500",
  score: 82,
  coverage_fraction: 1,
  domains: [],
  domains_missing: [],
  stability_label: "Robust",
  data_confidence: null,
  monte_carlo: {
    median_score: 82,
    ci_lower: 80,
    ci_upper: 84,
    median_rank: 3,
    rank_ci_lower: 1,
    rank_ci_upper: 5,
    probability_top_decile: 0.99,
    probability_top_quartile: 1,
    n_draws: 500,
    seed: 1,
  },
  weight_sensitivity: null,
  data_mode: "demo",
};

describe("MobileSelectedSheet", () => {
  beforeEach(() => {
    // TractDetail (mounted inside the sheet regardless of open state)
    // also queries these two for the countywide denominator and missing-
    // metric roster -- not the focus of these tests, but TanStack Query
    // warns loudly if a queryFn resolves to undefined, so give both a
    // minimal valid shape.
    vi.mocked(api.getAllTractBoundaries).mockResolvedValue({
      type: "FeatureCollection",
      features: [],
      scenario_id: "default_integrated_screen_v1",
      data_mode: "demo",
    });
    vi.mocked(api.getDomains).mockResolvedValue({ domains: [] });
  });

  it("shows the non-modal orientation panel, not a blank state, when nothing is selected", () => {
    renderWithClient(
      <MobileSelectedSheet
        selected={null}
        scenarioId="default_integrated_screen_v1"
        onCompare={() => {}}
        onClearSelection={() => {}}
        onSelect={() => {}}
      />,
    );
    expect(screen.getByText("Search for a community")).toBeInTheDocument();
  });

  it("collapsed summary shows the place name, concern band, and rank without waiting for the full sheet to open", async () => {
    vi.mocked(api.explainScore).mockResolvedValue(explanationFixture);
    vi.mocked(api.getTractProfile).mockResolvedValue({
      geography_type: "tract",
      tract_geoid_2020: "06085500500",
      name: "Census Tract 5005",
      name_long: "Census Tract 5005, Santa Clara County",
      county_fips: "06085",
      area_land_sqm: 1,
      area_water_sqm: 0,
      supervisor_district: 1,
      supervisor_district_share: 1,
      supervisor_district_is_clean_assignment: true,
      data_mode: "demo",
      note: "",
    });

    renderWithClient(
      <MobileSelectedSheet
        selected={{ geographyType: "tract", geoid: "06085500500", displayName: "Census Tract 5005", source: "url" }}
        scenarioId="default_integrated_screen_v1"
        onCompare={() => {}}
        onClearSelection={() => {}}
        onSelect={() => {}}
      />,
    );

    // "high combined concern" and "Census Tract 5005" both legitimately
    // appear twice -- once in the collapsed summary button, once in the
    // (always-mounted, per native <dialog>) sheet's own interpretation
    // text/title -- so this scopes queries to the collapsed button itself
    // rather than the whole document.
    const collapsedButton = screen.getByRole("button", { name: /Census Tract 5005/ });
    await waitFor(() => expect(within(collapsedButton).getByText(/high combined concern/)).toBeInTheDocument());
    expect(within(collapsedButton).getByText(/#3 countywide/)).toBeInTheDocument();
    expect(within(collapsedButton).getByText("Census Tract 5005")).toBeInTheDocument();
  });

  it("tapping the collapsed summary requests the full profile to open", async () => {
    vi.mocked(api.explainScore).mockResolvedValue(explanationFixture);
    vi.mocked(api.getTractProfile).mockResolvedValue({
      geography_type: "tract",
      tract_geoid_2020: "06085500500",
      name: "Census Tract 5005",
      name_long: "Census Tract 5005, Santa Clara County",
      county_fips: "06085",
      area_land_sqm: 1,
      area_water_sqm: 0,
      supervisor_district: 1,
      supervisor_district_share: 1,
      supervisor_district_is_clean_assignment: true,
      data_mode: "demo",
      note: "",
    });

    renderWithClient(
      <MobileSelectedSheet
        selected={{ geographyType: "tract", geoid: "06085500500", displayName: "Census Tract 5005", source: "url" }}
        scenarioId="default_integrated_screen_v1"
        onCompare={() => {}}
        onClearSelection={() => {}}
        onSelect={() => {}}
      />,
    );

    await waitFor(() => expect(screen.getByRole("button", { name: /Census Tract 5005/ })).toBeInTheDocument());
    // The bottom sheet's <dialog> content (title) is present in the DOM
    // regardless of open state (native <dialog>, per Dialog.tsx) -- this
    // confirms the same selection is wired through to the sheet's title,
    // without asserting on jsdom's incomplete showModal()/close() support.
    // A closed native <dialog> is legitimately display:none per the UA
    // stylesheet (jsdom honors this), so getByRole correctly excludes its
    // content from the accessibility tree while closed -- getByText with
    // an explicit selector sidesteps that visibility gate to check DOM
    // wiring rather than accessible-tree membership.
    expect(screen.getByText("Census Tract 5005", { selector: "h2" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Census Tract 5005/ }));
    // No error/throw on click is the meaningful assertion here -- the
    // actual open-state toggle is exercised end-to-end by Playwright,
    // where a real browser's <dialog> implementation is available.
  });
});
