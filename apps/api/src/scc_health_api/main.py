"""FastAPI application entrypoint for Santa Clara Health Intelligence."""

from __future__ import annotations

import logging
import sys
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware

from scc_health_api.db import check_warehouse
from scc_health_api.logging_config import configure_json_logging, request_logging_middleware
from scc_health_api.middleware import security_headers_middleware
from scc_health_api.routes.access import router as access_router
from scc_health_api.routes.advocate import router as advocate_router
from scc_health_api.routes.analytics import router as analytics_router
from scc_health_api.routes.copilot import router as copilot_router
from scc_health_api.routes.documents import router as documents_router
from scc_health_api.routes.geography import router as geography_router
from scc_health_api.routes.prioritize import router as prioritize_router
from scc_health_api.routes.sources import router as sources_router
from scc_health_api.routes.system import router as system_router
from scc_health_api.routes.utilization import router as utilization_router
from scc_health_api.routes.validate import router as validate_router
from scc_health_api.settings import Settings, get_settings

settings = get_settings()


def validate_production_readiness(app_settings: Settings) -> None:
    """Refuses to start in `production` without a connected live
    warehouse -- a production deployment must fail loudly at startup,
    never silently serve a broken/dataless instance (CLAUDE.md: "A failed
    source must produce a visible unavailable state... never a silent
    fallback"). Split out from `_lifespan` so it's directly unit-testable
    without going through FastAPI/anyio's threaded lifespan machinery."""
    if app_settings.environment != "production":
        return
    status = check_warehouse(app_settings)
    if not status.connected or status.data_mode != "live":
        logging.getLogger("scc_health_api").critical(
            "Refusing to start in production without a connected live warehouse: %s",
            status.detail or f"data_mode={status.data_mode}",
        )
        sys.exit(1)


@asynccontextmanager
async def _lifespan(_app: FastAPI) -> AsyncIterator[None]:
    configure_json_logging()
    validate_production_readiness(settings)
    if settings.sentry_dsn:
        import sentry_sdk

        sentry_sdk.init(
            dsn=settings.sentry_dsn,
            environment=settings.sentry_environment or settings.environment,
            send_default_pii=False,
        )
    yield


app = FastAPI(
    title="Santa Clara Health Intelligence API",
    description=(
        "Read-only public-health analytics API. All numeric answers come "
        "from tested analytics tools or read-only warehouse queries, never "
        "freehand computation. See docs/04_ARCHITECTURE_IMPLEMENTATION.md."
    ),
    version="0.1.0",
    # The interactive docs (default paths: /docs, /redoc, /openapi.json)
    # describe a read-only, non-authenticated API with no secrets in its
    # schema -- safe to leave enabled in production; there is no
    # privileged surface they would expose.
    lifespan=_lifespan,
)

# CORS origins are environment-driven (Settings.cors_allowed_origins,
# CORS_ALLOWED_ORIGINS env var) -- defaults to the local Next.js dev
# server only. A hosted deployment sets this to its real frontend
# origin(s); never a wildcard, per docs/09_SECURITY_PRIVACY_GOVERNANCE.md
# "Required controls > Web/API".
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_allowed_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)
app.add_middleware(TrustedHostMiddleware, allowed_hosts=settings.trusted_hosts)
app.middleware("http")(security_headers_middleware)
app.middleware("http")(request_logging_middleware)

app.include_router(system_router)
app.include_router(geography_router)
app.include_router(sources_router)
app.include_router(analytics_router)
app.include_router(access_router)
app.include_router(utilization_router)
app.include_router(prioritize_router)
app.include_router(validate_router)
app.include_router(advocate_router)
app.include_router(documents_router)
app.include_router(copilot_router)
