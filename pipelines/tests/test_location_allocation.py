"""Hand-verifiable tests for optimization/location_allocation.py.

Fixture: 2 candidate sites (A near tracts d1/d2, B near tract d3, far
apart), 3 demand points. With k=1, selecting B yields a higher
need-weighted-population objective (200) than selecting A (125), so the
solver must pick B -- unless an equity constraint forces coverage of the
high-need tracts near A instead.
"""

from __future__ import annotations

import pytest
from scc_health_pipeline.optimization.location_allocation import (
    CandidateSite,
    DemandPoint,
    run_maximal_covering_location,
)

SITE_A = CandidateSite("site_a", "Site A", 37.30, -121.90)
SITE_B = CandidateSite("site_b", "Site B", 40.00, -100.00)

D1 = DemandPoint("t1", 37.301, -121.901, population=100.0, need_weight=1.0)
D2 = DemandPoint("t2", 37.302, -121.902, population=50.0, need_weight=0.5)
D3 = DemandPoint("t3", 40.001, -100.001, population=200.0, need_weight=1.0)


def test_k1_selects_higher_objective_site() -> None:
    # objective(A) = 1.0*100 + 0.5*50 = 125; objective(B) = 1.0*200 = 200
    result = run_maximal_covering_location(
        [SITE_A, SITE_B], [D1, D2, D3], k_sites=1, distance_threshold_miles=1.0
    )
    assert result.status in {"OPTIMAL", "FEASIBLE"}
    assert result.selected_sites == ["site_b"]
    assert result.objective_value == pytest.approx(200.0, rel=1e-3)
    assert result.population_covered == pytest.approx(200.0)
    assert result.covered_tract_geoids == ["t3"]
    assert set(result.unserved_high_need_tracts) == {
        "t1"
    }  # t1 is need=1.0, top of the 75th pctile cut


def test_k2_covers_everything() -> None:
    result = run_maximal_covering_location(
        [SITE_A, SITE_B], [D1, D2, D3], k_sites=2, distance_threshold_miles=1.0
    )
    assert set(result.selected_sites) == {"site_a", "site_b"}
    assert result.population_covered == pytest.approx(350.0)
    assert result.unserved_high_need_tracts == []


def test_marginal_gain_attributes_unique_coverage_per_site() -> None:
    result = run_maximal_covering_location(
        [SITE_A, SITE_B], [D1, D2, D3], k_sites=2, distance_threshold_miles=1.0
    )
    # site_a uniquely covers d1+d2 (150), site_b uniquely covers d3 (200) --
    # no overlap in this fixture (A and B cover disjoint demand points).
    assert result.marginal_gain_per_site["site_a"] == pytest.approx(150.0)
    assert result.marginal_gain_per_site["site_b"] == pytest.approx(200.0)
    assert result.overlap_count == 0


def test_equity_constraint_forces_high_need_coverage_even_at_objective_cost() -> None:
    # Dedicated fixture: exactly one high-need tract (e1, need=1.0, near
    # site_a), and a much larger but lower-need population near site_b.
    # need_values sorted [0.1, 0.3, 1.0] -> 75th-percentile cutoff = 1.0,
    # so only e1 counts as "high-need".
    e1 = DemandPoint("e1", 37.301, -121.901, population=100.0, need_weight=1.0)
    e2 = DemandPoint("e2", 37.302, -121.902, population=10.0, need_weight=0.1)
    e3 = DemandPoint("e3", 40.001, -100.001, population=500.0, need_weight=0.3)
    # objective(A) = 1.0*100 + 0.1*10 = 101; objective(B) = 0.3*500 = 150
    # -> unconstrained k=1 picks site_b.
    unconstrained = run_maximal_covering_location(
        [SITE_A, SITE_B], [e1, e2, e3], k_sites=1, distance_threshold_miles=1.0
    )
    assert unconstrained.selected_sites == ["site_b"]
    assert "e1" in unconstrained.unserved_high_need_tracts

    # With an equity constraint requiring 100% of high-need tracts
    # covered, the solver must pick site_a instead (the only site
    # covering e1), even though its raw objective (101) is lower than
    # site_b's (150).
    constrained = run_maximal_covering_location(
        [SITE_A, SITE_B],
        [e1, e2, e3],
        k_sites=1,
        distance_threshold_miles=1.0,
        equity_min_coverage_fraction=1.0,
    )
    assert constrained.selected_sites == ["site_a"]
    assert constrained.unserved_high_need_tracts == []


def test_no_candidate_sites_returns_invalid_input_not_a_crash() -> None:
    result = run_maximal_covering_location([], [D1], k_sites=1, distance_threshold_miles=1.0)
    assert result.status == "INVALID_INPUT"
    assert result.objective_value is None


def test_unreachable_demand_point_is_never_covered() -> None:
    # A demand point with no candidate site within threshold must never
    # be marked covered, regardless of k.
    far_demand = DemandPoint("t_far", 0.0, 0.0, population=1000.0, need_weight=1.0)
    result = run_maximal_covering_location(
        [SITE_A, SITE_B], [D1, far_demand], k_sites=2, distance_threshold_miles=1.0
    )
    assert "t_far" not in result.covered_tract_geoids
