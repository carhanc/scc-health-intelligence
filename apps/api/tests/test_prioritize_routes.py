"""Integration tests for the Phase 7 Prioritize API (/api/v1/prioritize/*).
Uses the live warehouse (Phase 4 analytics.domain_scores), since custom
weighting reads directly from that already-tested, already-computed
table (DEC-030).
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

BALANCED_WEIGHTS = {
    "health_burden": 0.2,
    "access_barriers": 0.2,
    "environmental_burden": 0.2,
    "resource_accessibility": 0.2,
    "workforce_shortage": 0.2,
}


def _live_settings() -> Settings:
    return Settings(scc_health_warehouse_path=LIVE_WAREHOUSE_PATH)


@pytest.fixture
def client() -> TestClient:
    app.dependency_overrides[get_settings] = _live_settings
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()


def test_custom_score_ranks_all_408_tracts(client: TestClient) -> None:
    response = client.post("/api/v1/prioritize/custom-score", json={"weights": BALANCED_WEIGHTS})
    assert response.status_code == 200
    body = response.json()
    assert body["total_tracts"] == 408
    assert len(body["tracts"]) == 408
    assert body["has_uncertainty_data"] is False


def test_custom_score_is_ranked_descending(client: TestClient) -> None:
    response = client.post("/api/v1/prioritize/custom-score", json={"weights": BALANCED_WEIGHTS})
    scores = [t["score"] for t in response.json()["tracts"] if t["score"] is not None]
    assert scores == sorted(scores, reverse=True)


def test_custom_score_rejects_weights_not_summing_to_one(client: TestClient) -> None:
    response = client.post(
        "/api/v1/prioritize/custom-score", json={"weights": {"health_burden": 0.5}}
    )
    assert response.status_code == 400


def test_custom_score_rejects_unknown_domain(client: TestClient) -> None:
    response = client.post(
        "/api/v1/prioritize/custom-score", json={"weights": {"not_a_real_domain": 1.0}}
    )
    assert response.status_code == 400


def test_custom_score_matches_balanced_overview_scenario_closely(client: TestClient) -> None:
    """The 'Balanced overview' named scenario (default_integrated_screen_v1)
    uses this exact equal weighting, so a custom request with the same
    weights should reproduce (not just resemble) its ranking -- proof
    the duplicated aggregator is behaviorally identical to the pipeline's."""
    custom = client.post(
        "/api/v1/prioritize/custom-score", json={"weights": BALANCED_WEIGHTS}
    ).json()
    named = client.get(
        "/api/v1/scenarios/default_integrated_screen_v1/scores?limit=408"
    ).json()
    custom_by_tract = {t["tract_geoid_2020"]: t["score"] for t in custom["tracts"]}
    named_by_tract = {t["tract_geoid_2020"]: t["score"] for t in named["scores"]}
    mismatches = [
        t
        for t in custom_by_tract
        if custom_by_tract[t] is not None
        and named_by_tract.get(t) is not None
        and abs(custom_by_tract[t] - named_by_tract[t]) > 0.01
    ]
    assert mismatches == []


def test_export_csv_named_scenario(client: TestClient) -> None:
    response = client.get(
        "/api/v1/prioritize/export/csv?scenario_id=default_integrated_screen_v1&limit=10"
    )
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/csv")
    lines = response.text.strip().splitlines()
    assert len(lines) == 11  # header + 10 rows
    assert "tract_geoid_2020" in lines[0]


def test_export_csv_requires_scenario_id_or_weights(client: TestClient) -> None:
    response = client.get("/api/v1/prioritize/export/csv")
    assert response.status_code == 400


def test_export_csv_rejects_both_scenario_id_and_weights(client: TestClient) -> None:
    response = client.get(
        "/api/v1/prioritize/export/csv?scenario_id=default_integrated_screen_v1&weights=%7B%7D"
    )
    assert response.status_code == 400


def test_export_memo_discloses_screening_not_prediction_limitation(client: TestClient) -> None:
    response = client.get("/api/v1/prioritize/export/memo?scenario_id=food_access_v1&top_n=5")
    assert response.status_code == 200
    body = response.json()
    assert len(body["top_tracts"]) == 5
    assert body["is_custom_weighting"] is False
    limitations = body["limitations_note"].lower()
    assert "screening tool" in limitations
    assert "not a prediction" in limitations
    assert "guarantee" in limitations


def test_export_memo_top_tracts_carry_plain_language_domain_labels(client: TestClient) -> None:
    response = client.get(
        "/api/v1/prioritize/export/memo?scenario_id=environmental_burden_priority_v1&top_n=3"
    )
    body = response.json()
    assert len(body["top_tracts"]) > 0
    for entry in body["top_tracts"]:
        assert len(entry["top_domains"]) > 0
        for d in entry["top_domains"]:
            assert "_" not in d["label"]
            assert d["label"][0].isupper()


def test_environmental_burden_scenario_is_available(client: TestClient) -> None:
    response = client.get("/api/v1/scenarios")
    scenario_ids = {s["scenario_id"] for s in response.json()["scenarios"]}
    assert "environmental_burden_priority_v1" in scenario_ids
