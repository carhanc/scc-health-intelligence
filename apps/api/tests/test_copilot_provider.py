"""Unit tests for the Copilot provider abstraction (services/copilot_provider.py).

`DeterministicProvider.complete` is declared `async` (to satisfy the
`LLMProvider` protocol shared with the real network-calling
`AnthropicProvider`) but performs no actual I/O -- run it via
`asyncio.run()` directly rather than adding a `pytest-asyncio` dependency
for a single non-blocking coroutine.
"""

from __future__ import annotations

import asyncio

import pytest
from scc_health_api.schemas.advocacy import EvidenceItem
from scc_health_api.services.copilot_provider import (
    DeterministicProvider,
    GroundedRequest,
    _validate_citations,
    is_llm_configured,
)


def _evidence(evidence_id: str = "metric:test:1") -> EvidenceItem:
    return EvidenceItem(
        evidence_id=evidence_id,
        category="metric",
        label="Diabetes prevalence",
        value="8.4%",
        raw_value=8.4,
        unit="%",
        geography_type="tract",
        geography_id="06085500100",
        geography_label="Diabetes prevalence",
        data_status="observed",
        publisher="CDC",
        source_vintage="2025",
        retrieved_at="2026-07-13",
        method="direct",
        uncertainty_note=None,
        limitation=None,
        citation="CDC PLACES 2025.",
        source_url=None,
    )


def test_is_llm_configured_reflects_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    assert is_llm_configured() is False
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-test-not-real")
    assert is_llm_configured() is True


def test_validate_citations_accepts_only_ids_actually_given() -> None:
    text = "Some drafted text.\nEvidence used: [metric:test:1, metric:test:2]"
    valid, invalid = _validate_citations(text, {"metric:test:1"})
    assert valid == ["metric:test:1"]
    assert invalid == ["metric:test:2"]


def test_validate_citations_handles_missing_evidence_line() -> None:
    valid, invalid = _validate_citations("No citation line here.", {"metric:test:1"})
    assert valid == []
    assert invalid == []


def test_validate_citations_never_fabricates_a_valid_id_not_in_the_known_set() -> None:
    """The model could claim any string as an evidence_id -- the
    validator must never trust a claimed id that wasn't actually
    provided in the request, even if it looks plausible."""
    text = "Evidence used: [metric:invented_by_model:999]"
    valid, invalid = _validate_citations(text, {"metric:test:1"})
    assert valid == []
    assert invalid == ["metric:invented_by_model:999"]


def test_deterministic_provider_never_claims_to_be_ai() -> None:
    provider = DeterministicProvider()
    request = GroundedRequest(action="summarize_geography", instruction="", evidence=[_evidence()])
    response = asyncio.run(provider.complete(request))
    assert response.provider == "deterministic"


def test_deterministic_provider_prepare_questions_produces_real_questions() -> None:
    provider = DeterministicProvider()
    request = GroundedRequest(action="prepare_questions", instruction="", evidence=[_evidence()])
    response = asyncio.run(provider.complete(request))
    assert len(response.text) > 0
    assert response.evidence_ids_unsupported == []


def test_deterministic_provider_list_what_cannot_be_concluded_includes_disclaimer() -> None:
    provider = DeterministicProvider()
    request = GroundedRequest(
        action="list_what_cannot_be_concluded", instruction="", evidence=[_evidence()]
    )
    response = asyncio.run(provider.complete(request))
    lowered = response.text.lower()
    assert "screening" in lowered or "causal" in lowered or "guarantee" in lowered


def test_deterministic_provider_only_cites_evidence_it_was_actually_given() -> None:
    item = _evidence()
    provider = DeterministicProvider()
    request = GroundedRequest(action="summarize_geography", instruction="", evidence=[item])
    response = asyncio.run(provider.complete(request))
    assert response.evidence_ids_cited == [item.evidence_id]
