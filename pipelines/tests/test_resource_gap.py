"""Unit tests for resource-gap classification (Phase 6) -- pure logic,
hand-calculated small examples, no live data dependency."""

from __future__ import annotations

import pytest
from scc_health_pipeline.analytics.resource_gap import (
    assess_gap_stability,
    classify_gap,
    compute_resource_gaps,
)


def test_high_need_low_access_is_priority_gap() -> None:
    assert classify_gap(need_percentile=90.0, access_percentile=10.0) == "priority_gap"


def test_high_need_high_access_is_need_met() -> None:
    assert classify_gap(need_percentile=90.0, access_percentile=90.0) == "need_met"


def test_low_need_low_access_is_low_priority() -> None:
    assert classify_gap(need_percentile=10.0, access_percentile=10.0) == "low_priority"


def test_low_need_high_access_is_well_served() -> None:
    assert classify_gap(need_percentile=10.0, access_percentile=90.0) == "well_served"


def test_middle_tercile_falls_back_to_median_split() -> None:
    # Neither axis clears a tercile threshold -- falls back to the
    # median-split rule, still producing one of the four labels.
    assert classify_gap(need_percentile=55.0, access_percentile=45.0) == "priority_gap"
    assert classify_gap(need_percentile=45.0, access_percentile=55.0) == "well_served"


def test_compute_resource_gaps_hand_calculated_percentiles() -> None:
    # 3 geographies, need values 10/20/30 -- percentile-rank (percent at
    # or below) is 33.3/66.7/100 respectively.
    need = {"g1": 10.0, "g2": 20.0, "g3": 30.0}
    access = {"g1": 30.0, "g2": 20.0, "g3": 10.0}  # inversely ranked
    results = compute_resource_gaps(need, access)
    by_geo = {r.geography_id: r for r in results}
    assert by_geo["g1"].need_percentile == pytest.approx(100.0 / 3)
    assert by_geo["g3"].need_percentile == 100.0
    assert by_geo["g3"].access_percentile == pytest.approx(100.0 / 3)
    # g3: highest need, lowest access -> priority gap.
    assert by_geo["g3"].classification == "priority_gap"
    # g1: lowest need, highest access -> well served.
    assert by_geo["g1"].classification == "well_served"


def test_compute_resource_gaps_excludes_geography_missing_from_either_input() -> None:
    need = {"g1": 10.0, "g2": 20.0}
    access = {"g1": 5.0}  # g2 has no access value
    results = compute_resource_gaps(need, access)
    assert len(results) == 1
    assert results[0].geography_id == "g1"


def test_compute_resource_gaps_empty_input_returns_empty_list_not_crash() -> None:
    assert compute_resource_gaps({}, {}) == []


def test_assess_gap_stability_agrees_across_variants_is_stable() -> None:
    variants = {
        "walk": {"g1": "priority_gap", "g2": "well_served"},
        "drive": {"g1": "priority_gap", "g2": "well_served"},
    }
    stability = assess_gap_stability(variants)
    assert stability["g1"] == "stable"
    assert stability["g2"] == "stable"


def test_assess_gap_stability_disagreement_is_assumption_sensitive() -> None:
    variants = {
        "walk": {"g1": "priority_gap"},
        "drive": {"g1": "need_met"},
    }
    stability = assess_gap_stability(variants)
    assert stability["g1"] == "assumption_sensitive"


def test_assess_gap_stability_excludes_geography_present_in_only_one_variant() -> None:
    variants = {
        "walk": {"g1": "priority_gap", "g_walk_only": "well_served"},
        "drive": {"g1": "priority_gap"},
    }
    stability = assess_gap_stability(variants)
    assert "g_walk_only" not in stability
    assert stability["g1"] == "stable"
