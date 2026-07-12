"""System status routes: health, version, warehouse status.

These are the Phase-1 vertical-slice endpoints required by
docs/07_BUILD_PHASES.md Phase 1 ("API health route, DuckDB connectivity
check") and docs/04_ARCHITECTURE_IMPLEMENTATION.md §9 ("Metadata and
status" endpoint group).
"""

from __future__ import annotations

import subprocess
from functools import lru_cache

from fastapi import APIRouter, Depends

from scc_health_api.db import check_warehouse
from scc_health_api.schemas.system import (
    HealthResponse,
    VersionResponse,
    WarehouseStatusResponse,
)
from scc_health_api.settings import Settings, get_settings

router = APIRouter(prefix="/api/v1", tags=["system"])


@lru_cache(maxsize=1)
def _git_commit() -> str | None:
    try:
        result = subprocess.run(
            ["git", "rev-parse", "--short", "HEAD"],
            capture_output=True,
            text=True,
            timeout=2,
            check=False,
        )
        commit = result.stdout.strip()
        return commit or None
    except (OSError, subprocess.TimeoutExpired):
        return None


@router.get("/health", response_model=HealthResponse)
def get_health(settings: Settings = Depends(get_settings)) -> HealthResponse:
    return HealthResponse(version=settings.app_version)


@router.get("/version", response_model=VersionResponse)
def get_version(settings: Settings = Depends(get_settings)) -> VersionResponse:
    return VersionResponse(
        app_version=settings.app_version,
        data_build_id=None,  # populated once Phase 2's build-provenance table exists
        git_commit=_git_commit(),
    )


@router.get("/warehouse-status", response_model=WarehouseStatusResponse)
def get_warehouse_status(
    settings: Settings = Depends(get_settings),
) -> WarehouseStatusResponse:
    status = check_warehouse(settings)
    return WarehouseStatusResponse(
        connected=status.connected,
        path=status.path,
        spatial_extension_loaded=status.spatial_extension_loaded,
        data_mode=status.data_mode,
        detail=status.detail,
    )
