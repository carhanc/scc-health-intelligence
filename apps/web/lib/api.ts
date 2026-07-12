// Typed API client for Santa Clara Health Intelligence.
// The frontend never computes a score or fetches a data source directly —
// every number comes from apps/api, which is the single source of truth
// (see PLAN.md §7). No secrets are read here; the API base URL is the only
// configuration this module needs.

import type { Feature, Geometry } from "geojson";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

export type DataMode = "live" | "demo";
export type WarehouseDataMode = DataMode | "unavailable";

export interface HealthResponse {
  status: "ok";
  service: string;
  version: string;
}

export interface VersionResponse {
  app_version: string;
  data_build_id: string | null;
  git_commit: string | null;
}

export interface WarehouseStatus {
  connected: boolean;
  path: string;
  spatial_extension_loaded: boolean;
  data_mode: WarehouseDataMode;
  detail: string | null;
}

export type GeographyType =
  | "tract"
  | "place"
  | "zcta"
  | "county"
  | "supervisor_district";

export interface GeographySearchResult {
  geography_type: GeographyType;
  geography_id: string;
  label: string;
  data_mode: DataMode;
}

export interface GeographySearchResponse {
  query: string;
  results: GeographySearchResult[];
  data_mode: DataMode;
}

export interface TractProfile {
  geography_type: "tract";
  tract_geoid_2020: string;
  name: string;
  name_long: string;
  county_fips: string;
  area_land_sqm: number;
  area_water_sqm: number;
  supervisor_district: number | null;
  supervisor_district_share: number | null;
  supervisor_district_is_clean_assignment: boolean | null;
  data_mode: DataMode;
  note: string;
}

export interface PlaceProfile {
  geography_type: "place";
  place_geoid: string;
  name: string;
  name_long: string;
  area_land_sqm: number;
  area_water_sqm: number;
  data_mode: DataMode;
}

export interface SupervisorDistrictProfile {
  geography_type: "supervisor_district";
  district_number: number;
  supervisor_name: string;
  area_sq_miles: number;
  tract_count: number;
  data_mode: DataMode;
}

export interface GeographyBoundaryResponse {
  geography_type: GeographyType;
  geography_id: string;
  geojson: Feature;
  data_mode: DataMode;
}

export interface TractBoundaryFeatureProperties {
  tract_geoid_2020: string;
  name: string;
  score: number | null;
  coverage_fraction: number | null;
  stability_label: StabilityLabel | null;
}

export interface TractBoundaryFeature {
  type: "Feature";
  geometry: Geometry;
  properties: TractBoundaryFeatureProperties;
}

export interface TractBoundaryCollectionResponse {
  type: "FeatureCollection";
  features: TractBoundaryFeature[];
  scenario_id: string | null;
  data_mode: DataMode;
}

export type FreshnessState =
  | "unavailable"
  | "draft"
  | "intentional_older"
  | "newest_verified"
  | "lagged"
  | "stale";

export interface SourceStatusEntry {
  source_id: string;
  resource_id: string;
  publisher: string;
  landing_page: string;
  source_vintage: string;
  release_date: string | null;
  retrieved_at: string;
  status: string;
  license_or_terms: string;
  freshness_state: FreshnessState;
  row_count: number | null;
  warehouse_tables: string[];
}

export interface SourceStatusResponse {
  sources: SourceStatusEntry[];
  warehouse_data_mode: WarehouseDataMode;
}

export interface DataExplorerTable {
  schema_name: string;
  table_name: string;
  description: string;
  row_count: number | null;
  column_count: number | null;
  available: boolean;
}

export interface DataExplorerResponse {
  tables: DataExplorerTable[];
  warehouse_data_mode: WarehouseDataMode;
}

export interface DataExplorerTablePreview {
  schema_name: string;
  table_name: string;
  columns: string[];
  rows: Record<string, unknown>[];
  row_count: number;
  data_mode: DataMode;
}

// ---------------------------------------------------------------------
// Phase 4 analytics / decision-engine types (apps/api routes/analytics.py)
// ---------------------------------------------------------------------

export type StabilityLabel =
  | "Robust"
  | "Moderately stable"
  | "Assumption-sensitive"
  | "Data-limited";

export interface ScenarioSummary {
  scenario_id: string;
  label: string;
  description: string;
  weights: Record<string, number>;
  required_metrics: string[];
  minimum_confidence: number;
  notes: string;
}

export interface ScenarioListResponse {
  scenarios: ScenarioSummary[];
}

export interface MetricSummary {
  metric_id: string;
  label: string;
  domain: string;
  subdomain: string;
  unit: string;
  direction: "concern_high" | "concern_low" | "neutral";
  plain_language_definition: string;
  limitations: string;
  citation: string;
}

export interface DomainSummary {
  domain: string;
  subdomains: string[];
  metrics: MetricSummary[];
}

export interface DomainListResponse {
  domains: DomainSummary[];
}

export interface TractScenarioScore {
  tract_geoid_2020: string;
  scenario_id: string;
  score: number | null;
  coverage_fraction: number;
  domains_missing: string[];
  stability_label: StabilityLabel | null;
  confidence_score: number | null;
  monte_carlo_median: number | null;
  monte_carlo_ci_lower: number | null;
  monte_carlo_ci_upper: number | null;
  monte_carlo_median_rank: number | null;
  probability_top_decile: number | null;
}

export interface ScenarioScoresResponse {
  scenario_id: string;
  data_mode: DataMode;
  total_tracts: number;
  scores: TractScenarioScore[];
}

export interface MetricContribution {
  metric_id: string;
  label: string;
  domain: string;
  subdomain: string;
  raw_value: number | null;
  unit: string;
  direction: "concern_high" | "concern_low" | "neutral";
  percentile: number | null;
  effective_weight: number;
  contribution: number | null;
  standard_error: number | null;
  low_confidence_limit: number | null;
  high_confidence_limit: number | null;
  source_id: string;
  citation: string;
  plain_language_definition: string;
  limitations: string;
}

export interface DomainContributionDetail {
  domain: string;
  domain_score: number | null;
  configured_weight: number;
  normalized_weight: number;
  contribution: number | null;
  metrics: MetricContribution[];
}

export interface DataConfidenceDetail {
  confidence_score: number;
  coverage_component: number;
  precision_component: number;
  geography_quality_component: number;
  freshness_source_component: number;
}

export interface MonteCarloDetail {
  median_score: number | null;
  ci_lower: number | null;
  ci_upper: number | null;
  median_rank: number | null;
  rank_ci_lower: number | null;
  rank_ci_upper: number | null;
  probability_top_decile: number | null;
  probability_top_quartile: number | null;
  n_draws: number;
  seed: number;
}

export interface WeightSensitivityDetail {
  median_rank: number | null;
  rank_ci_lower: number | null;
  rank_ci_upper: number | null;
  rank_std: number | null;
  probability_top_decile: number | null;
  probability_top_quartile: number | null;
  most_influential_domain: string | null;
  n_draws: number;
  seed: number;
}

export interface ScoreExplanationResponse {
  scenario_id: string;
  scenario_label: string;
  tract_geoid_2020: string;
  score: number | null;
  coverage_fraction: number;
  domains: DomainContributionDetail[];
  domains_missing: string[];
  stability_label: StabilityLabel | null;
  data_confidence: DataConfidenceDetail | null;
  monte_carlo: MonteCarloDetail | null;
  weight_sensitivity: WeightSensitivityDetail | null;
  data_mode: DataMode;
}

export interface EvidenceItem {
  metric_id: string;
  label: string;
  raw_value: number | null;
  unit: string;
  county_percentile: number | null;
  citation: string;
}

export interface Recommendation {
  scenario_id: string;
  scenario_label: string;
  tract_geoid_2020: string;
  rank: number;
  score: number | null;
  coverage_fraction: number;
  stability_label: StabilityLabel | null;
  confidence_score: number | null;
  assumptions: string[];
  limitations: string[];
  supporting_evidence: EvidenceItem[];
  source_provenance: string[];
}

export interface RecommendationsResponse {
  scenario_id: string;
  data_mode: DataMode;
  recommendations: Recommendation[];
}

export interface OptimizationRun {
  run_id: string;
  scenario_label: string;
  k_sites: number;
  distance_threshold_miles: number;
  status: string;
  objective_value: number | null;
  selected_sites: string[];
  population_covered: number;
  high_need_population_covered: number;
  total_population: number;
  total_high_need_population: number;
  overlap_count: number;
  unserved_high_need_tracts: string[];
  assumptions: string[];
  method: string;
}

export interface OptimizationRunsResponse {
  data_mode: DataMode;
  runs: OptimizationRun[];
}

export interface CorrelationDiagnostic {
  scenario_id: string;
  outcome_label: string;
  validity_type: string;
  hypothesis: string;
  is_tautological: boolean;
  tautology_reason: string;
  n_paired_observations: number;
  n_missing: number;
  spearman_r: number | null;
  spearman_p_value: number | null;
  pearson_r: number | null;
  pearson_p_value: number | null;
  bootstrap_ci_lower: number | null;
  bootstrap_ci_upper: number | null;
  n_bootstrap: number;
  interpretation_note: string;
}

export interface CorrelationDiagnosticsResponse {
  data_mode: DataMode;
  diagnostics: CorrelationDiagnostic[];
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    /** Present only for structured geography-lookup errors (Phase 5
     * hotfix) -- e.g. "geography_not_found". Absent for plain-string
     * FastAPI error details (503s, validation errors, etc). */
    public readonly errorCode?: string,
    public readonly geographyType?: string,
    public readonly requestedId?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

interface StructuredErrorDetail {
  error_code?: string;
  geography_type?: string;
  requested_id?: string;
  message?: string;
}

async function apiGet<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  if (!response.ok) {
    let message = `Request to ${path} failed with status ${response.status}`;
    let errorCode: string | undefined;
    let geographyType: string | undefined;
    let requestedId: string | undefined;
    try {
      const body = (await response.json()) as { detail?: string | StructuredErrorDetail };
      if (typeof body.detail === "string" && body.detail) {
        message = body.detail;
      } else if (body.detail && typeof body.detail === "object") {
        if (body.detail.message) message = body.detail.message;
        errorCode = body.detail.error_code;
        geographyType = body.detail.geography_type;
        requestedId = body.detail.requested_id;
      }
    } catch {
      // response body wasn't JSON; fall through with the default message
    }
    throw new ApiError(message, response.status, errorCode, geographyType, requestedId);
  }
  return (await response.json()) as T;
}

export const api = {
  getHealth: () => apiGet<HealthResponse>("/api/v1/health"),
  getVersion: () => apiGet<VersionResponse>("/api/v1/version"),
  getWarehouseStatus: () => apiGet<WarehouseStatus>("/api/v1/warehouse-status"),
  searchGeographies: (query: string) =>
    apiGet<GeographySearchResponse>(
      `/api/v1/geographies/search?q=${encodeURIComponent(query)}`,
    ),
  getTractProfile: (tractGeoid: string) =>
    apiGet<TractProfile>(`/api/v1/geographies/tract/${encodeURIComponent(tractGeoid)}`),
  getPlaceProfile: (placeGeoid: string) =>
    apiGet<PlaceProfile>(`/api/v1/geographies/place/${encodeURIComponent(placeGeoid)}`),
  getSupervisorDistrictProfile: (districtNumber: number) =>
    apiGet<SupervisorDistrictProfile>(
      `/api/v1/geographies/supervisor_district/${districtNumber}`,
    ),
  getGeographyBoundary: (geographyType: GeographyType, geographyId: string) =>
    apiGet<GeographyBoundaryResponse>(
      `/api/v1/geographies/${geographyType}/${encodeURIComponent(geographyId)}/boundary`,
    ),
  getSources: () => apiGet<SourceStatusResponse>("/api/v1/sources"),
  getDataExplorer: () => apiGet<DataExplorerResponse>("/api/v1/data-explorer"),
  getDataExplorerTablePreview: (schemaName: string, tableName: string) =>
    apiGet<DataExplorerTablePreview>(
      `/api/v1/data-explorer/${encodeURIComponent(schemaName)}/${encodeURIComponent(tableName)}`,
    ),
  getAllTractBoundaries: (scenarioId?: string) =>
    apiGet<TractBoundaryCollectionResponse>(
      `/api/v1/geographies/tracts/boundaries${
        scenarioId ? `?scenario_id=${encodeURIComponent(scenarioId)}` : ""
      }`,
    ),
  getScenarios: () => apiGet<ScenarioListResponse>("/api/v1/scenarios"),
  getDomains: () => apiGet<DomainListResponse>("/api/v1/domains"),
  getScenarioScores: (
    scenarioId: string,
    options?: { limit?: number; offset?: number; order?: "score_desc" | "score_asc" },
  ) => {
    const params = new URLSearchParams();
    if (options?.limit !== undefined) params.set("limit", String(options.limit));
    if (options?.offset !== undefined) params.set("offset", String(options.offset));
    if (options?.order) params.set("order", options.order);
    const qs = params.toString();
    return apiGet<ScenarioScoresResponse>(
      `/api/v1/scenarios/${encodeURIComponent(scenarioId)}/scores${qs ? `?${qs}` : ""}`,
    );
  },
  explainScore: (scenarioId: string, tractGeoid: string) =>
    apiGet<ScoreExplanationResponse>(
      `/api/v1/scenarios/${encodeURIComponent(scenarioId)}/tracts/${encodeURIComponent(tractGeoid)}/explain`,
    ),
  getRecommendations: (scenarioId: string, topN = 10) =>
    apiGet<RecommendationsResponse>(
      `/api/v1/scenarios/${encodeURIComponent(scenarioId)}/recommendations?top_n=${topN}`,
    ),
  getOptimizationRuns: () => apiGet<OptimizationRunsResponse>("/api/v1/optimization/runs"),
  getCorrelationDiagnostics: () =>
    apiGet<CorrelationDiagnosticsResponse>("/api/v1/validation/correlation-diagnostics"),
};
