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
    DistrictTopConcernTractsResponse,
    GeographyBoundaryResponse,
    GeographySearchResponse,
    GeographySearchResult,
    PlaceProfile,
    PlaceTopConcernTractsResponse,
    SupervisorDistrictProfile,
    TopConcernTract,
    TractBoundaryCollectionResponse,
    TractProfile,
)
from scc_health_api.settings import Settings, get_settings

router = APIRouter(prefix="/api/v1/geographies", tags=["geography"])


def _geography_not_found(geography_type: str, requested_id: str) -> HTTPException:
    """A structured 404 body (Phase 5 hotfix): every geography-lookup miss
    carries a machine-readable error code plus the exact type and
    identifier that was requested, in addition to a plain-language
    message -- so a malformed identifier (e.g. the literal word "tract",
    or a display label instead of a GEOID) is immediately diagnosable
    from the response body rather than only from a generic 404 string.
    """
    label = geography_type.replace("_", " ")
    return HTTPException(
        status_code=404,
        detail={
            "error_code": "geography_not_found",
            "geography_type": geography_type,
            "requested_id": requested_id,
            "message": f"We couldn't find a {label} with identifier \"{requested_id}\".",
        },
    )


@router.get("/tracts/boundaries", response_model=TractBoundaryCollectionResponse)
def get_all_tract_boundaries(
    scenario_id: str | None = Query(
        None, description="If supplied, joins each tract's score for this scenario."
    ),
    settings: Settings = Depends(get_settings),
) -> TractBoundaryCollectionResponse:
    try:
        with get_read_only_connection(settings) as (conn, mode):
            features = geography_repo.get_all_tract_boundaries_with_scores(conn, scenario_id)
    except WarehouseUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return TractBoundaryCollectionResponse(
        features=features, scenario_id=scenario_id, data_mode=mode
    )


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
        raise _geography_not_found("tract", tract_geoid)
    return TractProfile(data_mode=mode, **profile)


@router.get("/place/{place_geoid}", response_model=PlaceProfile)
def get_place(place_geoid: str, settings: Settings = Depends(get_settings)) -> PlaceProfile:
    try:
        with get_read_only_connection(settings) as (conn, mode):
            profile = geography_repo.get_place_profile(conn, place_geoid)
    except WarehouseUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    if profile is None:
        raise _geography_not_found("place", place_geoid)
    return PlaceProfile(data_mode=mode, **profile)


@router.get("/place/{place_geoid}/top-concern-tracts", response_model=PlaceTopConcernTractsResponse)
def get_place_top_concern_tracts(
    place_geoid: str,
    scenario_id: str | None = Query(
        None,
        description="If supplied, returns the highest-scoring tracts in this place under it.",
    ),
    limit: int = Query(5, ge=1, le=20),
    settings: Settings = Depends(get_settings),
) -> PlaceTopConcernTractsResponse:
    """Phase 6.5: lets a city selection drill down into its own
    highest-concern tracts, so a user never needs to already know a
    tract number to get there. Returns an empty list (never fabricated
    tracts) when no scenario is active or scoring data doesn't exist."""
    try:
        with get_read_only_connection(settings) as (conn, mode):
            if geography_repo.get_place_profile(conn, place_geoid) is None:
                raise _geography_not_found("place", place_geoid)
            tracts = geography_repo.get_place_top_concern_tracts(
                conn, place_geoid, scenario_id, limit
            )
    except WarehouseUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return PlaceTopConcernTractsResponse(
        place_geoid=place_geoid,
        scenario_id=scenario_id,
        tracts=[TopConcernTract(**t) for t in tracts],
        data_mode=mode,
    )


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
        raise _geography_not_found("supervisor_district", str(district_number))
    return SupervisorDistrictProfile(data_mode=mode, **profile)


@router.get(
    "/supervisor_district/{district_number}/top-concern-tracts",
    response_model=DistrictTopConcernTractsResponse,
)
def get_district_top_concern_tracts(
    district_number: int,
    scenario_id: str | None = Query(
        None,
        description="If supplied, returns the highest-scoring tracts in this district under it.",
    ),
    limit: int = Query(5, ge=1, le=20),
    settings: Settings = Depends(get_settings),
) -> DistrictTopConcernTractsResponse:
    """Phase 6.5: same drill-down pattern as the place/city endpoint above."""
    try:
        with get_read_only_connection(settings) as (conn, mode):
            if geography_repo.get_supervisor_district_profile(conn, district_number) is None:
                raise _geography_not_found("supervisor_district", str(district_number))
            tracts = geography_repo.get_district_top_concern_tracts(
                conn, district_number, scenario_id, limit
            )
    except WarehouseUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return DistrictTopConcernTractsResponse(
        district_number=district_number,
        scenario_id=scenario_id,
        tracts=[TopConcernTract(**t) for t in tracts],
        data_mode=mode,
    )


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
        raise _geography_not_found(geography_type, geography_id)
    return GeographyBoundaryResponse(
        geography_type=geography_type,  # type: ignore[arg-type]
        geography_id=geography_id,
        geojson=boundary,
        data_mode=mode,
    )
