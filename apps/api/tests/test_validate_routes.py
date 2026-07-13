"""Integration tests for the Phase 7 Validate API (/api/v1/validate/*)."""

from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from scc_health_api.main import app
from scc_health_api.routes.validate import _rank, _spearman
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


# --- Pure-Python Spearman correlation, checked against scipy's reference
# implementation (a dev/test dependency here, not a runtime one -- the API
# package itself never imports scipy, see routes/validate.py's docstring).


def test_spearman_matches_scipy_reference_with_ties() -> None:
    from scipy import stats

    x = [10.0, 20.0, 20.0, 5.0, 40.0, 40.0, 40.0]
    y = [1.0, 5.0, 3.0, 2.0, 9.0, 8.0, 8.0]
    expected, _p = stats.spearmanr(x, y)
    assert _spearman(x, y) == pytest.approx(expected)


def test_spearman_perfect_correlation_is_one() -> None:
    assert _spearman([1.0, 2.0, 3.0, 4.0], [10.0, 20.0, 30.0, 40.0]) == pytest.approx(1.0)


def test_spearman_perfect_inverse_is_negative_one() -> None:
    assert _spearman([1.0, 2.0, 3.0, 4.0], [40.0, 30.0, 20.0, 10.0]) == pytest.approx(-1.0)


def test_spearman_too_few_points_is_none() -> None:
    assert _spearman([1.0, 2.0], [1.0, 2.0]) is None


def test_rank_handles_ties_with_average_rank() -> None:
    assert _rank([10.0, 20.0, 20.0, 5.0]) == [2.0, 3.5, 3.5, 1.0]


# --- API routes


def test_uncertainty_summary_for_named_scenario(client: TestClient) -> None:
    response = client.get(
        "/api/v1/validate/uncertainty-summary?scenario_id=default_integrated_screen_v1"
    )
    assert response.status_code == 200
    body = response.json()
    assert body["n_tracts_scored"] > 0
    assert body["n_tracts_data_limited"] >= 0
    assert sum(c["n_tracts"] for c in body["stability_label_counts"]) == body["n_tracts_scored"]


def test_uncertainty_summary_unknown_scenario_is_404(client: TestClient) -> None:
    response = client.get("/api/v1/validate/uncertainty-summary?scenario_id=not_a_real_scenario")
    assert response.status_code == 404


def test_sensitivity_summary_balanced_preset_matches_balanced_scenario_exactly(
    client: TestClient,
) -> None:
    """The 'balanced' preset and 'Balanced overview' scenario use the
    identical equal-weight vector -- their rank correlation must be
    exactly 1.0, a real sanity check on the correlation math."""
    response = client.get(
        "/api/v1/validate/sensitivity-summary?scenario_id=default_integrated_screen_v1"
    )
    assert response.status_code == 200
    body = response.json()
    comparisons = {c["preset_id"]: c for c in body["preset_comparisons"]}
    assert comparisons["balanced"]["spearman_rank_correlation_vs_named_scenario"] == pytest.approx(
        1.0
    )
    assert len(comparisons) == 5


def test_audit_status_reflects_a_real_clean_run(client: TestClient) -> None:
    response = client.get("/api/v1/validate/audit-status")
    assert response.status_code == 200
    body = response.json()
    assert body["run_at"] is not None
    assert len(body["suites"]) >= 8
    for suite in body["suites"]:
        assert suite["n_checks"] == suite["n_passed"] + suite["n_failed"]
        assert len(suite["checks"]) == suite["n_checks"]


def test_known_limitations_cover_causal_and_individual_risk(client: TestClient) -> None:
    response = client.get("/api/v1/validate/known-limitations")
    assert response.status_code == 200
    body = response.json()
    categories = {item["category"] for item in body["limitations"]}
    assert "Causal interpretation" in categories
    assert "Individual-level risk" in categories
    assert len(body["limitations"]) >= 5


def test_reproducibility_scenario_hashes_are_stable_across_requests(client: TestClient) -> None:
    r1 = client.get("/api/v1/validate/reproducibility").json()
    r2 = client.get("/api/v1/validate/reproducibility").json()
    hashes1 = {h["scenario_id"]: h["weights_hash"] for h in r1["scenario_hashes"]}
    hashes2 = {h["scenario_id"]: h["weights_hash"] for h in r2["scenario_hashes"]}
    assert hashes1 == hashes2
    assert len(hashes1) == 8
    assert r1["monte_carlo_seed"] == 42
    assert r1["data_manifest_source_count"] > 0


def test_reproducibility_hash_reflects_the_actual_weight_vector(client: TestClient) -> None:
    """Two scenarios sharing a hash is legitimate (and does happen today:
    mobile_transit_care_v1 and older_adult_support_v1 use an identical
    weight vector by design, per their own scenarios.yml notes about
    falling back to the same generic proxies) -- what must hold is that
    the hash is a genuine function of the weights, not a per-scenario
    label. Every DISTINCT weight vector must map to a distinct hash, and
    every IDENTICAL weight vector must map to the SAME hash."""
    from scc_health_api.services.analytics_config import load_scenario_metadata

    response = client.get("/api/v1/validate/reproducibility")
    hashes_by_id = {h["scenario_id"]: h["weights_hash"] for h in response.json()["scenario_hashes"]}

    weight_vector_to_hashes: dict[str, set[str]] = {}
    for scenario in load_scenario_metadata():
        key = str(sorted(scenario.weights.items()))
        weight_vector_to_hashes.setdefault(key, set()).add(hashes_by_id[scenario.scenario_id])

    for _key, hashes in weight_vector_to_hashes.items():
        assert len(hashes) == 1
