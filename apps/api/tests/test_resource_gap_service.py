"""Unit tests for the API's lightweight local resource-gap classifier
(`services/resource_gap.py`) -- the same hand-calculated examples as the
pipeline's `analytics/resource_gap.py` test suite, since the two are
intentional duplicates (DEC-022) that must stay behaviorally identical."""

from __future__ import annotations

from scc_health_api.services.resource_gap import classify_gap, compute_resource_gaps


def test_high_need_low_access_is_priority_gap() -> None:
    assert classify_gap(need_percentile=90.0, access_percentile=10.0) == "priority_gap"


def test_low_need_high_access_is_well_served() -> None:
    assert classify_gap(need_percentile=10.0, access_percentile=90.0) == "well_served"


def test_compute_resource_gaps_excludes_geography_missing_from_either_input() -> None:
    need = {"g1": 10.0, "g2": 20.0}
    access = {"g1": 5.0}
    results = compute_resource_gaps(need, access)
    assert len(results) == 1
    assert results[0].geography_id == "g1"


def test_compute_resource_gaps_empty_input_returns_empty_list_not_crash() -> None:
    assert compute_resource_gaps({}, {}) == []
