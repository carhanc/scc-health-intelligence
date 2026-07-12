"""Integration tests for the Phase 3 source-status and data-explorer routes.

Uses the live warehouse (built by `make data`), since the data-explorer
endpoint exists specifically to expose Phase 3 core-source tables that are
not part of the checked-in demo geography snapshot.
"""

from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from scc_health_api.main import app
from scc_health_api.settings import Settings, get_settings

REPO_ROOT = Path(__file__).resolve().parents[3]
LIVE_WAREHOUSE_PATH = REPO_ROOT / "warehouse" / "scc_health.duckdb"

pytestmark = pytest.mark.skipif(
    not LIVE_WAREHOUSE_PATH.exists(),
    reason="warehouse/scc_health.duckdb not built -- run `make data` first",
)


def _live_settings() -> Settings:
    return Settings(scc_health_warehouse_path=LIVE_WAREHOUSE_PATH)


@pytest.fixture
def client() -> TestClient:
    app.dependency_overrides[get_settings] = _live_settings
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()


def test_sources_endpoint_reports_freshness_state_and_row_counts(client: TestClient) -> None:
    response = client.get("/api/v1/sources")
    assert response.status_code == 200
    body = response.json()
    assert body["warehouse_data_mode"] == "live"

    by_id = {s["source_id"]: s for s in body["sources"]}
    places = by_id["cdc_places_tract_2025"]
    assert places["freshness_state"] in {"newest_verified", "lagged", "stale"}
    assert places["row_count"] == 16320
    assert places["warehouse_tables"] == ["health.places_observations"]

    blocked = by_id["ca_hpi_3_0"]
    assert blocked["freshness_state"] == "unavailable"
    assert blocked["status"] == "unavailable"
    assert blocked["row_count"] is None


def test_data_explorer_lists_every_registered_table_with_real_row_counts(
    client: TestClient,
) -> None:
    response = client.get("/api/v1/data-explorer")
    assert response.status_code == 200
    body = response.json()
    assert body["warehouse_data_mode"] == "live"

    by_name = {f"{t['schema_name']}.{t['table_name']}": t for t in body["tables"]}
    places = by_name["health.places_observations"]
    assert places["available"] is True
    assert places["row_count"] == 16320
    assert places["column_count"] and places["column_count"] > 0


def test_data_explorer_table_preview_is_bounded_and_matches_schema(client: TestClient) -> None:
    response = client.get("/api/v1/data-explorer/context/svi")
    assert response.status_code == 200
    body = response.json()
    assert body["row_count"] == 408
    assert len(body["rows"]) <= 50
    assert "tract_geoid_2020" in body["columns"]


def test_data_explorer_table_preview_404_for_unknown_table(client: TestClient) -> None:
    response = client.get("/api/v1/data-explorer/nonexistent/table")
    assert response.status_code == 404
