"""Unit tests for E2SFCA (Phase 6), against hand-calculated small
examples -- pure math, no live network/GTFS dependency."""

from __future__ import annotations

import math

import pytest
from scc_health_pipeline.analytics.e2sfca import (
    FacilitySupply,
    OriginDemand,
    compute_facility_supply_ratios,
    compute_origin_accessibility,
    gaussian_decay,
)


def test_gaussian_decay_zero_distance_is_exactly_one() -> None:
    assert gaussian_decay(0.0, catchment_radius_miles=5.0, sigma_miles=2.0) == 1.0


def test_gaussian_decay_at_one_sigma_matches_known_value() -> None:
    # W(sigma) = exp(-sigma^2 / (2*sigma^2)) = exp(-0.5) ~= 0.60653
    assert gaussian_decay(2.0, catchment_radius_miles=5.0, sigma_miles=2.0) == pytest.approx(
        math.exp(-0.5), rel=1e-9
    )


def test_gaussian_decay_beyond_catchment_is_zero_even_if_kernel_would_be_nonzero() -> None:
    # A hard cutoff at the catchment radius, not just an asymptotic decay.
    assert gaussian_decay(5.01, catchment_radius_miles=5.0, sigma_miles=100.0) == 0.0


def test_gaussian_decay_negative_distance_raises() -> None:
    with pytest.raises(ValueError, match="non-negative"):
        gaussian_decay(-1.0, catchment_radius_miles=5.0, sigma_miles=2.0)


def test_step1_supply_ratio_hand_calculation_zero_distance() -> None:
    # R_j = S_j / sum_k(P_k * W(d_kj)); at distance 0, W=1 exactly.
    facilities = [FacilitySupply("f1", "clinic", capacity=10.0, capacity_type="real_capacity")]
    origins = [OriginDemand("o1", population=50.0), OriginDemand("o2", population=100.0)]
    distances = {("o1", "f1"): 0.0, ("o2", "f1"): 0.0}
    ratios = compute_facility_supply_ratios(facilities, origins, distances, 5.0, 2.0)
    assert ratios["f1"] == pytest.approx(10.0 / (50.0 + 100.0))


def test_step1_facility_with_zero_demand_gets_zero_ratio_not_a_crash() -> None:
    facilities = [FacilitySupply("f1", "clinic", capacity=10.0, capacity_type="real_capacity")]
    origins = [OriginDemand("o1", population=50.0)]
    distances: dict[tuple[str, str], float] = {}  # o1 not within f1's catchment at all
    ratios = compute_facility_supply_ratios(facilities, origins, distances, 5.0, 2.0)
    assert ratios["f1"] == 0.0


def test_step1_ignores_an_origin_missing_from_the_distance_matrix() -> None:
    """A missing (origin, facility) entry means 'not in catchment' /
    'unreachable', not distance=0."""
    facilities = [FacilitySupply("f1", "clinic", capacity=10.0, capacity_type="real_capacity")]
    origins = [OriginDemand("o1", population=50.0), OriginDemand("o2", population=999.0)]
    distances = {("o1", "f1"): 0.0}  # o2 has no entry -- excluded, not treated as distance 0
    ratios = compute_facility_supply_ratios(facilities, origins, distances, 5.0, 2.0)
    assert ratios["f1"] == pytest.approx(10.0 / 50.0)


def test_step2_accessibility_hand_calculation_two_facilities_zero_distance() -> None:
    # Two facilities, one origin, both at distance 0 -- A_i = R_f1 + R_f2.
    facilities = [
        FacilitySupply("f1", "clinic", capacity=10.0, capacity_type="real_capacity"),
        FacilitySupply("f2", "clinic", capacity=20.0, capacity_type="real_capacity"),
    ]
    origins = [OriginDemand("o1", population=100.0)]
    distances = {("o1", "f1"): 0.0, ("o1", "f2"): 0.0}
    ratios = compute_facility_supply_ratios(facilities, origins, distances, 5.0, 2.0)
    results = compute_origin_accessibility(facilities, origins, distances, ratios, 5.0, 2.0)
    assert len(results) == 1
    expected = ratios["f1"] + ratios["f2"]
    assert results[0].accessibility_score == pytest.approx(expected)
    assert results[0].n_facilities_in_catchment == 2


def test_step2_origin_with_no_facility_in_catchment_gets_zero_not_omitted() -> None:
    facilities = [FacilitySupply("f1", "clinic", capacity=10.0, capacity_type="real_capacity")]
    origins = [OriginDemand("o1", population=100.0), OriginDemand("o2", population=50.0)]
    distances = {("o1", "f1"): 0.0}  # o2 has nothing in its catchment
    ratios = compute_facility_supply_ratios(facilities, origins, distances, 5.0, 2.0)
    results = compute_origin_accessibility(facilities, origins, distances, ratios, 5.0, 2.0)
    by_origin = {r.origin_id: r for r in results}
    assert by_origin["o2"].accessibility_score == 0.0
    assert by_origin["o2"].n_facilities_in_catchment == 0


def test_step2_keeps_capacity_types_of_different_categories_separate() -> None:
    facilities = [
        FacilitySupply("hosp1", "hospital", capacity=200.0, capacity_type="real_capacity"),
        FacilitySupply("clin1", "clinic", capacity=1.0, capacity_type="count_proxy"),
    ]
    origins = [OriginDemand("o1", population=100.0)]
    distances = {("o1", "hosp1"): 0.0, ("o1", "clin1"): 0.0}
    ratios = compute_facility_supply_ratios(facilities, origins, distances, 5.0, 2.0)
    results = compute_origin_accessibility(facilities, origins, distances, ratios, 5.0, 2.0)
    by_category = {r.category: r for r in results}
    assert by_category["hospital"].capacity_type == "real_capacity"
    assert by_category["clinic"].capacity_type == "count_proxy"


def test_step1_and_step2_never_produce_negative_or_nan_scores() -> None:
    facilities = [FacilitySupply("f1", "clinic", capacity=0.0, capacity_type="real_capacity")]
    origins = [OriginDemand("o1", population=0.0)]
    distances = {("o1", "f1"): 0.0}
    ratios = compute_facility_supply_ratios(facilities, origins, distances, 5.0, 2.0)
    results = compute_origin_accessibility(facilities, origins, distances, ratios, 5.0, 2.0)
    assert ratios["f1"] == 0.0
    assert results[0].accessibility_score == 0.0
    assert not math.isnan(results[0].accessibility_score)
