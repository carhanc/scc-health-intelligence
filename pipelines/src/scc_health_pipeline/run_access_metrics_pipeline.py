"""Phase 6 orchestration: computes real network-based accessibility
metrics for every population-weighted block-group origin --
nearest-clinical-care-facility distance/time (walk + drive), nearest
scheduled-transit stop, and E2SFCA catchment accessibility -- and writes
the results into the `analytics` warehouse schema.

All three reuse the SAME per-origin network Dijkstra pass
(`descriptive_access.all_facility_distances()`) rather than re-routing
per metric, since a second full pass over ~1,173 origins would roughly
double this already multi-minute batch step for no additional accuracy.

This is a genuinely long-running batch step (live-measured: ~0.5s/origin
for drive, ~2.1s/origin for walk, ~1.3s/origin for transit -- roughly
50-80 minutes total across 1,173 real Santa Clara County block-group
origins), analogous in spirit to `run_build_network_graphs.py`'s
multi-minute live download: a batch pipeline step, not something computed
per API request. Progress is logged every 25 origins so a background run
is observable.

Usage: uv run --package scc-health-pipeline python -m \
    scc_health_pipeline.run_access_metrics_pipeline
"""

from __future__ import annotations

import sys
import time
from pathlib import Path

import duckdb
import networkx as nx
import osmnx as ox

from scc_health_pipeline.analytics.e2sfca import (
    FacilitySupply,
    OriginDemand,
    compute_facility_supply_ratios,
    compute_origin_accessibility,
)
from scc_health_pipeline.routing.descriptive_access import (
    CanonicalFacilityPoint,
    all_facility_distances,
    nearest_facility_by_category,
)
from scc_health_pipeline.routing.network_osm import NetworkMode, load_cached_graph
from scc_health_pipeline.routing.transit_access import (
    TransitStopService,
    compute_weekday_stop_service_levels,
    nearest_transit_access,
)

REPO_ROOT = Path(__file__).resolve().parents[3]
WAREHOUSE_PATH = REPO_ROOT / "warehouse" / "scc_health.duckdb"

_PROGRESS_EVERY = 25

# E2SFCA catchment radius / Gaussian sigma per mode -- standard
# accessibility-research magnitudes for primary/acute clinical care
# (walk: ~1-2mi is a conventional walkable-care catchment; drive: ~15mi
# covers a ~20-30 min suburban/rural drive), not derived from this
# project's own data. Both are well within the wider cutoffs used for
# the nearest-facility search above, so no extra routing is needed --
# E2SFCA's Gaussian decay naturally zeroes out anything beyond its own
# (smaller) catchment radius.
_E2SFCA_PARAMS: dict[NetworkMode, tuple[float, float]] = {
    "walk": (2.0, 1.0),
    "drive": (15.0, 7.5),
}


def _nn(graph: nx.MultiDiGraph[int], lon: float, lat: float) -> int:
    return int(ox.distance.nearest_nodes(graph, lon, lat))


def _nn_batch(
    graph: nx.MultiDiGraph[int], lons: list[float], lats: list[float]
) -> list[int]:
    result = ox.distance.nearest_nodes(graph, lons, lats)
    return [int(x) for x in result]


def _load_canonical_facilities(conn: duckdb.DuckDBPyConnection) -> list[CanonicalFacilityPoint]:
    rows = conn.execute(
        "SELECT canonical_resource_id, category, latitude, longitude "
        "FROM resources.canonical_facilities "
        "WHERE category IN ('hospital', 'clinic') AND coordinate_quality = 'valid'"
    ).fetchall()
    return [CanonicalFacilityPoint(r[0], r[1], r[2], r[3]) for r in rows]


def _load_facility_supply(
    conn: duckdb.DuckDBPyConnection, facilities: list[CanonicalFacilityPoint]
) -> list[FacilitySupply]:
    """Real capacity (HCAI licensed beds) for hospitals where the crosswalk
    resolves to an HCAI source record; a count proxy (capacity=1) for
    every other clinical-care facility, including any hospital whose
    crosswalk lookup fails (never silently treated as zero capacity --
    the count-proxy fallback keeps it present with a disclosed method)."""
    bed_rows = conn.execute(
        """
        SELECT cf.canonical_resource_id, h.licensed_beds
        FROM resources.canonical_facilities cf
        JOIN resources.facility_source_crosswalk cw
            ON cw.canonical_resource_id = cf.canonical_resource_id AND cw.source_id = 'hcai'
        JOIN resources.hcai_facilities h ON h.oshpd_id = cw.source_specific_id
        WHERE cf.category = 'hospital' AND h.licensed_beds IS NOT NULL
        """
    ).fetchall()
    beds_by_id = {}
    for facility_id, beds_str in bed_rows:
        try:
            beds_by_id[facility_id] = float(beds_str)
        except (TypeError, ValueError):
            continue

    supply = []
    for f in facilities:
        if f.category == "hospital" and f.canonical_resource_id in beds_by_id:
            supply.append(
                FacilitySupply(
                    f.canonical_resource_id, f.category,
                    capacity=beds_by_id[f.canonical_resource_id], capacity_type="real_capacity",
                )
            )
        else:
            supply.append(
                FacilitySupply(
                    f.canonical_resource_id, f.category, capacity=1.0, capacity_type="count_proxy"
                )
            )
    return supply


def _load_origins(conn: duckdb.DuckDBPyConnection) -> list[tuple[str, str, float, float, int]]:
    return conn.execute(
        "SELECT block_group_geoid, tract_geoid_2020, latitude, longitude, population "
        "FROM geo.block_group_population_origins "
        "WHERE latitude IS NOT NULL AND longitude IS NOT NULL"
    ).fetchall()


def _create_tables(conn: duckdb.DuckDBPyConnection) -> None:
    conn.execute("CREATE SCHEMA IF NOT EXISTS analytics")
    conn.execute("DROP TABLE IF EXISTS analytics.network_access_metrics")
    conn.execute(
        """
        CREATE TABLE analytics.network_access_metrics (
            block_group_geoid VARCHAR,
            tract_geoid_2020 VARCHAR,
            mode VARCHAR,
            category VARCHAR,
            status VARCHAR,
            nearest_facility_id VARCHAR,
            distance_miles DOUBLE,
            duration_minutes DOUBLE,
            method VARCHAR,
            unavailable_reason VARCHAR
        )
        """
    )
    conn.execute("DROP TABLE IF EXISTS analytics.transit_access_metrics")
    conn.execute(
        """
        CREATE TABLE analytics.transit_access_metrics (
            block_group_geoid VARCHAR,
            tract_geoid_2020 VARCHAR,
            status VARCHAR,
            nearest_stop_id VARCHAR,
            nearest_stop_name VARCHAR,
            walk_distance_miles DOUBLE,
            n_trips_in_window INTEGER,
            headway_minutes DOUBLE,
            service_level VARCHAR,
            method VARCHAR,
            service_window VARCHAR,
            unavailable_reason VARCHAR
        )
        """
    )
    conn.execute("DROP TABLE IF EXISTS analytics.e2sfca_accessibility")
    conn.execute(
        """
        CREATE TABLE analytics.e2sfca_accessibility (
            block_group_geoid VARCHAR,
            tract_geoid_2020 VARCHAR,
            mode VARCHAR,
            category VARCHAR,
            capacity_type VARCHAR,
            accessibility_score DOUBLE,
            n_facilities_in_catchment INTEGER,
            catchment_radius_miles DOUBLE,
            sigma_miles DOUBLE,
            method VARCHAR
        )
        """
    )


def main() -> int:
    if not WAREHOUSE_PATH.exists():
        print(f"Warehouse not found at {WAREHOUSE_PATH}. Run `make data` first.")
        return 1

    conn = duckdb.connect(str(WAREHOUSE_PATH), read_only=False)
    try:
        facilities = _load_canonical_facilities(conn)
        facility_supply = _load_facility_supply(conn, facilities)
        origins = _load_origins(conn)
        stop_services: list[TransitStopService] = compute_weekday_stop_service_levels(conn)
        n_real_capacity = sum(1 for f in facility_supply if f.capacity_type == "real_capacity")
        print(f"Loaded {len(facilities)} candidate clinical-care facilities "
              f"({n_real_capacity} with real capacity, "
              f"{len(facility_supply) - n_real_capacity} count-proxy), "
              f"{len(origins)} population origins, {len(stop_services)} transit stops.")

        print("Loading cached OSM network graphs (drive, walk)...")
        g_drive = load_cached_graph(REPO_ROOT, "drive")
        g_walk = load_cached_graph(REPO_ROOT, "walk")
        graphs: dict[NetworkMode, nx.MultiDiGraph[int]] = {"drive": g_drive, "walk": g_walk}

        _create_tables(conn)

        network_rows: list[tuple[object, ...]] = []
        transit_rows: list[tuple[object, ...]] = []
        # (mode, origin_id, facility_id) -> distance_miles, collected for E2SFCA.
        e2sfca_distances: dict[NetworkMode, dict[tuple[str, str], float]] = {
            "drive": {}, "walk": {},
        }

        route_modes: list[NetworkMode] = ["drive", "walk"]
        t_start = time.time()
        for i, (bg_geoid, tract_geoid, lat, lon, _population) in enumerate(origins, start=1):
            for mode_typed in route_modes:
                mode = mode_typed
                graph = graphs[mode_typed]
                distances = all_facility_distances(
                    graph, mode_typed, bg_geoid, lat, lon, facilities,
                    nearest_nodes_fn=_nn, nearest_nodes_batch_fn=_nn_batch,
                )
                for facility_id, route in distances.items():
                    if route.distance_miles is not None:
                        e2sfca_distances[mode_typed][(bg_geoid, facility_id)] = route.distance_miles

                nearest_results = nearest_facility_by_category(
                    graph, mode_typed, bg_geoid, lat, lon, facilities,
                    precomputed_distances=distances,
                )
                for r in nearest_results:
                    network_rows.append((
                        bg_geoid, tract_geoid, mode, r.category, r.result.status,
                        r.result.destination_id, r.result.distance_miles,
                        r.result.duration_minutes, r.result.method,
                        r.result.unavailable_reason,
                    ))

            transit_result = nearest_transit_access(
                g_walk, bg_geoid, lat, lon, stop_services,
                nearest_nodes_fn=_nn, nearest_nodes_batch_fn=_nn_batch,
            )
            transit_rows.append((
                bg_geoid, tract_geoid, transit_result.status,
                transit_result.nearest_stop_id, transit_result.nearest_stop_name,
                transit_result.walk_distance_miles, transit_result.n_trips_in_window,
                transit_result.headway_minutes, transit_result.service_level,
                transit_result.method, transit_result.service_window,
                transit_result.unavailable_reason,
            ))

            if i % _PROGRESS_EVERY == 0 or i == len(origins):
                elapsed = time.time() - t_start
                rate = elapsed / i
                remaining = rate * (len(origins) - i)
                print(f"  [{i}/{len(origins)}] elapsed={elapsed / 60:.1f}min "
                      f"est_remaining={remaining / 60:.1f}min", flush=True)

        conn.executemany(
            "INSERT INTO analytics.network_access_metrics VALUES "
            "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            network_rows,
        )
        conn.executemany(
            "INSERT INTO analytics.transit_access_metrics VALUES "
            "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            transit_rows,
        )

        origin_demands = [
            OriginDemand(bg_geoid, float(population))
            for bg_geoid, _tract, _lat, _lon, population in origins
        ]
        e2sfca_rows: list[tuple[object, ...]] = []
        for mode_typed, (catchment_radius, sigma) in _E2SFCA_PARAMS.items():
            ratios = compute_facility_supply_ratios(
                facility_supply, origin_demands, e2sfca_distances[mode_typed],
                catchment_radius, sigma,
            )
            results = compute_origin_accessibility(
                facility_supply, origin_demands, e2sfca_distances[mode_typed], ratios,
                catchment_radius, sigma,
            )
            tract_by_bg = {bg: tract for bg, tract, _lat, _lon, _pop in origins}
            for e2sfca_result in results:
                e2sfca_rows.append((
                    e2sfca_result.origin_id, tract_by_bg.get(e2sfca_result.origin_id),
                    mode_typed, e2sfca_result.category, e2sfca_result.capacity_type,
                    e2sfca_result.accessibility_score, e2sfca_result.n_facilities_in_catchment,
                    catchment_radius, sigma, e2sfca_result.method,
                ))
        conn.executemany(
            "INSERT INTO analytics.e2sfca_accessibility VALUES "
            "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            e2sfca_rows,
        )

        n_network_routed = sum(1 for r in network_rows if r[4] == "routed")
        n_transit_routed = sum(1 for r in transit_rows if r[2] == "routed")
        print(f"Wrote {len(network_rows)} network_access_metrics rows "
              f"({n_network_routed} routed, {len(network_rows) - n_network_routed} unavailable).")
        print(f"Wrote {len(transit_rows)} transit_access_metrics rows "
              f"({n_transit_routed} routed, {len(transit_rows) - n_transit_routed} unavailable).")
        print(f"Wrote {len(e2sfca_rows)} e2sfca_accessibility rows.")
        print(f"Total time: {(time.time() - t_start) / 60:.1f} minutes.")
        return 0
    finally:
        conn.close()


if __name__ == "__main__":
    sys.exit(main())
