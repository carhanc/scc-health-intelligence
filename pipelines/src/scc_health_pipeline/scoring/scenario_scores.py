"""Scenario score aggregation: weighted combination of domain scores per
a named scenario configuration (docs/03_ANALYTICS_METHODS.md §7, §10.1).

A domain missing for a tract does not silently become zero -- its weight
is excluded and the remaining weights are renormalized, with the excluded
share tracked as `coverage_fraction` so a tract missing half its weighted
domains is visibly less complete, not silently averaged as if nothing
were missing.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from scc_health_pipeline.scoring.domain_scores import DomainScoreResult
from scc_health_pipeline.scoring.scenarios import ScenarioDefinition


@dataclass(frozen=True)
class DomainContribution:
    domain: str
    domain_score: float
    configured_weight: float
    normalized_weight: float  # weight actually used after renormalizing for missing domains
    contribution: float  # normalized_weight * domain_score


@dataclass(frozen=True)
class ScenarioScoreResult:
    scenario_id: str
    tract_geoid_2020: str
    score: float | None
    coverage_fraction: float  # sum(configured weight of present domains) / total configured weight
    domain_contributions: list[DomainContribution] = field(default_factory=list)
    domains_missing: list[str] = field(default_factory=list)


def compute_scenario_score(
    scenario: ScenarioDefinition,
    domain_results_for_tract: dict[str, DomainScoreResult],
    tract_geoid: str,
) -> ScenarioScoreResult:
    total_configured_weight = sum(scenario.weights.values())
    present_weight_sum = 0.0
    contributions: list[DomainContribution] = []
    missing: list[str] = []

    for domain, weight in scenario.weights.items():
        result = domain_results_for_tract.get(domain)
        if result is None or result.score is None:
            missing.append(domain)
            continue
        present_weight_sum += weight

    coverage_fraction = (
        present_weight_sum / total_configured_weight if total_configured_weight else 0.0
    )

    if present_weight_sum == 0:
        return ScenarioScoreResult(
            scenario_id=scenario.scenario_id,
            tract_geoid_2020=tract_geoid,
            score=None,
            coverage_fraction=0.0,
            domain_contributions=[],
            domains_missing=missing,
        )

    score = 0.0
    for domain, weight in scenario.weights.items():
        result = domain_results_for_tract.get(domain)
        if result is None or result.score is None:
            continue
        normalized_weight = weight / present_weight_sum
        contribution = normalized_weight * result.score
        score += contribution
        contributions.append(
            DomainContribution(
                domain=domain,
                domain_score=result.score,
                configured_weight=weight,
                normalized_weight=normalized_weight,
                contribution=contribution,
            )
        )

    return ScenarioScoreResult(
        scenario_id=scenario.scenario_id,
        tract_geoid_2020=tract_geoid,
        score=score,
        coverage_fraction=coverage_fraction,
        domain_contributions=contributions,
        domains_missing=missing,
    )


def compute_scenario_scores_for_all_tracts(
    scenario: ScenarioDefinition,
    domain_results_by_domain_and_tract: dict[str, dict[str, DomainScoreResult]],
    all_tract_geoids: list[str],
) -> list[ScenarioScoreResult]:
    results = []
    for tract in all_tract_geoids:
        domain_results_for_tract = {
            domain: by_tract[tract]
            for domain, by_tract in domain_results_by_domain_and_tract.items()
            if tract in by_tract
        }
        results.append(compute_scenario_score(scenario, domain_results_for_tract, tract))
    return results
