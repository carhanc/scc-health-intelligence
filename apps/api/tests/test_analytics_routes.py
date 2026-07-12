"""Integration tests for the Phase 4 decision-engine/explainability API
(/api/v1/scenarios, /api/v1/domains, and the analytics.* warehouse
routes). Uses the live warehouse (built by `make data`, including
`run_analytics_pipeline.py`), since Phase 4 analytics do not yet have an
offline demo snapshot (STATE.md, DEC noted in routes/analytics.py).
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

KNOWN_SCENARIO_ID = "default_integrated_screen_v1"


def _live_settings() -> Settings:
    return Settings(scc_health_warehouse_path=LIVE_WAREHOUSE_PATH)


@pytest.fixture
def client() -> TestClient:
    app.dependency_overrides[get_settings] = _live_settings
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()


def test_list_scenarios_returns_real_config(client: TestClient) -> None:
    response = client.get("/api/v1/scenarios")
    assert response.status_code == 200
    body = response.json()
    scenario_ids = {s["scenario_id"] for s in body["scenarios"]}
    assert KNOWN_SCENARIO_ID in scenario_ids
    assert "diabetes_prevention_v1" in scenario_ids
    default = next(s for s in body["scenarios"] if s["scenario_id"] == KNOWN_SCENARIO_ID)
    assert abs(sum(default["weights"].values()) - 1.0) < 1e-6


def test_list_domains_returns_real_metric_registry(client: TestClient) -> None:
    response = client.get("/api/v1/domains")
    assert response.status_code == 200
    body = response.json()
    domain_names = {d["domain"] for d in body["domains"]}
    assert domain_names == {
        "health_burden",
        "access_barriers",
        "environmental_burden",
        "resource_accessibility",
        "workforce_shortage",
    }
    health_burden = next(d for d in body["domains"] if d["domain"] == "health_burden")
    metric_ids = {m["metric_id"] for m in health_burden["metrics"]}
    assert "places_diabetes_prevalence" in metric_ids


def test_scenario_scores_returns_real_ranked_tracts(client: TestClient) -> None:
    response = client.get(f"/api/v1/scenarios/{KNOWN_SCENARIO_ID}/scores?limit=5")
    assert response.status_code == 200
    body = response.json()
    assert body["data_mode"] == "live"
    assert body["total_tracts"] == 408
    assert len(body["scores"]) == 5
    scores = [s["score"] for s in body["scores"]]
    assert scores == sorted(scores, reverse=True)
    for s in body["scores"]:
        assert 0.0 <= s["score"] <= 100.0
        assert s["stability_label"] in {
            "Robust",
            "Moderately stable",
            "Assumption-sensitive",
            "Data-limited",
        }


def test_scenario_scores_unknown_scenario_404(client: TestClient) -> None:
    response = client.get("/api/v1/scenarios/not_a_real_scenario/scores")
    assert response.status_code == 404


def test_explain_score_for_top_ranked_tract(client: TestClient) -> None:
    scores_response = client.get(f"/api/v1/scenarios/{KNOWN_SCENARIO_ID}/scores?limit=1")
    top_tract = scores_response.json()["scores"][0]["tract_geoid_2020"]

    response = client.get(f"/api/v1/scenarios/{KNOWN_SCENARIO_ID}/tracts/{top_tract}/explain")
    assert response.status_code == 200
    body = response.json()
    assert body["tract_geoid_2020"] == top_tract
    assert body["score"] is not None
    assert len(body["domains"]) == 5  # default_integrated_screen_v1 weights all 5 domains

    # Every domain's metric contributions must sum to that domain's
    # reported contribution (the same identity verified in
    # pipelines/tests/test_explainability.py, checked here end-to-end
    # through the live API).
    for domain in body["domains"]:
        if domain["metrics"]:
            summed = sum(
                m["contribution"] for m in domain["metrics"] if m["contribution"] is not None
            )
            assert abs(summed - domain["contribution"]) < 0.01

    assert body["monte_carlo"] is not None
    assert body["monte_carlo"]["n_draws"] == 500
    assert body["weight_sensitivity"] is not None
    assert body["weight_sensitivity"]["n_draws"] == 1000
    assert body["data_confidence"] is not None
    assert 0.0 <= body["data_confidence"]["confidence_score"] <= 1.0


def test_explain_score_unknown_tract_404(client: TestClient) -> None:
    response = client.get(f"/api/v1/scenarios/{KNOWN_SCENARIO_ID}/tracts/00000000000/explain")
    assert response.status_code == 404


def test_recommendations_are_ranked_and_fully_evidenced(client: TestClient) -> None:
    response = client.get(f"/api/v1/scenarios/{KNOWN_SCENARIO_ID}/recommendations?top_n=5")
    assert response.status_code == 200
    body = response.json()
    recs = body["recommendations"]
    assert len(recs) == 5
    assert [r["rank"] for r in recs] == [1, 2, 3, 4, 5]
    scores = [r["score"] for r in recs]
    assert scores == sorted(scores, reverse=True)
    for r in recs:
        assert len(r["assumptions"]) >= 2
        assert len(r["supporting_evidence"]) > 0
        assert len(r["source_provenance"]) > 0


def test_optimization_runs_reflect_real_solver_output(client: TestClient) -> None:
    response = client.get("/api/v1/optimization/runs")
    assert response.status_code == 200
    body = response.json()
    assert len(body["runs"]) == 3
    statuses = {r["status"] for r in body["runs"]}
    assert statuses <= {"OPTIMAL", "FEASIBLE", "INFEASIBLE"}
    # k=10 at a 1-mile threshold with a 50% equity constraint was
    # verified infeasible during the live pipeline run (see STATE.md).
    infeasible = [r for r in body["runs"] if r["status"] == "INFEASIBLE"]
    assert len(infeasible) == 1
    assert infeasible[0]["objective_value"] is None


def test_correlation_diagnostics_are_never_tautological(client: TestClient) -> None:
    response = client.get("/api/v1/validation/correlation-diagnostics")
    assert response.status_code == 200
    body = response.json()
    assert len(body["diagnostics"]) == 7
    for d in body["diagnostics"]:
        assert d["is_tautological"] is False
        assert d["spearman_r"] is not None
        assert -1.0 <= d["spearman_r"] <= 1.0
        assert d["n_paired_observations"] == 408
