import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { GeographyDetail } from "@/app/explore/geography-detail";
import { api } from "@/lib/api";
import type { ScoreExplanationResponse, TractProfile } from "@/lib/api";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    api: {
      ...actual.api,
      getTractProfile: vi.fn(),
      explainScore: vi.fn(),
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

const profileFixture: TractProfile = {
  geography_type: "tract",
  tract_geoid_2020: "06085500300",
  name: "Census Tract 5003",
  name_long: "Census Tract 5003, Santa Clara County",
  county_fips: "06085",
  area_land_sqm: 1_200_000,
  area_water_sqm: 0,
  supervisor_district: 2,
  supervisor_district_share: 1,
  supervisor_district_is_clean_assignment: true,
  data_mode: "demo",
  note: "Demo snapshot",
};

const dataLimitedExplanation: ScoreExplanationResponse = {
  scenario_id: "default_integrated_screen_v1",
  scenario_label: "Default integrated screen",
  tract_geoid_2020: "06085500300",
  score: null,
  coverage_fraction: 0.05,
  domains: [
    {
      domain: "Health burden",
      domain_score: null,
      configured_weight: 0.2,
      normalized_weight: 0.2,
      contribution: null,
      metrics: [
        {
          metric_id: "diabetes_prevalence",
          label: "Diabetes prevalence",
          domain: "Health burden",
          subdomain: "Chronic disease",
          raw_value: null,
          unit: "%",
          direction: "concern_high",
          percentile: null,
          effective_weight: 0.5,
          contribution: null,
          standard_error: null,
          low_confidence_limit: null,
          high_confidence_limit: null,
          source_id: "cdc_places",
          citation: "CDC PLACES 2025",
          plain_language_definition: "Share of adults with diagnosed diabetes.",
          limitations: "Model-based small-area estimate.",
        },
      ],
    },
  ],
  domains_missing: ["Environmental burden", "Resource accessibility"],
  stability_label: "Data-limited",
  data_confidence: null,
  monte_carlo: null,
  weight_sensitivity: null,
  data_mode: "demo",
};

describe("GeographyDetail (tract, missing data)", () => {
  it("never displays a missing score as zero -- it shows a dash and an explicit no-score message", async () => {
    vi.mocked(api.getTractProfile).mockResolvedValueOnce(profileFixture);
    vi.mocked(api.explainScore).mockResolvedValueOnce(dataLimitedExplanation);

    renderWithClient(
      <GeographyDetail
        selected={{ geographyType: "tract", geoid: "06085500300", displayName: "Census Tract 5003", source: "url" }}
        scenarioId="default_integrated_screen_v1"
        onCompare={() => {}}
        onClearSelection={() => {}}
        onSelect={() => {}}
      />,
    );

    await waitFor(() => expect(screen.getByText(/isn't enough data to compute a combined score/)).toBeInTheDocument());
    // The score display must render an em dash placeholder, never "0".
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.queryByText("0", { selector: "p" })).not.toBeInTheDocument();
  });

  it("lists every domain missing enough data by name instead of silently omitting them", async () => {
    vi.mocked(api.getTractProfile).mockResolvedValueOnce(profileFixture);
    vi.mocked(api.explainScore).mockResolvedValueOnce(dataLimitedExplanation);

    renderWithClient(
      <GeographyDetail
        selected={{ geographyType: "tract", geoid: "06085500300", displayName: "Census Tract 5003", source: "url" }}
        scenarioId="default_integrated_screen_v1"
        onCompare={() => {}}
        onClearSelection={() => {}}
        onSelect={() => {}}
      />,
    );

    await waitFor(() =>
      expect(screen.getByText(/Environmental burden, Resource accessibility/)).toBeInTheDocument(),
    );
  });
});
