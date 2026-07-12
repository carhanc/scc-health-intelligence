"""FastAPI application entrypoint for Santa Clara Health Intelligence."""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from scc_health_api.routes.analytics import router as analytics_router
from scc_health_api.routes.geography import router as geography_router
from scc_health_api.routes.sources import router as sources_router
from scc_health_api.routes.system import router as system_router

app = FastAPI(
    title="Santa Clara Health Intelligence API",
    description=(
        "Read-only public-health analytics API. All numeric answers come "
        "from tested analytics tools or read-only warehouse queries, never "
        "freehand computation. See docs/04_ARCHITECTURE_IMPLEMENTATION.md."
    ),
    version="0.1.0",
)

# Local dev only: allow the Next.js dev server to call this API. Tightened
# to an explicit allowlist (no wildcard) before any hosted deployment,
# per docs/09_SECURITY_PRIVACY_GOVERNANCE.md "Required controls > Web/API".
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

app.include_router(system_router)
app.include_router(geography_router)
app.include_router(sources_router)
app.include_router(analytics_router)
