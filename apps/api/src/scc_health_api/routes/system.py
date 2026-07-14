"""System status routes: health, version, warehouse status.

These are the Phase-1 vertical-slice endpoints required by
docs/07_BUILD_PHASES.md Phase 1 ("API health route, DuckDB connectivity
check") and docs/04_ARCHITECTURE_IMPLEMENTATION.md §9 ("Metadata and
status" endpoint group).
"""

from __future__ import annotations

import json
import subprocess
from functools import lru_cache

from fastapi import APIRouter, Depends, Response

from scc_health_api.db import check_warehouse
from scc_health_api.schemas.system import (
    HealthResponse,
    ReadyResponse,
    VersionResponse,
    WarehouseStatusResponse,
)
from scc_health_api.settings import Settings, get_settings

router = APIRouter(prefix="/api/v1", tags=["system"])


def _read_data_build_id(settings: Settings) -> str | None:
    """Reads the `data_build_id` recorded by
    `scripts/build_production_manifest.py`, if that manifest exists.
    Absent locally (a dev warehouse has no manifest) -- returns None,
    never a fabricated placeholder."""
    if not settings.data_manifest_path.exists():
        return None
    try:
        with settings.data_manifest_path.open(encoding="utf-8") as fh:
            manifest = json.load(fh)
        build_id = manifest.get("build_id")
        return str(build_id) if build_id is not None else None
    except (OSError, json.JSONDecodeError):
        return None


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
        data_build_id=_read_data_build_id(settings),
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


@router.get("/ready", response_model=ReadyResponse)
def get_ready(response: Response, settings: Settings = Depends(get_settings)) -> ReadyResponse:
    """Readiness probe: this instance can actually serve real queries right
    now. A hosted deployment's load balancer/health check should poll this,
    not /health -- a process can be alive with no usable warehouse."""
    status = check_warehouse(settings)
    ready = status.connected
    if not ready:
        response.status_code = 503
    return ReadyResponse(
        ready=ready,
        data_mode=status.data_mode,
        detail=status.detail,
    )
