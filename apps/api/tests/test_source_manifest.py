"""Retrieval dates come from the warehouse snapshot, with the file as a fallback."""

from __future__ import annotations

import json
from pathlib import Path

import duckdb
import pytest
from scc_health_api.services import source_manifest
from scc_health_api.services.freshness import classify_freshness
from scc_health_api.services.source_manifest import load_source_manifest

FILE_ENTRY = {
    "source_id": "hrsa_mua_p",
    "resource_id": "mua_p",
    "retrieved_at": "2026-07-15T00:00:00+00:00",
    "status": "success",
}
WAREHOUSE_ENTRY = {**FILE_ENTRY, "retrieved_at": "2026-10-20T23:34:14+00:00"}


@pytest.fixture()
def manifest_file(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    path = tmp_path / "DATA_MANIFEST.json"
    path.write_text(json.dumps([FILE_ENTRY]))
    monkeypatch.setattr(source_manifest, "DATA_MANIFEST_PATH", path)


def _warehouse_with_snapshot() -> duckdb.DuckDBPyConnection:
    conn = duckdb.connect(":memory:")
    conn.execute("CREATE SCHEMA meta")
    conn.execute(
        "CREATE TABLE meta.source_manifest (source_id VARCHAR, resource_id VARCHAR, "
        "retrieved_at VARCHAR, status VARCHAR, entry_json VARCHAR, snapshot_at VARCHAR)"
    )
    conn.execute(
        "INSERT INTO meta.source_manifest VALUES (?, ?, ?, ?, ?, ?)",
        [
            "hrsa_mua_p",
            "mua_p",
            WAREHOUSE_ENTRY["retrieved_at"],
            "success",
            json.dumps(WAREHOUSE_ENTRY),
            "2026-10-21T00:00:00+00:00",
        ],
    )
    return conn


def test_warehouse_snapshot_wins_over_the_checked_out_file(manifest_file: None) -> None:
    entries = load_source_manifest(_warehouse_with_snapshot())
    assert entries == [WAREHOUSE_ENTRY]


def test_falls_back_to_the_file_when_the_warehouse_has_no_snapshot(manifest_file: None) -> None:
    assert load_source_manifest(duckdb.connect(":memory:")) == [FILE_ENTRY]
    assert load_source_manifest(None) == [FILE_ENTRY]


def test_a_refreshed_release_moves_a_source_out_of_stale(manifest_file: None) -> None:
    """The reported bug: old dates in the file, fresh dates in the released data."""
    from datetime import UTC, datetime

    now = datetime(2026, 10, 21, tzinfo=UTC)
    assert classify_freshness(FILE_ENTRY, now) == "stale"
    assert classify_freshness(load_source_manifest(_warehouse_with_snapshot())[0], now) == (
        "newest_verified"
    )
