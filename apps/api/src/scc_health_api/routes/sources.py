"""Source status route: reads DATA_MANIFEST.json (server-side file, not the
warehouse) so source provenance is visible even before `make data` has been
run, and remains visible if the warehouse becomes unavailable.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends

from scc_health_api.db import resolve_warehouse_path
from scc_health_api.schemas.geography import SourceStatusEntry, SourceStatusResponse
from scc_health_api.settings import Settings, get_settings

router = APIRouter(prefix="/api/v1", tags=["sources"])

REPO_ROOT = Path(__file__).resolve().parents[5]
MANIFEST_PATH = REPO_ROOT / "DATA_MANIFEST.json"


def _load_manifest() -> list[dict[str, Any]]:
    if not MANIFEST_PATH.exists():
        return []
    with MANIFEST_PATH.open(encoding="utf-8") as fh:
        data: list[dict[str, Any]] = json.load(fh)
    return data


@router.get("/sources", response_model=SourceStatusResponse)
def get_sources(settings: Settings = Depends(get_settings)) -> SourceStatusResponse:
    _, mode = resolve_warehouse_path(settings)
    entries = _load_manifest()
    return SourceStatusResponse(
        warehouse_data_mode=mode,
        sources=[
            SourceStatusEntry(
                source_id=e["source_id"],
                resource_id=e["resource_id"],
                publisher=e["publisher"],
                landing_page=e["landing_page"],
                source_vintage=e["source_vintage"],
                retrieved_at=e["retrieved_at"],
                status=e["status"],
                license_or_terms=e["license_or_terms"],
            )
            for e in entries
        ],
    )
