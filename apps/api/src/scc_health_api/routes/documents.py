"""Phase 8 Document Intelligence API: ephemeral, in-memory-only analysis
of a single uploaded document. No file is ever written to disk, no
extracted text is persisted beyond the response, and no document content
is logged (docs/09_SECURITY_PRIVACY_GOVERNANCE.md "File upload" /
"Default local-first behavior").
"""

from __future__ import annotations

import duckdb
from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile

from scc_health_api.db import WarehouseUnavailableError, get_read_only_connection
from scc_health_api.rate_limit import document_analyze_limiter
from scc_health_api.schemas.documents import (
    DetectedStructure,
    DocumentAnalysisResponse,
    FinancialAmount,
    TopicMatch,
)
from scc_health_api.services.document_intelligence import (
    FileTooLargeError,
    UnsupportedFileError,
    analyze_document,
)
from scc_health_api.settings import Settings, get_settings

router = APIRouter(prefix="/api/v1/documents", tags=["documents"])

_PROCESSING_DISCLOSURE = (
    "This document was processed in memory, server-side, for this request only -- it was never "
    "written to disk, is not stored after this response, and was not sent to any AI provider. "
    "Uploaded content is treated as untrusted data to analyze, never as instructions."
)


def _known_place_names(conn: duckdb.DuckDBPyConnection) -> list[str]:
    rows = conn.execute("SELECT name FROM geo.places").fetchall()
    return [r[0] for r in rows]


@router.post("/analyze", response_model=DocumentAnalysisResponse)
async def analyze_uploaded_document(
    request: Request, file: UploadFile, settings: Settings = Depends(get_settings)
) -> DocumentAnalysisResponse:
    document_analyze_limiter.check(request)
    content = await file.read()

    try:
        with get_read_only_connection(settings) as (conn, _mode):
            place_names = _known_place_names(conn)
    except WarehouseUnavailableError:
        place_names = []

    try:
        result = analyze_document(file.filename or "uploaded_document", content, place_names)
    except FileTooLargeError as exc:
        raise HTTPException(status_code=413, detail=str(exc)) from exc
    except UnsupportedFileError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    finally:
        content = b""  # discard the reference to raw bytes as soon as possible

    return DocumentAnalysisResponse(
        filename=result.filename,
        file_hash=result.file_hash,
        extraction_method=result.extraction_method,
        page_count=result.page_count,
        truncated=result.truncated,
        structure=DetectedStructure(
            title=result.structure.title,
            dates=result.structure.dates,
            organizations=result.structure.organizations,
            agenda_item_headers=result.structure.agenda_item_headers,
            financial_amounts=[
                FinancialAmount(raw_text=a.raw_text, approximate_value=a.approximate_value)
                for a in result.structure.financial_amounts
            ],
        ),
        detected_geographies=result.detected_geographies,
        detected_topics=[
            TopicMatch(
                topic_id=t.topic_id,
                label=t.label,
                matched_keywords=t.matched_keywords,
                metrics=t.metrics,
                scenarios=t.scenarios,
                resource_categories=t.resource_categories,
                unavailable_reason=t.unavailable_reason,
            )
            for t in result.detected_topics
        ],
        injection_warnings=result.injection_warnings,
        excerpt_by_page={str(k): v for k, v in result.excerpt_by_page.items()},
        processing_disclosure=_PROCESSING_DISCLOSURE,
    )
