# Phase 9 production-readiness requirements

Phase 8 deliberately did not perform a production database/object-storage migration, deploy to hosted infrastructure, or build authenticated server-side persistence — those belong to Phase 9 per the Phase 8 kickoff scope boundary ("Production backend, deployment, scheduled refreshes, durable storage, observability, and release engineering belong to Phase 9"). This document records exactly what Phase 9 needs to pick up, so that work isn't rediscovered from scratch.

## 1. Server-side workspace persistence

Phase 8's `AdvocacyWorkspace` (`apps/web/lib/workspace/schema.ts`) is deliberately shaped so a server-side version can be added without rewriting the model:

- The schema already carries a `schemaVersion` field and a `migrateWorkspace()` function that never throws on malformed input — a server-side store should reuse this exact schema and migration function, not invent a second shape.
- All IDs (`workspaceId`, `evidence_id`, document content hashes) are already stable strings suitable as primary/foreign keys.
- What Phase 9 needs to add: an authenticated API surface (`POST/GET/PUT/DELETE /api/v1/workspaces`), a real persistence layer (the project's existing DuckDB-for-analytics + a proper transactional store for user data — DuckDB is not the right choice for concurrent multi-user writes; a lightweight Postgres/SQLite-per-tenant or similar should be evaluated), and a migration path for a user's existing browser-local workspaces to import into their new account (the existing `exportWorkspaceJson()`/`importWorkspaceJson()` functions already provide the exact transfer format needed).

## 2. Authentication

Phase 8 has **no account system** by design — every workspace is anonymous and browser-local. Phase 9 needs to decide and implement:

- An auth provider (evaluate options; no county-specific SSO requirement is known yet — confirm with stakeholders before building).
- Authorization scoping: a workspace belongs to exactly one user in the simplest model; whether commissioners/staff need shared/team workspaces is an open product question, not decided in Phase 8.
- What happens to a workspace created anonymously before a user signs in (should map to the existing import-JSON flow, not a new one).

## 3. Document storage and retention

Phase 8's document intelligence is deliberately **stateless and in-memory-only** — no uploaded file is ever written to disk (`docs/security/document-handling.md`). If Phase 9 wants to support "reopen this workspace later and still see the original document," it needs:

- A genuine decision (not a default) on whether to persist raw uploaded bytes at all, given this platform's stated "no PHI storage or handling capability, by design" (`CLAUDE.md`) — persisting raw documents changes that posture and needs its own privacy/security review, not a quiet addition.
- If persisted: encryption at rest, a retention/deletion policy, and a re-scan-on-access story (a document validated safe at upload time doesn't stay validated forever if the validation logic changes).
- The safer, recommended default: continue persisting only extracted *findings* (as Phase 8 already does), and require a user to re-upload the source document if they want it re-analyzed later.

## 4. AI provider operations

Phase 8's `AnthropicProvider` reads `ANTHROPIC_API_KEY` from the server process environment with no additional operational scaffolding. Phase 9 needs, if AI-assisted mode is to be enabled for real users at scale:

- Rate limiting on `/api/v1/copilot/ask` (not implemented in Phase 8) to control cost and abuse.
- The golden-evaluation set and adversarial red-team pass recorded as open in `RISK_REGISTER.md` RISK-032.
- Cost monitoring/budgeting for the configured provider.
- A decision on request logging/observability for AI-assisted requests that's compatible with the "no hidden training use, configurable retention" requirement already stated in the Phase 8 kickoff spec (not yet implemented — Phase 8 has no logging of AI request/response content at all, which trivially satisfies the requirement but doesn't yet give an operator visibility into usage).

## 5. Scheduled data refresh, observability, release engineering

Out of Phase 8's scope entirely and unchanged from prior phases' own resume notes (`STATE.md`):

- No scheduled/automated data-refresh pipeline exists yet (`make data` is run manually).
- No production hosting, CI/CD deploy pipeline, or observability (error tracking, uptime monitoring, structured logging) exists yet — `SENTRY_DSN` is scaffolded in `.env.example` but unused.
- No production database migration (DuckDB remains the local analytics store; see `PLAN.md` for the original optional PostGIS deployment path, still undecided).

## 6. What Phase 9 should NOT need to redo

To avoid re-deriving context: Phase 8's evidence-assembly layer (`advocacy_evidence.py`), document-intelligence pipeline, deterministic generation functions, and Copilot provider abstraction are all designed to be reused as-is by a server-side workspace feature — none of that logic needs to change to support authenticated, persistent workspaces. The only new work is the persistence/auth layer described above sitting on top of what already exists.
