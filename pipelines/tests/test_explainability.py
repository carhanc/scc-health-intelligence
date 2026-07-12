"""Tests for scoring/explainability.py -- the key property under test is
that the metric-level contribution cascade sums back to the exact
scenario score (hand-verified in the module docstring's worked example),
so "explainability" is provably not lossy/approximate."""

from __future__ import annotations

import pytest
from scc_health_pipeline.metrics.registry import MetricDefinition
from scc_health_pipeline.scoring.domain_scores import (
    MetricScoreResult,
    compute_domain_scores,
    compute_subdomain_scores,
)
from scc_health_pipeline.scoring.explainability import (
    build_score_explanation,
    scenario_config_hash,
    score_decomposition_counterfactual,
)
from scc_health_pipeline.scoring.scenario_scores import compute_scenario_score
from scc_health_pipeline.scoring.scenarios import ScenarioDefinition

TRACT = "t1"


def _metric_def(metric_id: str, domain: str, subdomain: str) -> MetricDefinition:
    return MetricDefinition(
        metric_id=metric_id,
        label=metric_id,
        domain=domain,
        subdomain=subdomain,
        source_id="src",
        source_table="x.x",
        unit="%",
        direction="concern_high",
        transform="none",
        uncertainty_type="none",
        minimum_coverage=0.9,
        allowed_geographies=["tract"],
        plain_language_definition="x",
        interpretation="x",
        limitations="x",
        citation="x",
    )


def test_metric_contributions_sum_to_scenario_score() -> None:
    # Domain A: sub1 (metric_1, pct 80), sub2 (metric_2, pct 40) -> A=60
    # Domain B: sub3 (metric_x pct 100, metric_y pct 0) -> B=50
    # scenario weights {A: 0.6, B: 0.4} -> score = 0.6*60 + 0.4*50 = 56
    metric_scores = [
        MetricScoreResult("metric_1", "A", "sub1", TRACT, 80.0, 80.0, 80.0),
        MetricScoreResult("metric_2", "A", "sub2", TRACT, 40.0, 40.0, 40.0),
        MetricScoreResult("metric_x", "B", "sub3", TRACT, 100.0, 100.0, 100.0),
        MetricScoreResult("metric_y", "B", "sub3", TRACT, 0.0, 0.0, 0.0),
    ]
    subdomain_scores = compute_subdomain_scores(metric_scores)
    domain_scores = compute_domain_scores(subdomain_scores)
    domain_results_for_tract = {d.domain: d for d in domain_scores}

    scenario = ScenarioDefinition(
        scenario_id="s1", label="S1", description="", weights={"A": 0.6, "B": 0.4}
    )
    scenario_result = compute_scenario_score(scenario, domain_results_for_tract, TRACT)
    assert scenario_result.score == pytest.approx(56.0)

    metric_defs_by_id = {
        "metric_1": _metric_def("metric_1", "A", "sub1"),
        "metric_2": _metric_def("metric_2", "A", "sub2"),
        "metric_x": _metric_def("metric_x", "B", "sub3"),
        "metric_y": _metric_def("metric_y", "B", "sub3"),
    }
    subdomains_present = {
        "A": [s.subdomain for s in subdomain_scores if s.domain == "A" and s.score is not None],
        "B": [s.subdomain for s in subdomain_scores if s.domain == "B" and s.score is not None],
    }
    subdomains_missing: dict[str, list[str]] = {"A": [], "B": []}

    explanation = build_score_explanation(
        scenario,
        scenario_result,
        metric_scores,
        metric_defs_by_id,
        subdomains_present,
        subdomains_missing,
    )

    all_contributions = [
        m.contribution for d in explanation.domains for m in d.metrics if m.contribution is not None
    ]
    assert sum(all_contributions) == pytest.approx(56.0)

    # Per-domain contribution cascade also matches hand-calculated values.
    by_domain = {d.domain: d for d in explanation.domains}
    a_metric_contribs = {m.metric_id: m.contribution for m in by_domain["A"].metrics}
    assert a_metric_contribs["metric_1"] == pytest.approx(24.0)  # 0.6/2 * 80
    assert a_metric_contribs["metric_2"] == pytest.approx(12.0)  # 0.6/2 * 40
    b_metric_contribs = {m.metric_id: m.contribution for m in by_domain["B"].metrics}
    assert b_metric_contribs["metric_x"] == pytest.approx(20.0)  # 0.4/2 * 100
    assert b_metric_contribs["metric_y"] == pytest.approx(0.0)  # 0.4/2 * 0


def test_scenario_config_hash_is_stable_and_order_independent() -> None:
    s1 = ScenarioDefinition("s", "S", "", weights={"A": 0.5, "B": 0.5})
    s2 = ScenarioDefinition("s", "S", "", weights={"B": 0.5, "A": 0.5})
    assert scenario_config_hash(s1) == scenario_config_hash(s2)


def test_scenario_config_hash_changes_with_different_weights() -> None:
    s1 = ScenarioDefinition("s", "S", "", weights={"A": 0.5, "B": 0.5})
    s2 = ScenarioDefinition("s", "S", "", weights={"A": 0.6, "B": 0.4})
    assert scenario_config_hash(s1) != scenario_config_hash(s2)


def test_score_decomposition_counterfactual_hand_calculated() -> None:
    from scc_health_pipeline.scoring.scenario_scores import DomainContribution, ScenarioScoreResult

    scenario_result = ScenarioScoreResult(
        scenario_id="s1",
        tract_geoid_2020=TRACT,
        score=56.0,
        coverage_fraction=1.0,
        domain_contributions=[
            DomainContribution("A", 60.0, 0.6, 0.6, 36.0),
            DomainContribution("B", 50.0, 0.4, 0.4, 20.0),
        ],
    )
    original, counterfactual = score_decomposition_counterfactual(
        scenario_result, domain_to_substitute="B", county_median_for_domain=10.0
    )
    assert original == pytest.approx(56.0)
    # B's contribution replaced: 36 (unchanged A) + 0.4*10 = 36 + 4 = 40
    assert counterfactual == pytest.approx(40.0)
