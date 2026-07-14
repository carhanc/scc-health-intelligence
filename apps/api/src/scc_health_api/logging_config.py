"""Structured JSON request logging for production (Phase 9).

Emits one JSON line per request with a request ID, route, latency, and
status -- replacing uvicorn's default plaintext access log so hosted
logs (Render, etc.) are machine-parseable. Never logs request bodies,
uploaded document content, or query parameters that could carry PHI-
adjacent text (docs/09_SECURITY_PRIVACY_GOVERNANCE.md "Telemetry").
"""

from __future__ import annotations

import json
import logging
import sys
import time
import uuid
from collections.abc import Awaitable, Callable

from starlette.requests import Request
from starlette.responses import Response

REQUEST_ID_HEADER = "X-Request-ID"

access_logger = logging.getLogger("scc_health_api.access")


def configure_json_logging() -> None:
    """Route the access logger to stdout as single-line JSON. Idempotent --
    safe to call more than once (e.g. under uvicorn --reload)."""
    access_logger.handlers.clear()
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(logging.Formatter("%(message)s"))
    access_logger.addHandler(handler)
    access_logger.setLevel(logging.INFO)
    access_logger.propagate = False


async def request_logging_middleware(
    request: Request, call_next: Callable[[Request], Awaitable[Response]]
) -> Response:
    request_id = request.headers.get(REQUEST_ID_HEADER) or str(uuid.uuid4())
    start = time.monotonic()
    try:
        response = await call_next(request)
    except Exception:
        duration_ms = round((time.monotonic() - start) * 1000, 1)
        access_logger.info(
            json.dumps(
                {
                    "request_id": request_id,
                    "method": request.method,
                    "path": request.url.path,
                    "status": 500,
                    "duration_ms": duration_ms,
                }
            )
        )
        raise
    duration_ms = round((time.monotonic() - start) * 1000, 1)
    response.headers[REQUEST_ID_HEADER] = request_id
    access_logger.info(
        json.dumps(
            {
                "request_id": request_id,
                "method": request.method,
                "path": request.url.path,
                "status": response.status_code,
                "duration_ms": duration_ms,
            }
        )
    )
    return response
