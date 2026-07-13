"""Real OSM-network walking/driving routing (Phase 6 Access Lab), per
DEC-043 (OSMnx + NetworkX, not a Java-based server router) and
docs/04_ARCHITECTURE_IMPLEMENTATION.md §11's `OSMNetworkProvider`.

This module's routing functions take an already-loaded `networkx.MultiDiGraph`
as a parameter rather than loading it themselves -- that keeps the routing
logic (snapping, shortest paths, cutoffs, failure handling) unit-testable
against small synthetic graphs with no live network I/O. Downloading and
caching the real Santa Clara County graphs is a separate, explicit step:
see `run_build_network_graphs.py` and `load_cached_graph()` below.

Every result carries a `method` distinct from
`routing.straight_line.METHOD_LABEL` ("straight_line_screening") so a
network-routed distance/time is never confusable with the haversine
screening baseline. A routing failure (no path, a point too far from any
road/path to snap sensibly) returns a typed `status="unavailable"` result
-- it never raises, and never silently substitutes a straight-line
distance without saying so.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

import networkx as nx

NetworkMode = Literal["walk", "drive"]

METHOD_LABELS: dict[NetworkMode, str] = {
    "walk": "osm_network_walk",
    "drive": "osm_network_drive",
}

# A snapped origin/destination more than this far from its nearest graph
# node is treated as off-network (e.g. bad coordinates, or a point in a
# body of water/restricted area with no digitized path nearby) rather than
# silently routed from a misleadingly-distant snap point.
_MAX_SNAP_DISTANCE_MILES = 0.5

_METERS_PER_MILE = 1609.344


@dataclass(frozen=True)
class NetworkRouteResult:
    origin_id: str
    destination_id: str | None
    mode: NetworkMode
    distance_miles: float | None
    duration_minutes: float | None
    status: Literal["routed", "unavailable"]
    method: str
    unavailable_reason: str | None = None


def _snap_node(
    graph: nx.MultiDiGraph[int], lat: float, lon: float
) -> tuple[int, float] | None:
    """Returns (nearest_node_id, snap_distance_miles), or None if the graph
    has no nodes at all."""
    if graph.number_of_nodes() == 0:
        return None
    node_id, dist_meters = _nearest_node_with_distance(graph, lat, lon)
    return node_id, dist_meters / _METERS_PER_MILE


def _nearest_node_with_distance(
    graph: nx.MultiDiGraph[int], lat: float, lon: float
) -> tuple[int, float]:
    """Brute-force nearest-node search using the haversine formula on node
    x/y attributes (OSMnx stores x=lon, y=lat). Deliberately dependency-light
    (no BallTree requirement) so this stays testable against tiny synthetic
    graphs; `load_cached_graph()` callers with large real graphs should
    prefer `osmnx.distance.nearest_nodes` (KD-tree, much faster) -- see
    `route_between_points`'s `nearest_nodes_fn` parameter.
    """
    from scc_health_pipeline.routing.straight_line import haversine_miles

    best_node: int | None = None
    best_dist_miles = float("inf")
    for node_id, data in graph.nodes(data=True):
        node_lat, node_lon = data["y"], data["x"]
        dist = haversine_miles(lat, lon, node_lat, node_lon)
        if dist < best_dist_miles:
            best_dist_miles = dist
            best_node = node_id
    assert best_node is not None
    return best_node, best_dist_miles * _METERS_PER_MILE


def route_between_points(
    graph: nx.MultiDiGraph[int],
    mode: NetworkMode,
    origin_id: str,
    origin_lat: float,
    origin_lon: float,
    destination_id: str,
    dest_lat: float,
    dest_lon: float,
    nearest_nodes_fn: object | None = None,
) -> NetworkRouteResult:
    """Single origin-destination shortest path by network distance (meters,
    via the `length` edge attribute OSMnx populates). Duration uses the
    `travel_time` edge attribute where present (added by
    `ox.routing.add_edge_travel_times` during graph build); falls back to
    None (not a fabricated number) if the graph has no travel-time
    attribute.

    `nearest_nodes_fn(graph, lon, lat) -> node_id` lets callers inject
    OSMnx's fast KD-tree-based `nearest_nodes` for large real graphs;
    defaults to a brute-force haversine scan suitable for small test graphs.
    """
    method = METHOD_LABELS[mode]

    if nearest_nodes_fn is not None:
        origin_node = nearest_nodes_fn(graph, origin_lon, origin_lat)  # type: ignore[operator]
        dest_node = nearest_nodes_fn(graph, dest_lon, dest_lat)  # type: ignore[operator]
    else:
        origin_snap = _snap_node(graph, origin_lat, origin_lon)
        dest_snap = _snap_node(graph, dest_lat, dest_lon)
        if origin_snap is None or dest_snap is None:
            return NetworkRouteResult(
                origin_id, destination_id, mode, None, None, "unavailable", method,
                unavailable_reason="Routing graph has no nodes.",
            )
        origin_node, origin_snap_dist = origin_snap
        dest_node, dest_snap_dist = dest_snap
        if origin_snap_dist > _MAX_SNAP_DISTANCE_MILES:
            return NetworkRouteResult(
                origin_id, destination_id, mode, None, None, "unavailable", method,
                unavailable_reason=(
                    f"Origin is {origin_snap_dist:.2f} mi from the nearest routable "
                    f"node (over the {_MAX_SNAP_DISTANCE_MILES} mi snap threshold)."
                ),
            )
        if dest_snap_dist > _MAX_SNAP_DISTANCE_MILES:
            return NetworkRouteResult(
                origin_id, destination_id, mode, None, None, "unavailable", method,
                unavailable_reason=(
                    f"Destination is {dest_snap_dist:.2f} mi from the nearest routable "
                    f"node (over the {_MAX_SNAP_DISTANCE_MILES} mi snap threshold)."
                ),
            )

    try:
        distance_meters = nx.shortest_path_length(
            graph, origin_node, dest_node, weight="length"
        )
    except nx.NetworkXNoPath:
        return NetworkRouteResult(
            origin_id, destination_id, mode, None, None, "unavailable", method,
            unavailable_reason="No connected path exists between origin and destination "
            "in the routable network (advanced route unavailable; screening distance "
            "available separately).",
        )
    except nx.NodeNotFound as exc:
        return NetworkRouteResult(
            origin_id, destination_id, mode, None, None, "unavailable", method,
            unavailable_reason=f"Node not found in routing graph: {exc}",
        )

    duration_minutes: float | None = None
    has_travel_time = any("travel_time" in d for _, _, d in graph.edges(data=True))
    if has_travel_time:
        try:
            duration_seconds = nx.shortest_path_length(
                graph, origin_node, dest_node, weight="travel_time"
            )
            duration_minutes = duration_seconds / 60.0
        except nx.NetworkXNoPath:
            duration_minutes = None

    return NetworkRouteResult(
        origin_id=origin_id,
        destination_id=destination_id,
        mode=mode,
        distance_miles=distance_meters / _METERS_PER_MILE,
        duration_minutes=duration_minutes,
        status="routed",
        method=method,
    )


def shortest_distances_from_origin(
    graph: nx.MultiDiGraph[int],
    mode: NetworkMode,
    origin_id: str,
    origin_lat: float,
    origin_lon: float,
    destinations: list[tuple[str, float, float]],
    cutoff_miles: float,
    nearest_nodes_fn: object | None = None,
    nearest_nodes_batch_fn: object | None = None,
) -> list[NetworkRouteResult]:
    """One-to-many shortest distances via a single Dijkstra run from the
    origin (efficient for population-origin-to-many-facilities batch use --
    O(V log V + E) once per origin rather than once per origin-destination
    pair). Destinations beyond `cutoff_miles` network distance are returned
    as `status="unavailable"` (out of range), not silently dropped from the
    result list, so callers always get one result per requested destination.

    `nearest_nodes_batch_fn(graph, lons, lats) -> list[node_id]` snaps all
    destinations in a single vectorized call (e.g. OSMnx's
    `nearest_nodes(G, X=lons, Y=lats)`, which builds its spatial index once).
    Strongly recommended whenever `destinations` is large (hundreds+) on a
    real graph -- calling a single-point `nearest_nodes_fn` once per
    destination rebuilds that index every time and does not scale (a real
    performance defect found and fixed during Phase 6 live verification:
    3,000+ individual snap calls against the 277k-node walk graph took long
    enough to look like a hang).
    """
    method = METHOD_LABELS[mode]

    if nearest_nodes_fn is not None:
        origin_node = nearest_nodes_fn(graph, origin_lon, origin_lat)  # type: ignore[operator]
    else:
        origin_snap = _snap_node(graph, origin_lat, origin_lon)
        if origin_snap is None:
            return [
                NetworkRouteResult(
                    origin_id, dest_id, mode, None, None, "unavailable", method,
                    unavailable_reason="Routing graph has no nodes.",
                )
                for dest_id, _, _ in destinations
            ]
        origin_node, origin_snap_dist = origin_snap
        if origin_snap_dist > _MAX_SNAP_DISTANCE_MILES:
            return [
                NetworkRouteResult(
                    origin_id, dest_id, mode, None, None, "unavailable", method,
                    unavailable_reason=(
                        f"Origin is {origin_snap_dist:.2f} mi from the nearest "
                        f"routable node (over the {_MAX_SNAP_DISTANCE_MILES} mi "
                        "snap threshold)."
                    ),
                )
                for dest_id, _, _ in destinations
            ]

    cutoff_meters = cutoff_miles * _METERS_PER_MILE
    lengths = nx.single_source_dijkstra_path_length(
        graph, origin_node, cutoff=cutoff_meters, weight="length"
    )

    # A second single-source Dijkstra run (by travel_time rather than
    # length) so callers get real durations, not just distances -- the
    # same edge attribute `route_between_points` uses, computed once per
    # origin here rather than once per destination. `travel_time`'s units
    # (seconds) differ from `length`'s (meters), so the distance-based
    # cutoff above cannot be reused directly; this floor speed must stay
    # BELOW the slowest speed actually assigned to any edge (walk mode's
    # constant 5 km/h = 1.39 m/s is the slowest in this codebase) so the
    # resulting time cutoff never excludes a node the distance search
    # already found reachable.
    _MIN_PLAUSIBLE_SPEED_MPS = 1.0
    durations_seconds: dict[int, float] | None = None
    has_travel_time = any("travel_time" in d for _, _, d in graph.edges(data=True))
    if has_travel_time:
        time_cutoff_seconds = cutoff_meters / _MIN_PLAUSIBLE_SPEED_MPS
        durations_seconds = nx.single_source_dijkstra_path_length(
            graph, origin_node, cutoff=time_cutoff_seconds, weight="travel_time"
        )

    batch_dest_nodes: list[int] | None = None
    if nearest_nodes_batch_fn is not None and destinations:
        lons = [d[2] for d in destinations]
        lats = [d[1] for d in destinations]
        batch_dest_nodes = list(nearest_nodes_batch_fn(graph, lons, lats))  # type: ignore[operator]

    results: list[NetworkRouteResult] = []
    for i, (dest_id, dest_lat, dest_lon) in enumerate(destinations):
        if batch_dest_nodes is not None:
            dest_node = batch_dest_nodes[i]
            dest_snap_dist = 0.0
        elif nearest_nodes_fn is not None:
            dest_node = nearest_nodes_fn(graph, dest_lon, dest_lat)  # type: ignore[operator]
            dest_snap_dist = 0.0
        else:
            dest_snap = _snap_node(graph, dest_lat, dest_lon)
            if dest_snap is None:
                results.append(
                    NetworkRouteResult(
                        origin_id, dest_id, mode, None, None, "unavailable", method,
                        unavailable_reason="Routing graph has no nodes.",
                    )
                )
                continue
            dest_node, dest_snap_dist = dest_snap
            if dest_snap_dist > _MAX_SNAP_DISTANCE_MILES:
                results.append(
                    NetworkRouteResult(
                        origin_id, dest_id, mode, None, None, "unavailable", method,
                        unavailable_reason=(
                            f"Destination is {dest_snap_dist:.2f} mi from the nearest "
                            f"routable node (over the {_MAX_SNAP_DISTANCE_MILES} mi "
                            "snap threshold)."
                        ),
                    )
                )
                continue

        if dest_node not in lengths:
            results.append(
                NetworkRouteResult(
                    origin_id, dest_id, mode, None, None, "unavailable", method,
                    unavailable_reason=(
                        f"No connected path within the {cutoff_miles} mi network-"
                        "distance cutoff (advanced route unavailable; screening "
                        "distance available separately)."
                    ),
                )
            )
            continue

        duration_minutes: float | None = None
        if durations_seconds is not None and dest_node in durations_seconds:
            duration_minutes = durations_seconds[dest_node] / 60.0

        results.append(
            NetworkRouteResult(
                origin_id=origin_id,
                destination_id=dest_id,
                mode=mode,
                distance_miles=lengths[dest_node] / _METERS_PER_MILE,
                duration_minutes=duration_minutes,
                status="routed",
                method=method,
            )
        )
    return results


def graph_cache_paths(repo_root: Path, mode: NetworkMode) -> tuple[Path, Path]:
    """Returns (graphml_path, metadata_json_path) for a cached graph."""
    cache_dir = repo_root / "data" / "raw" / "osm_network"
    return cache_dir / f"{mode}_graph.graphml", cache_dir / f"{mode}_metadata.json"


def load_cached_graph(repo_root: Path, mode: NetworkMode) -> nx.MultiDiGraph[int]:
    """Loads a previously-downloaded-and-cached graph from disk. Raises
    FileNotFoundError (not a silent empty graph) if the cache doesn't
    exist -- run `run_build_network_graphs.py` first."""
    import osmnx as ox

    graphml_path, _ = graph_cache_paths(repo_root, mode)
    if not graphml_path.exists():
        raise FileNotFoundError(
            f"No cached {mode} network graph at {graphml_path}. "
            "Run `python -m scc_health_pipeline.run_build_network_graphs` first."
        )
    graph: nx.MultiDiGraph[int] = ox.load_graphml(graphml_path)
    return graph


def load_cache_metadata(repo_root: Path, mode: NetworkMode) -> dict[str, object]:
    _, metadata_path = graph_cache_paths(repo_root, mode)
    if not metadata_path.exists():
        return {}
    return dict(json.loads(metadata_path.read_text()))
