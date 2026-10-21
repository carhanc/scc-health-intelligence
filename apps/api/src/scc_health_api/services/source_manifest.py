"""Where the API gets each data source's retrieval date and status.

The dates have to travel with the data they describe. The pipeline snapshots
the source manifest into the warehouse (`meta.source_manifest`) at the end of
every build, so a published release carries the real retrieval time of every
source it contains. Reading from the warehouse first means a refreshed release
updates the "last retrieved" dates and the freshness labels with it, with no
separate file to keep in step.

If the warehouse has no snapshot (an older release, or a development warehouse
built before this existed), fall back to the DATA_MANIFEST.json file in the
code checkout, which is what the API read before.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import duckdb

REPO_ROOT = Path(__file__).resolve().parents[5]
DATA_MANIFEST_PATH = REPO_ROOT / "DATA_MANIFEST.json"

SNAPSHOT_TABLE = "meta.source_manifest"


def _load_file() -> list[dict[str, Any]]:
    if not DATA_MANIFEST_PATH.exists():
        return []
    with DATA_MANIFEST_PATH.open(encoding="utf-8") as fh:
        data: list[dict[str, Any]] = json.load(fh)
    return data


def load_source_manifest(conn: duckdb.DuckDBPyConnection | None = None) -> list[dict[str, Any]]:
    """Every source's manifest entry, preferring the warehouse snapshot."""
    if conn is not None:
        try:
            rows = conn.execute(
                f"SELECT entry_json FROM {SNAPSHOT_TABLE} ORDER BY source_id, resource_id"  # noqa: S608 -- constant table name
            ).fetchall()
        except duckdb.Error:
            rows = []
        if rows:
            return [json.loads(r[0]) for r in rows]
    return _load_file()
