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
    data_mode: DataMode


class SupervisorDistrictProfile(BaseModel):
    geography_type: Literal["supervisor_district"] = "supervisor_district"
    district_number: int
    supervisor_name: str
    area_sq_miles: float
    tract_count: int
    data_mode: DataMode


class GeographyBoundaryResponse(BaseModel):
    geography_type: GeographyType
    geography_id: str
    geojson: dict[str, Any]
    data_mode: DataMode


class SourceStatusEntry(BaseModel):
    source_id: str
    resource_id: str
    publisher: str
    landing_page: str
    source_vintage: str
    retrieved_at: str
    status: str
    license_or_terms: str
    row_count: int | None = None


class SourceStatusResponse(BaseModel):
    sources: list[SourceStatusEntry]
    # Manifest entries are read directly from DATA_MANIFEST.json, independent
    # of whether a warehouse has been built, so "unavailable" is a valid,
    # truthful state here (unlike geography endpoints, which require a
    # warehouse and therefore only ever report "live" or "demo").
    warehouse_data_mode: Literal["live", "demo", "unavailable"]
