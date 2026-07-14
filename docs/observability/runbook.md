# Observability runbook (Phase 9)

## What is monitored, and how

| Signal | Mechanism | Where to look |
| --- | --- | --- |
| Backend liveness | `GET /api/v1/health` | Render's own health-check ping, or `curl` manually |
| Backend readiness (real data connected) | `GET /api/v1/ready` (503 if not ready) | Render's configured health-check path (see deployment guide step 4.6) |
| Deployed code/data version | `GET /api/v1/version` | Returns `app_version`, `git_commit`, `data_build_id` |
| Structured request logs | JSON lines to stdout (`logging_config.py`) | Render's own log viewer/log stream |
| Backend exceptions | Sentry (if `SENTRY_DSN` set) | Sentry project dashboard |
| Frontend exceptions | Sentry (if `NEXT_PUBLIC_SENTRY_DSN` set) | Same Sentry project, or a separate one |
| Deploy success/failure | GitHub Actions run status | Actions tab, `Deploy` workflow |
| Scheduled refresh success/failure | GitHub Actions run status + step summary | Actions tab, `Scheduled data refresh` workflow |

This is a deliberately minimal, coherent stack — Sentry for exceptions on both ends, Render/Vercel/GitHub Actions' own built-in dashboards for everything else. No second overlapping vendor was added for marginal value.

## Every backend log line

```json
{"request_id": "...", "method": "GET", "path": "/api/v1/geographies/search", "status": 200, "duration_ms": 12.4}
```

Never contains request bodies, uploaded document content, or query parameter values — only the request path template, method, status, and latency (`docs/09_SECURITY_PRIVACY_GOVERNANCE.md` "Telemetry"). `X-Request-ID` is echoed back in the response header, so a frontend error report and a backend log line for the same request can be correlated if both include it.

## What must never enter telemetry

- Uploaded document content or extracted text (Document Intelligence is in-memory-only and never logged — `docs/security/document-handling.md`).
- Advocate workspace contents (browser-local; never sent to the backend at all except as ephemeral request payloads for evidence/generation calls, and those payloads aren't logged).
- Any API key or secret value (Sentry's `send_default_pii: false` setting on both SDKs; no secret is ever included in a log message).
- Copilot prompts/responses in full (Sentry captures exceptions, not successful request/response bodies).

## What constitutes an incident

- `/api/v1/ready` returning 503 for more than a few minutes (the deployed backend has no usable data).
- The `Deploy` workflow's smoke-test step failing (a real regression reached production).
- The `Scheduled data refresh` workflow failing repeatedly (the published data artifact is going stale — see `docs/data/refresh-runbook.md`).
- A spike in Sentry-reported exceptions on either service.

See `docs/security/incident-response.md` for what to do about each.

## Inspecting a failed refresh

1. GitHub → Actions → "Scheduled data refresh" → the failed run.
2. Check the step that failed: `make data` (a live-source fetch broke — check which pipeline stage), `make audit` (a real data-quality problem was caught, working as intended), or the publish step (a `gh` auth/permissions issue).
3. The step summary (bottom of the run page) reports the `build_id`/table/row counts of the last *successful* build if the run failed partway — nothing was overwritten, since publish only happens after every prior step passes.

## Correlating a frontend error with a backend request

1. In Sentry, the frontend error event may include the failed request's URL.
2. If the corresponding `X-Request-ID` response header was captured (browser dev tools → Network tab, or a Sentry breadcrumb), search the backend's structured logs (Render log stream) for that `request_id`.
