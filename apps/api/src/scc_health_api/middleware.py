"""Security-header middleware for production hardening (Phase 9).

These headers protect against MIME-sniffing, clickjacking, and referrer
leakage -- real, low-cost mitigations for a read-only analytics API that
also accepts file uploads and renders no HTML itself. No CSP is set here
because the API never serves HTML; the frontend (Next.js/Vercel) is
responsible for its own CSP.
"""

from __future__ import annotations

from collections.abc import Awaitable, Callable

from starlette.requests import Request
from starlette.responses import Response


async def security_headers_middleware(
    request: Request, call_next: Callable[[Request], Awaitable[Response]]
) -> Response:
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    return response
