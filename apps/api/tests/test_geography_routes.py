"""Integration tests for /api/v1/geographies and /api/v1/sources.

Uses the demo warehouse (built from the checked-in data/demo/geography/
snapshot) via a dependency override, so these tests are deterministic and
do not depend on a live `make data` run having happened in this environment.
"""

from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from scc_health_api.main import app
from scc_health_api.settings import Settings, get_settings

REPO_ROOT = Path(__file__).resolve().parents[3]
DEMO_WAREHOUSE_PATH = REPO_ROOT / "warehouse" / "scc_health_demo.duckdb"
LIVE_WAREHOUSE_PATH = REPO_ROOT / "warehouse" / "scc_health.duckdb"


def _demo_only_settings() -> Settings:
    return Settings(
        scc_health_warehouse_path=REPO_ROOT / "warehouse" / "__does_not_exist__.duckdb",
        scc_health_demo_warehouse_path=DEMO_WAREHOUSE_PATH,
    )


pytestmark = pytest.mark.skipif(
    not DEMO_WAREHOUSE_PATH.exists(),
    reason="warehouse/scc_health_demo.duckdb not built -- run `make demo` first",
)


@pytest.fixture
def client() -> TestClient:
    app.dependency_overrides[get_settings] = _demo_only_settings
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()


def test_search_finds_known_tract_by_geoid(client: TestClient) -> None:
    response = client.get("/api/v1/geographies/search", params={"q": "06085500100"})
    assert response.status_code == 200
    body = response.json()
    assert body["data_mode"] == "demo"
    assert any(
        r["geography_type"] == "tract" and r["geography_id"] == "06085500100"
        for r in body["results"]
    )


def test_search_finds_place_by_name(client: TestClient) -> None:
    response = client.get("/api/v1/geographies/search", params={"q": "san jose"})
    assert response.status_code == 200
    body = response.json()
    assert any(r["geography_type"] == "place" for r in body["results"])


def test_get_tract_profile_includes_district_assignment(client: TestClient) -> None:
    response = client.get("/api/v1/geographies/tract/06085500100")
    assert response.status_code == 200
    body = response.json()
    assert body["tract_geoid_2020"] == "06085500100"
    assert body["supervisor_district"] in {1, 2, 3, 4, 5}
    assert 0.0 < body["supervisor_district_share"] <= 1.0
    assert body["data_mode"] == "demo"
    assert "Phase 4" in body["note"]


def test_get_tract_profile_404_for_unknown_geoid(client: TestClient) -> None:
    response = client.get("/api/v1/geographies/tract/00000000000")
    assert response.status_code == 404
    detail = response.json()["detail"]
    # Phase 5 hotfix: a lookup miss must return a structured, diagnosable
    # body -- error code, the geography type, and the exact identifier
    # that was requested -- not just an opaque string.
    assert detail["error_code"] == "geography_not_found"
    assert detail["geography_type"] == "tract"
    assert detail["requested_id"] == "00000000000"
    assert "message" in detail


def test_get_tract_profile_404_for_literal_geography_type_as_id(client: TestClient) -> None:
    # Regression test for the Phase 5 map-selection defect: a bug that
    # passed the literal string "tract" as if it were a GEOID must fail
    # with a clean, structured 404 -- never a malformed 500, never a
    # silently-wrong profile.
    response = client.get("/api/v1/geographies/tract/tract")
    assert response.status_code == 404
    detail = response.json()["detail"]
    assert detail["error_code"] == "geography_not_found"
    assert detail["requested_id"] == "tract"


def test_get_tract_profile_404_for_short_display_label(client: TestClient) -> None:
    # A short display label like "5033.21" (not the canonical 11-digit
    # GEOID "06085503321") must never resolve to a tract -- the API
    # performs a literal GEOID lookup and does not guess at labels.
    response = client.get("/api/v1/geographies/tract/5033.21")
    assert response.status_code == 404
    detail = response.json()["detail"]
    assert detail["error_code"] == "geography_not_found"
    assert detail["requested_id"] == "5033.21"


def test_get_tract_profile_preserves_leading_zero(client: TestClient) -> None:
    response = client.get("/api/v1/geographies/tract/06085500100")
    assert response.status_code == 200
    body = response.json()
    assert isinstance(body["tract_geoid_2020"], str)
    assert body["tract_geoid_2020"].startswith("0")
    assert body["tract_geoid_2020"] == "06085500100"


def test_get_supervisor_district_profile(client: TestClient) -> None:
    response = client.get("/api/v1/geographies/supervisor_district/1")
    assert response.status_code == 200
    body = response.json()
    assert body["district_number"] == 1
    assert body["supervisor_name"]
    assert body["tract_count"] > 0


def test_get_tract_boundary_returns_geojson_polygon(client: TestClient) -> None:
    response = client.get("/api/v1/geographies/tract/06085500100/boundary")
    assert response.status_code == 200
    body = response.json()
    assert body["geojson"]["type"] == "Feature"
    assert body["geojson"]["geometry"]["type"] in {"Polygon", "MultiPolygon"}


def test_get_boundary_404_for_unknown_geography(client: TestClient) -> None:
    response = client.get("/api/v1/geographies/tract/00000000000/boundary")
    assert response.status_code == 404
    detail = response.json()["detail"]
    assert detail["error_code"] == "geography_not_found"
    assert detail["geography_type"] == "tract"
    assert detail["requested_id"] == "00000000000"


def test_get_all_tract_boundaries_returns_every_tract(client: TestClient) -> None:
    response = client.get("/api/v1/geographies/tracts/boundaries")
    assert response.status_code == 200
    body = response.json()
    assert body["type"] == "FeatureCollection"
    assert len(body["features"]) == 408
    assert body["scenario_id"] is None
    first = body["features"][0]
    assert first["type"] == "Feature"
    assert first["geometry"]["type"] in {"Polygon", "MultiPolygon"}
    assert "tract_geoid_2020" in first["properties"]
    # The demo warehouse has no analytics.* tables (Phase 4 analytics are
    # live-only, DEC-035) -- scores must be absent, never fabricated as 0.
    assert first["properties"]["score"] is None


def test_get_all_tract_boundaries_with_unknown_scenario_still_returns_geometry(
    client: TestClient,
) -> None:
    # analytics.scenario_scores doesn't exist in the demo warehouse at
    # all, so even a scenario_id query param must degrade gracefully to
    # geometry-only rather than erroring.
    response = client.get(
        "/api/v1/geographies/tracts/boundaries?scenario_id=default_integrated_screen_v1"
    )
    assert response.status_code == 200
    body = response.json()
    assert len(body["features"]) == 408
    assert body["features"][0]["properties"]["score"] is None


def test_sources_endpoint_lists_manifest_entries(client: TestClient) -> None:
    response = client.get("/api/v1/sources")
    assert response.status_code == 200
    body = response.json()
    assert body["warehouse_data_mode"] == "demo"
    source_ids = {s["source_id"] for s in body["sources"]}
    assert "tiger_tract_2020" in source_ids
    assert "scc_supervisor_districts_2025" in source_ids


def test_geography_endpoints_return_503_when_no_warehouse_at_all() -> None:
    def _no_warehouse_settings() -> Settings:
        return Settings(
            scc_health_warehouse_path=REPO_ROOT / "warehouse" / "__does_not_exist__.duckdb",
            scc_health_demo_warehouse_path=REPO_ROOT / "warehouse" / "__also_missing__.duckdb",
        )

    app.dependency_overrides[get_settings] = _no_warehouse_settings
    try:
        client = TestClient(app)
        response = client.get("/api/v1/geographies/search", params={"q": "san jose"})
        assert response.status_code == 503
    finally:
        app.dependency_overrides.clear()
