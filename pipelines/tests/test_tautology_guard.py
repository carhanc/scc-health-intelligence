"""Tests for validation/tautology_guard.py -- positive (tautology
correctly flagged) and negative (independent outcome correctly cleared)
cases, matching docs/03 §15.1's worked examples exactly."""

from __future__ import annotations

from scc_health_pipeline.metrics.registry import MetricDefinition
from scc_health_pipeline.scoring.scenarios import ScenarioDefinition
from scc_health_pipeline.validation.tautology_guard import check_validation_tautology


def _metric(metric_id: str, domain: str, source_table: str, source_field: str) -> MetricDefinition:
    return MetricDefinition(
        metric_id=metric_id,
        label=metric_id,
        domain=domain,
        subdomain="x",
        source_id="x",
        source_table=source_table,
        source_field=source_field,
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


def test_flags_direct_metric_id_reuse_as_tautological() -> None:
    # docs §15.1's canonical example: diabetes-priority score correlated
    # with diabetes prevalence when diabetes prevalence is an input.
    diabetes_metric = _metric(
        "places_diabetes_prevalence", "health_burden", "health.places_observations", "data_value"
    )
    scenario = ScenarioDefinition(
        "diabetes_prevention_v1", "Diabetes prevention", "", weights={"health_burden": 1.0}
    )
    result = check_validation_tautology(
        scenario, [diabetes_metric], outcome_metric_id="places_diabetes_prevalence"
    )
    assert result.is_tautological is True


def test_flags_required_metric_reuse_as_tautological() -> None:
    uninsured_metric = _metric(
        "places_uninsured", "access_barriers", "health.places_observations", "data_value"
    )
    scenario = ScenarioDefinition(
        "coverage_navigation_v1",
        "Coverage navigation",
        "",
        weights={"health_burden": 1.0},  # note: uninsured not in weighted domains...
        required_metrics=["places_uninsured"],  # ...but IS a required_metric
    )
    result = check_validation_tautology(
        scenario, [uninsured_metric], outcome_metric_id="places_uninsured"
    )
    assert result.is_tautological is True
    assert "required_metrics" in result.reason


def test_flags_same_underlying_column_as_near_tautology() -> None:
    # Outcome uses a *different* metric_id but the exact same raw
    # (source_table, source_field) as a contributing metric.
    diabetes_metric = _metric(
        "places_diabetes_prevalence", "health_burden", "health.places_observations", "data_value"
    )
    scenario = ScenarioDefinition(
        "diabetes_prevention_v1", "Diabetes prevention", "", weights={"health_burden": 1.0}
    )
    result = check_validation_tautology(
        scenario,
        [diabetes_metric],
        outcome_source_table="health.places_observations",
        outcome_source_field="data_value",
    )
    assert result.is_tautological is True
    assert "near-tautology" in result.reason


def test_clears_genuinely_independent_outcome() -> None:
    # docs §15.2's valid example: HCAI ED utilization as an independent
    # outcome for a diabetes-prevention score.
    diabetes_metric = _metric(
        "places_diabetes_prevalence", "health_burden", "health.places_observations", "data_value"
    )
    scenario = ScenarioDefinition(
        "diabetes_prevention_v1", "Diabetes prevention", "", weights={"health_burden": 1.0}
    )
    result = check_validation_tautology(
        scenario,
        [diabetes_metric],
        outcome_source_table="utilization.hcai_ed_patient_county",
        outcome_source_field="encounters",
    )
    assert result.is_tautological is False


def test_clears_metric_id_from_unrelated_domain() -> None:
    diabetes_metric = _metric(
        "places_diabetes_prevalence", "health_burden", "health.places_observations", "data_value"
    )
    workforce_metric = _metric(
        "mua_designated_flag",
        "workforce_shortage",
        "analytics.workforce_shortage_inputs",
        "mua_designated",
    )
    scenario = ScenarioDefinition(
        "diabetes_prevention_v1", "Diabetes prevention", "", weights={"health_burden": 1.0}
    )
    result = check_validation_tautology(
        scenario, [diabetes_metric, workforce_metric], outcome_metric_id="mua_designated_flag"
    )
    assert result.is_tautological is False
