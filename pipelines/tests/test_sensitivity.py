"""Tests for scoring/sensitivity.py: preset sensitivity, Dirichlet
random-weight sensitivity, and stability-label classification."""

from __future__ import annotations

import pytest
from scc_health_pipeline.scoring.domain_scores import DomainScoreResult
from scc_health_pipeline.scoring.scenarios import ScenarioDefinition, SensitivityPreset
from scc_health_pipeline.scoring.sensitivity import (
    STABILITY_ASSUMPTION_SENSITIVE,
    STABILITY_DATA_LIMITED,
    STABILITY_MODERATELY_STABLE,
    STABILITY_ROBUST,
    classify_stability,
    compute_preset_sensitivity,
    compute_weight_sensitivity,
)


def _domain_result(domain: str, tract: str, score: float) -> DomainScoreResult:
    return DomainScoreResult(
        domain=domain,
        tract_geoid_2020=tract,
        score=score,
        coverage_fraction=1.0,
        n_subdomains_present=1,
        n_subdomains_total=1,
    )


def test_preset_sensitivity_ranks_tracts_correctly_per_preset() -> None:
    presets = [
        SensitivityPreset("balanced", "Balanced", {"A": 0.5, "B": 0.5}),
        SensitivityPreset("a_heavy", "A-heavy", {"A": 0.9, "B": 0.1}),
    ]
    domain_results = {
        "A": {"t1": _domain_result("A", "t1", 100.0), "t2": _domain_result("A", "t2", 0.0)},
        "B": {"t1": _domain_result("B", "t1", 0.0), "t2": _domain_result("B", "t2", 100.0)},
    }
    results = compute_preset_sensitivity(presets, domain_results, ["t1", "t2"])
    by_key = {(r.preset_id, r.tract_geoid_2020): r for r in results}

    # balanced: t1 = 0.5*100+0.5*0=50, t2=0.5*0+0.5*100=50 -> tied
    assert by_key[("balanced", "t1")].score == pytest.approx(50.0)
    assert by_key[("balanced", "t2")].score == pytest.approx(50.0)
    # a_heavy: t1 = 0.9*100+0.1*0=90, t2=0.9*0+0.1*100=10 -> t1 ranks first
    assert by_key[("a_heavy", "t1")].score == pytest.approx(90.0)
    assert by_key[("a_heavy", "t2")].score == pytest.approx(10.0)
    assert by_key[("a_heavy", "t1")].rank == 1
    assert by_key[("a_heavy", "t2")].rank == 2


def test_weight_sensitivity_dirichlet_bounds_and_probabilities() -> None:
    # t1's score is driven entirely by domain A; with a symmetric
    # 2-domain Dirichlet(1,1) (uniform on weight_A in [0,1]), t1 is top
    # decile (rank 1 of 4, since ceil(0.1*4)=1) exactly when weight_A>0.5
    # -> P(top decile) should be close to 0.5.
    scenario = ScenarioDefinition(
        scenario_id="s1", label="S1", description="", weights={"A": 0.5, "B": 0.5}
    )
    domain_results = {
        "A": {
            "t1": _domain_result("A", "t1", 100.0),
            "t2": _domain_result("A", "t2", 0.0),
            "t3": _domain_result("A", "t3", 0.0),
            "t4": _domain_result("A", "t4", 0.0),
        },
        "B": {
            "t1": _domain_result("B", "t1", 0.0),
            "t2": _domain_result("B", "t2", 100.0),
            "t3": _domain_result("B", "t3", 0.0),
            "t4": _domain_result("B", "t4", 0.0),
        },
    }
    results = compute_weight_sensitivity(
        scenario, domain_results, ["t1", "t2", "t3", "t4"], n_draws=2000, seed=42
    )
    by_tract = {r.tract_geoid_2020: r for r in results}

    assert by_tract["t1"].probability_top_decile == pytest.approx(0.5, abs=0.05)
    assert by_tract["t2"].probability_top_decile == pytest.approx(0.5, abs=0.05)
    # t3/t4 always score 0 -- never top-decile.
    assert by_tract["t3"].probability_top_decile == pytest.approx(0.0, abs=0.01)
    assert by_tract["t4"].probability_top_decile == pytest.approx(0.0, abs=0.01)
    for r in results:
        assert 0.0 <= r.probability_top_decile <= 1.0  # type: ignore[operator]
        assert 0.0 <= r.probability_top_quartile <= 1.0  # type: ignore[operator]
        assert r.median_rank is not None and 1 <= r.median_rank <= 4


def test_weight_sensitivity_most_influential_domain_identifies_dominant_driver() -> None:
    # t1's score is proportional to domain A's weight only (3 domains,
    # so Dirichlet marginals aren't perfectly anti-correlated) -- domain
    # A should be identified as the most influential.
    scenario = ScenarioDefinition(
        scenario_id="s1", label="S1", description="", weights={"A": 1 / 3, "B": 1 / 3, "C": 1 / 3}
    )
    domain_results = {
        "A": {"t1": _domain_result("A", "t1", 100.0), "t2": _domain_result("A", "t2", 0.0)},
        "B": {"t1": _domain_result("B", "t1", 0.0), "t2": _domain_result("B", "t2", 50.0)},
        "C": {"t1": _domain_result("C", "t1", 0.0), "t2": _domain_result("C", "t2", 50.0)},
    }
    results = compute_weight_sensitivity(
        scenario, domain_results, ["t1", "t2"], n_draws=500, seed=7
    )
    by_tract = {r.tract_geoid_2020: r for r in results}
    assert by_tract["t1"].most_influential_domain == "A"


def test_classify_stability_robust() -> None:
    assert classify_stability(0.9, data_confidence_score=0.8) == STABILITY_ROBUST


def test_classify_stability_moderately_stable() -> None:
    assert classify_stability(0.5, data_confidence_score=0.8) == STABILITY_MODERATELY_STABLE


def test_classify_stability_assumption_sensitive() -> None:
    assert classify_stability(0.1, data_confidence_score=0.8) == STABILITY_ASSUMPTION_SENSITIVE


def test_classify_stability_data_limited_overrides_high_weight_stability() -> None:
    # Even a high probability_top_decile is overridden by low data confidence.
    assert classify_stability(0.95, data_confidence_score=0.2) == STABILITY_DATA_LIMITED


def test_classify_stability_data_limited_when_no_weight_sensitivity_result() -> None:
    assert classify_stability(None, data_confidence_score=0.8) == STABILITY_DATA_LIMITED
