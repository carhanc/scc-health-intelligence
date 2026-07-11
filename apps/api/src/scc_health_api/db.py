"""Read-only DuckDB connectivity for the API layer.

Per docs/04_ARCHITECTURE_IMPLEMENTATION.md §6, the API uses a read-only
warehouse connection for request handling; heavy pipeline writes happen
only through `make data` jobs, never inside HTTP request handling.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import duckdb

from scc_health_api.settings import Settings


@dataclass(frozen=True)
class WarehouseStatus:
    connected: bool
    path: str
    spatial_extension_loaded: bool
    detail: str | None = None


def check_warehouse(settings: Settings) -> WarehouseStatus:
    """Attempt a read-only connection and confirm the spatial extension loads.

    The warehouse file may not exist yet (it is created by `make data` in
    Phase 2+) — that is a truthful "not connected" status, not an error the
    API should crash on, per the source-failure rules in CLAUDE.md.
    """
    path: Path = settings.scc_health_warehouse_path
    if not path.exists():
        return WarehouseStatus(
            connected=False,
            path=str(path),
            spatial_extension_loaded=False,
            detail="Warehouse file does not exist yet. Run `make data` to build it.",
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
            )
        finally:
            conn.close()
    except duckdb.Error as exc:
        return WarehouseStatus(
            connected=False,
            path=str(path),
            spatial_extension_loaded=False,
            detail=f"DuckDB error: {exc}",
        )
