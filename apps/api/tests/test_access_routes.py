"""Integration tests for the Phase 6 Access Lab API (/api/v1/access/*).
Uses the live warehouse (built by `make data`, including
`run_resource_canonicalization.py` and `run_access_metrics_pipeline.py`),
since Phase 6 access tables do not yet have an offline demo snapshot.
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

KNOWN_HOSPITAL_ID = "fac_hospital_c0e31e6573ba"  # Stanford Health Care, HCAI oshpd_id 106430035
KNOWN_BLOCK_GROUP_GEOID = "060855001001"
KNOWN_TRACT_GEOID = "06085500100"


def _live_settings() -> Settings:
    return Settings(scc_health_warehouse_path=LIVE_WAREHOUSE_PATH)


@pytest.fixture
def client() -> TestClient:
    app.dependency_overrides[get_settings] = _live_settings
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()


def test_list_facilities_returns_real_canonical_inventory(client: TestClient) -> None:
    response = client.get("/api/v1/access/facilities")
    assert response.status_code == 200
    body = response.json()
    assert body["data_mode"] == "live"
    assert body["category_counts"]["hospital"] == 15
    assert len(body["facilities"]) > 4000


def test_list_facilities_category_filter(client: TestClient) -> None:
    response = client.get("/api/v1/access/facilities?category=hospital")
    assert response.status_code == 200
    body = response.json()
    assert len(body["facilities"]) == 15
    assert all(f["category"] == "hospital" for f in body["facilities"])


def test_facility_detail_includes_real_source_lineage(client: TestClient) -> None:
    response = client.get(f"/api/v1/access/facilities/{KNOWN_HOSPITAL_ID}")
    assert response.status_code == 200
    body = response.json()
    assert body["facility"]["category"] == "hospital"
    assert body["facility"]["is_official"] is True
    assert len(body["sources"]) >= 1
    assert body["sources"][0]["source_id"] == "hcai"


def test_facility_detail_unknown_id_404(client: TestClient) -> None:
    response = client.get("/api/v1/access/facilities/not_a_real_facility_id")
    assert response.status_code == 404


def test_network_access_returns_walk_and_drive_for_both_categories(client: TestClient) -> None:
    response = client.get(f"/api/v1/access/network/{KNOWN_BLOCK_GROUP_GEOID}")
    assert response.status_code == 200
    body = response.json()
    assert body["block_group_geoid"] == KNOWN_BLOCK_GROUP_GEOID
    combos = {(r["mode"], r["category"]) for r in body["results"]}
    assert combos == {
        ("drive", "hospital"), ("drive", "clinic"), ("walk", "hospital"), ("walk", "clinic"),
    }
    for r in body["results"]:
        if r["status"] == "routed":
            assert r["distance_miles"] is not None
            assert "osm_network" in r["method"]


def test_network_access_unknown_block_group_404(client: TestClient) -> None:
    response = client.get("/api/v1/access/network/999999999999")
    assert response.status_code == 404


def test_transit_access_carries_the_scheduled_proxy_label(client: TestClient) -> None:
    response = client.get(f"/api/v1/access/transit/{KNOWN_BLOCK_GROUP_GEOID}")
    assert response.status_code == 200
    body = response.json()
    assert body["result"]["method"] == "scheduled_transit_access_proxy"
    assert "monday" in body["result"]["service_window"]


def test_transit_access_unknown_block_group_404(client: TestClient) -> None:
    response = client.get("/api/v1/access/transit/999999999999")
    assert response.status_code == 404


def test_tract_summary_uses_a_real_representative_block_group(client: TestClient) -> None:
    response = client.get(f"/api/v1/access/tract/{KNOWN_TRACT_GEOID}/summary")
    assert response.status_code == 200
    body = response.json()
    assert body["tract_geoid_2020"] == KNOWN_TRACT_GEOID
    assert body["representative_block_group_geoid"].startswith(KNOWN_TRACT_GEOID)
    assert body["representative_population"] > 0
    assert body["n_block_groups_in_tract"] >= 1
    combos = {(r["mode"], r["category"]) for r in body["network_results"]}
    assert combos == {
        ("drive", "hospital"), ("drive", "clinic"), ("walk", "hospital"), ("walk", "clinic"),
    }
    assert body["transit_result"]["method"] == "scheduled_transit_access_proxy"


def test_tract_summary_unknown_tract_404(client: TestClient) -> None:
    response = client.get("/api/v1/access/tract/99999999999/summary")
    assert response.status_code == 404


def test_e2sfca_filter_by_mode_and_category(client: TestClient) -> None:
    response = client.get("/api/v1/access/e2sfca?mode=drive&category=hospital")
    assert response.status_code == 200
    body = response.json()
    assert len(body["results"]) == 1173
    assert all(r["mode"] == "drive" and r["category"] == "hospital" for r in body["results"])
    assert all(r["capacity_type"] == "real_capacity" for r in body["results"])
    assert all(r["accessibility_score"] >= 0 for r in body["results"])


def test_e2sfca_clinic_uses_count_proxy_not_real_capacity(client: TestClient) -> None:
    response = client.get("/api/v1/access/e2sfca?mode=walk&category=clinic")
    assert response.status_code == 200
    body = response.json()
    assert all(r["capacity_type"] == "count_proxy" for r in body["results"])


def test_resource_gaps_classification_covers_all_four_labels(client: TestClient) -> None:
    response = client.get("/api/v1/access/gaps?mode=drive&category=clinic")
    assert response.status_code == 200
    body = response.json()
    assert body["need_domain"] == "health_burden"
    assert len(body["results"]) > 0
    classifications = {r["classification"] for r in body["results"]}
    assert classifications <= {"priority_gap", "need_met", "low_priority", "well_served"}
    for r in body["results"]:
        assert 0.0 <= r["need_percentile"] <= 100.0
        assert 0.0 <= r["access_percentile"] <= 100.0


def test_optimization_scenarios_returns_the_precomputed_sensitivity_sweep(
    client: TestClient,
) -> None:
    response = client.get("/api/v1/access/optimize/scenarios")
    assert response.status_code == 200
    body = response.json()
    run_ids = {s["run_id"] for s in body["scenarios"]}
    assert "mobile_clinic_baseline" in run_ids
    assert "mobile_clinic_tight_threshold" in run_ids
    infeasible = next(
        s for s in body["scenarios"] if s["run_id"] == "mobile_clinic_tight_threshold"
    )
    assert infeasible["status"] == "INFEASIBLE"
    assert infeasible["objective_value"] is None
    for s in body["scenarios"]:
        joined = " ".join(s["assumptions"]).lower()
        assert "people served" not in joined
        assert "health outcomes improved" not in joined
