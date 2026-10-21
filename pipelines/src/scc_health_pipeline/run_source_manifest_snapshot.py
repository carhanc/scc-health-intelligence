"""Last step of `make data`: copy the source manifest into the warehouse so the
real retrieval date of every source is released together with the data.

Usage:
    uv run --package scc-health-pipeline python -m \
        scc_health_pipeline.run_source_manifest_snapshot
"""

from __future__ import annotations

import collections
from pathlib import Path

import duckdb

from scc_health_pipeline.sources.manifest import load_manifest
from scc_health_pipeline.sources.manifest_snapshot import write_source_manifest_snapshot

REPO_ROOT = Path(__file__).resolve().parents[3]
WAREHOUSE_PATH = REPO_ROOT / "warehouse" / "scc_health.duckdb"


def main() -> None:
    entries = load_manifest()
    conn = duckdb.connect(str(WAREHOUSE_PATH))
    try:
        count = write_source_manifest_snapshot(conn, entries)
    finally:
        conn.close()
    by_status = collections.Counter(e.get("status") for e in entries)
    oldest = min(e["retrieved_at"] for e in entries)[:10]
    newest = max(e["retrieved_at"] for e in entries)[:10]
    print(
        f"Wrote meta.source_manifest: {count} entries {dict(by_status)}, "
        f"retrieved {oldest} to {newest}."
    )


if __name__ == "__main__":
    main()
