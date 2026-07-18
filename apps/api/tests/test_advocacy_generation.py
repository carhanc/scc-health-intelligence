"""Unit tests for deterministic advocacy generation (services/advocacy_generation.py)."""

from __future__ import annotations

from scc_health_api.schemas.advocacy import EvidenceItem
from scc_health_api.services.advocacy_generation import (
    NON_CAUSAL_DISCLAIMER,
    configuration_hash,
    generate_limitations_note,
    generate_meeting_questions,
    generate_sections,
)


def _metric_evidence(evidence_id: str = "metric:test:1", **overrides) -> EvidenceItem:
    defaults = dict(
        evidence_id=evidence_id,
        category="metric",
        label="Diabetes prevalence",
        value="8.4 % (17th percentile countywide)",
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
        limitation="Model-based small-area estimate.",
        citation="CDC PLACES 2025.",
        source_url=None,
    )
    defaults.update(overrides)
    return EvidenceItem(**defaults)


def test_generate_sections_includes_all_required_sections() -> None:
    sections = generate_sections("Census Tract 5001", "Balanced overview", [_metric_evidence()], "")
    required = {
        "what_is_happening",
        "where_is_it_happening",
        "who_may_be_affected",
        "what_evidence_supports_the_concern",
        "what_evidence_does_not_prove",
        "what_existing_resources_are_nearby",
        "what_intervention_scenarios_fit",
        "sources_and_limitations",
    }
    assert required.issubset(sections.keys())


def test_generate_sections_formats_a_full_iso_timestamp_retrieved_at_as_a_plain_date() -> None:
    # Found via live usability review of the Advocate redesign pass: some
    # evidence items' retrieved_at comes straight from a data manifest as
    # a full ISO 8601 timestamp with microseconds and a timezone offset,
    # which read as a raw, machine-generated string once it landed in
    # generated document text -- other retrieved_at values are already
    # short human-written strings and must pass through unchanged.
    item = _metric_evidence(retrieved_at="2026-07-15T03:38:38.049106+00:00")
    sections = generate_sections("Sunnyvale city", None, [item], "")
    assert "retrieved 2026-07-15)" in sections["sources_and_limitations"]
    assert "03:38:38" not in sections["sources_and_limitations"]

    passthrough_item = _metric_evidence(retrieved_at="computed at analytics build time")
    passthrough_sections = generate_sections("Sunnyvale city", None, [passthrough_item], "")
    assert "retrieved computed at analytics build time)" in passthrough_sections["sources_and_limitations"]


def test_generate_sections_never_omits_evidence_from_the_supports_section() -> None:
    item = _metric_evidence()
    sections = generate_sections("Census Tract 5001", None, [item], "")
    assert item.label in sections["what_evidence_supports_the_concern"]
    assert item.value in sections["what_evidence_supports_the_concern"]


def test_generate_sections_includes_user_notes_only_when_present() -> None:
    without_notes = generate_sections("Census Tract 5001", None, [], "")
    assert "user_notes" not in without_notes
    with_notes = generate_sections("Census Tract 5001", None, [], "A real observation.")
    assert with_notes["user_notes"] == "A real observation."


def test_generate_sections_handles_zero_evidence_without_crashing() -> None:
    sections = generate_sections("Census Tract 5001", None, [], "")
    supports_section = sections["what_evidence_supports_the_concern"]
    assert "No" in supports_section or supports_section


def test_generate_meeting_questions_references_real_evidence_ids() -> None:
    item = _metric_evidence()
    questions = generate_meeting_questions([item], None)
    assert len(questions) > 0
    assert any(item.evidence_id in q.based_on_evidence_ids for q in questions)


def test_generate_meeting_questions_never_crashes_on_empty_evidence() -> None:
    questions = generate_meeting_questions([], None)
    assert len(questions) >= 1
    assert questions[0].category == "clarifying"


def test_generate_meeting_questions_asks_about_scenario_robustness_when_scenario_given() -> None:
    questions = generate_meeting_questions([_metric_evidence()], "Diabetes prevention")
    assert any("Diabetes prevention" in q.question for q in questions)


def test_generate_limitations_note_always_includes_non_causal_disclaimer() -> None:
    note = generate_limitations_note([_metric_evidence()])
    assert NON_CAUSAL_DISCLAIMER in note


def test_generate_limitations_note_flags_modeled_evidence() -> None:
    modeled_item = _metric_evidence(evidence_id="metric:test:2", data_status="modeled")
    note = generate_limitations_note([modeled_item])
    assert "modeled estimate" in note.lower()


def test_configuration_hash_is_deterministic() -> None:
    h1 = configuration_hash(
        "06085500100", "default_integrated_screen_v1", ["a", "b"], "commissioner"
    )
    h2 = configuration_hash(
        "06085500100", "default_integrated_screen_v1", ["b", "a"], "commissioner"
    )
    assert h1 == h2  # order-independent (evidence_ids sorted internally)


def test_configuration_hash_differs_for_different_inputs() -> None:
    h1 = configuration_hash("06085500100", "default_integrated_screen_v1", ["a"], "commissioner")
    h2 = configuration_hash("06085500100", "food_access_v1", ["a"], "commissioner")
    assert h1 != h2
