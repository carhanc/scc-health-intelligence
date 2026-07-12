"""Source status and data-explorer routes.

/api/v1/sources reads DATA_MANIFEST.json (server-side file, not the
warehouse) so source provenance is visible even before `make data` has
been run, and remains visible if the warehouse becomes unavailable.
/api/v1/data-explorer and /api/v1/data-explorer/{schema}/{table} read the
warehouse directly to expose real table row counts and a bounded preview,
for the internal transparency tool (not a public analytics page).
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import duckdb
from fastapi import APIRouter, Depends, HTTPException

from scc_health_api.db import get_read_only_connection, resolve_warehouse_path
from scc_health_api.schemas.geography import (
    DataExplorerResponse,
    DataExplorerTable,
    DataExplorerTablePreview,
    SourceStatusEntry,
    SourceStatusResponse,
)
from scc_health_api.services.freshness import classify_freshness
from scc_health_api.services.table_registry import ALL_TABLES, SOURCE_TO_TABLES
from scc_health_api.settings import Settings, get_settings

router = APIRouter(prefix="/api/v1", tags=["sources"])

REPO_ROOT = Path(__file__).resolve().parents[5]
MANIFEST_PATH = REPO_ROOT / "DATA_MANIFEST.json"

# A preview must never return an unbounded table (e.g. 427k GTFS stop_times
# rows) to a browser tab.
_PREVIEW_ROW_LIMIT = 50


def _load_manifest() -> list[dict[str, Any]]:
    if not MANIFEST_PATH.exists():
        return []
    with MANIFEST_PATH.open(encoding="utf-8") as fh:
        data: list[dict[str, Any]] = json.load(fh)
    return data


def _table_exists(conn: duckdb.DuckDBPyConnection, schema: str, table: str) -> bool:
    row = conn.execute(
        "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = ? AND table_name = ?",
        [schema, table],
    ).fetchone()
    return bool(row and row[0] > 0)


def _row_count(conn: duckdb.DuckDBPyConnection, schema: str, table: str) -> int:
    row = conn.execute(f"SELECT COUNT(*) FROM {schema}.{table}").fetchone()
    return int(row[0]) if row else 0


@router.get("/sources", response_model=SourceStatusResponse)
def get_sources(settings: Settings = Depends(get_settings)) -> SourceStatusResponse:
    path, mode = resolve_warehouse_path(settings)
    entries = _load_manifest()

    conn: duckdb.DuckDBPyConnection | None = None
    if path is not None:
        conn = duckdb.connect(str(path), read_only=True)

    try:
        sources = []
        for e in entries:
            tables = SOURCE_TO_TABLES.get(e["source_id"], [])
            row_count: int | None = None
            if conn is not None and tables:
                # Multiple source_ids can share one table (e.g. the three
                # ACS table adapters all land in social.acs_observations);
                # report that shared table's total row count for each, since
                # there is no source-specific subset to count separately
                # without re-parsing staged files.
                schema, table = tables[0]
                if _table_exists(conn, schema, table):
                    row_count = _row_count(conn, schema, table)

            sources.append(
                SourceStatusEntry(
                    source_id=e["source_id"],
                    resource_id=e["resource_id"],
                    publisher=e["publisher"],
                    landing_page=e["landing_page"],
                    source_vintage=e["source_vintage"],
                    release_date=e.get("release_date"),
                    retrieved_at=e["retrieved_at"],
                    status=e["status"],
                    license_or_terms=e["license_or_terms"],
                    freshness_state=classify_freshness(e),
                    row_count=row_count,
                    warehouse_tables=[f"{s}.{t}" for s, t in tables],
                )
            )
    finally:
        if conn is not None:
            conn.close()

    return SourceStatusResponse(warehouse_data_mode=mode, sources=sources)


@router.get("/data-explorer", response_model=DataExplorerResponse)
def get_data_explorer(settings: Settings = Depends(get_settings)) -> DataExplorerResponse:
    path, mode = resolve_warehouse_path(settings)

    tables: list[DataExplorerTable] = []
    conn: duckdb.DuckDBPyConnection | None = None
    if path is not None:
        conn = duckdb.connect(str(path), read_only=True)
    try:
        for descriptor in ALL_TABLES:
            available = conn is not None and _table_exists(
                conn, descriptor.schema, descriptor.table
            )
            row_count = None
            column_count = None
            if available and conn is not None:
                row_count = _row_count(conn, descriptor.schema, descriptor.table)
                cols = conn.execute(
                    "SELECT COUNT(*) FROM information_schema.columns "
                    "WHERE table_schema = ? AND table_name = ?",
                    [descriptor.schema, descriptor.table],
                ).fetchone()
                column_count = int(cols[0]) if cols else None
            tables.append(
                DataExplorerTable(
                    schema_name=descriptor.schema,
                    table_name=descriptor.table,
                    description=descriptor.description,
                    row_count=row_count,
                    column_count=column_count,
                    available=available,
                )
            )
    finally:
        if conn is not None:
            conn.close()

    return DataExplorerResponse(tables=tables, warehouse_data_mode=mode)


@router.get(
    "/data-explorer/{schema_name}/{table_name}",
    response_model=DataExplorerTablePreview,
)
def get_data_explorer_table_preview(
    schema_name: str,
    table_name: str,
    settings: Settings = Depends(get_settings),
) -> DataExplorerTablePreview:
    known = {(d.schema, d.table) for d in ALL_TABLES}
    if (schema_name, table_name) not in known:
        raise HTTPException(status_code=404, detail=f"Unknown table {schema_name}.{table_name}.")

    with get_read_only_connection(settings) as (conn, mode):
        if not _table_exists(conn, schema_name, table_name):
            raise HTTPException(
                status_code=404,
                detail=f"{schema_name}.{table_name} is not present in the current "
                f"({mode}) warehouse.",
            )
        total = _row_count(conn, schema_name, table_name)
        result = conn.execute(
            f"SELECT * FROM {schema_name}.{table_name} LIMIT {_PREVIEW_ROW_LIMIT}"
        )
        columns = [d[0] for d in result.description]
        rows = [dict(zip(columns, row, strict=True)) for row in result.fetchall()]

    return DataExplorerTablePreview(
        schema_name=schema_name,
        table_name=table_name,
        columns=columns,
        rows=rows,
        row_count=total,
        data_mode=mode,
    )
