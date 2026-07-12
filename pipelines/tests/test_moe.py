"""Unit tests for MOE/CI uncertainty conversion utilities, hand-checked
against the formulas in docs/03_ANALYTICS_METHODS.md §8."""

from __future__ import annotations

import math

import pytest
from scc_health_pipeline.uncertainty.moe import (
    acs_moe_to_standard_error,
    coefficient_of_variation,
    derived_ratio_moe,
    places_ci_to_standard_error,
)


def test_acs_moe_to_standard_error_hand_calculated() -> None:
    # MOE of 164.5 at 90% confidence -> SE = 164.5 / 1.645 = 100.0
    assert acs_moe_to_standard_error(164.5) == pytest.approx(100.0)


def test_acs_moe_to_standard_error_rejects_negative() -> None:
    with pytest.raises(ValueError):
        acs_moe_to_standard_error(-5.0)


def test_places_ci_to_standard_error_hand_calculated() -> None:
    # CI [10.0, 14.0] -> SE = (14.0 - 10.0) / (2 * 1.96) = 4.0 / 3.92
    expected = 4.0 / 3.92
    assert places_ci_to_standard_error(10.0, 14.0) == pytest.approx(expected)


def test_places_ci_rejects_inverted_bounds() -> None:
    with pytest.raises(ValueError):
        places_ci_to_standard_error(14.0, 10.0)


def test_derived_ratio_moe_hand_calculated_positive_radicand() -> None:
    # numerator=50, numerator_moe=10, denominator=200, denominator_moe=20
    # proportion = 0.25
    # term = 10^2 - (0.25^2 * 20^2) = 100 - (0.0625*400) = 100 - 25 = 75
    # moe = sqrt(75) / 200
    expected = math.sqrt(75) / 200
    result = derived_ratio_moe(
        numerator_estimate=50, numerator_moe=10, denominator_estimate=200, denominator_moe=20
    )
    assert result == pytest.approx(expected)


def test_derived_ratio_moe_falls_back_when_radicand_negative() -> None:
    # Construct a case where numerator_moe^2 < proportion^2 * denominator_moe^2
    # numerator=10, numerator_moe=1, denominator=20, denominator_moe=50
    # proportion = 0.5; term = 1 - (0.25 * 2500) = 1 - 625 = -624 (negative)
    expected = math.sqrt(1**2 + (0.5**2 * 50**2)) / 20
    result = derived_ratio_moe(
        numerator_estimate=10, numerator_moe=1, denominator_estimate=20, denominator_moe=50
    )
    assert result == pytest.approx(expected)


def test_derived_ratio_moe_rejects_nonpositive_denominator() -> None:
    with pytest.raises(ValueError):
        derived_ratio_moe(
            numerator_estimate=10, numerator_moe=1, denominator_estimate=0, denominator_moe=1
        )


def test_coefficient_of_variation_hand_calculated() -> None:
    assert coefficient_of_variation(100.0, 10.0) == pytest.approx(0.1)


def test_coefficient_of_variation_none_for_zero_estimate() -> None:
    assert coefficient_of_variation(0.0, 10.0) is None
