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
    # Phase 6 (DEC-049) expanded the mobile-clinic optimizer step from 3
    # to 6 runs -- a real sensitivity/robustness sweep varying k_sites,
    # distance_threshold, and whether an equity constraint applies.
    assert len(body["runs"]) == 6
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
    assert len(body["diagnostics"]) == 8
    for d in body["diagnostics"]:
        assert d["is_tautological"] is False
        assert d["spearman_r"] is not None
        assert -1.0 <= d["spearman_r"] <= 1.0
        assert d["n_paired_observations"] == 408


def test_tract_boundaries_join_real_scenario_scores(client: TestClient) -> None:
    response = client.get(f"/api/v1/geographies/tracts/boundaries?scenario_id={KNOWN_SCENARIO_ID}")
    assert response.status_code == 200
    body = response.json()
    assert len(body["features"]) == 408
    scored = [f for f in body["features"] if f["properties"]["score"] is not None]
    # Every tract has full domain coverage for the default scenario in
    # this dataset (verified live, Phase 4), so every tract should score.
    assert len(scored) == 408
    for f in scored:
        assert 0.0 <= f["properties"]["score"] <= 100.0
        assert f["properties"]["stability_label"] in {
            "Robust",
            "Moderately stable",
            "Assumption-sensitive",
            "Data-limited",
        }


def test_tract_boundaries_carry_scenario_independent_domain_scores(client: TestClient) -> None:
    """DEC-073: each feature also carries all 5 domain scores, powering
    the Explore map's per-domain layer switcher -- these come from
    analytics.domain_scores, a table with no scenario_id column, so the
    values must be identical regardless of which scenario_id is passed."""
    domain_score_keys = [
        "health_burden_score",
        "access_barriers_score",
        "environmental_burden_score",
        "resource_accessibility_score",
        "workforce_shortage_score",
    ]

    response_a = client.get(
        f"/api/v1/geographies/tracts/boundaries?scenario_id={KNOWN_SCENARIO_ID}"
    )
    assert response_a.status_code == 200
    features_a = {
        f["properties"]["tract_geoid_2020"]: f["properties"] for f in response_a.json()["features"]
    }

    for props in features_a.values():
        for key in domain_score_keys:
            assert key in props
            if props[key] is not None:
                assert 0.0 <= props[key] <= 100.0

    # A tract with a known, live-verified domain-score profile (see
    # docs/design/explore-health-equity-research.md §3) -- pins the exact
    # values so a future pipeline change that silently alters domain
    # scoring is caught here, not just structurally.
    tract = features_a["06085503112"]
    assert tract["health_burden_score"] == pytest.approx(84.18304668304668)
    assert tract["access_barriers_score"] == pytest.approx(94.31818181818181)
    assert tract["environmental_burden_score"] == pytest.approx(95.57739557739558)
    assert tract["resource_accessibility_score"] == pytest.approx(19.656019656019655)
    assert tract["workforce_shortage_score"] == pytest.approx(93.55036855036855)

    # Domain scores must not vary by scenario_id -- verified against a
    # second, differently-weighted named scenario.
    response_b = client.get(
        "/api/v1/geographies/tracts/boundaries?scenario_id=diabetes_prevention_v1"
    )
    assert response_b.status_code == 200
    features_b = {
        f["properties"]["tract_geoid_2020"]: f["properties"] for f in response_b.json()["features"]
    }
    for key in domain_score_keys:
        assert features_a["06085503112"][key] == features_b["06085503112"][key]
