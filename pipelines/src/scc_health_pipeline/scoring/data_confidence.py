"""Data-confidence score: a separate reliability/confidence domain, never
treated as need, computed alongside every domain/scenario score per
docs/03_ANALYTICS_METHODS.md §4.7 and §8.4.

confidence = 0.35*coverage + 0.30*precision + 0.20*geography_quality
             + 0.15*freshness_source

Every component is documented and independently visible (not just the
blended total) -- CLAUDE.md requires every uncertainty/quality note to be
inspectable, not a single opaque number.
"""

from __future__ import annotations

from dataclasses import dataclass

from scc_health_pipeline.audits.vintage_audits import classify_entry
from scc_health_pipeline.metrics.registry import MetricDefinition
from scc_health_pipeline.scoring.domain_scores import DomainScoreResult, MetricCoverageResult

_FRESHNESS_SCORE = {
    "newest_verified": 1.0,
    "intentional_older": 0.9,  # a genuinely fixed-vintage source is not "worse," DEC-019-style
    "lagged": 0.6,
    "stale": 0.3,
    "draft": 0.1,
    "unavailable": 0.0,
}

_COVERAGE_WEIGHT = 0.35
_PRECISION_WEIGHT = 0.30
_GEOGRAPHY_WEIGHT = 0.20
_FRESHNESS_WEIGHT = 0.15


@dataclass(frozen=True)
class DataConfidenceResult:
    tract_geoid_2020: str
    scenario_id: str
    confidence_score: float  # 0-1
    coverage_component: float
    precision_component: float
    geography_quality_component: float
    freshness_source_component: float
    contributing_metric_ids: list[str]


def compute_data_confidence(
    tract_geoid: str,
    scenario_id: str,
    scenario_weights: dict[str, float],
    domain_results_for_tract: dict[str, DomainScoreResult],
    contributing_metrics: list[MetricDefinition],
    metric_coverage_by_id: dict[str, MetricCoverageResult],
    manifest_entries_by_source_id: dict[str, dict[str, object]],
) -> DataConfidenceResult:
    # coverage_component: weighted average of each scenario-weighted
    # domain's coverage_fraction for this tract.
    coverage_terms = []
    for domain, weight in scenario_weights.items():
        result = domain_results_for_tract.get(domain)
        if result is not None:
            coverage_terms.append(weight * result.coverage_fraction)
    total_weight = sum(scenario_weights.values()) or 1.0
    coverage_component = sum(coverage_terms) / total_weight if coverage_terms else 0.0

    # precision_component: fraction of contributing metrics that carry a
    # real uncertainty field (places_ci or acs_moe), among metrics that
    # were actually included (passed their minimum_coverage gate).
    included_metrics = [
        m
        for m in contributing_metrics
        if metric_coverage_by_id.get(m.metric_id) and metric_coverage_by_id[m.metric_id].included
    ]
    if included_metrics:
        with_uncertainty = sum(1 for m in included_metrics if m.uncertainty_type != "none")
        precision_component = with_uncertainty / len(included_metrics)
    else:
        precision_component = 0.0

    # geography_quality_component: native/direct metrics score 1.0;
    # precomputed straight-line-screening proxies score 0.7 (DEC-024).
    if included_metrics:
        geography_scores = [0.7 if m.transform == "precomputed" else 1.0 for m in included_metrics]
        geography_quality_component = sum(geography_scores) / len(geography_scores)
    else:
        geography_quality_component = 0.0

    # freshness_source_component: average freshness classification of
    # each contributing metric's underlying manifest source_id (reuses
    # the Phase 3 vintage-transparency classifier, DEC-022-style reuse).
    if included_metrics:
        freshness_scores = []
        for m in included_metrics:
            entry = manifest_entries_by_source_id.get(m.source_id)
            if entry is None:
                freshness_scores.append(0.5)  # unknown source -- neutral, not zero
                continue
            state = classify_entry(entry).state
            freshness_scores.append(_FRESHNESS_SCORE.get(state, 0.5))
        freshness_source_component = sum(freshness_scores) / len(freshness_scores)
    else:
        freshness_source_component = 0.0

    confidence_score = (
        _COVERAGE_WEIGHT * coverage_component
        + _PRECISION_WEIGHT * precision_component
        + _GEOGRAPHY_WEIGHT * geography_quality_component
        + _FRESHNESS_WEIGHT * freshness_source_component
    )

    return DataConfidenceResult(
        tract_geoid_2020=tract_geoid,
        scenario_id=scenario_id,
        confidence_score=confidence_score,
        coverage_component=coverage_component,
        precision_component=precision_component,
        geography_quality_component=geography_quality_component,
        freshness_source_component=freshness_source_component,
        contributing_metric_ids=[m.metric_id for m in included_metrics],
    )
