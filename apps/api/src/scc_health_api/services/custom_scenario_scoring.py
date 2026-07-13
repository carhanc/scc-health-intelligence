"""Dependency-free duplicate of the Phase 4 scenario-score aggregation
formula (`scc_health_pipeline.scoring.scenario_scores.compute_scenario_score`),
used only for a **user-supplied custom weight vector** -- something the
batch pipeline never precomputes, since it cannot enumerate every
possible weighting in advance.

This is not a second, divergent implementation of "the scoring logic":
it is the exact same formula (weighted mean of present domain scores,
renormalized over present domains, coverage_fraction = present weight
share) applied at request time instead of build time, following the
same dependency-isolation pattern already used for
`services/resource_gap.py` (DEC-022/DEC-051) so the API never imports
the pipeline package's polars/metrics-registry dependency chain just to
run five numbers through a weighted average. `tests/test_custom_scenario_scoring.py`
asserts this produces identical output to the pipeline's own hand-calculated
cases in `pipelines/tests/test_scenario_scores.py`.

Every number a custom weighting produces still comes from
`analytics.domain_scores` -- an already-tested, already-computed table
-- not from freehand recomputation of raw metrics (CLAUDE.md).
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass, field


@dataclass(frozen=True)
class DomainContribution:
    domain: str
    domain_score: float
    configured_weight: float
    normalized_weight: float
    contribution: float


@dataclass(frozen=True)
class CustomScoreResult:
    tract_geoid_2020: str
    score: float | None
    coverage_fraction: float
    domain_contributions: list[DomainContribution] = field(default_factory=list)
    domains_missing: list[str] = field(default_factory=list)


def compute_custom_score(
    weights: Mapping[str, float],
    domain_scores_for_tract: Mapping[str, float | None],
    tract_geoid: str,
) -> CustomScoreResult:
    total_configured_weight = sum(weights.values())
    present_weight_sum = 0.0
    missing: list[str] = []

    for domain, weight in weights.items():
        score = domain_scores_for_tract.get(domain)
        if score is None:
            missing.append(domain)
            continue
        present_weight_sum += weight

    coverage_fraction = (
        present_weight_sum / total_configured_weight if total_configured_weight else 0.0
    )

    if present_weight_sum == 0:
        return CustomScoreResult(
            tract_geoid_2020=tract_geoid,
            score=None,
            coverage_fraction=0.0,
            domain_contributions=[],
            domains_missing=missing,
        )

    score = 0.0
    contributions: list[DomainContribution] = []
    for domain, weight in weights.items():
        domain_score = domain_scores_for_tract.get(domain)
        if domain_score is None:
            continue
        normalized_weight = weight / present_weight_sum
        contribution = normalized_weight * domain_score
        score += contribution
        contributions.append(
            DomainContribution(
                domain=domain,
                domain_score=domain_score,
                configured_weight=weight,
                normalized_weight=normalized_weight,
                contribution=contribution,
            )
        )

    return CustomScoreResult(
        tract_geoid_2020=tract_geoid,
        score=score,
        coverage_fraction=coverage_fraction,
        domain_contributions=contributions,
        domains_missing=missing,
    )


class InvalidWeightsError(ValueError):
    pass


_KNOWN_DOMAINS = {
    "health_burden",
    "access_barriers",
    "environmental_burden",
    "resource_accessibility",
    "workforce_shortage",
}


def validate_custom_weights(weights: dict[str, float]) -> None:
    """Mirrors the same validation `scoring/scenarios.py::load_scenarios`
    applies to every config-defined scenario, so a user-supplied weight
    vector is held to the identical standard: known domains only,
    non-negative, and summing to 1.0 (within floating-point tolerance)."""
    if not weights:
        raise InvalidWeightsError("At least one domain weight is required.")
    unknown = set(weights) - _KNOWN_DOMAINS
    if unknown:
        raise InvalidWeightsError(f"Unknown domain(s): {sorted(unknown)}.")
    negative = [d for d, w in weights.items() if w < 0]
    if negative:
        raise InvalidWeightsError(f"Weight(s) must be non-negative: {sorted(negative)}.")
    total = sum(weights.values())
    if abs(total - 1.0) > 1e-6:
        raise InvalidWeightsError(f"Weights must sum to 1.0 (got {total}).")
