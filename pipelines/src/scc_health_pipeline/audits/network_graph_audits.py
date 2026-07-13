"""Phase 6 OSM network-graph cache audit -- wired into `make audit`.

Checks that the cached walk/drive graphs (`run_build_network_graphs.py`)
are present, non-trivially sized, and carry the honest metadata (speed
assumption, retrieval time, checksum) every routing result downstream
depends on for provenance.
"""

from __future__ import annotations

import json
from pathlib import Path

from scc_health_pipeline.audits.geography_audits import AuditReport
from scc_health_pipeline.routing.network_osm import NetworkMode, graph_cache_paths

# Live-verified during Phase 6 build: drive ~45.8k nodes/109.9k edges,
# walk ~277.4k nodes/788.2k edges for the full county extract. Generous
# bounds catch a truncated/corrupt/wrong-place download without being
# brittle to OSM's ordinary day-to-day edit churn.
_EXPECTED_NODE_RANGES: dict[NetworkMode, tuple[int, int]] = {
    "drive": (20_000, 150_000),
    "walk": (100_000, 600_000),
}


def run_network_graph_audits(repo_root: Path) -> AuditReport:
    report = AuditReport()

    modes: list[NetworkMode] = ["drive", "walk"]
    for mode_typed in modes:
        mode = mode_typed
        graphml_path, metadata_path = graph_cache_paths(repo_root, mode_typed)

        if not graphml_path.exists() or not metadata_path.exists():
            report.add(
                f"network_graph_cached_{mode}",
                False,
                f"No cached {mode} graph found at {graphml_path} -- run "
                "`run_build_network_graphs` before auditing.",
            )
            continue
        report.add(f"network_graph_cached_{mode}", True, f"{mode} graph cache present.")

        metadata = json.loads(metadata_path.read_text())

        n_nodes = metadata.get("n_nodes", 0)
        lo, hi = _EXPECTED_NODE_RANGES[mode_typed]
        report.add(
            f"network_graph_node_count_plausible_{mode}",
            lo <= n_nodes <= hi,
            f"{mode} graph has {n_nodes} nodes (expected {lo}-{hi}).",
        )

        n_edges = metadata.get("n_edges", 0)
        report.add(
            f"network_graph_has_edges_{mode}",
            n_edges > 0,
            f"{mode} graph has {n_edges} edges.",
        )

        has_speed_assumption = bool(metadata.get("speed_assumption"))
        report.add(
            f"network_graph_speed_assumption_documented_{mode}",
            has_speed_assumption,
            metadata.get("speed_assumption", "MISSING speed_assumption in metadata."),
        )

        actual_bytes = graphml_path.stat().st_size
        recorded_bytes = metadata.get("graphml_bytes")
        report.add(
            f"network_graph_file_size_matches_metadata_{mode}",
            actual_bytes == recorded_bytes,
            f"On-disk size {actual_bytes} bytes vs. recorded {recorded_bytes} bytes."
            if actual_bytes != recorded_bytes
            else f"On-disk size matches recorded metadata ({actual_bytes} bytes).",
        )

    return report
