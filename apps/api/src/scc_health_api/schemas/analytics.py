"""Typed response schemas for the Phase 4 analytics/decision-engine API
(/api/v1/scenarios, /api/v1/domains, /api/v1/optimization,
/api/v1/validation). Every score-bearing response exposes uncertainty,
weight, source, and provenance fields alongside the number itself --
never a bare value with no explainability path (CLAUDE.md, docs/03 §10).
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel

DataMode = Literal["live", "demo"]


class ScenarioSummary(BaseModel):
    scenario_id: str
    label: str
    description: str
    weights: dict[str, float]
    required_metrics: list[str]
    minimum_confidence: float
    notes: str


class ScenarioListResponse(BaseModel):
    scenarios: list[ScenarioSummary]


class SensitivityPresetSummary(BaseModel):
    preset_id: str
    label: str
    weights: dict[str, float]
    notes: str


class MetricSummary(BaseModel):
    metric_id: str
    label: str
    domain: str
    subdomain: str
    unit: str
    direction: str
    plain_language_definition: str
    limitations: str
    citation: str


class DomainSummary(BaseModel):
    domain: str
    subdomains: list[str]
    metrics: list[MetricSummary]


class DomainListResponse(BaseModel):
    domains: list[DomainSummary]


class TractScenarioScore(BaseModel):
    tract_geoid_2020: str
    scenario_id: str
    score: float | None
    coverage_fraction: float
    domains_missing: list[str]
    stability_label: str | None
    confidence_score: float | None
    monte_carlo_median: float | None
    monte_carlo_ci_lower: float | None
    monte_carlo_ci_upper: float | None
    monte_carlo_median_rank: int | None
    probability_top_decile: float | None


class ScenarioScoresResponse(BaseModel):
    scenario_id: str
    data_mode: DataMode
    total_tracts: int
    scores: list[TractScenarioScore]


class MetricContribution(BaseModel):
    metric_id: str
    label: str
    domain: str
    subdomain: str
    raw_value: float | None
    unit: str
    direction: str
    percentile: float | None
    effective_weight: float
    contribution: float | None
    standard_error: float | None
    low_confidence_limit: float | None
    high_confidence_limit: float | None
    source_id: str
    citation: str
    plain_language_definition: str
    limitations: str


class DomainContributionDetail(BaseModel):
    domain: str
    domain_score: float | None
    configured_weight: float
    normalized_weight: float
    contribution: float | None
    metrics: list[MetricContribution]


class DataConfidenceDetail(BaseModel):
    confidence_score: float
    coverage_component: float
    precision_component: float
    geography_quality_component: float
    freshness_source_component: float


class MonteCarloDetail(BaseModel):
    median_score: float | None
    ci_lower: float | None
    ci_upper: float | None
    median_rank: int | None
    rank_ci_lower: int | None
    rank_ci_upper: int | None
    probability_top_decile: float | None
    probability_top_quartile: float | None
    n_draws: int
    seed: int


class WeightSensitivityDetail(BaseModel):
    median_rank: int | None
    rank_ci_lower: int | None
    rank_ci_upper: int | None
    rank_std: float | None
    probability_top_decile: float | None
    probability_top_quartile: float | None
    most_influential_domain: str | None
    n_draws: int
    seed: int


class ScoreExplanationResponse(BaseModel):
    scenario_id: str
    scenario_label: str
    tract_geoid_2020: str
    score: float | None
    coverage_fraction: float
    domains: list[DomainContributionDetail]
    domains_missing: list[str]
    stability_label: str | None
    data_confidence: DataConfidenceDetail | None
    monte_carlo: MonteCarloDetail | None
    weight_sensitivity: WeightSensitivityDetail | None
    data_mode: DataMode


class EvidenceItem(BaseModel):
    metric_id: str
    label: str
    raw_value: float | None
    unit: str
    county_percentile: float | None
    citation: str


class Recommendation(BaseModel):
    scenario_id: str
    scenario_label: str
    tract_geoid_2020: str
    rank: int
    score: float | None
    coverage_fraction: float
    stability_label: str | None
    confidence_score: float | None
    assumptions: list[str]
    limitations: list[str]
    supporting_evidence: list[EvidenceItem]
    source_provenance: list[str]


class RecommendationsResponse(BaseModel):
    scenario_id: str
    data_mode: DataMode
    recommendations: list[Recommendation]


class OptimizationRun(BaseModel):
    run_id: str
    scenario_label: str
    k_sites: int
    distance_threshold_miles: float
    status: str
    objective_value: float | None
    selected_sites: list[str]
    population_covered: float
    high_need_population_covered: float
    total_population: float
    total_high_need_population: float
    overlap_count: int
    unserved_high_need_tracts: list[str]
    assumptions: list[str]
    method: str


class OptimizationRunsResponse(BaseModel):
    data_mode: DataMode
    runs: list[OptimizationRun]


class CorrelationDiagnostic(BaseModel):
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


class CorrelationDiagnosticsResponse(BaseModel):
    data_mode: DataMode
    diagnostics: list[CorrelationDiagnostic]
