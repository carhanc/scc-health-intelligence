"""Integration tests for the Phase 8 Copilot API (/api/v1/copilot/*).
Runs entirely in no-key mode (no ANTHROPIC_API_KEY in the test
environment) -- verifies the required "no-key user experience"
(docs/05_AI_COPILOT.md §21): the Copilot remains fully functional,
never pretends to be generative AI, and never 500s for lack of a key.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from scc_health_api.main import app


@pytest.fixture
def client(monkeypatch: pytest.MonkeyPatch) -> TestClient:
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    return TestClient(app)


def _evidence_item(evidence_id: str = "metric:test:1") -> dict:
    return {
        "evidence_id": evidence_id,
        "category": "metric",
        "label": "Diabetes prevalence",
        "value": "8.4%",
        "raw_value": 8.4,
        "unit": "%",
        "geography_type": "tract",
        "geography_id": "06085500100",
        "geography_label": "Diabetes prevalence",
        "data_status": "observed",
        "publisher": "CDC",
        "source_vintage": "2025",
        "retrieved_at": "2026-07-13",
        "method": "direct",
        "uncertainty_note": None,
        "limitation": None,
        "citation": "CDC PLACES 2025.",
        "source_url": None,
    }


def test_status_reports_deterministic_mode_without_a_key(client: TestClient) -> None:
    response = client.get("/api/v1/copilot/status")
    assert response.status_code == 200
    body = response.json()
    assert body["llm_configured"] is False
    assert body["provider"] == "deterministic"
    assert body["deterministic_always_available"] is True


def test_ask_works_end_to_end_without_any_ai_key(client: TestClient) -> None:
    response = client.post(
        "/api/v1/copilot/ask",
        json={
            "action": "prepare_questions",
            "instruction": "",
            "evidence": [_evidence_item()],
            "use_llm": True,  # requested, but no key configured -- must still succeed
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["provider"] == "deterministic"
    assert body["is_ai_generated"] is False
    assert len(body["text"]) > 0


def test_ask_never_claims_ai_generation_in_no_key_mode(client: TestClient) -> None:
    response = client.post(
        "/api/v1/copilot/ask",
        json={"action": "summarize_geography", "instruction": "", "evidence": [_evidence_item()]},
    )
    body = response.json()
    assert body["is_ai_generated"] is False
    assert body["model"] is None


def test_ask_returns_evidence_used_matching_input(client: TestClient) -> None:
    item = _evidence_item()
    response = client.post(
        "/api/v1/copilot/ask",
        json={"action": "summarize_geography", "instruction": "", "evidence": [item]},
    )
    body = response.json()
    assert body["evidence_used"][0]["evidence_id"] == item["evidence_id"]


def test_ask_with_use_llm_false_stays_deterministic_even_if_a_key_were_present(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-test-not-real-should-not-be-called")
    response = client.post(
        "/api/v1/copilot/ask",
        json={
            "action": "summarize_geography",
            "instruction": "",
            "evidence": [_evidence_item()],
            "use_llm": False,
        },
    )
    assert response.status_code == 200
    assert response.json()["provider"] == "deterministic"


def test_ask_response_includes_a_reproducible_configuration_hash(client: TestClient) -> None:
    payload = {
        "action": "summarize_geography",
        "instruction": "test",
        "evidence": [_evidence_item()],
    }
    r1 = client.post("/api/v1/copilot/ask", json=payload)
    r2 = client.post("/api/v1/copilot/ask", json=payload)
    assert r1.json()["configuration_hash"] == r2.json()["configuration_hash"]


def test_ask_rejects_an_unknown_action(client: TestClient) -> None:
    response = client.post(
        "/api/v1/copilot/ask",
        json={"action": "not_a_real_action", "instruction": "", "evidence": []},
    )
    assert response.status_code == 422  # pydantic Literal validation
