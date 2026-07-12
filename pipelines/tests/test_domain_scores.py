"""Hand-calculated fixture tests for scoring/domain_scores.py.

Fixture: 1 domain (health_burden), 2 subdomains -- cardiometabolic (2
metrics, full coverage) and mental_health (1 metric, 2/3 tract coverage,
included since its minimum_coverage is 0.5). 3 tracts. Every intermediate
number below is hand-derived; see the module docstring's worked example.
"""

from __future__ import annotations

import polars as pl
import pytest
from scc_health_pipeline.metrics.registry import MetricDefinition
from scc_health_pipeline.scoring.domain_scores import (
    SubdomainScoreResult,
    compute_domain_scores,
    compute_metric_scores,
    compute_subdomain_scores,
)

TRACTS = ["t1", "t2", "t3"]


def _metric(metric_id: str, subdomain: str, min_coverage: float = 0.9) -> MetricDefinition:
    return MetricDefinition(
        metric_id=metric_id,
        label=metric_id,
        domain="health_burden",
        subdomain=subdomain,
        source_id="x",
        source_table="x.x",
        unit="%",
        direction="concern_high",
        transform="none",
        uncertainty_type="none",
        minimum_coverage=min_coverage,
        allowed_geographies=["tract"],
        plain_language_definition="x",
        interpretation="x",
        limitations="x",
        citation="x",
        source_field="raw_value",
    )


def test_metric_scores_percentile_hand_calculated() -> None:
    metric_a = _metric("metric_a", "cardiometabolic")
    df_a = pl.DataFrame({"tract_geoid_2020": TRACTS, "raw_value": [10.0, 20.0, 30.0]})
    results_a, coverage_a = compute_metric_scores(df_a, metric_a)
    assert coverage_a.included
    assert coverage_a.coverage_fraction == 1.0
    by_tract = {r.tract_geoid_2020: r.percentile for r in results_a}
    assert by_tract == {"t1": 0.0, "t2": 50.0, "t3": 100.0}


def test_metric_scores_excluded_when_below_minimum_coverage() -> None:
    # Only 1/3 tracts present, minimum_coverage 0.9 -> excluded entirely.
    metric_c = _metric("metric_c", "mental_health", min_coverage=0.9)
    df_c = pl.DataFrame({"tract_geoid_2020": TRACTS, "raw_value": [5.0, None, None]})
    results_c, coverage_c = compute_metric_scores(df_c, metric_c)
    assert not coverage_c.included
    assert coverage_c.reason_excluded is not None
    assert all(r.percentile is None for r in results_c)


def test_full_pipeline_hand_calculated_domain_scores() -> None:
    metric_a = _metric("metric_a", "cardiometabolic")
    metric_b = _metric("metric_b", "cardiometabolic")
    metric_c = _metric("metric_c", "mental_health", min_coverage=0.5)

    df_a = pl.DataFrame({"tract_geoid_2020": TRACTS, "raw_value": [10.0, 20.0, 30.0]})
    df_b = pl.DataFrame({"tract_geoid_2020": TRACTS, "raw_value": [30.0, 20.0, 10.0]})
    df_c = pl.DataFrame({"tract_geoid_2020": TRACTS, "raw_value": [5.0, None, 15.0]})

    all_metric_scores = []
    for df, definition in [(df_a, metric_a), (df_b, metric_b), (df_c, metric_c)]:
        results, coverage = compute_metric_scores(df, definition)
        assert coverage.included
        all_metric_scores.extend(results)

    subdomain_scores = compute_subdomain_scores(all_metric_scores)
    by_key = {(s.subdomain, s.tract_geoid_2020): s.score for s in subdomain_scores}
    # cardiometabolic: avg(metric_a_pct, metric_b_pct) per tract = 50 for all 3
    assert by_key[("cardiometabolic", "t1")] == pytest.approx(50.0)
    assert by_key[("cardiometabolic", "t2")] == pytest.approx(50.0)
    assert by_key[("cardiometabolic", "t3")] == pytest.approx(50.0)
    # mental_health: only metric_c, percentiles among [5, 15] -> t1=0, t3=100, t2 missing
    assert by_key[("mental_health", "t1")] == pytest.approx(0.0)
    assert by_key[("mental_health", "t2")] is None
    assert by_key[("mental_health", "t3")] == pytest.approx(100.0)

    domain_scores = compute_domain_scores(subdomain_scores, coverage_threshold=0.5)
    by_tract = {d.tract_geoid_2020: d for d in domain_scores}
    # t1: both subdomains present -> (50 + 0) / 2 = 25
    assert by_tract["t1"].score == pytest.approx(25.0)
    assert by_tract["t1"].below_coverage_threshold is False
    # t2: cardiometabolic present (50), mental_health missing -> coverage
    # 1/2 = 0.5, not below the 0.5 threshold -> score = average of present
    # subdomains only = 50
    assert by_tract["t2"].score == pytest.approx(50.0)
    assert by_tract["t2"].coverage_fraction == pytest.approx(0.5)
    assert by_tract["t2"].subdomains_missing == ["mental_health"]
    # t3: both present -> (50 + 100) / 2 = 75
    assert by_tract["t3"].score == pytest.approx(75.0)


def test_domain_score_none_below_coverage_threshold() -> None:
    # Single subdomain missing entirely for a tract with a 0.7 threshold
    # and only 1 subdomain total -> coverage 0/1 = 0.0, below threshold.
    subdomain_scores = [
        SubdomainScoreResult(
            domain="health_burden",
            subdomain="cardiometabolic",
            tract_geoid_2020="t1",
            score=None,
            metric_ids_present=[],
            metric_ids_missing=["metric_a"],
        )
    ]
    result = compute_domain_scores(subdomain_scores, coverage_threshold=0.7)
    assert result[0].score is None
    assert result[0].below_coverage_threshold is True
