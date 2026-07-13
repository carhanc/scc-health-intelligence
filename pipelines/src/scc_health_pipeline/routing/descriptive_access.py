"""Descriptive network-based access metrics (Phase 6 Access Lab): for a
population-weighted origin, the nearest canonical facility per resource
category by real walking and driving network distance.

This supersedes nothing from Phase 4's `metrics/precomputed_geospatial.py`
(`analytics.resource_accessibility_inputs`, straight-line, tract-internal-
point origin, undeduplicated HCAI+HRSA candidates, DEC-024) -- that table
remains in place as the existing scoring pipeline's input and is left
untouched. This module produces a new, clearly-separate, more realistic
measure (real network routing, the deduplicated canonical facility list,
block-group population-weighted origins) for the Access Lab specifically.
Never conflate the two without disclosure; they use different origins,
different candidate lists, and different distance methods.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING

from scc_health_pipeline.routing.network_osm import NetworkMode, NetworkRouteResult
from scc_health_pipeline.routing.straight_line import haversine_miles

if TYPE_CHECKING:
    import networkx as nx

# Facility categories evaluated for "nearest clinical care"-style access
# (hospitals and clinics only -- transit_hub and food_retailer have their
# own dedicated modules/metrics and are not meaningfully "nearest facility
# you'd travel to for care").
_CLINICAL_CATEGORIES = {"hospital", "clinic"}

# Generous cutoffs so a genuinely-unreached tract/block-group is a real
# finding, not an artifact of too-tight a search radius.
_WALK_CUTOFF_MILES = 8.0
_DRIVE_CUTOFF_MILES = 30.0

# Matches the transit module's rationale: network distance is always >=
# straight-line, so pre-filtering candidates by straight-line distance
# before snapping/routing only removes facilities that could never have
# been within the network cutoff -- pure performance, no coverage loss.
_STRAIGHT_LINE_PREFILTER_FACTOR = 1.5


@dataclass(frozen=True)
class CanonicalFacilityPoint:
    canonical_resource_id: str
    category: str
    lat: float
    lon: float


@dataclass(frozen=True)
class NearestFacilityByCategoryResult:
    origin_id: str
    mode: NetworkMode
    category: str
    result: NetworkRouteResult


def all_facility_distances(
    graph: nx.MultiDiGraph[int],
    mode: NetworkMode,
    origin_id: str,
    origin_lat: float,
    origin_lon: float,
    facilities: list[CanonicalFacilityPoint],
    categories: set[str] = _CLINICAL_CATEGORIES,
    nearest_nodes_fn: object | None = None,
    nearest_nodes_batch_fn: object | None = None,
) -> dict[str, NetworkRouteResult]:
    """One Dijkstra run per origin, returning every *routed* result keyed
    by facility ID (unavailable/out-of-cutoff facilities are simply
    absent from the returned dict, not included as unavailable entries --
    callers needing a "no facility of category X" disclosure should use
    `nearest_facility_by_category`, which wraps this and always returns
    one row per category). Shared by both the nearest-facility reduction
    below and E2SFCA (`analytics/e2sfca.py`), which needs the full
    distance set within each facility's catchment, not just the nearest.
    """
    from scc_health_pipeline.routing.network_osm import shortest_distances_from_origin

    cutoff_miles = _WALK_CUTOFF_MILES if mode == "walk" else _DRIVE_CUTOFF_MILES
    relevant = [f for f in facilities if f.category in categories]
    prefilter_miles = cutoff_miles * _STRAIGHT_LINE_PREFILTER_FACTOR
    candidates = [
        f for f in relevant
        if haversine_miles(origin_lat, origin_lon, f.lat, f.lon) <= prefilter_miles
    ]
    if not candidates:
        return {}

    destinations = [(f.canonical_resource_id, f.lat, f.lon) for f in candidates]
    route_results = shortest_distances_from_origin(
        graph, mode, origin_id, origin_lat, origin_lon, destinations,
        cutoff_miles=cutoff_miles, nearest_nodes_fn=nearest_nodes_fn,
        nearest_nodes_batch_fn=nearest_nodes_batch_fn,
    )
    return {
        r.destination_id: r
        for r in route_results
        if r.destination_id is not None and r.status == "routed"
    }


def nearest_facility_by_category(
    graph: nx.MultiDiGraph[int],
    mode: NetworkMode,
    origin_id: str,
    origin_lat: float,
    origin_lon: float,
    facilities: list[CanonicalFacilityPoint],
    categories: set[str] = _CLINICAL_CATEGORIES,
    nearest_nodes_fn: object | None = None,
    nearest_nodes_batch_fn: object | None = None,
    precomputed_distances: dict[str, NetworkRouteResult] | None = None,
) -> list[NearestFacilityByCategoryResult]:
    """Reduces `all_facility_distances()` to the nearest facility per
    category. Always returns one result per requested category,
    `status="unavailable"` (with a stated reason) for a category with no
    facility reachable within the cutoff, never an omitted category.

    Pass `precomputed_distances` (the result of a prior
    `all_facility_distances()` call for this same origin/mode) to avoid
    re-running the Dijkstra search -- used by the batch pipeline, which
    also needs the full distance set for E2SFCA and would otherwise pay
    for the same search twice.
    """
    method = f"osm_network_{mode}"
    cutoff_miles = _WALK_CUTOFF_MILES if mode == "walk" else _DRIVE_CUTOFF_MILES
    facility_by_id = {f.canonical_resource_id: f for f in facilities}

    result_by_id = (
        precomputed_distances
        if precomputed_distances is not None
        else all_facility_distances(
            graph, mode, origin_id, origin_lat, origin_lon, facilities, categories,
            nearest_nodes_fn, nearest_nodes_batch_fn,
        )
    )

    outputs: list[NearestFacilityByCategoryResult] = []
    for category in categories:
        category_results = [
            result_by_id[fid]
            for fid in result_by_id
            if fid in facility_by_id and facility_by_id[fid].category == category
        ]
        if not category_results:
            outputs.append(
                NearestFacilityByCategoryResult(
                    origin_id, mode, category,
                    NetworkRouteResult(
                        origin_id, None, mode, None, None, "unavailable", method,
                        unavailable_reason=(
                            f"No {category} facility reachable within {cutoff_miles} mi "
                            "by the real network (advanced route unavailable)."
                        ),
                    ),
                )
            )
            continue
        best = min(category_results, key=lambda r: r.distance_miles or float("inf"))
        outputs.append(NearestFacilityByCategoryResult(origin_id, mode, category, best))
    return outputs
