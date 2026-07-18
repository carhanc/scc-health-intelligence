import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
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
  // Real snake_case domain keys, matching what the backend actually
  // returns (`scenario_scores.py`'s `missing` list is built from
  // `scenario.weights` keys, e.g. "environmental_burden") -- the
  // fixture previously used already-formatted English words here,
  // which happened to survive `domainLabel`'s humanize-fallback
  // unchanged and masked that this fixture didn't match the real API
  // contract.
  domains_missing: ["environmental_burden", "resource_accessibility"],
  stability_label: "Data-limited",
  data_confidence: null,
  monte_carlo: null,
  weight_sensitivity: null,
  data_mode: "demo",
};

describe("GeographyDetail (tract, missing data)", () => {
  beforeEach(() => {
    vi.mocked(api.getAllTractBoundaries).mockResolvedValue({
      type: "FeatureCollection",
      features: [],
      scenario_id: "default_integrated_screen_v1",
      data_mode: "demo",
    });
    vi.mocked(api.getDomains).mockResolvedValue({ domains: [] });
  });

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
      expect(screen.getByText(/Environmental conditions, Community resources/)).toBeInTheDocument(),
    );
  });

  it("discloses a metric missing from a present domain by name, never silently dropping it from the driver list", async () => {
    // A domain can itself have a real, scored contribution while still
    // being missing one of its constituent metrics (e.g. a source that
    // failed for just that measure) -- the "Why this area appears here"
    // driver list must not silently show only what happened to load; it
    // must name what's absent, the same "insufficient data" contract that
    // applies to a wholly missing domain, applied per-metric.
    const partiallyMissingExplanation: ScoreExplanationResponse = {
      ...dataLimitedExplanation,
      score: 62,
      coverage_fraction: 0.6,
      domains: [
        {
          domain: "Health burden",
          domain_score: 70,
          configured_weight: 0.2,
          normalized_weight: 0.2,
          contribution: 14,
          metrics: [
            {
              metric_id: "diabetes_prevalence",
              label: "Diabetes prevalence",
              domain: "Health burden",
              subdomain: "Chronic disease",
              raw_value: 12.5,
              unit: "%",
              direction: "concern_high",
              percentile: 70,
              effective_weight: 0.5,
              contribution: 14,
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
      domains_missing: [],
      stability_label: "Moderately stable",
    };

    vi.mocked(api.getTractProfile).mockResolvedValueOnce(profileFixture);
    vi.mocked(api.explainScore).mockResolvedValueOnce(partiallyMissingExplanation);
    vi.mocked(api.getDomains).mockResolvedValueOnce({
      domains: [
        {
          domain: "Health burden",
          subdomains: ["Chronic disease"],
          metrics: [
            {
              metric_id: "diabetes_prevalence",
              label: "Diabetes prevalence",
              domain: "Health burden",
              subdomain: "Chronic disease",
              unit: "%",
              direction: "concern_high",
              plain_language_definition: "Share of adults with diagnosed diabetes.",
              limitations: "Model-based small-area estimate.",
              citation: "CDC PLACES 2025",
            },
            {
              metric_id: "obesity_rate",
              label: "Obesity rate",
              domain: "Health burden",
              subdomain: "Chronic disease",
              unit: "%",
              direction: "concern_high",
              plain_language_definition: "Share of adults with obesity.",
              limitations: "Model-based small-area estimate.",
              citation: "CDC PLACES 2025",
            },
          ],
        },
      ],
    });

    renderWithClient(
      <GeographyDetail
        selected={{ geographyType: "tract", geoid: "06085500300", displayName: "Census Tract 5003", source: "url" }}
        scenarioId="default_integrated_screen_v1"
        onCompare={() => {}}
        onClearSelection={() => {}}
        onSelect={() => {}}
      />,
    );

    await waitFor(() => expect(screen.getByText("What is shaping this profile?")).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText("Insufficient data")).toBeInTheDocument());
    expect(screen.getByText(/Obesity rate/)).toBeInTheDocument();
    // Not counted as zero or silently folded in as a real driver row --
    // only the one real, present metric appears as a driver <li>.
    // Scoped to the top-driver list's own accessible name rather than
    // a page-wide listitem query, since jsdom does not reliably apply
    // the UA stylesheet rule hiding a closed <details>'s content from
    // the accessibility tree the way a real browser does (unrelated
    // <li>s inside the collapsed "What this result does not mean"
    // disclosure would otherwise also match).
    const topDriverList = screen.getByRole("list", { name: "Top factors shaping this profile" });
    const driverItems = within(topDriverList).getAllByRole("listitem");
    expect(driverItems).toHaveLength(1);
    expect(driverItems[0]?.textContent).toContain("Diabetes prevalence");
    expect(driverItems[0]?.textContent).not.toContain("Obesity rate");
  });
});
