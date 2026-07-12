// Typed API client for Santa Clara Health Intelligence.
// The frontend never computes a score or fetches a data source directly —
// every number comes from apps/api, which is the single source of truth
// (see PLAN.md §7). No secrets are read here; the API base URL is the only
// configuration this module needs.

import type { Feature } from "geojson";

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

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function apiGet<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  if (!response.ok) {
    let detail = "";
    try {
      const body = (await response.json()) as { detail?: string };
      detail = body.detail ?? "";
    } catch {
      // response body wasn't JSON; fall through with no extra detail
    }
    throw new ApiError(
      detail || `Request to ${path} failed with status ${response.status}`,
      response.status,
    );
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
};
