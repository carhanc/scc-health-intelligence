"""Contract tests for the Phase-1 system status endpoints."""

from __future__ import annotations

from fastapi.testclient import TestClient
from scc_health_api.main import app

client = TestClient(app)


def test_health_endpoint_returns_ok() -> None:
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["service"] == "scc-health-api"
    assert "version" in body


def test_version_endpoint_returns_app_version() -> None:
    response = client.get("/api/v1/version")
    assert response.status_code == 200
    body = response.json()
    assert "app_version" in body
    assert "data_build_id" in body
    assert "git_commit" in body


def test_warehouse_status_endpoint_is_truthful_when_warehouse_absent() -> None:
    """Before Phase 2/3 build the warehouse file, this must report
    connected=false with a clear reason — never a fake success."""
    response = client.get("/api/v1/warehouse-status")
    assert response.status_code == 200
    body = response.json()
    assert "connected" in body
    assert "path" in body
    if not body["connected"]:
        assert body["detail"]
