"""Typed response schemas for /api/v1 system endpoints."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel


class HealthResponse(BaseModel):
    status: Literal["ok"] = "ok"
    service: str = "scc-health-api"
    version: str


class VersionResponse(BaseModel):
    app_version: str
    data_build_id: str | None = None
    git_commit: str | None = None


class WarehouseStatusResponse(BaseModel):
    connected: bool
    path: str
    spatial_extension_loaded: bool
    data_mode: Literal["live", "demo", "unavailable"]
    detail: str | None = None


class ReadyResponse(BaseModel):
    """Readiness (not liveness): can this instance actually serve real
    queries right now? Distinct from /health, which only confirms the
    process itself is up -- a process can be "alive" with no warehouse."""

    ready: bool
    data_mode: Literal["live", "demo", "unavailable"]
    detail: str | None = None
