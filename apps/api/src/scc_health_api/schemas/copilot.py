"""Copilot API schemas (Phase 8)."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel

from scc_health_api.schemas.advocacy import EvidenceItem

CopilotAction = Literal[
    "summarize_geography",
    "explain_prioritization",
    "prepare_questions",
    "compare_geographies",
    "connect_document_to_evidence",
    "draft_public_comment",
    "draft_commissioner_briefing",
    "list_what_cannot_be_concluded",
    "identify_missing_evidence",
    "rewrite_for_public_audience",
]


class CopilotStatusResponse(BaseModel):
    llm_configured: bool
    provider: str
    model: str | None
    deterministic_always_available: bool = True


class CopilotAskRequest(BaseModel):
    action: CopilotAction
    instruction: str = ""
    evidence: list[EvidenceItem]
    untrusted_document_text: str | None = None
    use_llm: bool = True


class CopilotAskResponse(BaseModel):
    provider: Literal["anthropic", "deterministic"]
    model: str | None
    is_ai_generated: bool
    text: str
    evidence_ids_cited: list[str]
    evidence_ids_unsupported: list[str]
    evidence_used: list[EvidenceItem]
    generated_at: str
    configuration_hash: str
