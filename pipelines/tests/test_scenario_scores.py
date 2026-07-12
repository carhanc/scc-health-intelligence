"""Hand-calculated tests for scoring/scenario_scores.py and
scoring/scenarios.py (config loader + validation)."""

from __future__ import annotations

from pathlib import Path

import pytest
from scc_health_pipeline.scoring.domain_scores import DomainScoreResult
from scc_health_pipeline.scoring.scenario_scores import compute_scenario_score
from scc_health_pipeline.scoring.scenarios import (
    ScenarioConfigError,
    ScenarioDefinition,
    load_scenarios,
    load_sensitivity_presets,
    validate_scenarios_against_metric_registry,
)

REPO_ROOT = Path(__file__).resolve().parents[2]


def _domain_result(domain: str, tract: str, score: float | None) -> DomainScoreResult:
    return DomainScoreResult(
        domain=domain,
        tract_geoid_2020=tract,
        score=score,
        coverage_fraction=1.0 if score is not None else 0.0,
        n_subdomains_present=1 if score is not None else 0,
        n_subdomains_total=1,
    )


def test_scenario_score_renormalizes_when_a_domain_is_missing() -> None:
    scenario = ScenarioDefinition(
        scenario_id="test_scenario",
        label="Test",
        description="",
        weights={"A": 0.5, "B": 0.3, "C": 0.2},
    )
    domain_results = {
        "A": _domain_result("A", "t1", 80.0),
        "B": _domain_result("B", "t1", 40.0),
        # C missing entirely
    }
    result = compute_scenario_score(scenario, domain_results, "t1")
    # present_weight_sum = 0.8; normalized A=0.625, B=0.375
    # score = 0.625*80 + 0.375*40 = 50 + 15 = 65
    assert result.score == pytest.approx(65.0)
    assert result.coverage_fraction == pytest.approx(0.8)
    assert result.domains_missing == ["C"]
    contributions = {c.domain: c for c in result.domain_contributions}
    assert contributions["A"].normalized_weight == pytest.approx(0.625)
    assert contributions["A"].contribution == pytest.approx(50.0)
    assert contributions["B"].contribution == pytest.approx(15.0)


def test_scenario_score_none_when_all_domains_missing() -> None:
    scenario = ScenarioDefinition(
        scenario_id="test_scenario", label="Test", description="", weights={"A": 1.0}
    )
    result = compute_scenario_score(scenario, {}, "t1")
    assert result.score is None
    assert result.coverage_fraction == 0.0


def test_scenario_score_full_coverage_matches_simple_weighted_average() -> None:
    scenario = ScenarioDefinition(
        scenario_id="test_scenario",
        label="Test",
        description="",
        weights={"A": 0.6, "B": 0.4},
    )
    domain_results = {
        "A": _domain_result("A", "t1", 100.0),
        "B": _domain_result("B", "t1", 0.0),
    }
    result = compute_scenario_score(scenario, domain_results, "t1")
    assert result.score == pytest.approx(60.0)
    assert result.coverage_fraction == pytest.approx(1.0)
    assert result.domains_missing == []


def test_load_real_scenarios_config_parses_and_weights_sum_to_one() -> None:
    scenarios = load_scenarios(REPO_ROOT / "config" / "scenarios.yml")
    assert len(scenarios) >= 5
    for s in scenarios:
        assert abs(sum(s.weights.values()) - 1.0) < 1e-6


def test_load_real_sensitivity_presets_parses_and_weights_sum_to_one() -> None:
    presets = load_sensitivity_presets(REPO_ROOT / "config" / "scenarios.yml")
    preset_ids = {p.preset_id for p in presets}
    assert preset_ids == {
        "balanced",
        "need_first",
        "access_first",
        "resource_first",
        "systemic_pressure_first",
    }
    for p in presets:
        assert abs(sum(p.weights.values()) - 1.0) < 1e-6


def test_scenario_config_rejects_weights_not_summing_to_one(tmp_path: Path) -> None:
    bad_yaml = tmp_path / "bad_scenarios.yml"
    bad_yaml.write_text(
        "scenarios:\n"
        "  - scenario_id: bad\n"
        "    label: Bad\n"
        "    weights:\n"
        "      health_burden: 0.5\n"
        "      access_barriers: 0.3\n"
    )
    with pytest.raises(ScenarioConfigError, match="must sum to 1.0"):
        load_scenarios(bad_yaml)


def test_validate_scenarios_against_registry_flags_unknown_metric() -> None:
    scenario = ScenarioDefinition(
        scenario_id="s1",
        label="S1",
        description="",
        weights={"health_burden": 1.0},
        required_metrics=["nonexistent_metric_id"],
    )
    problems = validate_scenarios_against_metric_registry(
        [scenario], known_metric_ids={"places_diabetes_prevalence"}, known_domains={"health_burden"}
    )
    assert len(problems) == 1
    assert "nonexistent_metric_id" in problems[0]


def test_validate_scenarios_against_registry_flags_unknown_domain() -> None:
    scenario = ScenarioDefinition(
        scenario_id="s1", label="S1", description="", weights={"made_up_domain": 1.0}
    )
    problems = validate_scenarios_against_metric_registry(
        [scenario], known_metric_ids=set(), known_domains={"health_burden"}
    )
    assert len(problems) == 1
    assert "made_up_domain" in problems[0]


def test_real_scenarios_config_is_clean_against_real_metric_registry() -> None:
    from scc_health_pipeline.metrics.registry import load_metric_registry

    metric_defs = load_metric_registry(REPO_ROOT / "config" / "metrics.yml")
    known_metric_ids = {d.metric_id for d in metric_defs}
    known_domains = {d.domain for d in metric_defs}
    scenarios = load_scenarios(REPO_ROOT / "config" / "scenarios.yml")
    problems = validate_scenarios_against_metric_registry(
        scenarios, known_metric_ids, known_domains
    )
    assert problems == []
