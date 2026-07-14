"""Unit tests for the Phase-9 per-IP token-bucket rate limiter, plus a
route-level confirmation that it is actually wired into the two
genuinely expensive/abusable endpoints (document analysis, Copilot ask)."""

from __future__ import annotations

import io

import pytest
from fastapi import HTTPException, Request
from fastapi.testclient import TestClient
from scc_health_api.main import app
from scc_health_api.rate_limit import TokenBucketRateLimiter

client = TestClient(app)


def _fake_request(client_ip: str = "203.0.113.1") -> Request:
    scope = {
        "type": "http",
        "client": (client_ip, 12345),
        "headers": [],
    }
    return Request(scope)


def test_allows_requests_up_to_capacity() -> None:
    limiter = TokenBucketRateLimiter(capacity=3, refill_per_second=0.0)
    request = _fake_request()
    limiter.check(request)
    limiter.check(request)
    limiter.check(request)  # exactly at capacity -- must not raise


def test_blocks_once_capacity_is_exhausted() -> None:
    limiter = TokenBucketRateLimiter(capacity=2, refill_per_second=0.0)
    request = _fake_request()
    limiter.check(request)
    limiter.check(request)
    with pytest.raises(HTTPException) as exc_info:
        limiter.check(request)
    assert exc_info.value.status_code == 429


def test_different_clients_have_independent_budgets() -> None:
    limiter = TokenBucketRateLimiter(capacity=1, refill_per_second=0.0)
    limiter.check(_fake_request("203.0.113.1"))
    limiter.check(_fake_request("203.0.113.2"))  # a different client, must not raise


def test_refills_over_time(monkeypatch) -> None:
    limiter = TokenBucketRateLimiter(capacity=1, refill_per_second=10.0)
    request = _fake_request()
    limiter.check(request)
    with pytest.raises(HTTPException):
        limiter.check(request)

    # Simulate 1 second passing (10 tokens/sec refill) by advancing the
    # limiter's own clock reference, not real wall-clock sleep.
    limiter._buckets[limiter._client_key(request)].last_refill -= 1.0
    limiter.check(request)  # must not raise -- the bucket has refilled


def test_prefers_x_forwarded_for_header_over_direct_client() -> None:
    limiter = TokenBucketRateLimiter(capacity=1, refill_per_second=0.0)
    scope = {
        "type": "http",
        "client": ("10.0.0.1", 12345),
        "headers": [(b"x-forwarded-for", b"203.0.113.9, 10.0.0.1")],
    }
    request = Request(scope)
    assert limiter._client_key(request) == "203.0.113.9"


def test_document_analyze_route_is_rate_limited_after_repeated_requests() -> None:
    def _upload() -> object:
        return client.post(
            "/api/v1/documents/analyze",
            files={
                "file": ("agenda.txt", io.BytesIO(b"Board of Supervisors meeting."), "text/plain")
            },
        )

    for _ in range(10):
        _upload()
    response = _upload()
    assert response.status_code == 429


def test_copilot_ask_route_is_rate_limited_after_repeated_requests() -> None:
    payload = {"action": "summarize_geography", "instruction": "", "evidence": [], "use_llm": False}
    for _ in range(10):
        client.post("/api/v1/copilot/ask", json=payload)
    response = client.post("/api/v1/copilot/ask", json=payload)
    assert response.status_code == 429
