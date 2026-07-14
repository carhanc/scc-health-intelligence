"""Phase 8 Advocate API: evidence assembly and deterministic advocacy-output
generation. Every evidence item and generated output reads from
already-computed `analytics.*`/`resources.*` tables (DEC-030 unchanged) --
no score, percentile, or access figure is recomputed here.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from scc_health_api.db import WarehouseUnavailableError, get_read_only_connection
from scc_health_api.schemas.advocacy import (
    EvidenceBundleResponse,
    EvidenceItem,
    GeneratedBriefResponse,
)
from scc_health_api.services.advocacy_evidence import assemble_evidence
from scc_health_api.services.advocacy_generation import (
    NON_CAUSAL_DISCLAIMER,
    configuration_hash,
    generate_limitations_note,
    generate_meeting_questions,
    generate_sections,
    now_iso,
)
from scc_health_api.services.analytics_config import load_scenario_metadata
from scc_health_api.settings import Settings, get_settings

router = APIRouter(prefix="/api/v1/advocate", tags=["advocate"])

_KNOWN_GEOGRAPHY_TYPES = {"tract", "place", "supervisor_district", "zcta"}


def _scenario_label(scenario_id: str | None) -> str | None:
    if not scenario_id:
        return None
    for s in load_scenario_metadata():
        if s.scenario_id == scenario_id:
            return s.label
    raise HTTPException(status_code=404, detail=f"Unknown scenario_id: {scenario_id}")


@router.get("/evidence", response_model=EvidenceBundleResponse)
def get_evidence_bundle(
    geography_type: str = Query(...),
    geography_id: str = Query(...),
    scenario_id: str | None = Query(None),
    settings: Settings = Depends(get_settings),
) -> EvidenceBundleResponse:
    if geography_type not in _KNOWN_GEOGRAPHY_TYPES:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Unknown geography_type '{geography_type}'. "
                f"Expected one of {sorted(_KNOWN_GEOGRAPHY_TYPES)}."
            ),
        )
    scenario_label = _scenario_label(scenario_id)

    try:
        with get_read_only_connection(settings) as (conn, mode):
            geography_label, items = assemble_evidence(
                conn, geography_type, geography_id, scenario_id, scenario_label
            )
    except WarehouseUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    if not items:
        raise HTTPException(
            status_code=404,
            detail=(
                f"No evidence found for {geography_type} {geography_id} -- "
                "check the geography ID is real."
            ),
        )

    return EvidenceBundleResponse(
        data_mode=mode,
        geography_type=geography_type,
        geography_id=geography_id,
        geography_label=geography_label,
        scenario_id=scenario_id,
        items=items,
    )


class GenerateBriefRequest(BaseModel):
    output_type: str
    geography_label: str
    scenario_id: str | None = None
    audience: str = "commissioner"
    evidence: list[EvidenceItem]
    notes: str = ""
    # This endpoint never queries the warehouse itself -- it only
    # templates already-fetched evidence -- so it cannot determine
    # live-vs-demo on its own. The caller (which fetched that evidence
    # from a mode-aware endpoint) passes it through rather than this
    # route guessing or hardcoding a value.
    data_mode: str = "live"


@router.post("/generate", response_model=GeneratedBriefResponse)
def generate_brief(request: GenerateBriefRequest) -> GeneratedBriefResponse:
    scenario_label = _scenario_label(request.scenario_id)
    sections = generate_sections(
        request.geography_label, scenario_label, request.evidence, request.notes
    )
    questions = generate_meeting_questions(request.evidence, scenario_label)
    limitations_note = generate_limitations_note(request.evidence)
    evidence_ids = [e.evidence_id for e in request.evidence]

    return GeneratedBriefResponse(
        data_mode=request.data_mode,  # type: ignore[arg-type]
        generated_at=now_iso(),
        output_type=request.output_type,
        geography_label=request.geography_label,
        scenario_label=scenario_label,
        audience=request.audience,
        sections=sections,
        evidence_used=request.evidence,
        questions=questions,
        limitations_note=limitations_note,
        non_causal_disclaimer=NON_CAUSAL_DISCLAIMER,
        configuration_hash=configuration_hash(
            request.geography_label, request.scenario_id, evidence_ids, request.audience
        ),
    )
