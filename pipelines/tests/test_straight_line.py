"""Hand-calculated fixture tests for routing/straight_line.py."""

from __future__ import annotations

from scc_health_pipeline.routing.straight_line import (
    METHOD_LABEL,
    Point,
    haversine_miles,
    nearest_point,
    points_within_radius,
)


def test_haversine_zero_distance_for_identical_points() -> None:
    assert haversine_miles(37.3, -121.9, 37.3, -121.9) == 0.0


def test_haversine_one_degree_longitude_at_equator_hand_calculated() -> None:
    # Earth circumference / 360 degrees ~= 69.17 miles per degree of
    # longitude at the equator (radius 3958.7613 mi -> circumference
    # 2*pi*R = 24,873.6 mi -> /360 = 69.093 mi/degree).
    dist = haversine_miles(0.0, 0.0, 0.0, 1.0)
    assert abs(dist - 69.09) < 0.05


def test_haversine_known_san_jose_to_san_francisco_approx() -> None:
    # San Jose downtown (37.3382, -121.8863) to SF downtown
    # (37.7749, -122.4194) -- well-known straight-line distance ~42-43 mi.
    dist = haversine_miles(37.3382, -121.8863, 37.7749, -122.4194)
    assert 40.0 < dist < 45.0


def test_nearest_point_picks_closest_of_several_candidates() -> None:
    origin = Point("origin", 37.3, -121.9)
    candidates = [
        Point("far", 38.5, -123.0),
        Point("near", 37.31, -121.91),
        Point("mid", 37.6, -122.2),
    ]
    result = nearest_point(origin, candidates)
    assert result.nearest_point_id == "near"
    assert result.method == METHOD_LABEL
    assert result.n_candidates_considered == 3


def test_nearest_point_returns_none_distance_for_empty_candidates() -> None:
    origin = Point("origin", 37.3, -121.9)
    result = nearest_point(origin, [])
    assert result.nearest_point_id is None
    assert result.distance_miles is None
    assert result.n_candidates_considered == 0


def test_points_within_radius_filters_correctly() -> None:
    origin = Point("origin", 0.0, 0.0)
    candidates = [Point("a", 0.0, 0.1), Point("b", 0.0, 5.0)]
    # 0.1 degree ~= 6.9 miles, 5.0 degrees ~= 345 miles
    within = points_within_radius(origin, candidates, radius_miles=10.0)
    assert [p.id for p in within] == ["a"]
