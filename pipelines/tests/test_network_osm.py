"""Unit tests for OSM-network routing logic (Phase 6), using small
synthetic NetworkX graphs -- no live OSM/Overpass network calls. Graphs
mimic OSMnx's schema: node attributes x=lon, y=lat; edge attributes
length (meters) and optionally travel_time (seconds)."""

from __future__ import annotations

import networkx as nx
import pytest
from scc_health_pipeline.routing.network_osm import (
    route_between_points,
    shortest_distances_from_origin,
)

# A small line graph roughly along a real Santa Clara County latitude,
# ~0.01 degrees longitude apart per hop (~880m at this latitude).
_LAT = 37.35


def _line_graph(n_nodes: int = 4, with_travel_time: bool = False) -> nx.MultiDiGraph:
    g = nx.MultiDiGraph()
    for i in range(n_nodes):
        g.add_node(i, x=-121.90 + i * 0.01, y=_LAT)
    for i in range(n_nodes - 1):
        edge_attrs = {"length": 880.0}
        if with_travel_time:
            edge_attrs["travel_time"] = 880.0 / 1.4  # ~walking speed m/s
        g.add_edge(i, i + 1, **edge_attrs)
        g.add_edge(i + 1, i, **edge_attrs)
    return g


def test_route_between_points_on_connected_graph_returns_routed_status() -> None:
    g = _line_graph(4)
    result = route_between_points(
        g, "walk", "origin", _LAT, -121.90, "dest", _LAT, -121.87
    )
    assert result.status == "routed"
    assert result.distance_miles is not None
    assert result.distance_miles == pytest.approx(3 * 880.0 / 1609.344, rel=1e-3)
    assert result.method == "osm_network_walk"


def test_route_between_points_duration_present_when_travel_time_attribute_exists() -> None:
    g = _line_graph(4, with_travel_time=True)
    result = route_between_points(
        g, "walk", "origin", _LAT, -121.90, "dest", _LAT, -121.87
    )
    assert result.status == "routed"
    assert result.duration_minutes is not None
    assert result.duration_minutes > 0


def test_route_between_points_duration_is_none_without_travel_time_attribute() -> None:
    """Never fabricate a duration the graph doesn't actually carry."""
    g = _line_graph(4, with_travel_time=False)
    result = route_between_points(
        g, "walk", "origin", _LAT, -121.90, "dest", _LAT, -121.87
    )
    assert result.status == "routed"
    assert result.duration_minutes is None


def test_route_between_points_disconnected_graph_returns_unavailable_not_a_crash() -> None:
    g = nx.MultiDiGraph()
    g.add_node(0, x=-121.90, y=_LAT)
    g.add_node(1, x=-121.50, y=_LAT)  # far away, no edge connecting them
    result = route_between_points(g, "drive", "a", _LAT, -121.90, "b", _LAT, -121.50)
    assert result.status == "unavailable"
    assert result.distance_miles is None
    assert result.duration_minutes is None
    assert "advanced route unavailable" in (result.unavailable_reason or "")


def test_route_between_points_far_off_network_point_is_unavailable() -> None:
    g = _line_graph(4)
    # A point 5 degrees of longitude away is nowhere near the small test
    # network -- must not silently snap to a distant node and report a
    # misleading "routed" distance.
    result = route_between_points(g, "walk", "far", 37.35, -116.0, "dest", _LAT, -121.87)
    assert result.status == "unavailable"
    assert "snap threshold" in (result.unavailable_reason or "")


def test_shortest_distances_from_origin_returns_one_result_per_destination() -> None:
    g = _line_graph(5)
    destinations = [
        ("d1", _LAT, -121.89),
        ("d2", _LAT, -121.87),
        ("d3", _LAT, -121.86),
    ]
    results = shortest_distances_from_origin(
        g, "walk", "origin", _LAT, -121.90, destinations, cutoff_miles=5.0
    )
    assert len(results) == 3
    assert all(r.status == "routed" for r in results)


def test_shortest_distances_from_origin_respects_cutoff_without_dropping_destination() -> None:
    g = _line_graph(5)
    destinations = [
        ("near", _LAT, -121.89),  # ~880m away, within cutoff
        ("far", _LAT, -121.86),  # ~3.5km away, beyond a tight cutoff
    ]
    results = shortest_distances_from_origin(
        g, "walk", "origin", _LAT, -121.90, destinations, cutoff_miles=1.0
    )
    assert len(results) == 2  # never silently dropped
    by_id = {r.destination_id: r for r in results}
    assert by_id["near"].status == "routed"
    assert by_id["far"].status == "unavailable"
    assert "cutoff" in (by_id["far"].unavailable_reason or "")


def test_shortest_distances_from_origin_on_empty_graph_is_unavailable_not_a_crash() -> None:
    g = nx.MultiDiGraph()
    results = shortest_distances_from_origin(
        g, "drive", "origin", _LAT, -121.90, [("d1", _LAT, -121.89)], cutoff_miles=5.0
    )
    assert len(results) == 1
    assert results[0].status == "unavailable"
