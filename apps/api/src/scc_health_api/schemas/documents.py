"""Document Intelligence response schemas (Phase 8). Nothing here is
persisted server-side -- every response is computed once, in-memory,
for the single request that uploaded the file, and the raw bytes are
discarded immediately after (see services/document_intelligence.py and
docs/security/document-processing.md).
"""

from __future__ import annotations

from pydantic import BaseModel


class FinancialAmount(BaseModel):
    raw_text: str
    approximate_value: float


class DetectedStructure(BaseModel):
    title: str | None
    dates: list[str]
    organizations: list[str]
    agenda_item_headers: list[str]
    financial_amounts: list[FinancialAmount]


class TopicMatch(BaseModel):
    topic_id: str
    label: str
    matched_keywords: list[str]
    metrics: list[str]
    scenarios: list[str]
    resource_categories: list[str]
    unavailable_reason: str | None


class DocumentAnalysisResponse(BaseModel):
    filename: str
    file_hash: str
    extraction_method: str
    page_count: int
    truncated: bool
    structure: DetectedStructure
    detected_geographies: list[str]
    detected_topics: list[TopicMatch]
    injection_warnings: list[str]
    excerpt_by_page: dict[str, str]
    processing_disclosure: str
