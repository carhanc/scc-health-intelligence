"""Geography routes: search, profile, boundary.

Phase 2 scope (docs/07_BUILD_PHASES.md Phase 2): geography identity,
supervisor-district assignment, and boundary GeoJSON. Health/access/
resource metrics arrive in Phase 4 and extend TractProfile then.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query

from scc_health_api.db import WarehouseUnavailableError, get_read_only_connection
from scc_health_api.repositories import geography as geography_repo
from scc_health_api.schemas.geography import (
    GeographyBoundaryResponse,
    GeographySearchResponse,
    GeographySearchResult,
    PlaceProfile,
    SupervisorDistrictProfile,
    TractProfile,
)
from scc_health_api.settings import Settings, get_settings

router = APIRouter(prefix="/api/v1/geographies", tags=["geography"])


@router.get("/search", response_model=GeographySearchResponse)
def search_geographies(
    q: str = Query(
        ..., min_length=1, description="Search text: GEOID, tract name, place name, or district."
    ),
    settings: Settings = Depends(get_settings),
) -> GeographySearchResponse:
    try:
        with get_read_only_connection(settings) as (conn, mode):
            raw_results = geography_repo.search_geographies(conn, q)
            return GeographySearchResponse(
                query=q,
                results=[GeographySearchResult(data_mode=mode, **r) for r in raw_results],
                data_mode=mode,
            )
    except WarehouseUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@router.get("/tract/{tract_geoid}", response_model=TractProfile)
def get_tract(tract_geoid: str, settings: Settings = Depends(get_settings)) -> TractProfile:
    try:
        with get_read_only_connection(settings) as (conn, mode):
            profile = geography_repo.get_tract_profile(conn, tract_geoid)
    except WarehouseUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    if profile is None:
        raise HTTPException(status_code=404, detail=f"Tract {tract_geoid} not found.")
    return TractProfile(data_mode=mode, **profile)


@router.get("/place/{place_geoid}", response_model=PlaceProfile)
def get_place(place_geoid: str, settings: Settings = Depends(get_settings)) -> PlaceProfile:
    try:
        with get_read_only_connection(settings) as (conn, mode):
            profile = geography_repo.get_place_profile(conn, place_geoid)
    except WarehouseUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    if profile is None:
        raise HTTPException(status_code=404, detail=f"Place {place_geoid} not found.")
    return PlaceProfile(data_mode=mode, **profile)


@router.get(
    "/supervisor_district/{district_number}",
    response_model=SupervisorDistrictProfile,
)
def get_supervisor_district(
    district_number: int, settings: Settings = Depends(get_settings)
) -> SupervisorDistrictProfile:
    try:
        with get_read_only_connection(settings) as (conn, mode):
            profile = geography_repo.get_supervisor_district_profile(conn, district_number)
    except WarehouseUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    if profile is None:
        raise HTTPException(status_code=404, detail=f"District {district_number} not found.")
    return SupervisorDistrictProfile(data_mode=mode, **profile)


@router.get("/{geography_type}/{geography_id}/boundary", response_model=GeographyBoundaryResponse)
def get_geography_boundary(
    geography_type: str, geography_id: str, settings: Settings = Depends(get_settings)
) -> GeographyBoundaryResponse:
    try:
        with get_read_only_connection(settings) as (conn, mode):
            boundary = geography_repo.get_geography_boundary(conn, geography_type, geography_id)
    except WarehouseUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    if boundary is None:
        raise HTTPException(
            status_code=404,
            detail=f"No boundary found for {geography_type}/{geography_id}.",
        )
    return GeographyBoundaryResponse(
        geography_type=geography_type,  # type: ignore[arg-type]
        geography_id=geography_id,
        geojson=boundary,
        data_mode=mode,
    )
