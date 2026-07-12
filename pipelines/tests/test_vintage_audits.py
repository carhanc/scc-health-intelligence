"""Unit tests for the source freshness/vintage-transparency classifier.

Pure-function tests against classify_entry() -- no warehouse/network
required. Exercises every classification state so the audit's "collapse
vintage into one date" anti-pattern guard is itself tested.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from scc_health_pipeline.audits.vintage_audits import classify_entry


def _entry(**overrides: object) -> dict[str, object]:
    base: dict[str, object] = {
        "source_id": "cdc_places_tract_2025",
        "status": "success",
        "source_vintage": "2025 release",
        "release_date": "2025-12-12",
        "retrieved_at": "2026-07-12T00:00:00+00:00",
        "notes": "",
    }
    base.update(overrides)
    return base


def test_unavailable_status_classified_as_unavailable() -> None:
    result = classify_entry(_entry(status="unavailable"))
    assert result.state == "unavailable"


def test_draft_note_classified_as_draft() -> None:
    result = classify_entry(_entry(notes="resolved to a DRAFT dataset -- rejected"))
    assert result.state == "draft"


def test_fixed_vintage_source_classified_intentional_older_regardless_of_age() -> None:
    old_retrieval = (datetime.now(UTC) - timedelta(days=3650)).isoformat()
    result = classify_entry(_entry(source_id="cdc_atsdr_svi_2022", retrieved_at=old_retrieval))
    assert result.state == "intentional_older"


def test_within_cadence_window_classified_newest_verified() -> None:
    now = datetime.now(UTC)
    recent = (now - timedelta(days=1)).isoformat()
    result = classify_entry(_entry(retrieved_at=recent), now=now)
    assert result.state == "newest_verified"


def test_beyond_two_cadence_windows_classified_stale() -> None:
    now = datetime.now(UTC)
    very_old = (now - timedelta(days=800)).isoformat()  # cadence is 365d for this source_id
    result = classify_entry(_entry(retrieved_at=very_old), now=now)
    assert result.state == "stale"


def test_one_to_two_cadence_windows_classified_lagged() -> None:
    now = datetime.now(UTC)
    somewhat_old = (now - timedelta(days=500)).isoformat()  # cadence is 365d
    result = classify_entry(_entry(retrieved_at=somewhat_old), now=now)
    assert result.state == "lagged"


def test_classification_never_collapses_vintage_and_retrieval_into_one_field() -> None:
    """The core anti-pattern this audit guards against: source_vintage
    (observation period) and retrieved_at (our fetch time) must remain
    two distinct, independently-inspectable fields on every classification."""
    result = classify_entry(_entry())
    assert result.source_vintage == "2025 release"
    assert result.retrieved_at == "2026-07-12T00:00:00+00:00"
    assert result.source_vintage != result.retrieved_at
