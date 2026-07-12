"""Structured recommendation engine: assembles ranked, fully-evidenced
screening recommendations from scenario scores + explainability output.

Every recommendation is a priority-*screening* result, never a claim of
causal impact or a guarantee (CLAUDE.md: "Never label a heuristic,
association, optimization scenario, or correlation as causal impact").
Each one exposes contributing metrics, weights, uncertainty, assumptions,
limitations, supporting evidence, and source provenance -- nothing is
asserted without an attached, inspectable reason.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from scc_health_pipeline.scoring.explainability import ScoreExplanation
from scc_health_pipeline.scoring.scenario_scores import ScenarioScoreResult
from scc_health_pipeline.scoring.scenarios import ScenarioDefinition

_STRAIGHT_LINE_DOMAINS = {"resource_accessibility", "workforce_shortage"}


@dataclass(frozen=True)
class EvidenceItem:
    metric_id: str
    label: str
    raw_value: float | None
    unit: str
    county_percentile: float | None
    citation: str


@dataclass(frozen=True)
class Recommendation:
    scenario_id: str
    scenario_label: str
    tract_geoid_2020: str
    rank: int
    score: float | None
    coverage_fraction: float
    stability_label: str | None
    confidence_score: float | None
    assumptions: list[str] = field(default_factory=list)
    limitations: list[str] = field(default_factory=list)
    supporting_evidence: list[EvidenceItem] = field(default_factory=list)
    source_provenance: list[str] = field(default_factory=list)
    scenario_config_hash: str = ""


def _assumptions_for_scenario(scenario: ScenarioDefinition) -> list[str]:
    assumptions = [
        "This is a county-relative priority screening score (0-100 percentile among Santa "
        "Clara County tracts), not an absolute clinical threshold or a probability of any "
        "outcome.",
        "Domain weights reflect this scenario's configured policy lens, not an objectively "
        "'correct' weighting -- see the sensitivity analysis for how much the ranking depends "
        "on this choice.",
    ]
    straight_line_domains_used = [d for d in scenario.weights if d in _STRAIGHT_LINE_DOMAINS]
    if straight_line_domains_used:
        assumptions.append(
            f"Domain(s) {', '.join(sorted(straight_line_domains_used))} use straight-line "
            "distance as a screening proxy, not network travel time (Phase 6 will add network "
            "routing)."
        )
    return assumptions


def build_recommendation(
    scenario: ScenarioDefinition,
    scenario_result: ScenarioScoreResult,
    explanation: ScoreExplanation,
    rank: int,
) -> Recommendation:
    limitations = sorted(
        {m.limitations for d in explanation.domains for m in d.metrics if m.limitations}
    )
    supporting_evidence = [
        EvidenceItem(
            metric_id=m.metric_id,
            label=m.label,
            raw_value=m.raw_value,
            unit=m.unit,
            county_percentile=m.percentile,
            citation=m.citation,
        )
        for d in explanation.domains
        for m in d.metrics
    ]
    source_provenance = sorted({m.citation for d in explanation.domains for m in d.metrics})

    confidence_score = (
        explanation.data_confidence.confidence_score if explanation.data_confidence else None
    )

    return Recommendation(
        scenario_id=scenario.scenario_id,
        scenario_label=scenario.label,
        tract_geoid_2020=scenario_result.tract_geoid_2020,
        rank=rank,
        score=scenario_result.score,
        coverage_fraction=scenario_result.coverage_fraction,
        stability_label=explanation.stability_label,
        confidence_score=confidence_score,
        assumptions=_assumptions_for_scenario(scenario),
        limitations=list(limitations),
        supporting_evidence=supporting_evidence,
        source_provenance=source_provenance,
        scenario_config_hash=explanation.scenario_config_hash,
    )


def build_ranked_recommendations(
    scenario: ScenarioDefinition,
    scenario_results: list[ScenarioScoreResult],
    explanations_by_tract: dict[str, ScoreExplanation],
    top_n: int | None = None,
) -> list[Recommendation]:
    """Ranks tracts by scenario score descending (None scores excluded --
    a tract with insufficient data is never silently ranked as "low
    priority" by treating a missing score as zero)."""
    scored = [r for r in scenario_results if r.score is not None]
    ranked = sorted(scored, key=lambda r: r.score, reverse=True)  # type: ignore[arg-type,return-value]
    if top_n is not None:
        ranked = ranked[:top_n]

    recommendations = []
    for i, result in enumerate(ranked, start=1):
        explanation = explanations_by_tract.get(result.tract_geoid_2020)
        if explanation is None:
            continue
        recommendations.append(build_recommendation(scenario, result, explanation, rank=i))
    return recommendations
