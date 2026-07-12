"""Tests confirming the HPI adapter fails loudly and truthfully rather than
silently succeeding or fabricating data -- see DECISIONS.md DEC-018."""

from __future__ import annotations

import pytest
from scc_health_pipeline.sources.ca_hpi import CaHpiAdapter, blocked_manifest_entry


def test_discover_returns_no_resources() -> None:
    adapter = CaHpiAdapter()
    assert adapter.discover() == []


def test_fetch_raises_rather_than_returning_fake_success() -> None:
    adapter = CaHpiAdapter()
    with pytest.raises(NotImplementedError):
        adapter.fetch(resource=None, context=None)  # type: ignore[arg-type]


def test_quality_checks_never_pass() -> None:
    adapter = CaHpiAdapter()
    report = adapter.quality_checks([])
    assert not report.passed
    assert report.issues


def test_blocked_manifest_entry_has_unavailable_status() -> None:
    entry = blocked_manifest_entry()
    assert entry["status"] == "unavailable"
    assert entry["resource_url"] is None
    assert entry["bytes"] == 0
    assert "notes" in entry and entry["notes"]
