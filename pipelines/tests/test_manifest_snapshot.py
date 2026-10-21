"""The source manifest snapshot that ships inside the warehouse."""

from __future__ import annotations

import json
from datetime import UTC, datetime

import duckdb
import pytest
from scc_health_pipeline.sources.manifest_snapshot import write_source_manifest_snapshot

ENTRIES = [
    {
        "source_id": "hrsa_mua_p",
        "resource_id": "mua_p",
        "retrieved_at": "2026-10-20T23:34:14+00:00",
        "status": "success",
        "publisher": "HRSA",
    },
    {
        "source_id": "ca_hpi_3_0",
        "resource_id": "n/a",
        "retrieved_at": "2026-10-20T22:12:08+00:00",
        "status": "unavailable",
    },
]


def test_snapshot_keeps_every_entry_and_its_real_retrieval_time() -> None:
    conn = duckdb.connect(":memory:")
    count = write_source_manifest_snapshot(conn, ENTRIES, datetime(2026, 10, 21, tzinfo=UTC))
    assert count == 2

    rows = conn.execute(
        "SELECT source_id, retrieved_at, status, entry_json FROM meta.source_manifest "
        "ORDER BY source_id"
    ).fetchall()
    assert [r[0] for r in rows] == ["ca_hpi_3_0", "hrsa_mua_p"]
    assert rows[1][1] == "2026-10-20T23:34:14+00:00"
    assert rows[0][2] == "unavailable"
    # The full entry round-trips, so the API can rebuild exactly what the file held.
    assert json.loads(rows[1][3]) == ENTRIES[0]


def test_running_it_again_replaces_the_snapshot_not_appends() -> None:
    conn = duckdb.connect(":memory:")
    write_source_manifest_snapshot(conn, ENTRIES)
    write_source_manifest_snapshot(conn, ENTRIES[:1])
    assert conn.execute("SELECT COUNT(*) FROM meta.source_manifest").fetchone()[0] == 1


def test_refuses_an_empty_manifest_or_an_entry_with_no_retrieval_time() -> None:
    conn = duckdb.connect(":memory:")
    with pytest.raises(ValueError):
        write_source_manifest_snapshot(conn, [])
    with pytest.raises(ValueError):
        write_source_manifest_snapshot(conn, [{"source_id": "x", "status": "success"}])
