"""Unit tests for the API's lightweight local custom-scenario-scoring
aggregator (`services/custom_scenario_scoring.py`) -- the same
hand-calculated examples as the pipeline's
`scoring/scenario_scores.py` test suite
(pipelines/tests/test_scenario_scores.py), since the two are intentional
duplicates (DEC-022/DEC-051 pattern) that must stay behaviorally
identical."""

from __future__ import annotations

import pytest
from scc_health_api.services.custom_scenario_scoring import (
    InvalidWeightsError,
    compute_custom_score,
    validate_custom_weights,
)


def test_renormalizes_when_a_domain_is_missing() -> None:
    weights = {"A": 0.5, "B": 0.3, "C": 0.2}
    domain_scores = {"A": 80.0, "B": 40.0}  # C missing entirely
    result = compute_custom_score(weights, domain_scores, "t1")
    # present_weight_sum = 0.8; normalized A=0.625, B=0.375
    # score = 0.625*80 + 0.375*40 = 50 + 15 = 65
    assert result.score == pytest.approx(65.0)
    assert result.coverage_fraction == pytest.approx(0.8)
    assert result.domains_missing == ["C"]
    contributions = {c.domain: c for c in result.domain_contributions}
    assert contributions["A"].normalized_weight == pytest.approx(0.625)
    assert contributions["A"].contribution == pytest.approx(50.0)
    assert contributions["B"].contribution == pytest.approx(15.0)


def test_none_when_all_domains_missing() -> None:
    result = compute_custom_score({"A": 1.0}, {}, "t1")
    assert result.score is None
    assert result.coverage_fraction == 0.0


def test_full_coverage_matches_simple_weighted_average() -> None:
    weights = {"A": 0.6, "B": 0.4}
    domain_scores = {"A": 100.0, "B": 0.0}
    result = compute_custom_score(weights, domain_scores, "t1")
    assert result.score == pytest.approx(60.0)
    assert result.coverage_fraction == pytest.approx(1.0)
    assert result.domains_missing == []


def test_validate_rejects_unknown_domain() -> None:
    with pytest.raises(InvalidWeightsError, match="Unknown domain"):
        validate_custom_weights({"made_up_domain": 1.0})


def test_validate_rejects_negative_weight() -> None:
    with pytest.raises(InvalidWeightsError, match="non-negative"):
        validate_custom_weights({"health_burden": -0.1, "access_barriers": 1.1})


def test_validate_rejects_weights_not_summing_to_one() -> None:
    with pytest.raises(InvalidWeightsError, match="sum to 1.0"):
        validate_custom_weights({"health_burden": 0.5, "access_barriers": 0.3})


def test_validate_rejects_empty_weights() -> None:
    with pytest.raises(InvalidWeightsError):
        validate_custom_weights({})


def test_validate_accepts_a_real_full_weight_vector() -> None:
    validate_custom_weights(
        {
            "health_burden": 0.2,
            "access_barriers": 0.2,
            "environmental_burden": 0.2,
            "resource_accessibility": 0.2,
            "workforce_shortage": 0.2,
        }
    )
