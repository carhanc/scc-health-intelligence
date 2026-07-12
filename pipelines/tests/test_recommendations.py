"""Tests for scoring/recommendations.py."""

from __future__ import annotations

from scc_health_pipeline.scoring.explainability import (
    DomainExplanation,
    MetricExplanation,
    ScoreExplanation,
)
from scc_health_pipeline.scoring.recommendations import build_ranked_recommendations
from scc_health_pipeline.scoring.scenario_scores import ScenarioScoreResult
from scc_health_pipeline.scoring.scenarios import ScenarioDefinition


def _explanation(tract: str, score: float | None) -> ScoreExplanation:
    metric = MetricExplanation(
        metric_id="m1",
        label="Metric One",
        domain="health_burden",
        subdomain="cardiometabolic",
        raw_value=12.3,
        unit="%",
        direction="concern_high",
        percentile=80.0,
        effective_weight=1.0,
        contribution=80.0,
        standard_error=None,
        low_confidence_limit=None,
        high_confidence_limit=None,
        source_id="src1",
        citation="Source citation",
        plain_language_definition="x",
        limitations="Modeled small-area estimate.",
    )
    domain = DomainExplanation(
        domain="health_burden",
        domain_score=80.0,
        configured_weight=1.0,
        normalized_weight=1.0,
        contribution=80.0,
        subdomains_present=["cardiometabolic"],
        metrics=[metric],
    )
    return ScoreExplanation(
        scenario_id="s1",
        tract_geoid_2020=tract,
        score=score,
        coverage_fraction=1.0,
        domains=[domain],
        domains_missing=[],
        scenario_config_hash="abc123",
    )


def test_recommendations_ranked_by_score_descending() -> None:
    scenario = ScenarioDefinition("s1", "S1", "", weights={"health_burden": 1.0})
    results = [
        ScenarioScoreResult("s1", "t1", 50.0, 1.0, []),
        ScenarioScoreResult("s1", "t2", 90.0, 1.0, []),
        ScenarioScoreResult("s1", "t3", 70.0, 1.0, []),
    ]
    explanations = {
        t: _explanation(t, score) for t, score in [("t1", 50.0), ("t2", 90.0), ("t3", 70.0)]
    }
    recs = build_ranked_recommendations(scenario, results, explanations)
    assert [r.tract_geoid_2020 for r in recs] == ["t2", "t3", "t1"]
    assert [r.rank for r in recs] == [1, 2, 3]


def test_recommendations_exclude_tracts_with_no_score() -> None:
    scenario = ScenarioDefinition("s1", "S1", "", weights={"health_burden": 1.0})
    results = [
        ScenarioScoreResult("s1", "t1", 50.0, 1.0, []),
        ScenarioScoreResult("s1", "t2", None, 0.0, ["health_burden"]),
    ]
    explanations = {"t1": _explanation("t1", 50.0)}
    recs = build_ranked_recommendations(scenario, results, explanations)
    assert len(recs) == 1
    assert recs[0].tract_geoid_2020 == "t1"


def test_recommendation_evidence_and_provenance_populated() -> None:
    scenario = ScenarioDefinition("s1", "S1", "", weights={"health_burden": 1.0})
    results = [ScenarioScoreResult("s1", "t1", 80.0, 1.0, [])]
    explanations = {"t1": _explanation("t1", 80.0)}
    recs = build_ranked_recommendations(scenario, results, explanations)
    rec = recs[0]
    assert len(rec.supporting_evidence) == 1
    assert rec.supporting_evidence[0].metric_id == "m1"
    assert rec.source_provenance == ["Source citation"]
    assert "Modeled small-area estimate." in rec.limitations
    assert len(rec.assumptions) >= 2


def test_recommendations_top_n_limit() -> None:
    scenario = ScenarioDefinition("s1", "S1", "", weights={"health_burden": 1.0})
    results = [ScenarioScoreResult("s1", f"t{i}", float(i), 1.0, []) for i in range(10)]
    explanations = {f"t{i}": _explanation(f"t{i}", float(i)) for i in range(10)}
    recs = build_ranked_recommendations(scenario, results, explanations, top_n=3)
    assert len(recs) == 3
    assert recs[0].tract_geoid_2020 == "t9"
