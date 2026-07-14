"""Shared evidence and advocacy-generation schemas (Phase 8).

`EvidenceItem` is the single common shape every advocacy surface (Document
Intelligence claim-matching, deterministic brief generation, and the
optional grounded Copilot) cites from -- every field CLAUDE.md requires
("source, vintage, retrieval time, geography, unit, method, and
uncertainty/quality note") is present on every item, and `evidence_id` is
deterministic (a stable function of its inputs) so the same underlying
fact always gets the same ID across a session, a saved workspace, and a
regenerated export.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel

DataStatus = Literal["observed", "modeled", "suppressed", "derived"]
EvidenceCategory = Literal[
    "metric", "scenario_score", "access", "utilization", "resource", "document_passage"
]


class EvidenceItem(BaseModel):
    evidence_id: str
    category: EvidenceCategory
    label: str
    value: str
    raw_value: float | None
    unit: str | None
    geography_type: str
    geography_id: str
    geography_label: str
    data_status: DataStatus
    publisher: str
    source_vintage: str
    retrieved_at: str
    method: str | None
    uncertainty_note: str | None
    limitation: str | None
    citation: str
    source_url: str | None


class EvidenceBundleResponse(BaseModel):
    data_mode: Literal["live", "demo"]
    geography_type: str
    geography_id: str
    geography_label: str
    scenario_id: str | None
    items: list[EvidenceItem]


class MeetingQuestion(BaseModel):
    question: str
    based_on_evidence_ids: list[str]
    category: Literal["clarifying", "evidence_based", "follow_up"]


class GeneratedBriefResponse(BaseModel):
    data_mode: Literal["live", "demo"]
    generated_at: str
    output_type: str
    geography_label: str
    scenario_label: str | None
    audience: str
    sections: dict[str, str]
    evidence_used: list[EvidenceItem]
    questions: list[MeetingQuestion]
    limitations_note: str
    non_causal_disclaimer: str
    configuration_hash: str
