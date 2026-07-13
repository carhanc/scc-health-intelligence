"""Scheduled-transit accessibility (Phase 6 Access Lab), per DEC-043 and
RISK-021: a walk-to-stop + scheduled-frequency proxy, explicitly NOT a
real multi-modal router. Every result is labeled
`method="scheduled_transit_access_proxy"` and carries the exact service
window it was computed against, so it is never confusable with a live
departure board, a guaranteed arrival time, or a real transit-router's
door-to-door itinerary (which would additionally account for transfers,
in-vehicle travel time to the specific destination, and real-time
delays -- none of which this proxy attempts).

Two things are computed from real GTFS data already in the warehouse
(`resources.transit_{stops,stop_times,trips,calendar}`, VTA's published
feed):

1. Per-stop scheduled service frequency during a fixed daytime weekday
   window (07:00-19:00 Monday, a standard, disclosed accessibility-
   research convention -- not tailored to any specific traveler's
   schedule).
2. For a given origin, the best (lowest-headway) transit stop reachable
   within a real OSM-network walk distance -- reusing
   `routing/network_osm.py` rather than a second straight-line-only
   walk estimate.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING, Literal

if TYPE_CHECKING:
    import duckdb
    import networkx as nx

ServiceLevel = Literal["frequent", "regular", "infrequent", "minimal", "none"]

METHOD_LABEL = "scheduled_transit_access_proxy"

DEFAULT_WINDOW_START = "07:00:00"
DEFAULT_WINDOW_END = "19:00:00"
DEFAULT_WEEKDAY = "monday"

# Headway thresholds (minutes) used to translate a raw number into a
# plain-language service level -- conventional transit-planning bands
# (e.g. TCRP Transit Capacity and Quality of Service Manual's frequent-
# service definition of <=15 min headway), not derived from this
# project's own data.
_FREQUENT_MAX_HEADWAY_MIN = 15.0
_REGULAR_MAX_HEADWAY_MIN = 30.0
_INFREQUENT_MAX_HEADWAY_MIN = 60.0

_MAX_TRANSIT_WALK_MILES = 0.5

# Network (road/path-following) walk distance is always >= straight-line
# distance. Pre-filtering candidate stops by straight-line distance before
# doing any network snapping/routing is a pure performance optimization
# (never excludes a stop that could actually be within the network
# cutoff) -- 1.5x is a generous detour-factor margin for an urban/suburban
# street grid.
_STRAIGHT_LINE_PREFILTER_FACTOR = 1.5


def _parse_gtfs_time_to_minutes(time_str: str) -> int:
    """GTFS times are HH:MM:SS where HH may exceed 23 for a trip that
    continues past midnight on the same service day (e.g. "25:15:00")."""
    hours, minutes, seconds = time_str.split(":")
    return int(hours) * 60 + int(minutes) + int(seconds) // 60


def service_level_from_headway(headway_minutes: float | None) -> ServiceLevel:
    if headway_minutes is None:
        return "none"
    if headway_minutes <= _FREQUENT_MAX_HEADWAY_MIN:
        return "frequent"
    if headway_minutes <= _REGULAR_MAX_HEADWAY_MIN:
        return "regular"
    if headway_minutes <= _INFREQUENT_MAX_HEADWAY_MIN:
        return "infrequent"
    return "minimal"


@dataclass(frozen=True)
class TransitStopService:
    stop_id: str
    stop_name: str
    lat: float
    lon: float
    n_trips_in_window: int
    headway_minutes: float | None
    service_level: ServiceLevel


def compute_weekday_stop_service_levels(
    conn: duckdb.DuckDBPyConnection,
    window_start: str = DEFAULT_WINDOW_START,
    window_end: str = DEFAULT_WINDOW_END,
    weekday: str = DEFAULT_WEEKDAY,
) -> list[TransitStopService]:
    """Real GTFS aggregation: for every stop, count scheduled arrivals
    during [window_start, window_end) on `weekday`, using
    `transit_calendar`'s weekday flag (no calendar_dates.txt exceptions
    are present in this feed, so none are applied -- a stated
    simplification, not a silent one)."""
    if weekday not in {
        "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
    }:
        raise ValueError(f"Invalid weekday: {weekday}")

    rows = conn.execute(
        f"""
        SELECT st.stop_id, s.stop_name, s.stop_lat, s.stop_lon, COUNT(*) AS n_trips
        FROM resources.transit_stop_times st
        JOIN resources.transit_trips t ON st.trip_id = t.trip_id
        JOIN resources.transit_calendar c ON t.service_id = c.service_id
        JOIN resources.transit_stops s ON st.stop_id = s.stop_id
        WHERE c.{weekday} = 1
          AND st.arrival_time >= ?
          AND st.arrival_time < ?
        GROUP BY st.stop_id, s.stop_name, s.stop_lat, s.stop_lon
        """,
        [window_start, window_end],
    ).fetchall()

    window_minutes = _parse_gtfs_time_to_minutes(window_end) - _parse_gtfs_time_to_minutes(
        window_start
    )

    results = []
    for stop_id, stop_name, lat, lon, n_trips in rows:
        headway = window_minutes / n_trips if n_trips > 0 else None
        results.append(
            TransitStopService(
                stop_id=stop_id,
                stop_name=stop_name,
                lat=lat,
                lon=lon,
                n_trips_in_window=n_trips,
                headway_minutes=headway,
                service_level=service_level_from_headway(headway),
            )
        )
    return results


@dataclass(frozen=True)
class TransitAccessResult:
    origin_id: str
    status: Literal["routed", "unavailable"]
    method: str
    service_window: str
    nearest_stop_id: str | None = None
    nearest_stop_name: str | None = None
    walk_distance_miles: float | None = None
    n_trips_in_window: int | None = None
    headway_minutes: float | None = None
    service_level: ServiceLevel | None = None
    unavailable_reason: str | None = None


def nearest_transit_access(
    walk_graph: nx.MultiDiGraph[int],
    origin_id: str,
    origin_lat: float,
    origin_lon: float,
    stop_services: list[TransitStopService],
    max_walk_miles: float = _MAX_TRANSIT_WALK_MILES,
    window_start: str = DEFAULT_WINDOW_START,
    window_end: str = DEFAULT_WINDOW_END,
    nearest_nodes_fn: object | None = None,
    nearest_nodes_batch_fn: object | None = None,
) -> TransitAccessResult:
    """Among stops within `max_walk_miles` of the origin by real OSM walk-
    network distance, returns the one with the best (lowest-headway)
    scheduled service. Ties broken by shorter walk distance. Stops with
    no service in the window are still walk-distance-eligible but never
    chosen over one with actual scheduled service, since `headway_minutes
    is None` sorts last.

    Pass `nearest_nodes_batch_fn` (e.g. `ox.distance.nearest_nodes` called
    with array X/Y) when evaluating against the full real stop inventory
    (thousands of stops) -- without it, every stop is snapped individually,
    which does not scale on a real county-scale graph.
    """
    from scc_health_pipeline.routing.network_osm import shortest_distances_from_origin
    from scc_health_pipeline.routing.straight_line import haversine_miles

    method = METHOD_LABEL
    window_label = f"{window_start[:5]}-{window_end[:5]} {DEFAULT_WEEKDAY}"

    if not stop_services:
        return TransitAccessResult(
            origin_id, "unavailable", method, window_label,
            unavailable_reason="No transit stops available to evaluate.",
        )

    prefilter_miles = max_walk_miles * _STRAIGHT_LINE_PREFILTER_FACTOR
    candidate_stops = [
        s for s in stop_services
        if haversine_miles(origin_lat, origin_lon, s.lat, s.lon) <= prefilter_miles
    ]
    if not candidate_stops:
        return TransitAccessResult(
            origin_id, "unavailable", method, window_label,
            unavailable_reason=(
                f"No transit stop is within {prefilter_miles:.2f} mi straight-line "
                "distance (screened out before network routing)."
            ),
        )

    destinations = [(s.stop_id, s.lat, s.lon) for s in candidate_stops]
    route_results = shortest_distances_from_origin(
        walk_graph, "walk", origin_id, origin_lat, origin_lon, destinations,
        cutoff_miles=max_walk_miles, nearest_nodes_fn=nearest_nodes_fn,
        nearest_nodes_batch_fn=nearest_nodes_batch_fn,
    )
    reachable = {
        r.destination_id: r
        for r in route_results
        if r.status == "routed" and r.destination_id is not None
    }
    if not reachable:
        return TransitAccessResult(
            origin_id, "unavailable", method, window_label,
            unavailable_reason=(
                f"No transit stop is reachable within {max_walk_miles} mi by the "
                "real walk network."
            ),
        )

    services_by_id = {s.stop_id: s for s in stop_services}

    def sort_key(stop_id: str) -> tuple[int, float, float]:
        service = services_by_id[stop_id]
        headway = service.headway_minutes
        has_no_service = headway is None
        return (
            1 if has_no_service else 0,
            headway if headway is not None else float("inf"),
            reachable[stop_id].distance_miles or float("inf"),
        )

    best_stop_id = min(reachable, key=sort_key)
    best_service = services_by_id[best_stop_id]
    best_route = reachable[best_stop_id]

    return TransitAccessResult(
        origin_id=origin_id,
        status="routed",
        method=method,
        service_window=window_label,
        nearest_stop_id=best_stop_id,
        nearest_stop_name=best_service.stop_name,
        walk_distance_miles=best_route.distance_miles,
        n_trips_in_window=best_service.n_trips_in_window,
        headway_minutes=best_service.headway_minutes,
        service_level=best_service.service_level,
    )
