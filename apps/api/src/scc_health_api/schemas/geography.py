"""Typed response schemas for /api/v1/geographies and /api/v1/sources.

Phase 2 scope: geography identity, boundaries, and provenance only. Health/
access/resource metrics and domain scores are added starting Phase 4 --
this schema module is extended then, not replaced.
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel

GeographyType = Literal["tract", "place", "zcta", "county", "supervisor_district"]
DataMode = Literal["live", "demo"]


class GeographySearchResult(BaseModel):
    geography_type: GeographyType
    geography_id: str
    label: str
    data_mode: DataMode


class GeographySearchResponse(BaseModel):
    query: str
    results: list[GeographySearchResult]
    data_mode: DataMode


class TractProfile(BaseModel):
    geography_type: Literal["tract"] = "tract"
    tract_geoid_2020: str
    name: str
    name_long: str
    county_fips: str
    area_land_sqm: float
    area_water_sqm: float
    supervisor_district: int | None
    supervisor_district_share: float | None
    supervisor_district_is_clean_assignment: bool | None
    data_mode: DataMode
    note: str = (
        "Phase 2 scope: geography identity and district assignment only. "
        "Health, access, and resource metrics are added starting Phase 4."
    )


class PlaceProfile(BaseModel):
    geography_type: Literal["place"] = "place"
    place_geoid: str
    name: str
    name_long: str
    area_land_sqm: float
    area_water_sqm: float
    tract_count: int
    data_mode: DataMode


class TopConcernTract(BaseModel):
    tract_geoid_2020: str
    name_long: str
    score: float
    coverage_fraction: float


class PlaceTopConcernTractsResponse(BaseModel):
    place_geoid: str
    scenario_id: str | None
    tracts: list[TopConcernTract]
    data_mode: DataMode


class SupervisorDistrictProfile(BaseModel):
    geography_type: Literal["supervisor_district"] = "supervisor_district"
    district_number: int
    supervisor_name: str
    area_sq_miles: float
    tract_count: int
    data_mode: DataMode


class DistrictTopConcernTractsResponse(BaseModel):
    district_number: int
    scenario_id: str | None
    tracts: list[TopConcernTract]
    data_mode: DataMode


class GeographyBoundaryResponse(BaseModel):
    geography_type: GeographyType
    geography_id: str
    geojson: dict[str, Any]
    data_mode: DataMode


class TractBoundaryCollectionResponse(BaseModel):
    """Bulk tract geometry for the Explore map choropleth (DEC-038). Each
    feature's properties always carry identity (tract_geoid_2020, name);
    score/coverage_fraction/stability_label are present only when a valid
    scenario_id was supplied and analytics tables exist -- absent, not
    zero, when scoring data isn't available for a tract or at all."""

    type: Literal["FeatureCollection"] = "FeatureCollection"
    features: list[dict[str, Any]]
    scenario_id: str | None
    data_mode: DataMode


FreshnessState = Literal[
    "unavailable", "draft", "intentional_older", "newest_verified", "lagged", "stale"
]


class SourceStatusEntry(BaseModel):
    source_id: str
    resource_id: str
    publisher: str
    landing_page: str
    source_vintage: str
    release_date: str | None = None
    retrieved_at: str
    status: str
    license_or_terms: str
    freshness_state: FreshnessState
    row_count: int | None = None
    warehouse_tables: list[str] = []


class SourceStatusResponse(BaseModel):
    sources: list[SourceStatusEntry]
    # Manifest entries are read directly from DATA_MANIFEST.json, independent
    # of whether a warehouse has been built, so "unavailable" is a valid,
    # truthful state here (unlike geography endpoints, which require a
    # warehouse and therefore only ever report "live" or "demo").
    warehouse_data_mode: Literal["live", "demo", "unavailable"]


class DataExplorerTable(BaseModel):
    schema_name: str
    table_name: str
    description: str
    row_count: int | None
    column_count: int | None
    available: bool


class DataExplorerResponse(BaseModel):
    tables: list[DataExplorerTable]
    warehouse_data_mode: Literal["live", "demo", "unavailable"]


class DataExplorerTablePreview(BaseModel):
    schema_name: str
    table_name: str
    columns: list[str]
    rows: list[dict[str, object]]
    row_count: int
    data_mode: Literal["live", "demo"]
