"""Integration tests for the Phase 8 Advocate API (/api/v1/advocate/*)."""

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


def test_evidence_bundle_for_a_real_tract_with_scenario(client: TestClient) -> None:
    response = client.get(
        f"/api/v1/advocate/evidence?geography_type=tract&geography_id={KNOWN_TRACT_GEOID}"
        "&scenario_id=default_integrated_screen_v1"
    )
    assert response.status_code == 200
    body = response.json()
    assert "Census Tract" in body["geography_label"]
    assert len(body["items"]) > 0
    for item in body["items"]:
        assert item["publisher"]
        assert item["citation"]
        assert item["data_status"] in {"observed", "modeled", "suppressed", "derived"}


def test_evidence_bundle_without_scenario_still_returns_access_and_resource_evidence(
    client: TestClient,
) -> None:
    response = client.get(
        f"/api/v1/advocate/evidence?geography_type=tract&geography_id={KNOWN_TRACT_GEOID}"
    )
    assert response.status_code == 200
    categories = {item["category"] for item in response.json()["items"]}
    assert "metric" not in categories  # no scenario given, no metric evidence
    assert categories  # but access/utilization/resource evidence still present


def test_evidence_bundle_rejects_unknown_geography_type(client: TestClient) -> None:
    response = client.get("/api/v1/advocate/evidence?geography_type=country&geography_id=US")
    assert response.status_code == 400


def test_evidence_bundle_unknown_scenario_is_404(client: TestClient) -> None:
    response = client.get(
        f"/api/v1/advocate/evidence?geography_type=tract&geography_id={KNOWN_TRACT_GEOID}"
        "&scenario_id=not_a_real_scenario"
    )
    assert response.status_code == 404


def test_evidence_bundle_unknown_tract_is_404(client: TestClient) -> None:
    response = client.get("/api/v1/advocate/evidence?geography_type=tract&geography_id=06085999999")
    assert response.status_code == 404


def test_evidence_bundle_for_a_place_aggregates_across_member_tracts(client: TestClient) -> None:
    # 0668000 = San Jose (established KNOWN_PLACE_GEOID from Phase 6.5 tests)
    response = client.get(
        "/api/v1/advocate/evidence?geography_type=place&geography_id=0668000"
        "&scenario_id=default_integrated_screen_v1"
    )
    assert response.status_code == 200
    body = response.json()
    metric_items = [i for i in body["items"] if i["category"] == "metric"]
    assert len(metric_items) > 0
    assert any("average across" in i["value"] for i in metric_items)


def test_generate_brief_produces_all_required_sections(client: TestClient) -> None:
    evidence_response = client.get(
        f"/api/v1/advocate/evidence?geography_type=tract&geography_id={KNOWN_TRACT_GEOID}"
        "&scenario_id=default_integrated_screen_v1"
    )
    evidence = evidence_response.json()["items"][:5]

    response = client.post(
        "/api/v1/advocate/generate",
        json={
            "output_type": "one_page_brief",
            "geography_label": "Census Tract 06085500100",
            "scenario_id": "default_integrated_screen_v1",
            "audience": "commissioner",
            "evidence": evidence,
            "notes": "",
            "data_mode": "live",
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert "what_evidence_does_not_prove" in body["sections"]
    assert body["non_causal_disclaimer"]
    assert body["configuration_hash"]
    assert len(body["questions"]) > 0


def test_generate_brief_is_reproducible_for_identical_input(client: TestClient) -> None:
    payload = {
        "output_type": "memo",
        "geography_label": "Test Geography",
        "scenario_id": None,
        "audience": "public",
        "evidence": [],
        "notes": "same notes",
        "data_mode": "live",
    }
    r1 = client.post("/api/v1/advocate/generate", json=payload)
    r2 = client.post("/api/v1/advocate/generate", json=payload)
    assert r1.json()["configuration_hash"] == r2.json()["configuration_hash"]
