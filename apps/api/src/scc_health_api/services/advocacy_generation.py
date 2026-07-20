"""Deterministic advocacy-output generation (Phase 8): rules/templates
over already-assembled, already-cited `EvidenceItem` objects -- no AI
call, no freehand arithmetic, always available with zero configuration
(docs/05_AI_COPILOT.md §2.1's "deterministic mode... guarantees core
usability and reproducibility").
"""

from __future__ import annotations

import hashlib
import json
from datetime import UTC, datetime

from scc_health_api.schemas.advocacy import EvidenceItem, MeetingQuestion

NON_CAUSAL_DISCLAIMER = (
    "Every figure here is a real, cited measurement or a disclosed modeled estimate -- none of "
    "it establishes that any factor causes an outcome, or that any specific intervention would "
    "resolve it. This is a screening and evidence-organization tool, not a program evaluation or "
    "a guarantee of impact."
)


def configuration_hash(
    geography_id: str, scenario_id: str | None, evidence_ids: list[str], audience: str
) -> str:
    payload = json.dumps(
        {
            "geography_id": geography_id,
            "scenario_id": scenario_id,
            "evidence_ids": sorted(evidence_ids),
            "audience": audience,
        },
        sort_keys=True,
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()[:16]


def _format_evidence_line(item: EvidenceItem) -> str:
    return f"- {item.label}: {item.value} (source: {item.publisher}, {item.source_vintage})"


def _format_retrieved_at(retrieved_at: str) -> str:
    """Most `retrieved_at` values are already short, human-written strings
    ("computed at analytics build time", "2026-07-13") -- but some come
    straight from a data manifest's full ISO 8601 timestamp with
    microsecond precision and a timezone offset (e.g.
    "2026-07-15T03:38:38.049106+00:00"), which reads as a raw, machine-
    generated string when it lands in generated document text (found via
    live usability review of this pass). Reduce that specific shape to a
    plain date; anything else passes through unchanged."""
    try:
        return datetime.fromisoformat(retrieved_at).date().isoformat()
    except ValueError:
        return retrieved_at


def generate_sections(
    geography_label: str,
    scenario_label: str | None,
    evidence: list[EvidenceItem],
    notes: str,
) -> dict[str, str]:
    metric_items = [e for e in evidence if e.category == "metric"]
    score_items = [e for e in evidence if e.category == "scenario_score"]
    access_items = [e for e in evidence if e.category == "access"]
    utilization_items = [e for e in evidence if e.category == "utilization"]
    resource_items = [e for e in evidence if e.category == "resource"]

    what_is_happening = (
        f"Selected evidence for {geography_label}"
        + (f" under the '{scenario_label}' priority lens" if scenario_label else "")
        + f" includes {len(metric_items)} health/access measure(s)"
        + (f" and {len(utilization_items)} utilization measure(s)" if utilization_items else "")
        + "."
    )
    if metric_items:
        what_is_happening += "\n\n" + "\n".join(_format_evidence_line(e) for e in metric_items)

    where = f"Geography: {geography_label}."

    who_may_be_affected = (
        "This platform does not identify individuals or estimate individual-level risk. "
        "The evidence below describes population-level, tract-aggregated measures for this "
        "geography only."
    )

    what_evidence_supports = "\n".join(
        _format_evidence_line(e) for e in (metric_items + score_items)
    ) or "No scored evidence was selected for this workspace."

    what_evidence_does_not_prove = (
        "These measures are associations and modeled estimates, not causal evidence. A high "
        "score or rate identifies a place for closer investigation -- it does not establish "
        "that any specific factor causes the underlying condition, or that any specific "
        "intervention would resolve it. See the Validate page for full methodology and "
        "independent validation results."
    )

    resources_nearby = "\n".join(_format_evidence_line(e) for e in resource_items) or (
        "No nearby-resource evidence was selected for this workspace -- see the Access Lab for "
        "a full resource browser."
    )

    intervention_scenarios = (
        f"Under '{scenario_label}', the Prioritize page's site & program constraints tab shows "
        "modeled mobile-clinic siting scenarios that could apply here -- see the Prioritize page "
        "for the full, disclosed set of pre-vetted scenarios (this platform does not expose live, "
        "freely-parameterized solving)."
        if scenario_label
        else (
            "Select a priority scenario in Prioritize to see which modeled intervention "
            "scenarios apply here."
        )
    )

    access_summary = "\n".join(_format_evidence_line(e) for e in access_items)
    if access_summary:
        intervention_scenarios += "\n\n" + access_summary

    sources_and_limitations = "\n".join(
        f"- {e.label}: {e.citation} ({e.publisher}, {e.source_vintage}, "
        f"retrieved {_format_retrieved_at(e.retrieved_at)})"
        + (f" -- {e.limitation}" if e.limitation else "")
        for e in evidence
    ) or "No evidence selected."

    sections = {
        "what_is_happening": what_is_happening,
        "where_is_it_happening": where,
        "who_may_be_affected": who_may_be_affected,
        "what_evidence_supports_the_concern": what_evidence_supports,
        "what_evidence_does_not_prove": what_evidence_does_not_prove,
        "what_existing_resources_are_nearby": resources_nearby,
        "what_intervention_scenarios_fit": intervention_scenarios,
        "sources_and_limitations": sources_and_limitations,
    }
    if notes.strip():
        sections["user_notes"] = notes.strip()
    return sections


def generate_meeting_questions(
    evidence: list[EvidenceItem], scenario_label: str | None
) -> list[MeetingQuestion]:
    questions: list[MeetingQuestion] = []

    metric_items = [e for e in evidence if e.category == "metric"]
    for item in metric_items[:3]:
        questions.append(
            MeetingQuestion(
                question=(
                    "What is the department's current strategy for addressing "
                    f"{item.label.lower()} in this area, given the reported value of "
                    f"{item.value}?"
                ),
                based_on_evidence_ids=[item.evidence_id],
                category="evidence_based",
            )
        )

    utilization_items = [e for e in evidence if e.category == "utilization"]
    for item in utilization_items[:1]:
        questions.append(
            MeetingQuestion(
                question=(
                    "What follow-up data would help confirm whether this modeled utilization "
                    "estimate reflects a real service gap, versus an allocation artifact?"
                ),
                based_on_evidence_ids=[item.evidence_id],
                category="follow_up",
            )
        )

    resource_items = [e for e in evidence if e.category == "resource"]
    for item in resource_items[:1]:
        questions.append(
            MeetingQuestion(
                question=(
                    f"Are the {item.value} in this area currently accepting new patients, and do "
                    "they accept the payer types most common among residents here?"
                ),
                based_on_evidence_ids=[item.evidence_id],
                category="clarifying",
            )
        )

    if scenario_label:
        questions.append(
            MeetingQuestion(
                question=(
                    f"If priorities shifted away from '{scenario_label}', would this area still "
                    "rank as a priority under a different, equally reasonable weighting?"
                ),
                based_on_evidence_ids=[
                    e.evidence_id for e in evidence if e.category == "scenario_score"
                ],
                category="follow_up",
            )
        )

    if not questions:
        questions.append(
            MeetingQuestion(
                question=(
                    "What additional public data would help clarify the situation in this area?"
                ),
                based_on_evidence_ids=[],
                category="clarifying",
            )
        )
    return questions


def generate_limitations_note(evidence: list[EvidenceItem]) -> str:
    modeled = [e for e in evidence if e.data_status == "modeled"]
    derived = [e for e in evidence if e.data_status == "derived"]
    parts = []
    if modeled:
        parts.append(
            f"{len(modeled)} of {len(evidence)} evidence item(s) are modeled estimates, not "
            "directly observed figures -- see each item's own method and limitation note."
        )
    if derived:
        parts.append(
            f"{len(derived)} of {len(evidence)} evidence item(s) are this platform's own derived "
            "scores or averages, not raw published figures."
        )
    parts.append(NON_CAUSAL_DISCLAIMER)
    return " ".join(parts)


def now_iso() -> str:
    return datetime.now(UTC).isoformat()
