"""Phase 7 Utilization API: observed HCAI emergency-department data at
its real native geographies (county, facility, patient ZIP) plus one
disclosed, clearly-labeled modeled tract-level allocation.

Every route reads directly from the `analytics.utilization_*` warehouse
tables populated by `run_utilization_pipeline.py` -- no aggregation or
allocation math is recomputed here (same read-only-presentation-layer
boundary as analytics.py, DEC-030). Utilization tables currently exist
only in the live warehouse -- there is no offline demo snapshot yet
(same disclosed gap as Phase 4 analytics), so every route here returns a
truthful 503, not fabricated data, when the tables are absent.
"""

from __future__ import annotations

from typing import Any, Literal

import duckdb
from fastapi import APIRouter, Depends, HTTPException, Query

from scc_health_api.db import WarehouseUnavailableError, get_read_only_connection
from scc_health_api.schemas.utilization import (
    CountyTrendPoint,
    CountyTrendsResponse,
    CriterionValidityResponse,
    CriterionValidityResult,
    FacilityBreakdownDetail,
    FacilityDetailResponse,
    FacilitySummary,
    FacilitySummaryListResponse,
    TractUtilization,
    TractUtilizationDetailResponse,
    TractUtilizationListResponse,
    ZipObservedEncounters,
    ZipObservedListResponse,
)
from scc_health_api.settings import Settings, get_settings

router = APIRouter(prefix="/api/v1/utilization", tags=["utilization"])

_UTILIZATION_UNAVAILABLE_DETAIL = (
    "Phase 7 utilization tables are not present in the current warehouse. Run "
    "`uv run --package scc-health-pipeline python -m scc_health_pipeline.run_utilization_pipeline` "
    "(or `make data`) first. Utilization data currently exists only in live mode -- there is no "
    "offline demo snapshot yet (see STATE.md)."
)

_KNOWN_BREAKDOWNS = {"disposition", "race_group", "sex", "expected_payer"}


def _require_table(conn: duckdb.DuckDBPyConnection, table: str) -> None:
    row = conn.execute(
        "SELECT COUNT(*) FROM information_schema.tables "
        "WHERE table_schema = 'analytics' AND table_name = ?",
        [table],
    ).fetchone()
    if not row or row[0] == 0:
        raise HTTPException(status_code=503, detail=_UTILIZATION_UNAVAILABLE_DETAIL)


@router.get("/county-trends", response_model=CountyTrendsResponse)
def get_county_trends(
    breakdown: str = Query("disposition"),
    settings: Settings = Depends(get_settings),
) -> CountyTrendsResponse:
    if breakdown not in _KNOWN_BREAKDOWNS:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown breakdown '{breakdown}'. Expected one of {sorted(_KNOWN_BREAKDOWNS)}.",
        )
    try:
        with get_read_only_connection(settings) as (conn, mode):
            _require_table(conn, "utilization_ed_county_trends")
            rows = conn.execute(
                """
                SELECT breakdown_category, category_value, service_year, encounters,
                       is_suppressed, suppression_annotation_desc, data_status
                FROM analytics.utilization_ed_county_trends
                WHERE breakdown_category = ?
                ORDER BY category_value, service_year
                """,
                [breakdown],
            ).fetchall()
    except WarehouseUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    points = [
        CountyTrendPoint(
            breakdown_category=r[0],
            category_value=r[1],
            service_year=r[2],
            encounters=r[3],
            is_suppressed=r[4],
            suppression_annotation_desc=r[5],
            data_status=r[6],
        )
        for r in rows
    ]
    return CountyTrendsResponse(data_mode=mode, breakdown=breakdown, points=points)


def _facility_summary_from_row(r: tuple[Any, ...]) -> FacilitySummary:
    return FacilitySummary(
        oshpd_id=r[0],
        facility_name=r[1],
        city=r[2],
        zip_code=r[3],
        license_category=r[4],
        trauma_center_level=r[5],
        er_service_level=r[6],
        is_rural=(r[7] is not None and r[7] != ""),
        is_teaching=(r[8] is not None and r[8] != ""),
        licensed_bed_band=r[9],
        total_ed_encounters=r[10],
        reporting_year=r[11],
    )


_FACILITY_SUMMARY_COLUMNS = (
    "oshpd_id, FACILITY_NAME, DBA_CITY, DBA_ZIP_CODE, LICENSE_CATEGORY_DESC, "
    "TRAUMA_CENTER_DESC, ER_SERVICE_LEVEL_DESC, RURAL_HOSPITAL_DESC, TEACHING_HOSPITAL_DESC, "
    "LICENSED_BED_SIZE, total_ed_encounters, reporting_year"
)


@router.get("/facilities", response_model=FacilitySummaryListResponse)
def list_facilities(settings: Settings = Depends(get_settings)) -> FacilitySummaryListResponse:
    try:
        with get_read_only_connection(settings) as (conn, mode):
            _require_table(conn, "utilization_ed_facility_summary")
            rows = conn.execute(
                f"SELECT {_FACILITY_SUMMARY_COLUMNS} "
                "FROM analytics.utilization_ed_facility_summary ORDER BY FACILITY_NAME"
            ).fetchall()
    except WarehouseUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    return FacilitySummaryListResponse(
        data_mode=mode, facilities=[_facility_summary_from_row(r) for r in rows]
    )


@router.get("/facilities/{oshpd_id}", response_model=FacilityDetailResponse)
def get_facility_detail(
    oshpd_id: str, settings: Settings = Depends(get_settings)
) -> FacilityDetailResponse:
    try:
        with get_read_only_connection(settings) as (conn, mode):
            _require_table(conn, "utilization_ed_facility_summary")
            summary_row = conn.execute(
                f"SELECT {_FACILITY_SUMMARY_COLUMNS} "
                "FROM analytics.utilization_ed_facility_summary WHERE oshpd_id = ?",
                [oshpd_id],
            ).fetchone()
            if summary_row is None:
                raise HTTPException(
                    status_code=404, detail=f"No facility found for oshpd_id {oshpd_id}."
                )
            detail_row = conn.execute(
                """
                SELECT disp_Died, disp_Routine, disp_Psychiatric_Care,
                       Payer_MediCal, Payer_Medicare, Payer_Private_Health_Insurance,
                       Payer_Self_Pay_or_Uninsured, Payer_Other_Government, Payer_All_Other_Payers,
                       Payer_Other_Unknown,
                       English, Spanish, All_Other_Languages, PLS_Other_Unknown
                FROM analytics.utilization_ed_facility_summary
                WHERE oshpd_id = ?
                """,
                [oshpd_id],
            ).fetchone()
    except WarehouseUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    if detail_row is None:
        raise HTTPException(status_code=404, detail=f"No facility found for oshpd_id {oshpd_id}.")

    breakdown = FacilityBreakdownDetail(
        disposition={
            "died": detail_row[0],
            "routine_discharge": detail_row[1],
            "psychiatric_care": detail_row[2],
        },
        payer_mix={
            "medi_cal": detail_row[3],
            "medicare": detail_row[4],
            "private_health_insurance": detail_row[5],
            "self_pay_or_uninsured": detail_row[6],
            "other_government": detail_row[7],
            "all_other_payers": detail_row[8],
            "other_unknown": detail_row[9],
        },
        language={
            "english": detail_row[10],
            "spanish": detail_row[11],
            "all_other_languages": detail_row[12],
            "other_unknown": detail_row[13],
        },
    )
    return FacilityDetailResponse(
        data_mode=mode,
        facility=_facility_summary_from_row(summary_row),
        breakdown=breakdown,
    )


@router.get("/zips", response_model=ZipObservedListResponse)
def list_zip_observed(settings: Settings = Depends(get_settings)) -> ZipObservedListResponse:
    try:
        with get_read_only_connection(settings) as (conn, mode):
            _require_table(conn, "utilization_ed_zip_observed")
            rows = conn.execute(
                "SELECT patient_zip, pattype_group, encounters, reporting_year "
                "FROM analytics.utilization_ed_zip_observed "
                "ORDER BY encounters DESC"
            ).fetchall()
            (total,) = conn.execute(
                "SELECT COALESCE(SUM(encounters), 0) FROM analytics.utilization_ed_zip_observed"
            ).fetchone()  # type: ignore[misc]
    except WarehouseUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    zips = [
        ZipObservedEncounters(
            patient_zip=r[0], pattype_group=r[1], encounters=r[2], reporting_year=r[3]
        )
        for r in rows
    ]
    return ZipObservedListResponse(data_mode=mode, total_observed_encounters=total, zips=zips)


_TRACT_COLUMNS = (
    "tract_geoid_2020, modeled_ed_encounters_combined, total_population, "
    "modeled_ed_rate_per_1000, e2sfca_hospital_drive_access_score, n_contributing_zips, "
    "crosswalk_quality, method, rate_reliability, rate_reliability_note"
)


def _tract_from_row(r: tuple[Any, ...]) -> TractUtilization:
    return TractUtilization(
        tract_geoid_2020=r[0],
        modeled_ed_encounters_combined=r[1],
        total_population=r[2],
        modeled_ed_rate_per_1000=r[3],
        e2sfca_hospital_drive_access_score=r[4],
        n_contributing_zips=r[5],
        crosswalk_quality=r[6],
        method=r[7],
        rate_reliability=r[8],
        rate_reliability_note=r[9],
    )


@router.get("/tracts", response_model=TractUtilizationListResponse)
def list_tract_utilization(
    order: Literal["rate_desc", "rate_asc"] = Query("rate_desc"),
    limit: int = Query(408, ge=1, le=408),
    settings: Settings = Depends(get_settings),
) -> TractUtilizationListResponse:
    order_sql = (
        "modeled_ed_rate_per_1000 DESC NULLS LAST"
        if order == "rate_desc"
        else "modeled_ed_rate_per_1000 ASC NULLS LAST"
    )
    try:
        with get_read_only_connection(settings) as (conn, mode):
            _require_table(conn, "utilization_access_vs_utilization")
            rows = conn.execute(
                f"SELECT {_TRACT_COLUMNS} FROM analytics.utilization_access_vs_utilization "
                f"ORDER BY {order_sql} LIMIT ?",
                [limit],
            ).fetchall()
    except WarehouseUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    return TractUtilizationListResponse(data_mode=mode, tracts=[_tract_from_row(r) for r in rows])


@router.get("/tracts/{tract_geoid}", response_model=TractUtilizationDetailResponse)
def get_tract_utilization(
    tract_geoid: str, settings: Settings = Depends(get_settings)
) -> TractUtilizationDetailResponse:
    try:
        with get_read_only_connection(settings) as (conn, mode):
            _require_table(conn, "utilization_access_vs_utilization")
            row = conn.execute(
                f"SELECT {_TRACT_COLUMNS} FROM analytics.utilization_access_vs_utilization "
                "WHERE tract_geoid_2020 = ?",
                [tract_geoid],
            ).fetchone()
            if row is None:
                raise HTTPException(
                    status_code=404, detail=f"No utilization data for tract {tract_geoid}."
                )
    except WarehouseUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    return TractUtilizationDetailResponse(data_mode=mode, tract=_tract_from_row(row))


@router.get("/criterion-validity", response_model=CriterionValidityResponse)
def get_criterion_validity(
    settings: Settings = Depends(get_settings),
) -> CriterionValidityResponse:
    try:
        with get_read_only_connection(settings) as (conn, mode):
            _require_table(conn, "utilization_criterion_validity")
            rows = conn.execute(
                """
                SELECT scenario_id, outcome_label, validity_type, hypothesis, is_tautological,
                       tautology_reason, n_paired_observations, n_missing, spearman_r,
                       spearman_p_value, pearson_r, pearson_p_value, bootstrap_ci_lower,
                       bootstrap_ci_upper, n_bootstrap, interpretation_note
                FROM analytics.utilization_criterion_validity
                ORDER BY scenario_id
                """
            ).fetchall()
    except WarehouseUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    results = [
        CriterionValidityResult(
            scenario_id=r[0],
            outcome_label=r[1],
            validity_type=r[2],
            hypothesis=r[3],
            is_tautological=r[4],
            tautology_reason=r[5],
            n_paired_observations=r[6],
            n_missing=r[7],
            spearman_r=r[8],
            spearman_p_value=r[9],
            pearson_r=r[10],
            pearson_p_value=r[11],
            bootstrap_ci_lower=r[12],
            bootstrap_ci_upper=r[13],
            n_bootstrap=r[14],
            interpretation_note=r[15],
        )
        for r in rows
    ]
    return CriterionValidityResponse(data_mode=mode, results=results)
