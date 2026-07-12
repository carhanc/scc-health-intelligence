"""Tests for validation/correlation_diagnostics.py."""

from __future__ import annotations

import pytest
from scc_health_pipeline.metrics.registry import MetricDefinition
from scc_health_pipeline.scoring.scenarios import ScenarioDefinition
from scc_health_pipeline.validation.correlation_diagnostics import run_correlation_diagnostic


def _diabetes_metric() -> MetricDefinition:
    return MetricDefinition(
        metric_id="places_diabetes_prevalence",
        label="Diabetes",
        domain="health_burden",
        subdomain="cardiometabolic",
        source_id="cdc_places_tract_2025",
        source_table="health.places_observations",
        source_field="data_value",
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
    )


def _scenario() -> ScenarioDefinition:
    return ScenarioDefinition(
        "diabetes_prevention_v1", "Diabetes prevention", "", weights={"health_burden": 1.0}
    )


def test_perfectly_monotonic_data_gives_spearman_r_of_one() -> None:
    tract_scores = {f"t{i}": float(i) for i in range(10)}
    outcome_values = {f"t{i}": float(i) * 2 + 5 for i in range(10)}  # strictly monotonic transform
    result = run_correlation_diagnostic(
        _scenario(),
        [_diabetes_metric()],
        hypothesis="Higher scenario score is associated with higher outcome value.",
        tract_scores=tract_scores,
        outcome_values=outcome_values,
        outcome_label="Test outcome",
        outcome_source_table="context.svi",
        outcome_source_field="RPL_THEMES",
    )
    assert result.is_tautological is False
    assert result.spearman_r == pytest.approx(1.0)
    assert result.n_paired_observations == 10
    assert result.n_missing == 0


def test_inversely_related_data_gives_negative_spearman_r() -> None:
    tract_scores = {f"t{i}": float(i) for i in range(10)}
    outcome_values = {f"t{i}": float(10 - i) for i in range(10)}
    result = run_correlation_diagnostic(
        _scenario(),
        [_diabetes_metric()],
        hypothesis="x",
        tract_scores=tract_scores,
        outcome_values=outcome_values,
        outcome_label="Test outcome",
        outcome_source_table="context.svi",
        outcome_source_field="RPL_THEMES",
    )
    assert result.spearman_r == pytest.approx(-1.0)


def test_tautological_outcome_is_blocked_before_computing_anything() -> None:
    tract_scores = {"t1": 1.0, "t2": 2.0, "t3": 3.0}
    outcome_values = {"t1": 10.0, "t2": 20.0, "t3": 30.0}
    result = run_correlation_diagnostic(
        _scenario(),
        [_diabetes_metric()],
        hypothesis="x",
        tract_scores=tract_scores,
        outcome_values=outcome_values,
        outcome_label="Diabetes prevalence (same source)",
        outcome_source_table="health.places_observations",
        outcome_source_field="data_value",
    )
    assert result.is_tautological is True
    assert result.spearman_r is None
    assert "BLOCKED" in result.interpretation_note


def test_missing_observations_are_counted_and_excluded() -> None:
    tract_scores = {"t1": 1.0, "t2": 2.0, "t3": 3.0, "t4": 4.0}
    outcome_values = {"t1": 10.0, "t2": 20.0, "t3": 30.0}  # t4 missing from outcome
    result = run_correlation_diagnostic(
        _scenario(),
        [_diabetes_metric()],
        hypothesis="x",
        tract_scores=tract_scores,
        outcome_values=outcome_values,
        outcome_label="Test outcome",
        outcome_source_table="context.svi",
        outcome_source_field="RPL_THEMES",
    )
    assert result.n_paired_observations == 3
    assert result.n_missing == 1


def test_insufficient_data_returns_none_correlation_not_a_crash() -> None:
    tract_scores = {"t1": 1.0}
    outcome_values = {"t1": 10.0}
    result = run_correlation_diagnostic(
        _scenario(),
        [_diabetes_metric()],
        hypothesis="x",
        tract_scores=tract_scores,
        outcome_values=outcome_values,
        outcome_label="Test outcome",
        outcome_source_table="context.svi",
        outcome_source_field="RPL_THEMES",
    )
    assert result.spearman_r is None
    assert "Insufficient" in result.interpretation_note
