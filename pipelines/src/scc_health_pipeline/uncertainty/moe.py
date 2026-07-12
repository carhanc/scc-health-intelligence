"""Margin-of-error / confidence-interval conversion utilities.

Implements the formulas specified in docs/03_ANALYTICS_METHODS.md §8:
ACS 90%-MOE-to-standard-error conversion (§8.1), PLACES 95%-CI-to-standard-
error conversion (§8.2), and the Census-recommended derived-ratio MOE
formula for proportions computed from two ACS estimates (numerator is a
subset of denominator), per Census Bureau ACS methodology documentation
(https://www.census.gov/programs-surveys/acs/guidance/statistical-testing.html).

These are pure functions with no I/O, used by every source adapter that
carries an uncertainty field (ACS, PLACES, SVI) and later by the Phase 4
Monte Carlo uncertainty-propagation engine.
"""

from __future__ import annotations

import math

# ACS margins of error are published at 90% confidence by default.
ACS_MOE_Z_SCORE_90 = 1.645

# PLACES confidence limits are published at 95% confidence.
PLACES_CI_Z_SCORE_95 = 1.96


def acs_moe_to_standard_error(moe_90: float) -> float:
    """Convert a published ACS 90%-confidence margin of error to a standard error.

    docs/03_ANALYTICS_METHODS.md §8.1: standard_error = MOE / 1.645
    """
    if moe_90 < 0:
        raise ValueError(f"ACS margin of error must be non-negative, got {moe_90}")
    return moe_90 / ACS_MOE_Z_SCORE_90


def places_ci_to_standard_error(confidence_low: float, confidence_high: float) -> float:
    """Convert PLACES 95% confidence limits to a standard error.

    docs/03_ANALYTICS_METHODS.md §8.2: standard_error ~= (upper - lower) / (2 * 1.96)
    """
    if confidence_high < confidence_low:
        raise ValueError(
            f"confidence_high ({confidence_high}) must be >= confidence_low ({confidence_low})"
        )
    return (confidence_high - confidence_low) / (2 * PLACES_CI_Z_SCORE_95)


def derived_ratio_moe(
    numerator_estimate: float,
    numerator_moe: float,
    denominator_estimate: float,
    denominator_moe: float,
) -> float:
    """MOE of a proportion numerator/denominator where the numerator is a
    subset of the denominator (the common ACS derived-rate case, e.g.
    "percent uninsured" = uninsured population / total population).

    Uses the Census Bureau's standard formula (ACS General Handbook,
    Appendix A: "Calculating Margins of Error for Derived Estimates"):

        proportion = numerator / denominator
        term = numerator_moe^2 - (proportion^2 * denominator_moe^2)
        if term >= 0:
            moe = sqrt(term) / denominator_estimate
        else:
            # Approximation the Census Handbook recommends when the
            # simpler formula produces a negative radicand.
            moe = sqrt(numerator_moe^2 + (proportion^2 * denominator_moe^2)) / denominator_estimate
    """
    if denominator_estimate <= 0:
        raise ValueError("denominator_estimate must be positive to compute a derived-ratio MOE")

    proportion = numerator_estimate / denominator_estimate
    term = numerator_moe**2 - (proportion**2 * denominator_moe**2)
    if term >= 0:
        return math.sqrt(term) / denominator_estimate
    return math.sqrt(numerator_moe**2 + (proportion**2 * denominator_moe**2)) / denominator_estimate


def coefficient_of_variation(estimate: float, standard_error: float) -> float | None:
    """CV = SE / estimate, expressed as a fraction (not percentage).

    Returns None when the estimate is zero (CV is undefined), per
    docs/02_DATA_SOURCE_REGISTRY.md §4.2 ("Flag high coefficient-of-variation
    estimates") -- a None/undefined CV must be surfaced, not silently
    treated as zero or perfect precision.
    """
    if estimate == 0:
        return None
    return standard_error / abs(estimate)
