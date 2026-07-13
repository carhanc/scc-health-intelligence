"""Enhanced Two-Step Floating Catchment Area (E2SFCA) accessibility, per
docs/03_ANALYTICS_METHODS.md §12.5.

Step 1 (per facility j): R_j = S_j / sum_k( P_k * W(d_kj) ) for every
population point k within the facility's catchment -- the facility's
supply-to-demand ratio, discounted by how much competing demand is
closer to it than farther.

Step 2 (per population point i): A_i = sum_j( R_j * W(d_ij) ) for every
facility j within the population point's catchment -- the population
point's total accessibility, summing every facility's (distance-
discounted) contribution.

W(d) is a Gaussian distance-decay kernel, zero beyond the catchment
radius -- nearby facilities count more than farther ones, and nothing
outside the catchment contributes at all (a standard, well-documented
E2SFCA choice, not this project's own invention).

This module is pure math over an already-computed distance matrix; it
does not know or care whether those distances came from real network
routing or a synthetic test fixture, and is fully unit-testable against
hand-calculated small examples.

Non-negotiable per this project's Phase 6 spec: capacity (S_j) must be a
real, source-provided value where available (e.g. HCAI's licensed bed
count for hospitals) -- never inferred or fabricated from facility type
alone. Where no real capacity exists, a facility-count proxy (S_j = 1 for
every facility) is used instead, and every result is labeled with which
kind of capacity it used (`capacity_type`) so a real-capacity accessibility
score is never silently combined with a count-proxy one.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Literal

CapacityType = Literal["real_capacity", "count_proxy"]

METHOD_LABEL = "e2sfca_gaussian_decay"


@dataclass(frozen=True)
class FacilitySupply:
    facility_id: str
    category: str
    capacity: float
    capacity_type: CapacityType


@dataclass(frozen=True)
class OriginDemand:
    origin_id: str
    population: float


@dataclass(frozen=True)
class E2SFCAResult:
    origin_id: str
    category: str
    capacity_type: CapacityType
    accessibility_score: float
    n_facilities_in_catchment: int
    method: str = METHOD_LABEL


def gaussian_decay(
    distance_miles: float, catchment_radius_miles: float, sigma_miles: float
) -> float:
    """W(d): 0 beyond the catchment radius, otherwise a Gaussian kernel
    centered at distance 0 -- a facility at zero distance weighs 1.0; the
    weight falls off smoothly (not a hard step) as distance grows, per
    docs/03 §12.5."""
    if distance_miles < 0:
        raise ValueError("distance_miles must be non-negative")
    if distance_miles > catchment_radius_miles:
        return 0.0
    return math.exp(-(distance_miles**2) / (2 * sigma_miles**2))


def compute_facility_supply_ratios(
    facilities: list[FacilitySupply],
    origins: list[OriginDemand],
    distances_miles: dict[tuple[str, str], float],
    catchment_radius_miles: float,
    sigma_miles: float,
) -> dict[str, float]:
    """Step 1: R_j for every facility. A facility with zero demand within
    its catchment (no population point close enough) gets R_j = 0 (not a
    division-by-zero crash, and not an infinite/undefined score) -- a real,
    if unusual, finding (e.g. a facility in a very sparsely populated area).
    """
    ratios: dict[str, float] = {}
    for facility in facilities:
        weighted_demand = 0.0
        for origin in origins:
            dist = distances_miles.get((origin.origin_id, facility.facility_id))
            if dist is None:
                continue
            weighted_demand += origin.population * gaussian_decay(
                dist, catchment_radius_miles, sigma_miles
            )
        ratios[facility.facility_id] = (
            facility.capacity / weighted_demand if weighted_demand > 0 else 0.0
        )
    return ratios


def compute_origin_accessibility(
    facilities: list[FacilitySupply],
    origins: list[OriginDemand],
    distances_miles: dict[tuple[str, str], float],
    supply_ratios: dict[str, float],
    catchment_radius_miles: float,
    sigma_miles: float,
) -> list[E2SFCAResult]:
    """Step 2: A_i for every (origin, category) pair actually represented
    among `facilities`. Returns one result per origin per category present
    in `facilities` -- an origin with zero facilities of a category within
    its catchment gets accessibility_score=0.0 with
    n_facilities_in_catchment=0 (a real "no access" finding), not an
    omitted row.
    """
    categories = sorted({f.category for f in facilities})
    capacity_type_by_category = {
        category: next(f.capacity_type for f in facilities if f.category == category)
        for category in categories
    }
    facilities_by_category: dict[str, list[FacilitySupply]] = {
        category: [f for f in facilities if f.category == category] for category in categories
    }

    results: list[E2SFCAResult] = []
    for origin in origins:
        for category in categories:
            score = 0.0
            n_in_catchment = 0
            for facility in facilities_by_category[category]:
                dist = distances_miles.get((origin.origin_id, facility.facility_id))
                if dist is None or dist > catchment_radius_miles:
                    continue
                weight = gaussian_decay(dist, catchment_radius_miles, sigma_miles)
                if weight <= 0:
                    continue
                score += supply_ratios.get(facility.facility_id, 0.0) * weight
                n_in_catchment += 1
            results.append(
                E2SFCAResult(
                    origin_id=origin.origin_id,
                    category=category,
                    capacity_type=capacity_type_by_category[category],
                    accessibility_score=score,
                    n_facilities_in_catchment=n_in_catchment,
                )
            )
    return results
