"""Shared pytest fixtures for the API test suite."""

from __future__ import annotations

import pytest
from scc_health_api.rate_limit import copilot_ask_limiter, document_analyze_limiter


@pytest.fixture(autouse=True)
def _reset_rate_limiters() -> None:
    """The document-analysis and Copilot rate limiters are process-wide
    singletons (Phase 9, `rate_limit.py`) so a real deployment enforces a
    per-client budget across requests. In tests, that same global state
    would otherwise leak between test functions -- one test's requests
    could trip another, unrelated test's rate limit. Reset before every
    test so each test starts with a full bucket."""
    document_analyze_limiter._buckets.clear()
    copilot_ask_limiter._buckets.clear()
