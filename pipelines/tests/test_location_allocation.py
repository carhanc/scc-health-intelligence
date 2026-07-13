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


def test_population_weighted_demand_uses_block_group_geoid_when_present() -> None:
    # A DemandPoint with a real block-group origin should drive coverage
    # exactly as a tract-only one would -- block_group_geoid is additive
    # provenance, not a different demand model.
    bg_demand = DemandPoint(
        "t1", 37.301, -121.901, population=100.0, need_weight=1.0,
        block_group_geoid="060855001001",
    )
    result = run_maximal_covering_location(
        [SITE_A], [bg_demand], k_sites=1, distance_threshold_miles=1.0
    )
    assert result.population_covered == pytest.approx(100.0)
    assert result.covered_tract_geoids == ["t1"]


def test_custom_distance_fn_overrides_straight_line() -> None:
    # A distance_fn that reports everything as 1000 miles away makes
    # every demand point unreachable, regardless of true straight-line
    # proximity -- proves the override is actually used, not ignored.
    def always_far(_o_lat: float, _o_lon: float, _d_lat: float, _d_lon: float) -> float:
        return 1000.0

    result = run_maximal_covering_location(
        [SITE_A, SITE_B], [D1, D2, D3], k_sites=2, distance_threshold_miles=1.0,
        distance_fn=always_far, distance_method_label="test_always_far",
    )
    assert result.population_covered == 0.0
    assert any("test_always_far" in a for a in result.assumptions)


def test_precomputed_distances_take_priority_and_missing_pairs_do_not_cover() -> None:
    # site_a is geometrically close to d1 (would cover under straight-line
    # screening) but the precomputed matrix has NO entry for (t1, site_a)
    # -- must be treated as unknown/not-covering, never silently
    # falling back to straight-line for that one pair.
    precomputed = {("t2", "site_a"): 0.1}  # only d2 has a known network distance to site_a
    result = run_maximal_covering_location(
        [SITE_A], [D1, D2], k_sites=1, distance_threshold_miles=1.0,
        precomputed_distances=precomputed,
    )
    assert "t1" not in result.covered_tract_geoids
    assert "t2" in result.covered_tract_geoids
    assert result.method == "network_distance_precomputed"
    assert any("network_distance_precomputed" in a for a in result.assumptions)


def test_infeasible_equity_constraint_returns_typed_infeasible_status() -> None:
    # Two high-need demand points, each coverable by only one distinct
    # site; k_sites=1 with a 100%-high-need-coverage equity constraint
    # cannot be satisfied by any single site -- must return a typed
    # infeasible result, not raise or silently return a partial solution.
    site_near_h1 = CandidateSite("site_h1", "Near H1", 10.0, 10.0)
    site_near_h2 = CandidateSite("site_h2", "Near H2", 20.0, 20.0)
    h1 = DemandPoint("h1", 10.001, 10.001, population=50.0, need_weight=1.0)
    h2 = DemandPoint("h2", 20.001, 20.001, population=50.0, need_weight=1.0)
    result = run_maximal_covering_location(
        [site_near_h1, site_near_h2], [h1, h2], k_sites=1, distance_threshold_miles=1.0,
        equity_min_coverage_fraction=1.0,
    )
    assert result.status == "INFEASIBLE"
    assert result.objective_value is None
    assert result.selected_sites == []


def test_solution_is_deterministic_across_repeated_runs() -> None:
    first = run_maximal_covering_location(
        [SITE_A, SITE_B], [D1, D2, D3], k_sites=1, distance_threshold_miles=1.0
    )
    second = run_maximal_covering_location(
        [SITE_A, SITE_B], [D1, D2, D3], k_sites=1, distance_threshold_miles=1.0
    )
    assert first.selected_sites == second.selected_sites
    assert first.objective_value == second.objective_value


def test_selected_sites_are_real_site_ids_not_category_or_label_strings() -> None:
    result = run_maximal_covering_location(
        [SITE_A, SITE_B], [D1, D2, D3], k_sites=2, distance_threshold_miles=1.0
    )
    input_site_ids = {SITE_A.site_id, SITE_B.site_id}
    input_labels_and_categories = {SITE_A.label, SITE_B.label, "hospital", "clinic", "transit_hub"}
    for site_id in result.selected_sites:
        assert site_id in input_site_ids
        assert site_id not in input_labels_and_categories


def test_abstract_analytical_sites_are_counted_and_never_silently_relabeled() -> None:
    abstract_site = CandidateSite(
        "abstract_1", "Hypothetical demand-center site", 37.301, -121.901,
        site_type="abstract_analytical",
    )
    result = run_maximal_covering_location(
        [abstract_site], [D1], k_sites=1, distance_threshold_miles=1.0
    )
    assert result.n_abstract_analytical_sites_selected == 1
    assert any("abstract_analytical" in a and "hypothetical" in a for a in result.assumptions)


def test_assumptions_never_claim_people_served_or_health_outcomes() -> None:
    result = run_maximal_covering_location(
        [SITE_A, SITE_B], [D1, D2, D3], k_sites=1, distance_threshold_miles=1.0
    )
    joined = " ".join(result.assumptions).lower()
    banned_phrases = (
        "people served", "patients served", "health outcomes improved", "savings generated",
    )
    for banned_phrase in banned_phrases:
        assert banned_phrase not in joined
