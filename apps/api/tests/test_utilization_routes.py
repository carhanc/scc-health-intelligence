"""Integration tests for the Phase 7 Utilization API (/api/v1/utilization/*).
Uses the live warehouse (built by `make data`, including
`run_utilization_pipeline.py`), since Phase 7 utilization tables do not
yet have an offline demo snapshot.
"""

from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from scc_health_api.main import app
from scc_health_api.settings import Settings, get_settings

REPO_ROOT = Path(__file__).resolve().parents[3]
LIVE_WAREHOUSE_PATH = REPO_ROOT / "warehouse" / "scc_health.duckdb"
DEMO_WAREHOUSE_PATH = REPO_ROOT / "warehouse" / "scc_health_demo.duckdb"

pytestmark = pytest.mark.skipif(
    not LIVE_WAREHOUSE_PATH.exists(),
    reason="warehouse/scc_health.duckdb not built -- run `make data` first",
)

KNOWN_TRACT_GEOID = "06085500100"
KNOWN_LOW_RELIABILITY_TRACT = "06085513500"


def _live_settings() -> Settings:
    return Settings(scc_health_warehouse_path=LIVE_WAREHOUSE_PATH)


def _demo_only_settings() -> Settings:
    return Settings(
        scc_health_warehouse_path=REPO_ROOT / "warehouse" / "does_not_exist.duckdb",
        scc_health_demo_warehouse_path=DEMO_WAREHOUSE_PATH,
    )


@pytest.fixture
def client() -> TestClient:
    app.dependency_overrides[get_settings] = _live_settings
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()


def test_county_trends_default_breakdown(client: TestClient) -> None:
    response = client.get("/api/v1/utilization/county-trends")
    assert response.status_code == 200
    body = response.json()
    assert body["data_mode"] == "live"
    assert body["breakdown"] == "disposition"
    assert body["geography_level"] == "county"
    assert len(body["points"]) > 0
    assert all(p["breakdown_category"] == "disposition" for p in body["points"])


def test_county_trends_unknown_breakdown_is_a_400_not_an_empty_200(client: TestClient) -> None:
    response = client.get("/api/v1/utilization/county-trends?breakdown=not_a_real_breakdown")
    assert response.status_code == 400


def test_county_trends_preserves_suppression_as_null_not_zero(client: TestClient) -> None:
    response = client.get("/api/v1/utilization/county-trends?breakdown=disposition")
    body = response.json()
    suppressed = [p for p in body["points"] if p["is_suppressed"]]
    assert len(suppressed) > 0
    assert all(p["encounters"] is None for p in suppressed)
    assert all(p["data_status"] == "suppressed" for p in suppressed)


def test_list_facilities_returns_real_santa_clara_facilities(client: TestClient) -> None:
    response = client.get("/api/v1/utilization/facilities")
    assert response.status_code == 200
    body = response.json()
    assert body["data_mode"] == "live"
    assert len(body["facilities"]) == 9
    for f in body["facilities"]:
        assert f["data_status"] == "observed"
        assert f["total_ed_encounters"] is not None
        assert f["total_ed_encounters"] > 0


def test_facility_zip_code_is_a_zero_padded_string(client: TestClient) -> None:
    response = client.get("/api/v1/utilization/facilities")
    body = response.json()
    for f in body["facilities"]:
        assert isinstance(f["zip_code"], str)
        assert len(f["zip_code"]) == 5


def test_facility_detail_includes_payer_disposition_and_language_breakdowns(
    client: TestClient,
) -> None:
    list_response = client.get("/api/v1/utilization/facilities")
    oshpd_id = list_response.json()["facilities"][0]["oshpd_id"]

    response = client.get(f"/api/v1/utilization/facilities/{oshpd_id}")
    assert response.status_code == 200
    body = response.json()
    assert body["facility"]["oshpd_id"] == oshpd_id
    assert "medi_cal" in body["breakdown"]["payer_mix"]
    assert "english" in body["breakdown"]["language"]
    assert "routine_discharge" in body["breakdown"]["disposition"]


def test_facility_detail_unknown_id_is_404(client: TestClient) -> None:
    response = client.get("/api/v1/utilization/facilities/not-a-real-id")
    assert response.status_code == 404


def test_list_zip_observed_is_real_zip_level_not_tract(client: TestClient) -> None:
    response = client.get("/api/v1/utilization/zips")
    assert response.status_code == 200
    body = response.json()
    assert body["geography_level"] == "patient_zip"
    assert body["total_observed_encounters"] > 0
    assert len(body["zips"]) > 0
    for z in body["zips"]:
        assert len(z["patient_zip"]) == 5
        assert z["data_status"] == "observed"
        assert z["pattype_group"] in {"ed_only", "inpatient_from_ed"}


def test_list_tract_utilization_ranked_and_labeled_modeled(client: TestClient) -> None:
    response = client.get("/api/v1/utilization/tracts?limit=10")
    assert response.status_code == 200
    body = response.json()
    assert body["geography_level"] == "tract"
    assert len(body["tracts"]) == 10
    for t in body["tracts"]:
        assert t["data_status"] == "modeled"
        assert len(t["tract_geoid_2020"]) == 11
        assert t["tract_geoid_2020"].startswith("06085")


def test_get_tract_utilization_by_geoid(client: TestClient) -> None:
    response = client.get(f"/api/v1/utilization/tracts/{KNOWN_TRACT_GEOID}")
    assert response.status_code == 200
    body = response.json()
    assert body["tract"]["tract_geoid_2020"] == KNOWN_TRACT_GEOID


def test_get_tract_utilization_unknown_geoid_is_404(client: TestClient) -> None:
    response = client.get("/api/v1/utilization/tracts/06085999999")
    assert response.status_code == 404


def test_implausible_rate_tract_is_flagged_low_reliability(client: TestClient) -> None:
    response = client.get(f"/api/v1/utilization/tracts/{KNOWN_LOW_RELIABILITY_TRACT}")
    assert response.status_code == 200
    tract = response.json()["tract"]
    assert tract["rate_reliability"] == "low_reliability"
    assert tract["rate_reliability_note"]
    assert "unreliable" in tract["rate_reliability_note"].lower()


def test_most_tracts_are_in_the_plausible_range(client: TestClient) -> None:
    response = client.get("/api/v1/utilization/tracts?limit=408")
    tracts = response.json()["tracts"]
    plausible = [t for t in tracts if t["rate_reliability"] == "plausible_range"]
    assert len(plausible) > len(tracts) * 0.8


def test_criterion_validity_covers_every_scenario_and_is_never_tautological(
    client: TestClient,
) -> None:
    response = client.get("/api/v1/utilization/criterion-validity")
    assert response.status_code == 200
    body = response.json()
    assert len(body["results"]) == 8
    for r in body["results"]:
        assert r["is_tautological"] is False
        assert r["validity_type"] == "criterion"
        assert r["n_paired_observations"] > 0


def test_utilization_routes_return_a_truthful_503_without_phase_7_tables(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    if not DEMO_WAREHOUSE_PATH.exists():
        pytest.skip("warehouse/scc_health_demo.duckdb not built -- run `make demo` first")
    app.dependency_overrides[get_settings] = _demo_only_settings
    try:
        client = TestClient(app)
        response = client.get("/api/v1/utilization/facilities")
        assert response.status_code == 503
        assert "run_utilization_pipeline" in response.json()["detail"]
    finally:
        app.dependency_overrides.clear()
