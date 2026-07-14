# API operations reference (Phase 9)

## Endpoints for operators (not end users)

| Endpoint | Purpose | Notes |
| --- | --- | --- |
| `GET /api/v1/health` | Liveness — is the process up at all | Use for a basic "is it running" ping. Always returns 200 if the process is alive, regardless of data state. |
| `GET /api/v1/ready` | Readiness — can this instance actually serve real queries | Returns 503 if the warehouse doesn't connect. **Use this as the load balancer / hosting-platform health-check path**, not `/health`. |
| `GET /api/v1/version` | Deployed code and data version | `app_version`, `git_commit`, `data_build_id` (null if no production manifest exists yet). |
| `GET /api/v1/warehouse-status` | Detailed warehouse diagnostic | `connected`, `data_mode` (`live`/`demo`/`unavailable`), spatial-extension load status, a human-readable `detail` on any problem. |
| `GET /docs`, `GET /redoc`, `GET /openapi.json` | Interactive/machine-readable API docs | Left enabled in production — the API is read-only and non-authenticated, and its schema contains no secrets. |

## Startup behavior

- `SCC_HEALTH_ENVIRONMENT=local` (default): starts regardless of warehouse state — useful for local development before `make data`/`make demo` has run.
- `SCC_HEALTH_ENVIRONMENT=production`: refuses to start (process exits with code 1, logs a critical-level message) unless the live warehouse connects successfully. This is deliberate — a production instance silently serving with no data would be worse than a failed deploy that's immediately visible in Render's dashboard.

## Rate limiting

Two routes carry a per-client (by `X-Forwarded-For` or direct IP) token-bucket limit: `POST /api/v1/documents/analyze` and `POST /api/v1/copilot/ask` (10 requests, refilling at ~1 per 6 seconds — see `apps/api/src/scc_health_api/rate_limit.py`). Every other route is unlimited — read-only analytics queries have no identified abuse vector that would justify the product cost of limiting them.

This limiter is **in-process**, not shared across instances. If the backend is ever scaled to multiple concurrent instances, this should move to a shared store (Redis or similar) — recorded as a known limitation for that scenario, not a current gap (this release runs a single Render instance).

## CORS and host validation

- `CORS_ALLOWED_ORIGINS` (env, comma-separated): the exact frontend origin(s) allowed to call the API. No wildcard support by design.
- `TRUSTED_HOSTS` (env, comma-separated): the `Host` header values Starlette's `TrustedHostMiddleware` will accept; requests with any other `Host` header are rejected before reaching route handlers.

## Security headers

Every response carries `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, and `Referrer-Policy: strict-origin-when-cross-origin` (`apps/api/src/scc_health_api/middleware.py`). No Content-Security-Policy header is set here — the API serves JSON, not HTML, so CSP is the frontend's (Vercel/Next.js) responsibility, not the API's.

## Request logging

Structured JSON, one line per request, to stdout: `request_id`, `method`, `path`, `status`, `duration_ms`. Never includes request/response bodies, query parameter values, or uploaded content. `X-Request-ID` is echoed in the response header for correlating a frontend error report with a specific backend log line.

## Data endpoints

Every other route under `/api/v1/*` is a read-only query against the DuckDB warehouse (or a templated response over already-fetched evidence, for Advocate/Copilot) — see `docs/04_ARCHITECTURE_IMPLEMENTATION.md` for the full route inventory and `DATA_DICTIONARY.md` for what each underlying table contains. No route performs a write.
