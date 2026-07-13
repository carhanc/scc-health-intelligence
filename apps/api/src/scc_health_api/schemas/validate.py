"""Typed response schemas for the Phase 7 Validate API (/api/v1/validate/*).
Data-coverage content is deliberately NOT duplicated here -- the Validate
page's coverage section calls the existing `/api/v1/sources` and
`/api/v1/data-explorer` endpoints (Phase 1/3), which already expose
publisher, vintage, freshness, and row counts per source.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel

DataMode = Literal["live", "demo"]


class StabilityLabelCount(BaseModel):
    stability_label: str
    n_tracts: int


class UncertaintySummary(BaseModel):
    data_mode: DataMode
    scenario_id: str
    scenario_label: str
    n_tracts_scored: int
    n_tracts_data_limited: int
    stability_label_counts: list[StabilityLabelCount]
    median_ci_width: float | None
    mean_probability_top_decile_among_top_decile: float | None
    note: str


class PresetComparisonRow(BaseModel):
    preset_id: str
    preset_label: str
    spearman_rank_correlation_vs_named_scenario: float | None
    n_paired_tracts: int


class SensitivitySummary(BaseModel):
    data_mode: DataMode
    scenario_id: str
    scenario_label: str
    preset_comparisons: list[PresetComparisonRow]
    note: str
    optimizer_sensitivity_note: str


class AuditCheckResult(BaseModel):
    check_name: str
    passed: bool
    message: str


class AuditSuiteResult(BaseModel):
    suite: str
    n_checks: int
    n_passed: int
    n_failed: int
    checks: list[AuditCheckResult]


class AuditStatusResponse(BaseModel):
    data_mode: DataMode
    run_at: str | None
    all_passed: bool
    suites: list[AuditSuiteResult]


class KnownLimitation(BaseModel):
    category: str
    statement: str


class KnownLimitationsResponse(BaseModel):
    limitations: list[KnownLimitation]


class ScenarioHash(BaseModel):
    scenario_id: str
    label: str
    weights_hash: str


class BuildRecord(BaseModel):
    build_id: str
    phase: str
    finished_at: str
    notes: str


class ReproducibilityResponse(BaseModel):
    data_mode: DataMode
    scenario_hashes: list[ScenarioHash]
    recent_builds: list[BuildRecord]
    data_manifest_source_count: int
    monte_carlo_seed: int
    monte_carlo_draws: int
    weight_sensitivity_seed: int
    weight_sensitivity_draws: int
    note: str
