"""Snapshot the source manifest into the warehouse.

DATA_MANIFEST.json records, for every source, when it was actually retrieved
and whether the retrieval worked. That file lives in the code checkout, so on
its own it cannot travel with a published data release: a new warehouse would
arrive next to old dates. This writes the same entries into `meta.source_manifest`
inside the warehouse at the end of a build, so the dates ship with the data they
describe and the API reads them from there.
"""

from __future__ import annotations

import json
from datetime import UTC, datetime
from typing import Any

import duckdb

SNAPSHOT_SCHEMA = "meta"
SNAPSHOT_TABLE = "source_manifest"


def write_source_manifest_snapshot(
    conn: duckdb.DuckDBPyConnection,
    entries: list[dict[str, Any]],
    snapshot_at: datetime | None = None,
) -> int:
    """Replace `meta.source_manifest` with `entries`. Returns the row count.

    Refuses an empty manifest or an entry with no source_id or retrieval time,
    because a snapshot that silently drops dates is worse than no snapshot.
    """
    if not entries:
        raise ValueError("Refusing to snapshot an empty source manifest.")
    for entry in entries:
        if not entry.get("source_id") or not entry.get("retrieved_at"):
            raise ValueError(f"Manifest entry is missing source_id or retrieved_at: {entry!r}")

    stamp = (snapshot_at or datetime.now(UTC)).isoformat()
    conn.execute(f"CREATE SCHEMA IF NOT EXISTS {SNAPSHOT_SCHEMA}")
    conn.execute(f"DROP TABLE IF EXISTS {SNAPSHOT_SCHEMA}.{SNAPSHOT_TABLE}")
    conn.execute(
        f"""
        CREATE TABLE {SNAPSHOT_SCHEMA}.{SNAPSHOT_TABLE} (
            source_id VARCHAR,
            resource_id VARCHAR,
            retrieved_at VARCHAR,
            status VARCHAR,
            entry_json VARCHAR,
            snapshot_at VARCHAR
        )
        """  # noqa: S608 -- constant identifiers
    )
    conn.executemany(
        f"INSERT INTO {SNAPSHOT_SCHEMA}.{SNAPSHOT_TABLE} VALUES (?, ?, ?, ?, ?, ?)",  # noqa: S608
        [
            (
                e["source_id"],
                e.get("resource_id"),
                e["retrieved_at"],
                e.get("status"),
                json.dumps(e, sort_keys=True),
                stamp,
            )
            for e in entries
        ],
    )
    return len(entries)
