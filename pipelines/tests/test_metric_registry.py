"""Tests for metrics/registry.py: YAML loading/validation, and metric
evaluation against a small synthetic in-memory DuckDB warehouse (hand-
calculated expected values, not the live warehouse)."""

from __future__ import annotations

from pathlib import Path

import duckdb
import pytest
import yaml
from scc_health_pipeline.metrics.registry import (
    MetricDefinition,
    MetricRegistryError,
    evaluate_metric,
    load_metric_registry,
    validate_registry_against_warehouse,
)

FIXTURES_DIR = Path(__file__).resolve().parents[1] / "fixtures"


def test_load_real_registry_parses_without_error() -> None:
    defs = load_metric_registry(Path(__file__).resolve().parents[2] / "config" / "metrics.yml")
    assert len(defs) > 0
    ids = [d.metric_id for d in defs]
    assert len(ids) == len(set(ids)), "duplicate metric_id in real registry"


def test_load_registry_rejects_missing_required_field(tmp_path: Path) -> None:
    bad_yaml = tmp_path / "bad.yml"
    bad_yaml.write_text("metrics:\n  - metric_id: foo\n    label: Foo\n    domain: health_burden\n")
    with pytest.raises(MetricRegistryError, match="missing required field"):
        load_metric_registry(bad_yaml)


def test_load_registry_rejects_duplicate_metric_id(tmp_path: Path) -> None:
    entry = {
        "metric_id": "dup",
        "label": "Dup",
        "domain": "health_burden",
        "subdomain": "cardiometabolic",
        "source_id": "x",
        "source_table": "health.places_observations",
        "source_field": "data_value",
        "unit": "%",
        "direction": "concern_high",
        "transform": "none",
        "uncertainty_type": "none",
        "minimum_coverage": 0.9,
        "allowed_geographies": ["tract"],
        "plain_language_definition": "x",
        "interpretation": "x",
        "limitations": "x",
        "citation": "x",
    }
    dup_yaml = tmp_path / "dup.yml"
    dup_yaml.write_text(yaml.safe_dump({"metrics": [entry, dict(entry)]}))
    with pytest.raises(MetricRegistryError, match="duplicate metric_id"):
        load_metric_registry(dup_yaml)


@pytest.fixture
def conn() -> duckdb.DuckDBPyConnection:
    c = duckdb.connect(":memory:")
    c.execute(
        """
        CREATE SCHEMA health;
        CREATE TABLE health.places_observations (
            tract_geoid_2020 VARCHAR, measure_id VARCHAR, data_value DOUBLE,
            low_confidence_limit DOUBLE, high_confidence_limit DOUBLE
        );
        INSERT INTO health.places_observations VALUES
            ('06085500100', 'DIABETES', 8.4, 7.3, 9.6),
            ('06085500200', 'DIABETES', 12.0, 10.0, 14.0);

        CREATE SCHEMA social;
        CREATE TABLE social.acs_observations (
            tract_geoid_2020 VARCHAR, variable_id VARCHAR, estimate DOUBLE, moe_90 DOUBLE
        );
        INSERT INTO social.acs_observations VALUES
            ('06085500100', 'B17001_E001', 1000.0, 50.0),
            ('06085500100', 'B17001_E002', 100.0, 20.0),
            ('06085500200', 'B17001_E001', 2000.0, 80.0),
            ('06085500200', 'B17001_E002', 400.0, 60.0);
        """
    )
    return c


def _direct_metric() -> MetricDefinition:
    return MetricDefinition(
        metric_id="test_diabetes",
        label="Diabetes",
        domain="health_burden",
        subdomain="cardiometabolic",
        source_id="x",
        source_table="health.places_observations",
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
        source_field="data_value",
        source_filter={"measure_id": "DIABETES"},
    )


def _acs_ratio_metric() -> MetricDefinition:
    return MetricDefinition(
        metric_id="test_poverty",
        label="Poverty",
        domain="access_barriers",
        subdomain="affordability_coverage",
        source_id="x",
        source_table="social.acs_observations",
        unit="%",
        direction="concern_high",
        transform="acs_ratio",
        uncertainty_type="acs_moe",
        minimum_coverage=0.9,
        allowed_geographies=["tract"],
        plain_language_definition="x",
        interpretation="x",
        limitations="x",
        citation="x",
        numerator_variable="B17001_E002",
        denominator_variable="B17001_E001",
    )


def test_evaluate_direct_metric_hand_calculated(conn: duckdb.DuckDBPyConnection) -> None:
    result = evaluate_metric(conn, _direct_metric()).sort("tract_geoid_2020")
    assert result["raw_value"].to_list() == [8.4, 12.0]
    assert result["low_confidence_limit"].to_list() == [7.3, 10.0]


def test_evaluate_acs_ratio_hand_calculated(conn: duckdb.DuckDBPyConnection) -> None:
    result = evaluate_metric(conn, _acs_ratio_metric()).sort("tract_geoid_2020")
    # tract 1: 100/1000 * 100 = 10.0%; tract 2: 400/2000 * 100 = 20.0%
    assert result["raw_value"].to_list() == pytest.approx([10.0, 20.0])


def test_validate_registry_flags_missing_table(conn: duckdb.DuckDBPyConnection) -> None:
    bad = MetricDefinition(
        metric_id="missing_table_metric",
        label="x",
        domain="health_burden",
        subdomain="cardiometabolic",
        source_id="x",
        source_table="nonexistent.table",
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
        source_field="data_value",
    )
    problems = validate_registry_against_warehouse(conn, [bad])
    assert len(problems) == 1
    assert "nonexistent.table" in problems[0]


def test_validate_registry_flags_missing_column(conn: duckdb.DuckDBPyConnection) -> None:
    bad = MetricDefinition(
        metric_id="missing_column_metric",
        label="x",
        domain="health_burden",
        subdomain="cardiometabolic",
        source_id="x",
        source_table="health.places_observations",
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
        source_field="this_column_does_not_exist",
    )
    problems = validate_registry_against_warehouse(conn, [bad])
    assert len(problems) == 1
    assert "this_column_does_not_exist" in problems[0]


def test_validate_registry_clean_on_real_definition(conn: duckdb.DuckDBPyConnection) -> None:
    problems = validate_registry_against_warehouse(conn, [_direct_metric()])
    assert problems == []
