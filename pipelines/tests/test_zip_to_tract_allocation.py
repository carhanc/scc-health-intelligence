"""Unit tests for ZIP-to-tract ED-utilization allocation (Phase 7),
against hand-calculated small examples."""

from __future__ import annotations

import pytest
from scc_health_pipeline.utilization.zip_to_tract_allocation import (
    CrosswalkRow,
    ZipObservedEncounters,
    allocate_zip_encounters_to_tracts,
)


def test_single_zip_fully_within_one_tract() -> None:
    zips = [ZipObservedEncounters("95128", "ed_only", 100)]
    crosswalk = [CrosswalkRow("95128", "06085123456", 1.0, "moderate_confidence_crosswalk")]
    results, diag = allocate_zip_encounters_to_tracts(zips, crosswalk)
    assert len(results) == 1
    assert results[0].tract_geoid_2020 == "06085123456"
    assert results[0].modeled_encounters == pytest.approx(100.0)
    assert results[0].n_contributing_zips == 1
    assert diag.total_observed_encounters == 100
    assert diag.total_modeled_encounters == pytest.approx(100.0)
    assert diag.n_unmatched_zips == 0


def test_zip_split_across_two_tracts_by_weight() -> None:
    zips = [ZipObservedEncounters("95128", "ed_only", 100)]
    crosswalk = [
        CrosswalkRow("95128", "06085000100", 0.6, "moderate_confidence_crosswalk"),
        CrosswalkRow("95128", "06085000200", 0.4, "moderate_confidence_crosswalk"),
    ]
    results, diag = allocate_zip_encounters_to_tracts(zips, crosswalk)
    by_tract = {r.tract_geoid_2020: r for r in results}
    assert by_tract["06085000100"].modeled_encounters == pytest.approx(60.0)
    assert by_tract["06085000200"].modeled_encounters == pytest.approx(40.0)
    assert diag.total_modeled_encounters == pytest.approx(100.0)


def test_multiple_zips_accumulate_into_the_same_tract() -> None:
    zips = [
        ZipObservedEncounters("95128", "ed_only", 100),
        ZipObservedEncounters("95126", "ed_only", 50),
    ]
    crosswalk = [
        CrosswalkRow("95128", "06085000100", 1.0, "moderate_confidence_crosswalk"),
        CrosswalkRow("95126", "06085000100", 1.0, "moderate_confidence_crosswalk"),
    ]
    results, _diag = allocate_zip_encounters_to_tracts(zips, crosswalk)
    assert len(results) == 1
    assert results[0].modeled_encounters == pytest.approx(150.0)
    assert results[0].n_contributing_zips == 2


def test_unmatched_zip_is_disclosed_not_silently_dropped_or_defaulted() -> None:
    zips = [ZipObservedEncounters("00000", "ed_only", 42)]
    crosswalk: list[CrosswalkRow] = []  # no crosswalk entry for this ZIP at all
    results, diag = allocate_zip_encounters_to_tracts(zips, crosswalk)
    assert results == []
    assert diag.n_unmatched_zips == 1
    assert diag.unmatched_zip_encounters == 42
    assert "00000" in diag.unmatched_zip_codes
    # The unmatched encounters must not silently vanish from the totals.
    assert diag.total_observed_encounters == 42
    assert diag.total_modeled_encounters == 0.0


def test_pattype_groups_are_never_silently_combined() -> None:
    zips = [
        ZipObservedEncounters("95128", "ed_only", 100),
        ZipObservedEncounters("95128", "inpatient_from_ed", 20),
    ]
    crosswalk = [CrosswalkRow("95128", "06085000100", 1.0, "moderate_confidence_crosswalk")]
    results, _diag = allocate_zip_encounters_to_tracts(zips, crosswalk)
    by_group = {r.pattype_group: r for r in results}
    assert set(by_group) == {"ed_only", "inpatient_from_ed"}
    assert by_group["ed_only"].modeled_encounters == pytest.approx(100.0)
    assert by_group["inpatient_from_ed"].modeled_encounters == pytest.approx(20.0)


def test_tract_quality_reflects_the_worst_contributing_zip_not_an_average() -> None:
    zips = [
        ZipObservedEncounters("95128", "ed_only", 100),
        ZipObservedEncounters("95126", "ed_only", 100),
    ]
    crosswalk = [
        CrosswalkRow("95128", "06085000100", 1.0, "high_confidence_crosswalk"),
        CrosswalkRow("95126", "06085000100", 1.0, "low_confidence_crosswalk"),
    ]
    results, _diag = allocate_zip_encounters_to_tracts(zips, crosswalk)
    assert results[0].lowest_crosswalk_quality == "low_confidence_crosswalk"


def test_every_result_carries_the_disclosed_method_label() -> None:
    zips = [ZipObservedEncounters("95128", "ed_only", 10)]
    crosswalk = [CrosswalkRow("95128", "06085000100", 1.0, "moderate_confidence_crosswalk")]
    results, _diag = allocate_zip_encounters_to_tracts(zips, crosswalk)
    assert results[0].method == "zip_to_tract_area_weighted_allocation"


def test_empty_input_returns_empty_results_not_a_crash() -> None:
    results, diag = allocate_zip_encounters_to_tracts([], [])
    assert results == []
    assert diag.total_observed_encounters == 0
    assert diag.n_zips_observed == 0
