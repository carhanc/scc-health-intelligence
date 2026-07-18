import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { GeographyDetail } from "@/app/explore/geography-detail";
import { api } from "@/lib/api";
import type {
  ScoreExplanationResponse,
  TractProfile,
  TractBoundaryCollectionResponse,
  DomainListResponse,
} from "@/lib/api";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    api: {
      ...actual.api,
      getTractProfile: vi.fn(),
      explainScore: vi.fn(),
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

const profileFixture: TractProfile = {
  geography_type: "tract",
  tract_geoid_2020: "06085500400",
  name: "Census Tract 5004",
  name_long: "Census Tract 5004, Santa Clara County",
  county_fips: "06085",
  area_land_sqm: 1_000_000,
  area_water_sqm: 0,
  supervisor_district: 1,
  supervisor_district_share: 1,
  supervisor_district_is_clean_assignment: true,
  data_mode: "demo",
  note: "Demo snapshot",
};

// Deliberately unequal weights: "Highest percentile domain" (90) is
// weighted low (0.05); "Highest actual contributor" (Access barriers,
// percentile 70) is weighted high (0.50) -- contribution = percentile x
// weight, so the two sort orders genuinely disagree here, unlike the
// platform's one equally-weighted "Balanced overview" scenario where
// they coincide by construction. This is exactly the regression DEC-074
// fixes: the old implementation sorted by domain_score/percentile alone
// and would have reported "Highest percentile domain" as the driver.
const unequalWeightExplanation: ScoreExplanationResponse = {
  scenario_id: "custom_unequal_v1",
  scenario_label: "Custom unequal weighting",
  tract_geoid_2020: "06085500400",
  score: 39.5,
  coverage_fraction: 1,
  domains: [
    {
      domain: "environmental_burden",
      domain_score: 90,
      configured_weight: 0.05,
      normalized_weight: 0.05,
      contribution: 4.5,
      metrics: [
        {
          metric_id: "high_percentile_low_weight",
          label: "Highest-percentile, lowest-weight metric",
          domain: "environmental_burden",
          subdomain: "pollution_burden",
          raw_value: 95,
          unit: "statewide percentile (0-100)",
          direction: "concern_high",
          percentile: 90,
          effective_weight: 0.05,
          contribution: 4.5,
          standard_error: null,
          low_confidence_limit: null,
          high_confidence_limit: null,
          source_id: "calenviroscreen",
          citation: "CalEnviroScreen 5.0",
          plain_language_definition: "A high-percentile metric that is nonetheless weighted lightly.",
          limitations: "",
        },
      ],
    },
    {
      domain: "access_barriers",
      domain_score: 70,
      configured_weight: 0.5,
      normalized_weight: 0.5,
      contribution: 35,
      metrics: [
        {
          metric_id: "moderate_percentile_high_weight",
          label: "Moderate-percentile, highest-weight metric",
          domain: "access_barriers",
          subdomain: "mobility",
          raw_value: 22.4,
          unit: "%",
          direction: "concern_high",
          percentile: 70,
          effective_weight: 0.5,
          contribution: 35,
          standard_error: null,
          low_confidence_limit: null,
          high_confidence_limit: null,
          source_id: "acs",
          citation: "ACS 2023 5-year",
          plain_language_definition: "A moderate-percentile metric that is nonetheless the largest contributor.",
          limitations: "",
        },
      ],
    },
  ],
  domains_missing: [],
  stability_label: "Moderately stable",
  data_confidence: {
    confidence_score: 0.85,
    coverage_component: 1,
    precision_component: 0.8,
    geography_quality_component: 1,
    freshness_source_component: 0.8,
  },
  monte_carlo: {
    median_score: 39.5,
    ci_lower: 35,
    ci_upper: 44,
    median_rank: 100,
    rank_ci_lower: 90,
    rank_ci_upper: 110,
    probability_top_decile: 0.02,
    probability_top_quartile: 0.3,
    n_draws: 500,
    seed: 1,
  },
  weight_sensitivity: null,
  data_mode: "demo",
};

const boundariesFixture: TractBoundaryCollectionResponse = {
  type: "FeatureCollection",
  scenario_id: "custom_unequal_v1",
  data_mode: "demo",
  features: Array.from({ length: 200 }, (_, i) => ({
    type: "Feature" as const,
    geometry: { type: "Polygon" as const, coordinates: [] },
    properties: {
      tract_geoid_2020: `0608550${String(i).padStart(4, "0")}`,
      name: `Tract ${i}`,
      score: 50,
      coverage_fraction: 1,
      stability_label: "Robust",
      health_burden_score: null,
      access_barriers_score: null,
      environmental_burden_score: null,
      resource_accessibility_score: null,
      workforce_shortage_score: null,
    },
  })),
};

const domainsFixture: DomainListResponse = {
  domains: [
    {
      domain: "environmental_burden",
      subdomains: ["pollution_burden"],
      metrics: [
        {
          metric_id: "high_percentile_low_weight",
          label: "Highest-percentile, lowest-weight metric",
          domain: "environmental_burden",
          subdomain: "pollution_burden",
          unit: "statewide percentile (0-100)",
          direction: "concern_high",
          plain_language_definition: "",
          limitations: "",
          citation: "",
        },
      ],
    },
    {
      domain: "access_barriers",
      subdomains: ["mobility"],
      metrics: [
        {
          metric_id: "moderate_percentile_high_weight",
          label: "Moderate-percentile, highest-weight metric",
          domain: "access_barriers",
          subdomain: "mobility",
          unit: "%",
          direction: "concern_high",
          plain_language_definition: "",
          limitations: "",
          citation: "",
        },
      ],
    },
  ],
};

describe("TractDetail driver ranking (DEC-074 regression)", () => {
  it("names the domain with the largest CONTRIBUTION as the driver, not the domain with the highest raw percentile", async () => {
    vi.mocked(api.getTractProfile).mockResolvedValue(profileFixture);
    vi.mocked(api.explainScore).mockResolvedValue(unequalWeightExplanation);
    vi.mocked(api.getAllTractBoundaries).mockResolvedValue(boundariesFixture);
    vi.mocked(api.getDomains).mockResolvedValue(domainsFixture);

    renderWithClient(
      <GeographyDetail
        selected={{ geographyType: "tract", geoid: "06085500400", displayName: "Census Tract 5004", source: "url" }}
        scenarioId="custom_unequal_v1"
        onCompare={() => {}}
        onClearSelection={() => {}}
        onSelect={() => {}}
      />,
    );

    // Contribution-based (correct): Access barriers contributed 35 of
    // 39.5 points -- far more than Environmental burden's 4.5, even
    // though Environmental burden has the higher raw percentile (90 vs
    // 70). The interpretation sentence must name Access barriers.
    await waitFor(() => expect(screen.getByText(/contributed to primarily by/)).toBeInTheDocument());
    const interpretation = screen.getByText(/contributed to primarily by/).closest("p")!;
    expect(interpretation.textContent).toMatch(/access barriers/i);
    expect(interpretation.textContent).not.toMatch(/driven mainly by environmental burden/i);

    // The old, buggy sort (by domain_score/percentile) would have picked
    // Environmental burden (90) here -- explicitly assert it did not.
    expect(interpretation.textContent?.toLowerCase().indexOf("access barriers")).toBeGreaterThan(-1);
  });

  it("ranks the specific-drivers list by contribution, with the largest contributor first", async () => {
    vi.mocked(api.getTractProfile).mockResolvedValue(profileFixture);
    vi.mocked(api.explainScore).mockResolvedValue(unequalWeightExplanation);
    vi.mocked(api.getAllTractBoundaries).mockResolvedValue(boundariesFixture);
    vi.mocked(api.getDomains).mockResolvedValue(domainsFixture);

    renderWithClient(
      <GeographyDetail
        selected={{ geographyType: "tract", geoid: "06085500400", displayName: "Census Tract 5004", source: "url" }}
        scenarioId="custom_unequal_v1"
        onCompare={() => {}}
        onClearSelection={() => {}}
        onSelect={() => {}}
      />,
    );

    await waitFor(() => expect(screen.getByText("Why this area appears here")).toBeInTheDocument());
    // Driver rows are the only <li> elements on this page (DomainDisclosure's
    // metric rows are plain <div>s) -- scoping to listitem role avoids also
    // matching the same metric labels rendered inside the (separate,
    // domain_score-ordered) "What's driving this score" disclosures above.
    const driverListItems = screen.getAllByRole("listitem");
    const driverLabels = driverListItems.map((el) => el.textContent ?? "");
    const highWeightIndex = driverLabels.findIndex((t) => t.includes("Moderate-percentile, highest-weight"));
    const lowWeightIndex = driverLabels.findIndex((t) => t.includes("Highest-percentile, lowest-weight"));
    expect(highWeightIndex).toBeGreaterThanOrEqual(0);
    expect(lowWeightIndex).toBeGreaterThanOrEqual(0);
    // The higher-contribution metric (35 points) must be listed before
    // the lower-contribution one (4.5 points), regardless of percentile.
    expect(highWeightIndex).toBeLessThan(lowWeightIndex);
  });

  it("shows a real comparison-percentile sentence with the true countywide denominator, not a hardcoded 408", async () => {
    vi.mocked(api.getTractProfile).mockResolvedValue(profileFixture);
    vi.mocked(api.explainScore).mockResolvedValue(unequalWeightExplanation);
    vi.mocked(api.getAllTractBoundaries).mockResolvedValue(boundariesFixture);
    vi.mocked(api.getDomains).mockResolvedValue(domainsFixture);

    renderWithClient(
      <GeographyDetail
        selected={{ geographyType: "tract", geoid: "06085500400", displayName: "Census Tract 5004", source: "url" }}
        scenarioId="custom_unequal_v1"
        onCompare={() => {}}
        onClearSelection={() => {}}
        onSelect={() => {}}
      />,
    );

    // boundariesFixture has 200 features (not 408) -- the comparison
    // sentence and the rank denominator must both reflect that real
    // number, proving neither is a hardcoded literal.
    await waitFor(() => expect(screen.getByText(/of 200 Santa Clara County tracts/)).toBeInTheDocument());
    expect(screen.getByText(/Countywide rank \(of 200\)/)).toBeInTheDocument();
    expect(screen.queryByText(/of 408/)).not.toBeInTheDocument();
  });
});
