"""Typed response schemas for the Phase 6 Access Lab API
(/api/v1/access/*). Every distance/time-bearing response carries its
`method` label (e.g. "osm_network_walk" vs. "straight_line_screening" vs.
"scheduled_transit_access_proxy") so the frontend can never present one
kind of result as another. Optimizer/E2SFCA responses never use language
implying a causal health-outcome claim -- see
`optimization/location_allocation.py` and `analytics/e2sfca.py` module
docstrings for the underlying non-negotiable rules this schema layer
must not violate by omission.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel

DataMode = Literal["live", "demo"]


class FacilitySummary(BaseModel):
    canonical_resource_id: str
    category: str
    subtype: str
    name: str
    status: str
    address: str
    city: str
    zip_code: str
    latitude: float | None
    longitude: float | None
    is_official: bool
    dedup_status: str
    coordinate_quality: str
    n_contributing_sources: int
    limitation_notes: str


class FacilityListResponse(BaseModel):
    data_mode: DataMode
    facilities: list[FacilitySummary]
    category_counts: dict[str, int]


class FacilitySourceRecord(BaseModel):
    source_id: str
    source_specific_id: str
    match_method: str
    match_confidence: str


class FacilityDetailResponse(BaseModel):
    data_mode: DataMode
    facility: FacilitySummary
    sources: list[FacilitySourceRecord]


class NetworkAccessResult(BaseModel):
    mode: str
    category: str
    status: str
    nearest_facility_id: str | None
    distance_miles: float | None
    duration_minutes: float | None
    method: str
    unavailable_reason: str | None


class NetworkAccessResponse(BaseModel):
    data_mode: DataMode
    block_group_geoid: str
    tract_geoid_2020: str | None
    results: list[NetworkAccessResult]


class TractAccessSummaryResponse(BaseModel):
    """A tract's access picture, surfaced via its largest-population
    block group -- a real, specific origin (not an averaged/fabricated
    point), since the underlying network/transit computations are
    inherently block-group-level. See `representative_block_group_geoid`
    and `representative_population` for exactly which real origin these
    results describe."""

    data_mode: DataMode
    tract_geoid_2020: str
    representative_block_group_geoid: str
    representative_population: int
    n_block_groups_in_tract: int
    network_results: list[NetworkAccessResult]
    transit_result: TransitAccessResult


class TransitAccessResult(BaseModel):
    status: str
    nearest_stop_id: str | None
    nearest_stop_name: str | None
    walk_distance_miles: float | None
    n_trips_in_window: int | None
    headway_minutes: float | None
    service_level: str | None
    method: str
    service_window: str
    unavailable_reason: str | None


class TransitAccessResponse(BaseModel):
    data_mode: DataMode
    block_group_geoid: str
    tract_geoid_2020: str | None
    result: TransitAccessResult


class E2SFCAResult(BaseModel):
    block_group_geoid: str
    tract_geoid_2020: str | None
    mode: str
    category: str
    capacity_type: str
    accessibility_score: float
    n_facilities_in_catchment: int
    catchment_radius_miles: float
    sigma_miles: float
    method: str


class E2SFCAResponse(BaseModel):
    data_mode: DataMode
    results: list[E2SFCAResult]


class ResourceGapResult(BaseModel):
    tract_geoid_2020: str
    need_percentile: float
    access_percentile: float
    classification: str
    method: str


class ResourceGapResponse(BaseModel):
    data_mode: DataMode
    mode: str
    category: str
    need_domain: str
    results: list[ResourceGapResult]


class OptimizationScenarioResponse(BaseModel):
    data_mode: DataMode
    run_id: str
    scenario_label: str
    status: str
    objective_value: float | None
    k_sites: int
    distance_threshold_miles: float
    selected_sites: list[str]
    population_covered: float
    high_need_population_covered: float
    total_population: float
    total_high_need_population: float
    unserved_high_need_tracts: list[str]
    overlap_count: int
    assumptions: list[str]
    method: str


class OptimizationScenariosResponse(BaseModel):
    data_mode: DataMode
    scenarios: list[OptimizationScenarioResponse]
