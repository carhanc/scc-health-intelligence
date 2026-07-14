# STATE.md — Session Continuity Resume Point

**Last updated:** 2026-07-14 (Phase 9 — Production release candidate — complete)

## Current phase and gate

**Phase 5 — CLOSED. Gate 5: PASS.** (Unchanged; see git history for detail.)

**Phase 6 (Access Lab, real-world accessibility modeling, resource intelligence, mobile-service optimization) — CLOSED. Gate 6: PASS.** Full detail in `TASKS.md`'s Phase 6 section and commit `4c782bc`.

**Phase 6.5 (geography search UX: city/ZIP/district-first search, city drill-down) — CLOSED. Gate 6.5: PASS.** Full detail in `TASKS.md`'s Phase 6.5 section, `DECISIONS.md` DEC-052 through DEC-054, `RISK_REGISTER.md` RISK-026. Commit `e92cb75`.

**Phase 7 (Prioritize, Utilization, Validate) — CLOSED. Gate 7: PASS.** Full detail in `TASKS.md`'s Phase 7 section, `DECISIONS.md` DEC-055 through DEC-060, `RISK_REGISTER.md` RISK-027 through RISK-029. Commit `dc81dfa`.

**Phase 8 (Advocate workspace, Document Intelligence, optional Copilot) — CLOSED. Gate 8: PASS.** Full detail in `TASKS.md`'s Phase 8 section, `DECISIONS.md` DEC-061 through DEC-065, `RISK_REGISTER.md` RISK-030 through RISK-032. Commit `e3363ad`.

**Phase 9 (Production release candidate) — CLOSED for the work achievable without cloud credentials. Gate 9: PASS on every locally-verifiable item; two items (real deploy-workflow and scheduled-refresh-workflow execution) remain genuinely unexecuted, honestly disclosed as RISK-033, not claimed done.** The kickoff instruction explicitly redirected this phase's scope from the original spec pack's "Reporting, export, sharing" to production hardening/deployment-readiness (mapping most closely to the original Phase 10). Full detail in `TASKS.md`'s two Phase 9 sections, `DECISIONS.md` DEC-066 through DEC-069, `RISK_REGISTER.md` RISK-033 through RISK-035.

## What Phase 9 built

1. **Production architecture decision** (DEC-066): Vercel (frontend) + Render (backend, persistent disk for the DuckDB warehouse) + GitHub Releases (versioned data artifact). Anonymous, browser-local Advocate workspaces (no accounts this release). AI-assisted Copilot deliberately left disabled in production.
2. **Backend production hardening**: environment-driven CORS allowlist and `TrustedHostMiddleware` (previously hardcoded to `http://localhost:3000`, now `Settings.cors_allowed_origins`/`trusted_hosts`); security-header middleware; structured JSON request logging with `X-Request-ID` correlation; a new `/api/v1/ready` readiness endpoint distinct from `/health` (returns 503 if the warehouse isn't connected); startup validation that refuses to run in `production` environment without a connected live warehouse (`sys.exit(1)`, tested via a directly-callable `validate_production_readiness()` function rather than fighting FastAPI's threaded lifespan machinery in tests); a dependency-free per-IP token-bucket rate limiter on `/api/v1/documents/analyze` and `/api/v1/copilot/ask`.
3. **Frontend production hardening**: `error.tsx`/`global-error.tsx` route error boundaries and a custom `not-found.tsx` (none existed before — an unhandled render error had no branded fallback); a generated favicon (`app/icon.tsx`, via `next/og`'s `ImageResponse` — no favicon existed at all before this); confirmed zero secret leakage into the client bundle via a live build-output grep; confirmed the existing per-query TanStack Query error-state pattern already gracefully degrades when the backend is unreachable (verified live by stopping the API mid-session and reloading the homepage — every data section showed "temporarily unavailable," nothing crashed).
4. **Production data artifact pipeline**: `scripts/build_production_manifest.py` (introspects the live warehouse, fails loudly on any missing required schema — verified live against the real local warehouse: 59 tables, 670,291 total rows), `scripts/publish_data_artifact.py` (packages + prints/optionally runs the `gh release create` command), `scripts/fetch_data_artifact.py` (downloads + SHA-256-verifies, reads paths from the same `Settings` object the API itself uses, DEC-067 — end-to-end verified via a local HTTP server test this session). `make export-demo` given a real implementation (was a stub) packaging the frozen demo geography snapshot.
5. **CI/CD**: fixed `ci.yml`'s `uv sync` → `uv sync --all-packages` gotcha; added required `security-audit` (`pip-audit` + `pnpm audit`) and `e2e` jobs; added `.github/workflows/scheduled-refresh.yml` (monthly build-validate-publish data refresh) and `.github/workflows/deploy.yml` (deploy-hook trigger + real smoke test against live URLs, fails loudly on any check failure). Every `uses:` action pinned to a commit SHA looked up live via the GitHub API, not guessed (DEC-068 — one guessed SHA was caught wrong and corrected before being trusted).
6. **Dependency/supply-chain audit**: `docs/security/dependency-audit.md` — 0 findings in `pip-audit` (87 packages), 1 moderate finding in `pnpm audit` found and fixed this session (a transitive PostCSS XSS advisory pinned by Next.js itself, GHSA-qx2v-qp2m-jg93, fixed via a `pnpm-workspace.yaml` override, re-verified clean).
7. **Observability**: Sentry wired for both the API (`sentry-sdk[fastapi]`) and the frontend (`@sentry/nextjs` via `instrumentation.ts`/`instrumentation-client.ts`), genuinely no-op when unset — live-verified the server starts and serves 200 both with and without `SENTRY_DSN` configured.
8. **AI production-readiness tooling**: `scripts/copilot_golden_eval.py` — 5 cases (citation grounding, non-causal language, prompt-injection resistance, empty-evidence handling, missing-evidence identification) plus the platform-side citation validator, all passing in deterministic mode this session (AI-assisted cases correctly skip, not fail, with no key configured).
9. **Repository audit — real findings, not just a checklist pass**: removed `vitest-axe`/`axe-core` (genuinely unused direct dependencies, superseded by `@axe-core/playwright`); removed the now-fully-dead `coming-soon.tsx` component (all 9 nav destinations have been real since Phase 8) and simplified/de-speculated `nav-coming-soon.spec.ts` accordingly; removed a duplicate accessibility test; **found and fixed two live, real user-facing bugs** (DEC-069): the homepage footer's "Accessibility" and "Privacy" links both silently pointed at `/validate`, and "Contact / report an issue" linked to Anthropic's own `claude-code` repository instead of this project's — built real `/privacy` and `/accessibility` pages and fixed all three links, plus added the footer-link test coverage that should have caught this originally; found and fixed two genuine internal "Phase N"/"RISK-XXX" jargon leaks into user-facing description text on the Validate and Access Lab pages.
10. **Full documentation set** (12 new/updated files): root `README.md` (didn't exist before), `docs/deployment/production-deployment-guide.md`, `rollback-guide.md`, `environment-variables.md`, `api-operations.md`, `docs/observability/runbook.md`, `docs/data/refresh-runbook.md`, `docs/security/INCIDENT_RESPONSE.md`, `ai-production-readiness.md`, `dependency-audit.md`, `docs/release/release-checklist.md`, plus updates to `TASKS.md`/`DECISIONS.md`/`RISK_REGISTER.md`/`MODEL_CARD.md`/`DATA_DICTIONARY.md`/`.env.example`/the manual visual-review checklist.

## Final verification (all live-run this session, all green)

- `make lint` / `make typecheck` / `make audit` / `make build` — all clean.
- `make test`: **451 backend pytest** (up from 437 — 14 new: 10 system-route tests covering `/ready`, CORS allowlisting, security headers, and startup validation; 4 covered by the new `test_rate_limit.py`'s remaining cases) + **66 frontend vitest**, 0 failures.
- Full Playwright suite (`npx playwright test`, both desktop and mobile projects, run clean with no server interference after two earlier runs were disrupted by this session's own server-restart testing): **322 passed, 2 honest pre-existing skips, 0 failures** (up from 316) — includes the new `production-smoke.spec.ts` (3 tests) and the expanded footer-link regression test in `overview.spec.ts`.
- `scripts/smoke_test.py` against local dev servers: **11/11 checks passed** (frontend load, health, ready, version/data-build-id, one real query each against Explore/Prioritize/Access Lab/Utilization/Validate, one deterministic Advocate generation, one deterministic Copilot ask) — found and fixed several real route-path/schema mismatches in the script itself while getting this to a genuine pass (`/api/v1/geographies/search` not `/geography/search`, `/api/v1/scenarios` not `/api/v1/analytics/scenarios`, the real `GenerateBriefRequest`/`EvidenceBundleResponse` field names).
- `scripts/copilot_golden_eval.py`: 5/5 deterministic-mode cases + the citation validator, all passing; AI-assisted cases correctly and honestly skipped (no `ANTHROPIC_API_KEY` set).
- `scripts/build_production_manifest.py`: real run against the local warehouse — 59 tables, 670,291 total rows, `build_id=prod-20260714T222747Z`.
- Clean-room audit (`scripts/check_clean_room.py`), secret scan, and oversized-file scan (`git status`-scoped) — all clean.
- Client-bundle secret-leakage grep (`.next/static/`) — zero occurrences of any server-side secret env var name.

## Real bugs found and fixed this session (not just tests made to pass)

1. **Footer links wrong** (DEC-069): "Accessibility"/"Privacy" both pointed at `/validate`; "Contact" pointed at Anthropic's own GitHub repo instead of this project's. A real, live, user-facing defect a repository audit caught — fixed with two new real pages and expanded test coverage that would have caught it originally.
2. **`ci.yml`'s `uv sync` gotcha**: would have silently stripped pipeline-package dependencies in CI, exactly the documented STATE.md gotcha from earlier phases, now actually fixed in the workflow file itself (not just documented as a thing to remember).
3. **A guessed GitHub Actions commit SHA was wrong** (`actions/upload-artifact`) — caught by verifying every pin against the live GitHub API rather than trusting a plausible-looking guess (DEC-068).
4. **`pip-audit` initially failed** on the two local editable workspace packages (not published to PyPI, can't be looked up there) — fixed by filtering `-e` lines from the exported requirements before auditing.
5. **A moderate PostCSS XSS vulnerability** (transitive via Next.js itself) — found by `pnpm audit`, fixed via a `pnpm-workspace.yaml` override, re-verified clean and re-verified the full build/test suite still passes with the override in place.
6. **`fetch_data_artifact.py`'s hardcoded warehouse path** would have silently diverged from the API's own `Settings.scc_health_warehouse_path` on a Render deployment with a persistent disk mounted outside the repo checkout — refactored to import and use the same `Settings` object (DEC-067) before this became a real deployment-time bug.
7. **A stale, misleadingly-titled duplicate accessibility test** ("a coming-soon shell page" — actually testing `/advocate`, now a real page) and a now-fully-dead `coming-soon.tsx` component, both cleaned up.
8. **Two internal-jargon leaks into user-facing text** ("Phase 7"/"RISK-015" on Validate; "Phase 4" on Access Lab) — found via a targeted grep sweep, fixed.
9. **No favicon existed at all** — added a real generated one (`app/icon.tsx`), live-verified it serves a valid 32×32 PNG.

## Blockers

**RISK-012, status `accepted`** (unchanged): Claude Preview MCP tool remains blocked by a macOS TCC permission gap. Playwright (driven directly via Bash) remains the primary automated browser-verification path.

**RISK-033 (new, this phase):** the `deploy.yml` and `scheduled-refresh.yml` GitHub Actions workflows have never executed against a real GitHub Actions runner or a real Render/Vercel deployment — no cloud accounts or credentials were available in this environment. Every constituent command was independently, genuinely verified locally instead. This is the single most important open item before this release candidate becomes a real production deployment — see `docs/deployment/production-deployment-guide.md` for the exact runbook.

No other release-blocking issues. RISK-021 through RISK-035 are open-by-design scope/limitation disclosures, not defects — see `RISK_REGISTER.md`.

## Last commands run

Full sequence, all green: `uv run pytest apps/api/tests pipelines/tests` (451 passed), `pnpm -r test` (66 passed), a full clean `npx playwright test` run (322 passed, 2 skips, 0 failures — after two earlier runs were disrupted by this session's own manual dev-server restarts during favicon debugging, both discarded and re-run clean), `make lint && make typecheck && make audit && make build`, `uv run python scripts/check_clean_room.py`, a manual secret scan and oversized-file scan of every changed file, and live runs of every new Phase 9 script (`build_production_manifest.py`, `publish_data_artifact.py`, `fetch_data_artifact.py` via a local HTTP server test, `smoke_test.py`, `copilot_golden_eval.py`, `export_demo.py`).

## Next action (exact resume point)

**Phase 9 (locally-executable scope) is closed.** The kickoff instruction said "Do not begin a Phase 10" and "stop after producing the Phase 9 release candidate and final report" — that is exactly where this session ends: **committed, not pushed, not deployed.**

The genuine next step is not a new phase — it's the repository owner executing the parts of Phase 9 that require their own cloud accounts and credentials, exactly as documented in `docs/deployment/production-deployment-guide.md`:

1. `git push origin main` (after reviewing the Phase 9 commit).
2. Run `make data && make audit && make publish-data` to produce the first real production data artifact, then `scripts/publish_data_artifact.py --publish` (requires `gh auth login`).
3. Create the Render Web Service and Vercel project per the guide's exact steps, including the persistent disk and every listed environment variable.
4. Add the GitHub Actions repo secrets/variables listed in `docs/deployment/environment-variables.md`'s third table.
5. Verify with `scripts/smoke_test.py` and `e2e/production-smoke.spec.ts` against the real deployed URLs (both were only run against localhost this session, per RISK-033).

Only after that real deployment is live and smoke-tested does it make sense to consider what a genuine "Phase 10" would cover — none of that scope should be assumed or started without the repository owner's explicit direction, per the original Phase 9 kickoff's own closing instruction.

## Current running processes

None. All dev/API servers started during this session were stopped cleanly.

## Notes for continuation

- Toolchain: node@22 via Homebrew (`/usr/local/opt/node@22`), not on default PATH — `export PATH="/usr/local/opt/node@22/bin:$PATH"` before any pnpm/node command.
- **New gotcha this session:** never manually `pkill -f "next dev"` while a background Playwright run's own `webServer` (with `reuseExistingServer: true`) might depend on that exact process — it will corrupt the in-flight test run (observed directly this session: a `pkill` aimed at cleaning up a manual debug server instead killed the Playwright job's server mid-run, producing a wave of spurious 404s that looked like a real regression until traced back to the real cause). If a Playwright run is in flight in the background, don't touch dev-server processes until it completes.
- **New pattern this session:** when a background async task needs to be directly unit-testable (e.g. `main.py`'s production-startup validation, originally inline in an `asynccontextmanager` lifespan), extract the actual logic into a plain, synchronously-callable function and have the async wrapper just call it — testing `sys.exit()` behavior through FastAPI/anyio's threaded `TestClient` lifespan machinery directly is unreliable (`SystemExit` gets wrapped in a `BaseExceptionGroup` inside a background thread that a synchronous `try/except` in the test's own thread may not observe).
- **New pattern this session:** a rate limiter or other process-wide singleton used by application code needs an `autouse` pytest fixture resetting its state before every test (`apps/api/tests/conftest.py`, new this phase) — otherwise one test's usage silently consumes budget that leaks into unrelated tests run later in the same session.
- Never guess a GitHub Actions commit SHA for pinning — look it up live via `https://api.github.com/repos/<owner>/<repo>/git/refs/tags/<tag>` and confirm `object.type == "commit"` first (DEC-068).
- `apps/web/e2e/fixtures/` remains the established location for small, intentionally-committed test-document fixtures (unchanged from Phase 8).
- Clean-room boundary reminder (unchanged all sessions, DEC-001): never inspect/reference the sibling project directory this repository's spec calls out, or any other sibling repository outside this project root.
