"""Unit tests for descriptive nearest-facility-by-category access (Phase
6), using a small synthetic walk graph -- no live OSM I/O."""

from __future__ import annotations

import networkx as nx
from scc_health_pipeline.routing.descriptive_access import (
    CanonicalFacilityPoint,
    all_facility_distances,
    nearest_facility_by_category,
)

_LAT = 37.35


def _line_graph(n_nodes: int = 8) -> nx.MultiDiGraph:
    g = nx.MultiDiGraph()
    for i in range(n_nodes):
        g.add_node(i, x=-121.90 + i * 0.01, y=_LAT)  # ~880m per hop
    for i in range(n_nodes - 1):
        g.add_edge(i, i + 1, length=880.0)
        g.add_edge(i + 1, i, length=880.0)
    return g


def test_returns_one_result_per_requested_category_even_when_unreachable() -> None:
    g = _line_graph(8)
    facilities = [
        CanonicalFacilityPoint("fac_h1", "hospital", _LAT, -121.89),
    ]
    results = nearest_facility_by_category(
        g, "walk", "origin", _LAT, -121.90, facilities, categories={"hospital", "clinic"}
    )
    by_category = {r.category: r for r in results}
    assert set(by_category) == {"hospital", "clinic"}
    assert by_category["hospital"].result.status == "routed"
    assert by_category["clinic"].result.status == "unavailable"


def test_picks_nearest_facility_within_each_category_independently() -> None:
    g = _line_graph(8)
    facilities = [
        CanonicalFacilityPoint("fac_h_near", "hospital", _LAT, -121.89),
        CanonicalFacilityPoint("fac_h_far", "hospital", _LAT, -121.85),
        CanonicalFacilityPoint("fac_c_near", "clinic", _LAT, -121.895),
    ]
    results = nearest_facility_by_category(
        g, "walk", "origin", _LAT, -121.90, facilities, categories={"hospital", "clinic"}
    )
    by_category = {r.category: r for r in results}
    assert by_category["hospital"].result.destination_id == "fac_h_near"
    assert by_category["clinic"].result.destination_id == "fac_c_near"


def test_ignores_facilities_outside_requested_categories() -> None:
    g = _line_graph(8)
    facilities = [
        CanonicalFacilityPoint("fac_food", "food_retailer", _LAT, -121.895),
    ]
    results = nearest_facility_by_category(
        g, "walk", "origin", _LAT, -121.90, facilities, categories={"hospital"}
    )
    assert len(results) == 1
    assert results[0].category == "hospital"
    assert results[0].result.status == "unavailable"


def test_no_candidate_facilities_at_all_is_unavailable_for_every_category() -> None:
    g = _line_graph(8)
    results = nearest_facility_by_category(
        g, "walk", "origin", _LAT, -121.90, [], categories={"hospital", "clinic"}
    )
    assert len(results) == 2
    assert all(r.result.status == "unavailable" for r in results)


def test_drive_mode_label_is_distinct_from_walk() -> None:
    g = _line_graph(8)
    facilities = [CanonicalFacilityPoint("fac_h1", "hospital", _LAT, -121.89)]
    results = nearest_facility_by_category(
        g, "drive", "origin", _LAT, -121.90, facilities, categories={"hospital"}
    )
    assert results[0].result.method == "osm_network_drive"


def test_all_facility_distances_returns_every_routed_facility_not_just_nearest() -> None:
    g = _line_graph(8)
    facilities = [
        CanonicalFacilityPoint("fac_h_near", "hospital", _LAT, -121.89),
        CanonicalFacilityPoint("fac_h_far", "hospital", _LAT, -121.87),
    ]
    distances = all_facility_distances(
        g, "walk", "origin", _LAT, -121.90, facilities, categories={"hospital"}
    )
    assert set(distances) == {"fac_h_near", "fac_h_far"}
    assert distances["fac_h_near"].distance_miles < distances["fac_h_far"].distance_miles


def test_nearest_facility_by_category_accepts_precomputed_distances_without_rerouting() -> None:
    g = _line_graph(8)
    facilities = [CanonicalFacilityPoint("fac_h1", "hospital", _LAT, -121.89)]
    precomputed = all_facility_distances(
        g, "walk", "origin", _LAT, -121.90, facilities, categories={"hospital"}
    )
    results = nearest_facility_by_category(
        g, "walk", "origin", _LAT, -121.90, facilities, categories={"hospital"},
        precomputed_distances=precomputed,
    )
    assert results[0].result.destination_id == "fac_h1"
    assert results[0].result.status == "routed"
