"""Score explainability: full decomposition of a scenario score down to
individual metric contributions, per docs/03_ANALYTICS_METHODS.md §10.

Every score exposes: component domains, component metrics, raw value and
unit, county percentile, contribution to score, uncertainty, weight,
source/vintage, directionality, missing metrics, and a scenario
configuration hash (§18 reproducibility). No opaque black-box number is
ever returned without this decomposition available alongside it.

Contribution cascades through 3 levels of equal weighting (docs §6.1's
subdomain -> domain averaging, extended one level further to individual
metrics): domain normalized weight -> split equally across present
subdomains -> split equally across present metrics within each subdomain.
By construction, summing every metric's contribution across every domain
reproduces the scenario score exactly (verified in
pipelines/tests/test_explainability.py).
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field

from scc_health_pipeline.metrics.registry import MetricDefinition
from scc_health_pipeline.scoring.data_confidence import DataConfidenceResult
from scc_health_pipeline.scoring.domain_scores import MetricScoreResult
from scc_health_pipeline.scoring.scenario_scores import ScenarioScoreResult
from scc_health_pipeline.scoring.scenarios import ScenarioDefinition
from scc_health_pipeline.uncertainty.monte_carlo import MonteCarloScenarioResult


def scenario_config_hash(scenario: ScenarioDefinition) -> str:
    """Stable hash (not Python's randomized str hash) of a scenario's
    weight configuration, for reproducibility tracking (docs §18)."""
    payload = json.dumps(
        {"scenario_id": scenario.scenario_id, "weights": scenario.weights}, sort_keys=True
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()[:16]


@dataclass(frozen=True)
class MetricExplanation:
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


@dataclass(frozen=True)
class DomainExplanation:
    domain: str
    domain_score: float | None
    configured_weight: float
    normalized_weight: float
    contribution: float | None
    subdomains_present: list[str] = field(default_factory=list)
    subdomains_missing: list[str] = field(default_factory=list)
    metrics: list[MetricExplanation] = field(default_factory=list)


@dataclass(frozen=True)
class ScoreExplanation:
    scenario_id: str
    tract_geoid_2020: str
    score: float | None
    coverage_fraction: float
    domains: list[DomainExplanation]
    domains_missing: list[str]
    scenario_config_hash: str
    data_confidence: DataConfidenceResult | None = None
    stability_label: str | None = None
    monte_carlo: MonteCarloScenarioResult | None = None


def build_score_explanation(
    scenario: ScenarioDefinition,
    scenario_result: ScenarioScoreResult,
    all_metric_scores_for_tract: list[MetricScoreResult],
    metric_definitions_by_id: dict[str, MetricDefinition],
    subdomains_present_by_domain: dict[str, list[str]],
    subdomains_missing_by_domain: dict[str, list[str]],
    data_confidence: DataConfidenceResult | None = None,
    stability_label: str | None = None,
    monte_carlo: MonteCarloScenarioResult | None = None,
) -> ScoreExplanation:
    metric_scores_by_subdomain: dict[tuple[str, str], list[MetricScoreResult]] = {}
    for m in all_metric_scores_for_tract:
        metric_scores_by_subdomain.setdefault((m.domain, m.subdomain), []).append(m)

    domain_explanations = []
    for contribution in scenario_result.domain_contributions:
        domain = contribution.domain
        subdomains_present = subdomains_present_by_domain.get(domain, [])
        subdomains_missing = subdomains_missing_by_domain.get(domain, [])
        n_subdomains_present = len(subdomains_present) or 1
        subdomain_weight = contribution.normalized_weight / n_subdomains_present

        metric_explanations = []
        for subdomain in subdomains_present:
            members = metric_scores_by_subdomain.get((domain, subdomain), [])
            present = [m for m in members if m.percentile is not None]
            n_present = len(present) or 1
            metric_weight = subdomain_weight / n_present
            for m in present:
                definition = metric_definitions_by_id.get(m.metric_id)
                if definition is None:
                    continue
                metric_explanations.append(
                    MetricExplanation(
                        metric_id=m.metric_id,
                        label=definition.label,
                        domain=domain,
                        subdomain=subdomain,
                        raw_value=m.raw_value,
                        unit=definition.unit,
                        direction=definition.direction,
                        percentile=m.percentile,
                        effective_weight=metric_weight,
                        contribution=(
                            metric_weight * m.percentile if m.percentile is not None else None
                        ),
                        standard_error=m.standard_error,
                        low_confidence_limit=m.low_confidence_limit,
                        high_confidence_limit=m.high_confidence_limit,
                        source_id=definition.source_id,
                        citation=definition.citation,
                        plain_language_definition=definition.plain_language_definition,
                        limitations=definition.limitations,
                    )
                )

        domain_explanations.append(
            DomainExplanation(
                domain=domain,
                domain_score=contribution.domain_score,
                configured_weight=contribution.configured_weight,
                normalized_weight=contribution.normalized_weight,
                contribution=contribution.contribution,
                subdomains_present=subdomains_present,
                subdomains_missing=subdomains_missing,
                metrics=metric_explanations,
            )
        )

    return ScoreExplanation(
        scenario_id=scenario.scenario_id,
        tract_geoid_2020=scenario_result.tract_geoid_2020,
        score=scenario_result.score,
        coverage_fraction=scenario_result.coverage_fraction,
        domains=domain_explanations,
        domains_missing=scenario_result.domains_missing,
        scenario_config_hash=scenario_config_hash(scenario),
        data_confidence=data_confidence,
        stability_label=stability_label,
        monte_carlo=monte_carlo,
    )


def score_decomposition_counterfactual(
    scenario_result: ScenarioScoreResult, domain_to_substitute: str, county_median_for_domain: float
) -> tuple[float | None, float | None]:
    """docs §10.2: "If this tract's resource-access domain were set to
    the county median, its scenario score would move from X to Y." This
    is a noncausal score decomposition -- callers must label it exactly
    that, never "expected intervention impact." Returns
    (original_score, counterfactual_score)."""
    if scenario_result.score is None:
        return None, None
    counterfactual_score = 0.0
    found = False
    for c in scenario_result.domain_contributions:
        if c.domain == domain_to_substitute:
            counterfactual_score += c.normalized_weight * county_median_for_domain
            found = True
        else:
            counterfactual_score += c.contribution
    if not found:
        return scenario_result.score, scenario_result.score
    return scenario_result.score, counterfactual_score
