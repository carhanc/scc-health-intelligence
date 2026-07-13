"""Unit tests for scheduled-transit accessibility (Phase 6), using a small
synthetic walk graph -- no live OSM/GTFS I/O."""

from __future__ import annotations

import networkx as nx
import pytest
from scc_health_pipeline.routing.transit_access import (
    TransitStopService,
    nearest_transit_access,
    service_level_from_headway,
)

_LAT = 37.35


def _line_graph(n_nodes: int = 6) -> nx.MultiDiGraph:
    g = nx.MultiDiGraph()
    for i in range(n_nodes):
        g.add_node(i, x=-121.90 + i * 0.005, y=_LAT)  # ~440m per hop
    for i in range(n_nodes - 1):
        g.add_edge(i, i + 1, length=440.0)
        g.add_edge(i + 1, i, length=440.0)
    return g


def _stop(stop_id: str, lat: float, lon: float, n_trips: int) -> TransitStopService:
    window_minutes = 12 * 60  # 07:00-19:00
    headway = window_minutes / n_trips if n_trips > 0 else None
    from scc_health_pipeline.routing.transit_access import service_level_from_headway

    return TransitStopService(
        stop_id=stop_id, stop_name=f"Stop {stop_id}", lat=lat, lon=lon,
        n_trips_in_window=n_trips, headway_minutes=headway,
        service_level=service_level_from_headway(headway),
    )


@pytest.mark.parametrize(
    ("headway", "expected"),
    [
        (None, "none"),
        (10.0, "frequent"),
        (15.0, "frequent"),
        (20.0, "regular"),
        (30.0, "regular"),
        (45.0, "infrequent"),
        (60.0, "infrequent"),
        (90.0, "minimal"),
    ],
)
def test_service_level_from_headway_bands(headway: float | None, expected: str) -> None:
    assert service_level_from_headway(headway) == expected


def test_nearest_transit_access_picks_best_service_among_reachable_stops() -> None:
    g = _line_graph(6)
    stops = [
        _stop("s_near_low_freq", _LAT, -121.895, n_trips=4),  # ~440m, headway 180min
        _stop("s_far_high_freq", _LAT, -121.89, n_trips=48),  # ~880m, headway 15min
    ]
    result = nearest_transit_access(g, "origin", _LAT, -121.90, stops, max_walk_miles=1.0)
    assert result.status == "routed"
    assert result.nearest_stop_id == "s_far_high_freq"
    assert result.service_level == "frequent"
    assert result.method == "scheduled_transit_access_proxy"


def test_nearest_transit_access_excludes_stops_beyond_walk_cutoff() -> None:
    g = _line_graph(6)
    stops = [_stop("s_too_far", _LAT, -121.87, n_trips=48)]  # ~2.6mi away
    result = nearest_transit_access(g, "origin", _LAT, -121.90, stops, max_walk_miles=0.3)
    assert result.status == "unavailable"
    # Screened out by the straight-line pre-filter before network routing
    # even runs -- also a legitimate "excluded, beyond cutoff" outcome.
    assert result.unavailable_reason is not None
    assert "0.3" in result.unavailable_reason or "within" in result.unavailable_reason


def test_nearest_transit_access_excludes_a_stop_within_prefilter_but_not_network_cutoff() -> None:
    """A stop close enough to survive the straight-line pre-filter but
    still beyond the real network-distance cutoff must still end up
    unavailable, not silently accepted."""
    g = _line_graph(6)
    stops = [_stop("s_within_prefilter_only", _LAT, -121.895, n_trips=48)]  # ~440m
    result = nearest_transit_access(g, "origin", _LAT, -121.90, stops, max_walk_miles=0.2)
    assert result.status == "unavailable"


def test_nearest_transit_access_no_stops_is_unavailable_not_a_crash() -> None:
    g = _line_graph(3)
    result = nearest_transit_access(g, "origin", _LAT, -121.90, [], max_walk_miles=1.0)
    assert result.status == "unavailable"
    assert "No transit stops" in (result.unavailable_reason or "")


def test_nearest_transit_access_prefers_serviced_stop_over_unserved_closer_stop() -> None:
    g = _line_graph(6)
    stops = [
        _stop("s_near_no_service", _LAT, -121.895, n_trips=0),
        _stop("s_far_with_service", _LAT, -121.89, n_trips=24),
    ]
    result = nearest_transit_access(g, "origin", _LAT, -121.90, stops, max_walk_miles=1.0)
    assert result.nearest_stop_id == "s_far_with_service"


def test_transit_access_result_always_carries_the_service_window_label() -> None:
    g = _line_graph(3)
    result = nearest_transit_access(g, "origin", _LAT, -121.90, [], max_walk_miles=1.0)
    assert "monday" in result.service_window
    assert "07:00" in result.service_window
