"""Phase 6 Access Lab API: canonical resource inventory, real network
(walk/drive) and scheduled-transit access results, E2SFCA catchment
accessibility, resource-gap classification, and mobile-service
site-placement sensitivity scenarios.

Every route reads precomputed `analytics.*`/`resources.*` warehouse
tables populated by `run_resource_canonicalization.py`,
`run_access_metrics_pipeline.py`, and `run_analytics_pipeline.py` -- no
network route, E2SFCA score, or optimizer solve is recomputed per
request. A single origin's full walk+drive+transit computation takes
several seconds (too slow for a synchronous request at any real
concurrency); the full county batch takes ~59 minutes. The optimizer
sensitivity sweep (6 scenarios varying k_sites/distance_threshold/equity)
is precomputed by `run_analytics_pipeline.py` for the same reason this
API deliberately does not import `scc_health_pipeline.optimization.*`
directly (DEC-022's established boundary: the pipeline package pulls in
OR-Tools/GeoPandas/OSMnx, which the API's runtime does not need).
"""

from __future__ import annotations

import duckdb
from fastapi import APIRouter, Depends, HTTPException, Query

from scc_health_api.db import WarehouseUnavailableError, get_read_only_connection
from scc_health_api.schemas.access import (
    E2SFCAResponse,
    E2SFCAResult,
    FacilityDetailResponse,
    FacilityListResponse,
    FacilitySourceRecord,
    FacilitySummary,
    NetworkAccessResponse,
    NetworkAccessResult,
    OptimizationScenarioResponse,
    OptimizationScenariosResponse,
    ResourceGapResponse,
    ResourceGapResult,
    TractAccessSummaryResponse,
    TransitAccessResponse,
    TransitAccessResult,
)
from scc_health_api.services.resource_gap import compute_resource_gaps
from scc_health_api.settings import Settings, get_settings

router = APIRouter(prefix="/api/v1/access", tags=["access"])

_RESOURCES_UNAVAILABLE_DETAIL = (
    "Phase 6 resource canonicalization tables are not present in the current warehouse. Run "
    "`uv run --package scc-health-pipeline python -m "
    "scc_health_pipeline.run_resource_canonicalization` (or `make data`) first."
)
_ACCESS_METRICS_UNAVAILABLE_DETAIL = (
    "Phase 6 access-metrics tables are not present in the current warehouse. Run "
    "`uv run --package scc-health-pipeline python -m "
    "scc_health_pipeline.run_access_metrics_pipeline` (or `make data`) first. This is a real "
    "~59-minute batch computation over the full county, not something the API can compute "
    "per request."
)


def _require_table(conn: duckdb.DuckDBPyConnection, schema: str, table: str, detail: str) -> None:
    row = conn.execute(
        "SELECT COUNT(*) FROM information_schema.tables "
        "WHERE table_schema = ? AND table_name = ?",
        [schema, table],
    ).fetchone()
    if not row or row[0] == 0:
        raise HTTPException(status_code=503, detail=detail)


def _facility_row_to_summary(r: tuple[object, ...]) -> FacilitySummary:
    return FacilitySummary(
        canonical_resource_id=r[0],  # type: ignore[arg-type]
        category=r[1],  # type: ignore[arg-type]
        subtype=r[2],  # type: ignore[arg-type]
        name=r[3],  # type: ignore[arg-type]
        status=r[4],  # type: ignore[arg-type]
        address=r[5],  # type: ignore[arg-type]
        city=r[6],  # type: ignore[arg-type]
        zip_code=r[7],  # type: ignore[arg-type]
        latitude=r[8],  # type: ignore[arg-type]
        longitude=r[9],  # type: ignore[arg-type]
        is_official=r[10],  # type: ignore[arg-type]
        dedup_status=r[11],  # type: ignore[arg-type]
        coordinate_quality=r[12],  # type: ignore[arg-type]
        n_contributing_sources=r[13],  # type: ignore[arg-type]
        limitation_notes=r[14],  # type: ignore[arg-type]
    )


_FACILITY_COLUMNS = (
    "canonical_resource_id, category, subtype, name, status, address, city, zip_code, "
    "latitude, longitude, is_official, dedup_status, coordinate_quality, "
    "n_contributing_sources, limitation_notes"
)


@router.get("/facilities", response_model=FacilityListResponse)
def list_facilities(
    category: str | None = Query(default=None),
    settings: Settings = Depends(get_settings),
) -> FacilityListResponse:
    try:
        with get_read_only_connection(settings) as (conn, mode):
            _require_table(
                conn, "resources", "canonical_facilities", _RESOURCES_UNAVAILABLE_DETAIL
            )
            if category is not None:
                rows = conn.execute(
                    f"SELECT {_FACILITY_COLUMNS} FROM resources.canonical_facilities "
                    "WHERE category = ? ORDER BY name",
                    [category],
                ).fetchall()
            else:
                rows = conn.execute(
                    f"SELECT {_FACILITY_COLUMNS} FROM resources.canonical_facilities ORDER BY name"
                ).fetchall()
            count_rows = conn.execute(
                "SELECT category, COUNT(*) FROM resources.canonical_facilities GROUP BY category"
            ).fetchall()
    except WarehouseUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    facilities = [_facility_row_to_summary(r) for r in rows]
    category_counts = {r[0]: r[1] for r in count_rows}
    return FacilityListResponse(
        data_mode=mode, facilities=facilities, category_counts=category_counts
    )


@router.get("/facilities/{facility_id}", response_model=FacilityDetailResponse)
def get_facility(
    facility_id: str, settings: Settings = Depends(get_settings)
) -> FacilityDetailResponse:
    try:
        with get_read_only_connection(settings) as (conn, mode):
            _require_table(
                conn, "resources", "canonical_facilities", _RESOURCES_UNAVAILABLE_DETAIL
            )
            row = conn.execute(
                f"SELECT {_FACILITY_COLUMNS} FROM resources.canonical_facilities "
                "WHERE canonical_resource_id = ?",
                [facility_id],
            ).fetchone()
            if row is None:
                raise HTTPException(
                    status_code=404, detail=f"Unknown canonical_resource_id: {facility_id}"
                )
            source_rows = conn.execute(
                "SELECT source_id, source_specific_id, match_method, match_confidence "
                "FROM resources.facility_source_crosswalk "
                "WHERE canonical_resource_id = ? ORDER BY source_id",
                [facility_id],
            ).fetchall()
    except WarehouseUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    sources = [
        FacilitySourceRecord(
            source_id=s[0], source_specific_id=s[1], match_method=s[2], match_confidence=s[3]
        )
        for s in source_rows
    ]
    return FacilityDetailResponse(
        data_mode=mode, facility=_facility_row_to_summary(row), sources=sources
    )


@router.get("/network/{block_group_geoid}", response_model=NetworkAccessResponse)
def get_network_access(
    block_group_geoid: str, settings: Settings = Depends(get_settings)
) -> NetworkAccessResponse:
    try:
        with get_read_only_connection(settings) as (conn, mode):
            _require_table(
                conn, "analytics", "network_access_metrics", _ACCESS_METRICS_UNAVAILABLE_DETAIL
            )
            rows = conn.execute(
                "SELECT tract_geoid_2020, mode, category, status, nearest_facility_id, "
                "distance_miles, duration_minutes, method, unavailable_reason "
                "FROM analytics.network_access_metrics WHERE block_group_geoid = ?",
                [block_group_geoid],
            ).fetchall()
    except WarehouseUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    if not rows:
        raise HTTPException(
            status_code=404,
            detail=f"No network access results for block_group_geoid: {block_group_geoid}",
        )

    results = [
        NetworkAccessResult(
            mode=r[1], category=r[2], status=r[3], nearest_facility_id=r[4],
            distance_miles=r[5], duration_minutes=r[6], method=r[7], unavailable_reason=r[8],
        )
        for r in rows
    ]
    return NetworkAccessResponse(
        data_mode=mode, block_group_geoid=block_group_geoid,
        tract_geoid_2020=rows[0][0], results=results,
    )


@router.get("/transit/{block_group_geoid}", response_model=TransitAccessResponse)
def get_transit_access(
    block_group_geoid: str, settings: Settings = Depends(get_settings)
) -> TransitAccessResponse:
    try:
        with get_read_only_connection(settings) as (conn, mode):
            _require_table(
                conn, "analytics", "transit_access_metrics", _ACCESS_METRICS_UNAVAILABLE_DETAIL
            )
            row = conn.execute(
                "SELECT tract_geoid_2020, status, nearest_stop_id, nearest_stop_name, "
                "walk_distance_miles, n_trips_in_window, headway_minutes, service_level, "
                "method, service_window, unavailable_reason "
                "FROM analytics.transit_access_metrics WHERE block_group_geoid = ?",
                [block_group_geoid],
            ).fetchone()
    except WarehouseUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    if row is None:
        raise HTTPException(
            status_code=404,
            detail=f"No transit access result for block_group_geoid: {block_group_geoid}",
        )

    result = TransitAccessResult(
        status=row[1], nearest_stop_id=row[2], nearest_stop_name=row[3],
        walk_distance_miles=row[4], n_trips_in_window=row[5], headway_minutes=row[6],
        service_level=row[7], method=row[8], service_window=row[9], unavailable_reason=row[10],
    )
    return TransitAccessResponse(
        data_mode=mode, block_group_geoid=block_group_geoid,
        tract_geoid_2020=row[0], result=result,
    )


@router.get("/tract/{tract_geoid_2020}/summary", response_model=TractAccessSummaryResponse)
def get_tract_access_summary(
    tract_geoid_2020: str, settings: Settings = Depends(get_settings)
) -> TractAccessSummaryResponse:
    """Surfaces a tract's access picture via its largest-population real
    block-group origin, since the Explore/Access Lab UI selects a tract
    but the underlying network/transit computations are block-group-
    level. Never averages/fabricates a synthetic point -- always a real,
    named origin, disclosed as such (`representative_block_group_geoid`).
    """
    try:
        with get_read_only_connection(settings) as (conn, mode):
            _require_table(
                conn, "geo", "block_group_population_origins", _RESOURCES_UNAVAILABLE_DETAIL
            )
            origin_row = conn.execute(
                "SELECT block_group_geoid, population FROM geo.block_group_population_origins "
                "WHERE tract_geoid_2020 = ? ORDER BY population DESC LIMIT 1",
                [tract_geoid_2020],
            ).fetchone()
            if origin_row is None:
                raise HTTPException(
                    status_code=404,
                    detail=f"No population origins found for tract_geoid_2020: {tract_geoid_2020}",
                )
            count_row = conn.execute(
                "SELECT COUNT(*) FROM geo.block_group_population_origins "
                "WHERE tract_geoid_2020 = ?",
                [tract_geoid_2020],
            ).fetchone()
            n_block_groups = count_row[0] if count_row is not None else 0

            block_group_geoid, population = origin_row
            _require_table(
                conn, "analytics", "network_access_metrics", _ACCESS_METRICS_UNAVAILABLE_DETAIL
            )
            network_rows = conn.execute(
                "SELECT mode, category, status, nearest_facility_id, distance_miles, "
                "duration_minutes, method, unavailable_reason "
                "FROM analytics.network_access_metrics WHERE block_group_geoid = ?",
                [block_group_geoid],
            ).fetchall()
            transit_row = conn.execute(
                "SELECT status, nearest_stop_id, nearest_stop_name, walk_distance_miles, "
                "n_trips_in_window, headway_minutes, service_level, method, service_window, "
                "unavailable_reason "
                "FROM analytics.transit_access_metrics WHERE block_group_geoid = ?",
                [block_group_geoid],
            ).fetchone()
    except WarehouseUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    if not network_rows or transit_row is None:
        raise HTTPException(
            status_code=404,
            detail=f"No access-metrics results for block_group_geoid: {block_group_geoid} "
            f"(tract {tract_geoid_2020}'s representative origin).",
        )

    network_results = [
        NetworkAccessResult(
            mode=r[0], category=r[1], status=r[2], nearest_facility_id=r[3],
            distance_miles=r[4], duration_minutes=r[5], method=r[6], unavailable_reason=r[7],
        )
        for r in network_rows
    ]
    transit_result = TransitAccessResult(
        status=transit_row[0], nearest_stop_id=transit_row[1], nearest_stop_name=transit_row[2],
        walk_distance_miles=transit_row[3], n_trips_in_window=transit_row[4],
        headway_minutes=transit_row[5], service_level=transit_row[6], method=transit_row[7],
        service_window=transit_row[8], unavailable_reason=transit_row[9],
    )
    return TractAccessSummaryResponse(
        data_mode=mode,
        tract_geoid_2020=tract_geoid_2020,
        representative_block_group_geoid=block_group_geoid,
        representative_population=int(population),
        n_block_groups_in_tract=n_block_groups,
        network_results=network_results,
        transit_result=transit_result,
    )


@router.get("/e2sfca", response_model=E2SFCAResponse)
def list_e2sfca(
    mode_filter: str | None = Query(default=None, alias="mode"),
    category: str | None = Query(default=None),
    settings: Settings = Depends(get_settings),
) -> E2SFCAResponse:
    try:
        with get_read_only_connection(settings) as (conn, data_mode):
            _require_table(
                conn, "analytics", "e2sfca_accessibility", _ACCESS_METRICS_UNAVAILABLE_DETAIL
            )
            clauses = []
            params: list[str] = []
            if mode_filter is not None:
                clauses.append("mode = ?")
                params.append(mode_filter)
            if category is not None:
                clauses.append("category = ?")
                params.append(category)
            where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
            rows = conn.execute(
                "SELECT block_group_geoid, tract_geoid_2020, mode, category, capacity_type, "
                "accessibility_score, n_facilities_in_catchment, catchment_radius_miles, "
                f"sigma_miles, method FROM analytics.e2sfca_accessibility {where}",
                params,
            ).fetchall()
    except WarehouseUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    results = [
        E2SFCAResult(
            block_group_geoid=r[0], tract_geoid_2020=r[1], mode=r[2], category=r[3],
            capacity_type=r[4], accessibility_score=r[5], n_facilities_in_catchment=r[6],
            catchment_radius_miles=r[7], sigma_miles=r[8], method=r[9],
        )
        for r in rows
    ]
    return E2SFCAResponse(data_mode=data_mode, results=results)


@router.get("/gaps", response_model=ResourceGapResponse)
def get_resource_gaps(
    mode_filter: str = Query(default="drive", alias="mode"),
    category: str = Query(default="clinic"),
    settings: Settings = Depends(get_settings),
) -> ResourceGapResponse:
    """Computed on demand (DEC-050) by joining Phase 4's health_burden
    domain score to Phase 6's E2SFCA accessibility score at the tract
    level -- not a materialized table, since it is a deterministic,
    cheap function of two already-computed columns and a third copy
    would risk drifting out of sync with either source. Uses the
    dependency-free local classifier in `services/resource_gap.py`, not
    an import of the pipeline package (DEC-022)."""
    try:
        with get_read_only_connection(settings) as (conn, data_mode):
            _require_table(conn, "analytics", "domain_scores", _ACCESS_METRICS_UNAVAILABLE_DETAIL)
            _require_table(
                conn, "analytics", "e2sfca_accessibility", _ACCESS_METRICS_UNAVAILABLE_DETAIL
            )
            need_rows = conn.execute(
                "SELECT tract_geoid_2020, score FROM analytics.domain_scores "
                "WHERE domain = 'health_burden' AND score IS NOT NULL"
            ).fetchall()
            access_rows = conn.execute(
                "SELECT tract_geoid_2020, AVG(accessibility_score) FROM "
                "analytics.e2sfca_accessibility "
                "WHERE mode = ? AND category = ? AND tract_geoid_2020 IS NOT NULL "
                "GROUP BY tract_geoid_2020",
                [mode_filter, category],
            ).fetchall()
    except WarehouseUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    need_by_tract = {r[0]: r[1] for r in need_rows}
    access_by_tract = {r[0]: r[1] for r in access_rows}
    gap_results = compute_resource_gaps(need_by_tract, access_by_tract)

    results = [
        ResourceGapResult(
            tract_geoid_2020=g.geography_id, need_percentile=g.need_percentile,
            access_percentile=g.access_percentile, classification=g.classification,
            method=g.method,
        )
        for g in gap_results
    ]
    return ResourceGapResponse(
        data_mode=data_mode, mode=mode_filter, category=category,
        need_domain="health_burden", results=results,
    )


@router.get("/optimize/scenarios", response_model=OptimizationScenariosResponse)
def list_optimization_scenarios(
    settings: Settings = Depends(get_settings),
) -> OptimizationScenariosResponse:
    """Precomputed mobile-clinic siting sensitivity sweep (6 scenarios
    varying k_sites/distance_threshold/equity constraint) from
    `run_analytics_pipeline.py` -- not a live solve. The API deliberately
    does not run OR-Tools itself (DEC-022's dependency boundary); explore
    a different scenario by adding it to that pipeline step and
    re-running `make data`, not by calling this endpoint with parameters.
    """
    try:
        with get_read_only_connection(settings) as (conn, data_mode):
            _require_table(
                conn, "analytics", "optimization_runs", _ACCESS_METRICS_UNAVAILABLE_DETAIL
            )
            rows = conn.execute(
                "SELECT run_id, scenario_label, k_sites, distance_threshold_miles, status, "
                "objective_value, selected_sites, population_covered, "
                "high_need_population_covered, total_population, total_high_need_population, "
                "overlap_count, unserved_high_need_tracts, assumptions, method "
                "FROM analytics.optimization_runs WHERE run_id LIKE 'mobile_clinic_%' "
                "ORDER BY run_id"
            ).fetchall()
    except WarehouseUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    scenarios = [
        OptimizationScenarioResponse(
            data_mode=data_mode,
            run_id=r[0],
            scenario_label=r[1],
            status=r[4],
            objective_value=r[5],
            k_sites=r[2],
            distance_threshold_miles=r[3],
            selected_sites=r[6].split(";") if r[6] else [],
            population_covered=r[7],
            high_need_population_covered=r[8],
            total_population=r[9],
            total_high_need_population=r[10],
            unserved_high_need_tracts=r[12].split(";") if r[12] else [],
            overlap_count=r[11],
            assumptions=r[13].split(" | ") if r[13] else [],
            method=r[14],
        )
        for r in rows
    ]
    return OptimizationScenariosResponse(data_mode=data_mode, scenarios=scenarios)
