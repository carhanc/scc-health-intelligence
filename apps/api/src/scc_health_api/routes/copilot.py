"""Phase 8 Copilot API. Deterministic mode is always available with zero
configuration; grounded LLM mode activates only when `ANTHROPIC_API_KEY`
is set server-side (never read from or exposed to the browser, per
docs/09_SECURITY_PRIVACY_GOVERNANCE.md "Secrets management").
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException
from starlette.requests import Request as HttpRequest

from scc_health_api.rate_limit import copilot_ask_limiter
from scc_health_api.schemas.copilot import (
    CopilotAskRequest,
    CopilotAskResponse,
    CopilotStatusResponse,
)
from scc_health_api.services.advocacy_generation import configuration_hash, now_iso
from scc_health_api.services.copilot_provider import (
    AnthropicProvider,
    DeterministicProvider,
    GroundedRequest,
    is_llm_configured,
)

router = APIRouter(prefix="/api/v1/copilot", tags=["copilot"])


@router.get("/status", response_model=CopilotStatusResponse)
def get_copilot_status() -> CopilotStatusResponse:
    configured = is_llm_configured()
    return CopilotStatusResponse(
        llm_configured=configured,
        provider="anthropic" if configured else "deterministic",
        model=AnthropicProvider().model if configured else None,
    )


@router.post("/ask", response_model=CopilotAskResponse)
async def ask_copilot(http_request: HttpRequest, request: CopilotAskRequest) -> CopilotAskResponse:
    copilot_ask_limiter.check(http_request)
    use_llm = request.use_llm and is_llm_configured()
    provider = AnthropicProvider() if use_llm else DeterministicProvider()

    grounded_request = GroundedRequest(
        action=request.action,
        instruction=request.instruction,
        evidence=request.evidence,
        untrusted_document_text=request.untrusted_document_text,
    )
    try:
        result = await provider.complete(grounded_request)
    except Exception as exc:  # noqa: BLE001 -- any provider failure must degrade, not 500 silently
        raise HTTPException(status_code=502, detail=f"AI provider request failed: {exc}") from exc

    return CopilotAskResponse(
        provider=result.provider,  # type: ignore[arg-type]
        model=result.model,
        is_ai_generated=result.provider == "anthropic",
        text=result.text,
        evidence_ids_cited=result.evidence_ids_cited,
        evidence_ids_unsupported=result.evidence_ids_unsupported,
        evidence_used=request.evidence,
        generated_at=now_iso(),
        configuration_hash=configuration_hash(
            request.action, None, [e.evidence_id for e in request.evidence], request.instruction
        ),
    )
