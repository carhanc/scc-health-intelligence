"""Straight-line (haversine great-circle) distance -- the explicitly-labeled
screening-only baseline required by docs/03_ANALYTICS_METHODS.md §12.2:
"If only straight-line distance is available, label it explicitly."

This module intentionally does not attempt network routing (walking/driving
via OSM, transit via GTFS) -- that is Phase 6 (Access Lab) scope, requiring
OSMnx/networkx network graphs not yet built. Every caller of this module
must carry a `method="straight_line_screening"` label through to any
score/metric/API response it feeds, per DEC-024, so a straight-line
distance is never presented as if it were a network travel time.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

_EARTH_RADIUS_MILES = 3958.7613

METHOD_LABEL = "straight_line_screening"


def haversine_miles(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance in miles between two WGS84 lat/lon points."""
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    d_phi = math.radians(lat2 - lat1)
    d_lambda = math.radians(lon2 - lon1)
    a = math.sin(d_phi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(d_lambda / 2) ** 2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return _EARTH_RADIUS_MILES * c


@dataclass(frozen=True)
class Point:
    id: str
    lat: float
    lon: float


@dataclass(frozen=True)
class NearestResult:
    origin_id: str
    nearest_point_id: str | None
    distance_miles: float | None
    n_candidates_considered: int
    method: str = METHOD_LABEL


def nearest_point(origin: Point, candidates: list[Point]) -> NearestResult:
    """Distance from `origin` to the nearest of `candidates`. Returns a
    None distance (not zero, not an arbitrarily large sentinel) when there
    are no candidates -- an empty resource category must be visibly
    "no data," never silently coerced to a fabricated distance."""
    if not candidates:
        return NearestResult(origin.id, None, None, 0)
    best = min(candidates, key=lambda c: haversine_miles(origin.lat, origin.lon, c.lat, c.lon))
    dist = haversine_miles(origin.lat, origin.lon, best.lat, best.lon)
    return NearestResult(origin.id, best.id, dist, len(candidates))


def points_within_radius(
    origin: Point, candidates: list[Point], radius_miles: float
) -> list[Point]:
    return [
        c
        for c in candidates
        if haversine_miles(origin.lat, origin.lon, c.lat, c.lon) <= radius_miles
    ]
