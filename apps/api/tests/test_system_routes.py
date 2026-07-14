"""Contract tests for the Phase-1 system status endpoints, plus the
Phase-9 production-hardening additions (/ready, CORS allowlisting)."""

from __future__ import annotations

from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient
from scc_health_api import main
from scc_health_api.db import WarehouseStatus
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


def test_ready_endpoint_reflects_real_warehouse_connectivity() -> None:
    """/ready must match whatever check_warehouse actually reports for
    this environment -- it is a live readiness probe, not a static ok."""
    response = client.get("/api/v1/ready")
    warehouse = client.get("/api/v1/warehouse-status").json()
    assert response.json()["ready"] == warehouse["connected"]
    assert response.status_code == (200 if warehouse["connected"] else 503)


def test_ready_endpoint_returns_503_when_warehouse_unavailable(monkeypatch) -> None:
    """A hosted deployment's load balancer must be able to distinguish
    "not ready yet" from "ready" using the HTTP status alone."""

    def _fake_check_warehouse(_settings: object) -> WarehouseStatus:
        return WarehouseStatus(
            connected=False,
            path="/nonexistent/warehouse.duckdb",
            spatial_extension_loaded=False,
            data_mode="unavailable",
            detail="Neither the live nor the demo warehouse exists yet.",
        )

    monkeypatch.setattr("scc_health_api.routes.system.check_warehouse", _fake_check_warehouse)
    response = client.get("/api/v1/ready")
    assert response.status_code == 503
    body = response.json()
    assert body["ready"] is False
    assert body["data_mode"] == "unavailable"
    assert body["detail"]


def test_cors_only_allows_configured_origins() -> None:
    """The default (local dev) CORS allowlist must reject an arbitrary
    origin -- confirms the allowlist is enforced, not a permissive
    wildcard, per docs/09_SECURITY_PRIVACY_GOVERNANCE.md."""
    allowed = client.get(
        "/api/v1/health", headers={"Origin": "http://localhost:3000"}
    )
    assert allowed.headers.get("access-control-allow-origin") == "http://localhost:3000"

    disallowed = client.get(
        "/api/v1/health", headers={"Origin": "https://evil.example.com"}
    )
    assert "access-control-allow-origin" not in {k.lower() for k in disallowed.headers}


def test_security_headers_present_on_every_response() -> None:
    response = client.get("/api/v1/health")
    assert response.headers.get("x-content-type-options") == "nosniff"
    assert response.headers.get("x-frame-options") == "DENY"
    assert response.headers.get("referrer-policy") == "strict-origin-when-cross-origin"
    assert response.headers.get("x-request-id")


def test_startup_refuses_to_run_in_production_without_a_live_warehouse(monkeypatch) -> None:
    """A production deployment must fail loudly at startup, not silently
    serve a broken/dataless instance (CLAUDE.md "A failed source must
    produce a visible unavailable state... never a silent fallback")."""
    fake_settings = SimpleNamespace(environment="production")

    def _fake_check_warehouse(_settings: object) -> WarehouseStatus:
        return WarehouseStatus(
            connected=False,
            path="/nonexistent/warehouse.duckdb",
            spatial_extension_loaded=False,
            data_mode="unavailable",
            detail="no warehouse",
        )

    monkeypatch.setattr(main, "check_warehouse", _fake_check_warehouse)

    with pytest.raises(SystemExit) as exc_info:
        main.validate_production_readiness(fake_settings)
    assert exc_info.value.code == 1


def test_startup_allows_production_when_warehouse_is_live(monkeypatch) -> None:
    fake_settings = SimpleNamespace(environment="production")

    def _fake_check_warehouse(_settings: object) -> WarehouseStatus:
        return WarehouseStatus(
            connected=True,
            path="/warehouse/scc_health.duckdb",
            spatial_extension_loaded=True,
            data_mode="live",
        )

    monkeypatch.setattr(main, "check_warehouse", _fake_check_warehouse)
    main.validate_production_readiness(fake_settings)  # must not raise


def test_startup_validation_is_a_no_op_outside_production() -> None:
    fake_settings = SimpleNamespace(environment="local")
    main.validate_production_readiness(fake_settings)  # must not raise, no warehouse check needed
