"""Tests for uncertainty/monte_carlo.py: reproducibility under a fixed
seed (the core requirement, docs/03 §8.3 + TASKS.md Gate 4), bounds
respected, and sane interval ordering. Not hand-calculated to the last
decimal (a 500-draw simulation isn't hand-verifiable) but every
structural property is checked exactly."""

from __future__ import annotations

import polars as pl
import pytest
from scc_health_pipeline.metrics.registry import MetricDefinition
from scc_health_pipeline.scoring.scenarios import ScenarioDefinition
from scc_health_pipeline.uncertainty.monte_carlo import MonteCarloConfig, run_monte_carlo

TRACTS = [f"t{i}" for i in range(1, 6)]


def _metric(metric_id: str) -> MetricDefinition:
    return MetricDefinition(
        metric_id=metric_id,
        label=metric_id,
        domain="health_burden",
        subdomain="cardiometabolic",
        source_id="x",
        source_table="x.x",
        unit="%",
        direction="concern_high",
        transform="none",
        uncertainty_type="places_ci",
        minimum_coverage=0.9,
        allowed_geographies=["tract"],
        plain_language_definition="x",
        interpretation="x",
        limitations="x",
        citation="x",
        source_field="raw_value",
    )


def _raw_data() -> dict[str, pl.DataFrame]:
    return {
        "metric_a": pl.DataFrame(
            {
                "tract_geoid_2020": TRACTS,
                "raw_value": [10.0, 20.0, 30.0, 40.0, 50.0],
                "low_confidence_limit": [8.0, 17.0, 26.0, 35.0, 44.0],
                "high_confidence_limit": [12.0, 23.0, 34.0, 45.0, 56.0],
            }
        )
    }


def _scenario() -> ScenarioDefinition:
    return ScenarioDefinition(
        scenario_id="test_scenario",
        label="Test",
        description="",
        weights={"health_burden": 1.0},
    )


def test_monte_carlo_reproducible_under_fixed_seed() -> None:
    definitions = [_metric("metric_a")]
    config = MonteCarloConfig(n_draws=100, seed=7)

    run1 = run_monte_carlo(_scenario(), definitions, _raw_data(), TRACTS, config)
    run2 = run_monte_carlo(_scenario(), definitions, _raw_data(), TRACTS, config)

    by_tract_1 = {r.tract_geoid_2020: r for r in run1}
    by_tract_2 = {r.tract_geoid_2020: r for r in run2}
    for t in TRACTS:
        assert by_tract_1[t].median_score == by_tract_2[t].median_score
        assert by_tract_1[t].ci_lower == by_tract_2[t].ci_lower
        assert by_tract_1[t].ci_upper == by_tract_2[t].ci_upper
        assert by_tract_1[t].median_rank == by_tract_2[t].median_rank
        assert by_tract_1[t].probability_top_decile == by_tract_2[t].probability_top_decile


def _closely_spaced_raw_data() -> dict[str, pl.DataFrame]:
    # Values only 2 points apart with an SE ~1.0 (from a 4-point-wide CI)
    # -- close enough that draw-to-draw rank reordering is plausible,
    # unlike _raw_data()'s widely-spaced (10-point-gap) fixture where a
    # >5-sigma shift would be needed to ever flip rank order.
    return {
        "metric_a": pl.DataFrame(
            {
                "tract_geoid_2020": TRACTS,
                "raw_value": [20.0, 22.0, 24.0, 26.0, 28.0],
                "low_confidence_limit": [18.0, 20.0, 22.0, 24.0, 26.0],
                "high_confidence_limit": [22.0, 24.0, 26.0, 28.0, 30.0],
            }
        )
    }


def test_monte_carlo_different_seed_can_differ() -> None:
    definitions = [_metric("metric_a")]
    run_a = run_monte_carlo(
        _scenario(),
        definitions,
        _closely_spaced_raw_data(),
        TRACTS,
        MonteCarloConfig(n_draws=200, seed=1),
    )
    run_b = run_monte_carlo(
        _scenario(),
        definitions,
        _closely_spaced_raw_data(),
        TRACTS,
        MonteCarloConfig(n_draws=200, seed=2),
    )
    # With closely-spaced values, rank reordering across draws is
    # plausible, so at least one tract's confidence interval should
    # differ across seeds.
    ci_a = [(r.ci_lower, r.ci_upper) for r in run_a]
    ci_b = [(r.ci_lower, r.ci_upper) for r in run_b]
    assert ci_a != ci_b


def test_monte_carlo_widely_spaced_values_never_reorder_rank() -> None:
    # A documented, expected property of percentile-based scoring: when
    # perturbation noise (SE) is far smaller than the gaps between
    # values, rank order never flips across draws, so the CI collapses
    # to the point estimate exactly -- this is not a bug, it is what
    # "the uncertainty doesn't change the conclusion" looks like.
    definitions = [_metric("metric_a")]
    results = run_monte_carlo(
        _scenario(), definitions, _raw_data(), TRACTS, MonteCarloConfig(n_draws=200, seed=1)
    )
    for r in results:
        assert r.ci_lower == r.ci_upper == r.median_score


def test_monte_carlo_interval_ordering_and_bounds() -> None:
    definitions = [_metric("metric_a")]
    results = run_monte_carlo(
        _scenario(), definitions, _raw_data(), TRACTS, MonteCarloConfig(n_draws=300, seed=42)
    )
    for r in results:
        assert r.ci_lower is not None and r.ci_upper is not None and r.median_score is not None
        assert r.ci_lower <= r.median_score <= r.ci_upper
        assert 0.0 <= r.ci_lower <= 100.0
        assert 0.0 <= r.ci_upper <= 100.0
        assert r.median_rank is not None and 1 <= r.median_rank <= len(TRACTS)
        assert 0.0 <= r.probability_top_decile <= 1.0  # type: ignore[operator]
        assert 0.0 <= r.probability_top_quartile <= 1.0  # type: ignore[operator]


def test_monte_carlo_highest_value_tract_has_highest_median_rank_probability() -> None:
    # t5 has raw_value=50 (highest concern) -- across many draws it should
    # be ranked #1 (i.e. median_rank == 1) far more often than t1 (raw=10).
    definitions = [_metric("metric_a")]
    results = run_monte_carlo(
        _scenario(), definitions, _raw_data(), TRACTS, MonteCarloConfig(n_draws=300, seed=42)
    )
    by_tract = {r.tract_geoid_2020: r for r in results}
    assert by_tract["t5"].median_rank == 1
    assert by_tract["t1"].median_rank == 5


def test_monte_carlo_no_uncertainty_metric_is_not_perturbed() -> None:
    # uncertainty_type="none" metrics must never be given a fabricated
    # standard error -- their raw value should pass through every draw
    # unperturbed, so the CI collapses to the point estimate exactly.
    no_uncertainty_metric = MetricDefinition(
        metric_id="metric_b",
        label="metric_b",
        domain="health_burden",
        subdomain="cardiometabolic",
        source_id="x",
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
        source_field="raw_value",
    )
    raw_data = {
        "metric_b": pl.DataFrame(
            {"tract_geoid_2020": TRACTS, "raw_value": [10.0, 20.0, 30.0, 40.0, 50.0]}
        )
    }
    results = run_monte_carlo(
        _scenario(), [no_uncertainty_metric], raw_data, TRACTS, MonteCarloConfig(n_draws=50, seed=1)
    )
    by_tract = {r.tract_geoid_2020: r for r in results}
    for t, expected_pct in zip(TRACTS, [0.0, 25.0, 50.0, 75.0, 100.0], strict=True):
        assert by_tract[t].ci_lower == pytest.approx(expected_pct)
        assert by_tract[t].ci_upper == pytest.approx(expected_pct)
        assert by_tract[t].median_score == pytest.approx(expected_pct)
