"""Phase 6: downloads and caches the real Santa Clara County OSM walk and
drive network graphs used by `routing/network_osm.py`. A separate,
explicit step from `make data` because it is a live multi-minute Overpass
API download (live-verified: ~150s for drive, ~195s for walk) that should
be cached to disk and reused, not repeated on every pipeline run.

Usage: uv run --package scc-health-pipeline python -m scc_health_pipeline.run_build_network_graphs
"""

from __future__ import annotations

import hashlib
import json
import sys
import time
from datetime import UTC, datetime
from pathlib import Path

import networkx as nx
import osmnx as ox

from scc_health_pipeline.routing.network_osm import NetworkMode, graph_cache_paths
from scc_health_pipeline.sources.base import RawArtifact
from scc_health_pipeline.sources.manifest import record_artifact

REPO_ROOT = Path(__file__).resolve().parents[3]
_PLACE_QUERY = "Santa Clara County, California, USA"

# osmnx's add_edge_speeds() imputes free-flow speeds from OSM `maxspeed`
# tags / highway-type defaults -- appropriate for the drive graph, but
# meaningless for a walk graph (maxspeed describes vehicle speed limits,
# not how fast a pedestrian moves). osmnx's own docstring for
# add_edge_speeds() says explicitly: "If you wish to set all edge speeds
# to a single constant value (such as for a walking network), use
# nx.set_edge_attributes() ... rather than using this function." 5 km/h
# is the standard constant used in pedestrian-accessibility research
# (e.g. WHO/OSRM `foot` profile defaults).
_WALKING_SPEED_KPH = 5.0


def _checksum(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def build_and_cache_graph(mode: NetworkMode, force: bool = False) -> nx.MultiDiGraph[int]:
    graphml_path, metadata_path = graph_cache_paths(REPO_ROOT, mode)
    graphml_path.parent.mkdir(parents=True, exist_ok=True)

    if graphml_path.exists() and not force:
        print(f"[{mode}] Cached graph already exists at {graphml_path} -- skipping download "
              "(pass force=True / delete the file to refresh).")
        graph: nx.MultiDiGraph[int] = ox.load_graphml(graphml_path)
        return graph

    print(f"[{mode}] Downloading network graph for '{_PLACE_QUERY}' from OpenStreetMap "
          "via Overpass API (this can take 2-4 minutes for a county-scale extract)...")
    t0 = time.time()
    network_type = "walk" if mode == "walk" else "drive"
    graph = ox.graph_from_place(_PLACE_QUERY, network_type=network_type)
    if mode == "walk":
        # types-networkx's stub lacks an overload for the scalar-broadcast
        # form (a single value applied to every edge); this is a
        # documented, valid networkx usage pattern.
        nx.set_edge_attributes(graph, _WALKING_SPEED_KPH, "speed_kph")  # type: ignore[call-overload]
    else:
        graph = ox.routing.add_edge_speeds(graph)
    graph = ox.routing.add_edge_travel_times(graph)
    elapsed = time.time() - t0

    ox.save_graphml(graph, graphml_path)
    checksum = _checksum(graphml_path)

    metadata = {
        "mode": mode,
        "network_type": network_type,
        "place_query": _PLACE_QUERY,
        "source": "OpenStreetMap contributors, via OSMnx/Overpass API",
        "license": "Open Database License (ODbL) 1.0",
        "retrieved_at": datetime.now(UTC).isoformat(),
        "download_seconds": round(elapsed, 1),
        "n_nodes": graph.number_of_nodes(),
        "n_edges": graph.number_of_edges(),
        "graphml_sha256": checksum,
        "graphml_bytes": graphml_path.stat().st_size,
        "speed_assumption": (
            f"Constant {_WALKING_SPEED_KPH} km/h for every edge (pedestrian speed, not "
            "derived from OSM maxspeed tags)." if mode == "walk"
            else "osmnx free-flow speed imputation from OSM maxspeed tags / highway-type "
            "defaults (ox.routing.add_edge_speeds)."
        ),
    }
    metadata_path.write_text(json.dumps(metadata, indent=2))

    record_artifact(
        RawArtifact(
            resource_id=f"osm_network_{mode}",
            source_id="osm_overpass_network",
            local_path=graphml_path,
            url=f"Overpass API query for network_type={network_type}, place='{_PLACE_QUERY}'",
            sha256=checksum,
            bytes=graphml_path.stat().st_size,
            content_type="application/graphml+xml",
            retrieved_at=metadata["retrieved_at"],  # type: ignore[arg-type]
            status="success",
            notes=(
                f"{graph.number_of_nodes()} nodes, {graph.number_of_edges()} edges. "
                f"{metadata['speed_assumption']}"
            ),
        ),
        publisher="OpenStreetMap contributors",
        landing_page="https://www.openstreetmap.org/copyright",
        source_vintage="live Overpass API extract",
        release_date=None,
        native_geography="road/path network graph (not tract-aligned)",
        license_or_terms="Open Database License (ODbL) 1.0",
        adapter_version="1.0.0",
    )

    graphml_mb = graphml_path.stat().st_size / 1e6
    print(f"[{mode}] Downloaded and cached: {graph.number_of_nodes()} nodes, "
          f"{graph.number_of_edges()} edges, {elapsed:.1f}s, "
          f"{graphml_mb:.1f}MB -> {graphml_path}")
    return graph


def main() -> int:
    modes: list[NetworkMode] = ["drive", "walk"]
    for mode in modes:
        build_and_cache_graph(mode)
    print("Network graph build complete.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
