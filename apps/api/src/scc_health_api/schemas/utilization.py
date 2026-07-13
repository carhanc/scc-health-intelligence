"""Typed response schemas for the Phase 7 Utilization API
(/api/v1/utilization/*). Every response distinguishes `data_status`
("observed" | "modeled" | "suppressed") on each record -- CLAUDE.md's
rule that observed and modeled figures must never be visually or
analytically merged applies here just as strictly as to the Phase 4
scoring outputs.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel

DataMode = Literal["live", "demo"]
DataStatus = Literal["observed", "modeled", "suppressed"]


class CountyTrendPoint(BaseModel):
    breakdown_category: str
    category_value: str
    service_year: int
    encounters: int | None
    is_suppressed: bool
    suppression_annotation_desc: str | None
    data_status: DataStatus


class CountyTrendsResponse(BaseModel):
    data_mode: DataMode
    geography_level: Literal["county"] = "county"
    breakdown: str
    points: list[CountyTrendPoint]


class FacilitySummary(BaseModel):
    oshpd_id: str
    facility_name: str
    city: str | None
    zip_code: str | None
    license_category: str | None
    trauma_center_level: str | None
    er_service_level: str | None
    is_rural: bool | None
    is_teaching: bool | None
    licensed_bed_band: str | None
    total_ed_encounters: int | None
    reporting_year: int
    data_status: DataStatus = "observed"


class FacilitySummaryListResponse(BaseModel):
    data_mode: DataMode
    facilities: list[FacilitySummary]


class FacilityBreakdownDetail(BaseModel):
    """Payer mix, disposition, and language breakdown for a single
    facility -- each group's counts are independent slices of the same
    total_ed_encounters (see run_utilization_pipeline.py), never summed
    across groups."""

    disposition: dict[str, int | None]
    payer_mix: dict[str, int | None]
    language: dict[str, int | None]


class FacilityDetailResponse(BaseModel):
    data_mode: DataMode
    facility: FacilitySummary
    breakdown: FacilityBreakdownDetail


class ZipObservedEncounters(BaseModel):
    patient_zip: str
    pattype_group: str
    encounters: int
    reporting_year: int
    data_status: DataStatus = "observed"


class ZipObservedListResponse(BaseModel):
    data_mode: DataMode
    geography_level: Literal["patient_zip"] = "patient_zip"
    total_observed_encounters: int
    zips: list[ZipObservedEncounters]


class TractUtilization(BaseModel):
    tract_geoid_2020: str
    modeled_ed_encounters_combined: float | None
    total_population: float | None
    modeled_ed_rate_per_1000: float | None
    e2sfca_hospital_drive_access_score: float | None
    n_contributing_zips: int | None
    crosswalk_quality: str | None
    method: str | None
    rate_reliability: Literal["plausible_range", "low_reliability"] | None
    rate_reliability_note: str | None
    data_status: DataStatus = "modeled"


class TractUtilizationListResponse(BaseModel):
    data_mode: DataMode
    geography_level: Literal["tract"] = "tract"
    tracts: list[TractUtilization]


class TractUtilizationDetailResponse(BaseModel):
    data_mode: DataMode
    tract: TractUtilization


class CriterionValidityResult(BaseModel):
    scenario_id: str
    outcome_label: str
    validity_type: str
    hypothesis: str
    is_tautological: bool
    tautology_reason: str
    n_paired_observations: int
    n_missing: int
    spearman_r: float | None
    spearman_p_value: float | None
    pearson_r: float | None
    pearson_p_value: float | None
    bootstrap_ci_lower: float | None
    bootstrap_ci_upper: float | None
    n_bootstrap: int
    interpretation_note: str


class CriterionValidityResponse(BaseModel):
    data_mode: DataMode
    results: list[CriterionValidityResult]
