"""Read-only DuckDB connectivity for the API layer.

Per docs/04_ARCHITECTURE_IMPLEMENTATION.md §6, the API uses a read-only
warehouse connection for request handling; heavy pipeline writes happen
only through `make data`/`make demo` jobs, never inside HTTP request
handling.
"""

from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

import duckdb

from scc_health_api.settings import Settings

DataMode = Literal["live", "demo", "unavailable"]
# Narrower alias for contexts that have already confirmed a warehouse
# exists (e.g. inside get_read_only_connection, after the "unavailable"
# case has raised) -- lets callers avoid handling an impossible branch.
ConnectedDataMode = Literal["live", "demo"]


@dataclass(frozen=True)
class WarehouseStatus:
    connected: bool
    path: str
    spatial_extension_loaded: bool
    data_mode: DataMode
    detail: str | None = None


def resolve_warehouse_path(settings: Settings) -> tuple[Path | None, DataMode]:
    """Prefer the live warehouse; fall back to the demo snapshot; otherwise
    report a truthful unavailable state. Never silently substitutes one for
    the other without the caller being able to tell which mode is active."""
    if settings.scc_health_warehouse_path.exists():
        return settings.scc_health_warehouse_path, "live"
    if settings.scc_health_demo_warehouse_path.exists():
        return settings.scc_health_demo_warehouse_path, "demo"
    return None, "unavailable"


def check_warehouse(settings: Settings) -> WarehouseStatus:
    """Attempt a read-only connection and confirm the spatial extension loads.

    Neither warehouse file may exist yet (they are created by `make data` /
    `make demo`) -- that is a truthful "not connected" status, not an error
    the API should crash on, per the source-failure rules in CLAUDE.md.
    """
    path, mode = resolve_warehouse_path(settings)
    if path is None:
        return WarehouseStatus(
            connected=False,
            path=str(settings.scc_health_warehouse_path),
            spatial_extension_loaded=False,
            data_mode=mode,
            detail="Neither the live nor the demo warehouse exists yet. "
            "Run `make data` (live) or `make demo` (offline snapshot) to build one.",
        )

    try:
        conn = duckdb.connect(str(path), read_only=True)
        try:
            conn.execute("INSTALL spatial")
            conn.execute("LOAD spatial")
            conn.execute("SELECT 1")
            return WarehouseStatus(
                connected=True,
                path=str(path),
                spatial_extension_loaded=True,
                data_mode=mode,
            )
        finally:
            conn.close()
    except duckdb.Error as exc:
        return WarehouseStatus(
            connected=False,
            path=str(path),
            spatial_extension_loaded=False,
            data_mode=mode,
            detail=f"DuckDB error: {exc}",
        )


@contextmanager
def get_read_only_connection(
    settings: Settings,
) -> Iterator[tuple[duckdb.DuckDBPyConnection, ConnectedDataMode]]:
    """Yield a read-only connection to whichever warehouse is available, plus
    which data mode it is (live/demo), so routes can label responses
    accurately and never present demo data as live."""
    path, mode = resolve_warehouse_path(settings)
    if path is None or mode == "unavailable":
        raise WarehouseUnavailableError(
            "Neither the live nor the demo warehouse exists. Run `make data` or `make demo` first."
        )
    conn = duckdb.connect(str(path), read_only=True)
    try:
        conn.execute("INSTALL spatial")
        conn.execute("LOAD spatial")
        yield conn, mode
    finally:
        conn.close()


class WarehouseUnavailableError(RuntimeError):
    """Raised when no warehouse (live or demo) is available to query."""
