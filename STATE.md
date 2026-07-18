# STATE.md — Session Continuity Resume Point

**Last updated:** 2026-07-17 (Explore health-equity comprehension pass — second pass on branch `ux/health-equity-redesign`, not merged to `main`)

## Most recent work: Explore health-equity comprehension pass (second pass, same branch, not on `main`)

`main` is unchanged since the Phase 9 correction pass described below. Branch `ux/health-equity-redesign` (still not pushed, not merged, not deployed) now has **7 commits**: the original 5-commit UX redesign (see the section immediately below) plus 2 new commits from a focused second pass centered on Explore-page comprehension, selected-geography storytelling, driving-factor explanation accuracy, and a new mobile bottom-sheet pattern for the selected-geography profile.

**What the second pass did:** fixed a real mathematical-accuracy defect where the "driven mainly by X" explanation sorted by raw domain percentile instead of scenario-weighted contribution (DEC-074, already existed before this specific continuation but re-verified here); added a scenario-independent per-domain map layer (DEC-073); added a non-modal Explore orientation state for first-time users; rebuilt the selected-tract panel into a "Health Equity Screening Profile" with a contribution-ranked driver list and disclosed confidence/interpretation language; and added a mobile collapsed-summary-bar + bottom-sheet pattern (2-state by design, not 3-state — see DEC-075's context and the visual-review doc §9) so the profile doesn't force a long single-column layout below the 1280px breakpoint. Two more real defects were found and fixed during live verification of the new mobile sheet (Compare not closing the sheet, a raw place GEOID showing in the collapsed bar instead of a resolved name) — DEC-075.

**Full research:** `docs/design/explore-health-equity-research.md`. **Full verification evidence:** `docs/design/explore-health-equity-visual-review.md`. **Key decisions:** `DECISIONS.md` DEC-073 through DEC-075.

**Verification, all live-run this session:** frontend unit 98/98 (17 files); backend pytest 192/192; full Playwright suite 425 passed / 29 honestly-skipped / 0 failed in a clean, uncontended run; axe 0 serious/critical violations across every page and state, including 2 new mobile-specific scans; responsive suite passing at all 6 required breakpoints (1440/1280/1024/768/390/320); `eslint`/`tsc --noEmit` (frontend) and `ruff check`/`mypy` (backend) all clean; production `next build` clean, ~2.6MB `.next/static`, zero new runtime dependencies; map-layer switching verified to cost zero additional network requests (read the browser network log before/after three consecutive layer switches). One tooling artifact was investigated and ruled out, not a real defect — see `docs/design/explore-health-equity-visual-review.md` §6 (the in-app preview-pane browser tool showed a false-negative empty panel for the backend-down state; a standalone real-Chromium Playwright script against the identical state showed the correct error card; now covered by a permanent automated test using route interception instead of physically stopping the shared dev server).

**A self-inflicted, since-corrected environment issue, worth flagging for future sessions:** restarting the backend server from `apps/web` instead of the repo root caused `.env.local`'s relative `SCC_HEALTH_WAREHOUSE_PATH` to resolve against the wrong directory, silently (and correctly, per the app's own truthful-fallback design in `db.py`) falling back to the demo warehouse, which lacks Phase-4 analytics tables — producing real, temporary 503s and several confusing Playwright failures until diagnosed via `/api/v1/warehouse-status` and fixed by restarting from the repo root. Not a code defect; recorded so a future session restarting either server manually always does so from the repository root (`make dev` already does this correctly).

---

## Prior work: first health-equity UX redesign pass (5 commits, same branch)

Commits, in order: `9af8b64` (design tokens + 11 new shared components + DEC-072), `89912f9` (Overview 7/16 fix + Explore recolor/mobile-order fix), `dd7e345` (Prioritize top-25 default, Access Lab glossary term, Utilization scroll-shadow), `e6074cd` (Validate/Advocate/Copilot/Data polish), `6b94bfe` (a11y/responsive/visual verification, `docs/design/health-equity-ux-visual-review.md`).

**Full plan:** `docs/design/health-equity-ux-redesign.md`. **Full verification evidence:** `docs/design/health-equity-ux-visual-review.md`. **Key decision:** `DECISIONS.md` DEC-072 (the concern-gradient color reversal).

**The single most important finding this session:** Overview's "stable rankings" card read "16" directly under a "7 high-concern tracts" card with copy implying 16 was a subset of 7 — it wasn't; the code independently re-filtered the full 408-tract array. Verified against the live warehouse: the true, intended value is 7 of 7. Fixed in `apps/web/app/overview-snapshot.tsx`; regression-tested in `apps/web/test/overview-snapshot.test.tsx` with a fixture that discriminates the old (buggy) computation from the new one.

**Verification, all live-run this session:** 85/85 vitest unit tests; 25/25 axe accessibility checks (zero serious/critical violations); full Playwright suite 161 passed/1 expected-skip (desktop-chromium) and 221 passed/1 expected-skip (mobile-chromium); `tsc --noEmit` and `eslint` clean on both `apps/web` and `packages/ui`; zero new runtime dependencies added (checked via `git diff main...ux/health-equity-redesign -- **/package.json`); a real, non-assumed WCAG-contrast + colorblind-simulation check on the new concern gradient (see the visual-review doc §3); 10 representative real Playwright screenshots inspected directly across all 9 pages and all 6 required breakpoints.

**One pre-existing, out-of-scope defect found and disclosed, not fixed:** Access Lab's tab row visually clips at 390px/320px — predates this branch, touches shared `Tabs.tsx` which this redesign did not modify. Noted in the visual-review doc, not silently dropped.

**Next action for this thread:** the branch is complete and ready for review. Nothing further is planned unless the repository owner requests changes, wants it merged, or wants the disclosed Access Lab tab-clipping issue fixed as a follow-up.

---

## Prior phase history (all on `main`, unaffected by the branch above)

## Current phase and gate

**Phase 5 — CLOSED. Gate 5: PASS.** (Unchanged; see git history for detail.)

**Phase 6 (Access Lab, real-world accessibility modeling, resource intelligence, mobile-service optimization) — CLOSED. Gate 6: PASS.** Full detail in `TASKS.md`'s Phase 6 section and commit `4c782bc`.

**Phase 6.5 (geography search UX: city/ZIP/district-first search, city drill-down) — CLOSED. Gate 6.5: PASS.** Full detail in `TASKS.md`'s Phase 6.5 section, `DECISIONS.md` DEC-052 through DEC-054, `RISK_REGISTER.md` RISK-026. Commit `e92cb75`.

**Phase 7 (Prioritize, Utilization, Validate) — CLOSED. Gate 7: PASS.** Full detail in `TASKS.md`'s Phase 7 section, `DECISIONS.md` DEC-055 through DEC-060, `RISK_REGISTER.md` RISK-027 through RISK-029. Commit `dc81dfa`.

**Phase 8 (Advocate workspace, Document Intelligence, optional Copilot) — CLOSED. Gate 8: PASS.** Full detail in `TASKS.md`'s Phase 8 section, `DECISIONS.md` DEC-061 through DEC-065, `RISK_REGISTER.md` RISK-030 through RISK-032. Commit `e3363ad`.

**Phase 9 (Production release candidate) — CLOSED for the work achievable without cloud credentials.** Full detail in `TASKS.md`'s two Phase 9 sections, `DECISIONS.md` DEC-066 through DEC-069, `RISK_REGISTER.md` RISK-033 through RISK-035. Commit `9e5af93`.

**Phase 9 — Pre-deployment correction pass — CLOSED.** A verified-blocker correction pass run before real cloud provisioning, prompted by three concrete, confirmed issues the original Phase 9 pass's data-artifact pipeline hadn't accounted for: **the repository is private** (the artifact-fetch script assumed public downloads), Render's persistent disk isn't mounted at build time (the deployment guide's Build Command would have fetched the artifact to the wrong place at the wrong time), and a published data release was never actually delivered to the running backend. Full detail in `TASKS.md`'s "Phase 9 — Pre-deployment correction pass" section, `DECISIONS.md` DEC-070/DEC-071, `RISK_REGISTER.md` RISK-036.

## What the correction pass fixed

1. **Private GitHub Release artifact support** (DEC-070): `scripts/fetch_data_artifact.py` rewritten around the GitHub REST API -- authenticated release lookup (exact tag or `latest`, resolving the newest published `data-*` release), authenticated asset downloads via `Accept: application/octet-stream` with a custom `HTTPRedirectHandler` that strips the `Authorization` header on any cross-host redirect (GitHub's asset endpoint redirects to a temporary, pre-signed cloud-storage URL), and a clean unauthenticated fallback via `browser_download_url` for a genuinely public repository. New `DATA_ARTIFACT_GITHUB_TOKEN` env var. 18 new mocked tests (`scripts/tests/test_fetch_data_artifact.py`) covering every documented failure mode (401/403/404/malformed manifest/SHA mismatch), `latest` vs. exact-tag resolution, atomic preservation of a known-good warehouse when a download fails partway, the already-up-to-date skip-download path, and -- specifically -- that the token is never present in any printed output.
2. **Render persistent-disk timing corrected** (DEC-071): a new `scripts/render_start.sh` (the Start Command) fetches/verifies the data artifact at **runtime start**, falls back to an existing warehouse if that fetch fails but one is already present, refuses to start only if truly nothing usable exists, then `exec`s uvicorn. The Build Command now only installs the serving package's dependencies. A `render.yaml` Blueprint (optional, reduces manual dashboard-entry risk) encodes the corrected topology with every secret `sync: false`. The paid-plan requirement for a persistent disk was verified against Render's own documentation this session, not assumed.
3. **Automatic data-refresh delivery**: `scheduled-refresh.yml` now triggers the Render deploy hook after a successful publish and polls `/api/v1/version` for up to 10 minutes until production reports the new `build_id`, failing loudly on timeout. Production defaults to `DATA_ARTIFACT_RELEASE_TAG=latest`, so no separate "update the pinned tag" step is needed for routine refreshes; a specific historical tag remains supported for rollback (`docs/deployment/rollback-guide.md`).
4. **CI private-repository support**: `ci.yml`'s release-listing request is now authenticated with `github.token`; the token is passed through to the fetch step as `DATA_ARTIFACT_GITHUB_TOKEN`; a genuine API failure now fails the job loudly (via `curl -sf`), distinct from the honest "no release published yet" first-run skip; added an explicit commit-verification step.
5. **Deploy workflow hardening**: added `workflow_dispatch` with the job-level `if:` condition corrected to actually run for a manual trigger (not only `workflow_run`); a dedicated configuration-check step computes secret/variable presence once via job outputs and **fails the job loudly** if a deploy hook is configured with no matching production-URL variable (previously: silently deployed without being able to verify the result); checks out the exact `workflow_run.head_sha` that passed CI; replaced the fixed 90-second sleep with bounded polling (backend readiness+version, frontend response, ~5-minute timeout each).
6. **Vercel monorepo configuration verified, not assumed**: a real, clean `git clone` + `pnpm install --frozen-lockfile` from the repo root + `next build` from `apps/web` (exactly matching Vercel's Root Directory behavior) confirmed the workspace-linked `@scc-health/ui` package resolves and all 14 routes build correctly. Confirmed via a full `process.env` grep that `NEXT_PUBLIC_API_BASE_URL` is genuinely the only required frontend production variable. Confirmed no `vercel.json` is needed.
7. **Documentation rewritten to match the corrected implementation**: `docs/deployment/production-deployment-guide.md` (full rewrite), `environment-variables.md` (added the token + a troubleshooting table), `rollback-guide.md` (corrected build-time→runtime-start language, added the `latest`-vs-pinned-tag mechanism), `docs/data/refresh-runbook.md` (added the "deliver" step), `docs/observability/runbook.md` (added the deliver-step failure mode and token-redaction note), plus `TASKS.md`/`DECISIONS.md`/`RISK_REGISTER.md`/`MODEL_CARD.md`/`.env.example`.
8. **Workflow syntax validated with a real parser**: `actionlint` (installed via Homebrew this session) -- 0 errors across all three workflow files.
9. **A genuine local end-to-end deployment simulation** (new `scripts/simulate_private_deployment.py`, kept as a reusable verification tool): builds a real manifest from the real local warehouse, simulates GitHub's authenticated private-release API serving that real manifest and real warehouse bytes (no real network call), runs the real `fetch_artifact()` download-and-verify path into a temp "persistent disk," then starts a real FastAPI app instance in `production` environment mode against it and confirms `/api/v1/ready` and `/api/v1/version` both genuinely succeed. All steps passed.

## Final verification (all live-run this session, all green)

- `make lint` / `make typecheck` / `make audit` / `make build` — all clean. (`make audit` initially showed 5 real, pre-existing, time-based `freshness_state` failures for HRSA sources -- unrelated to any code in this pass, caused simply by real time passing since an earlier session's `make data` run exceeded HRSA's declared 1-day refresh cadence; resolved by re-running `run_core_sources_pipeline`, a small, fast, targeted refresh, not the full `make data`. Re-verified clean after: 258/258 checks passing.)
- `make test`: **469 pytest** (451 backend + 18 new in `scripts/tests/`) + **66 frontend vitest**, 0 failures.
- `actionlint` (installed via Homebrew): **0 errors** across `ci.yml`, `deploy.yml`, `scheduled-refresh.yml` — a real semantic/shellcheck-integrated parser, not just a YAML syntax check.
- `scripts/simulate_private_deployment.py`: all 4 steps passed against the real local warehouse (48.0 MB) -- authenticated download simulation, atomic install, SHA-256 verification, and a real FastAPI app instance starting in production mode and serving `/api/v1/ready`/`/api/v1/version` successfully.
- A real, clean-clone simulation of Vercel's exact install/build sequence (`git clone` to a temp dir, `pnpm install --frozen-lockfile` from repo root, `next build` from `apps/web`) — all 14 routes built successfully, confirming the workspace-package resolution the deployment guide depends on.
- Full Playwright suite (`npx playwright test`, both desktop and mobile projects) — run as the final regression backstop for this pass (no frontend UI code was touched by this correction pass; this confirms nothing was inadvertently broken).
- Clean-room audit (`scripts/check_clean_room.py`), secret scan, and oversized-file scan — all clean.

## Real bugs/gaps found and fixed this correction pass

1. **The entire data-artifact download path would have failed against the real, private repository** — the original implementation used unauthenticated `browser_download_url`s, which return 404 for any private repo regardless of whether the release exists. This would have been discovered only at the moment of first real deployment. DEC-070.
2. **The deployment guide's Build Command would have fetched the data artifact before Render's persistent disk was mounted** — the file would have been written to the build's ephemeral filesystem and lost on every deploy, never actually landing on the disk. DEC-071.
3. **A published data release was never actually delivered anywhere** — `scheduled-refresh.yml` created a new GitHub Release but had no mechanism to tell the running backend about it; fixed with a deploy-hook trigger + bounded `/api/v1/version` polling.
4. **`deploy.yml`'s job-level `if:` condition would have skipped the job entirely on a manual `workflow_dispatch`** trigger (it only checked `github.event.workflow_run.conclusion`, which doesn't exist for a dispatch event) — would have silently prevented the very "trigger the first deployment manually" use case being added.
5. **A partially-configured deployment (a hook secret with no matching URL variable) would previously deploy without any way to verify the result, while still reporting overall success** — now fails the job loudly with an actionable message instead.
6. **5 real, pre-existing `make audit` freshness failures** (HRSA sources exceeding their declared refresh cadence, purely from wall-clock time passing since an earlier session) — resolved with a small, targeted `run_core_sources_pipeline` re-run rather than either ignoring the failure or running the full 1.5-hour `make data`.
7. **A guessed Homebrew/tooling gap**: `actionlint` wasn't installed; installed it (with its `shellcheck` dependency) via Homebrew this session specifically to get real workflow validation rather than settling for a bare YAML parse check.

## Blockers

**RISK-012, status `accepted`** (unchanged): Claude Preview MCP tool remains blocked by a macOS TCC permission gap. Playwright (driven directly via Bash) remains the primary automated browser-verification path.

**RISK-033 (updated this pass, still open):** the `deploy.yml` and `scheduled-refresh.yml` GitHub Actions workflows have never executed against real GitHub Actions/Render/Vercel infrastructure — no cloud accounts or credentials were available in this environment, and this remains true after the correction pass. What changed: the workflows are now believed to be *correct* (private-repo auth fixed, disk-timing fixed, delivery fixed, actionlint-clean), where before this pass they had at least three confirmed, concrete bugs that would have surfaced only during a real deployment attempt. This is still the single most important open item before this release candidate becomes a real production deployment.

**RISK-036 (new this pass):** `DATA_ARTIFACT_GITHUB_TOKEN` is a real credential requiring manual rotation before its expiration (no automated rotation/warning mechanism exists). Low-to-moderate priority; `scripts/render_start.sh`'s fallback-to-existing-warehouse behavior means a lapsed token doesn't cause downtime for an already-running service, only blocks a fresh disk/service creation.

No other release-blocking issues. RISK-021 through RISK-036 are open-by-design scope/limitation disclosures, not defects — see `RISK_REGISTER.md`.

## Last commands run

Full sequence, all green: `make lint && make typecheck && make audit && make build`, `uv run pytest apps/api/tests pipelines/tests scripts/tests` (469 passed), `pnpm -r test` (66 passed), `actionlint .github/workflows/*.yml` (0 errors), `uv run python scripts/simulate_private_deployment.py` (all 4 steps passed), a real clean-clone Vercel-install/build simulation, a full `npx playwright test` run, `uv run python scripts/check_clean_room.py`, and a manual secret scan and oversized-file scan of every changed file.

## Next action (exact resume point)

**Phase 9, including this correction pass, is closed.** Nothing here begins a Phase 10. The genuine next step is the repository owner executing the credentialed cloud-provisioning steps, exactly as documented in `docs/deployment/production-deployment-guide.md` (rewritten this pass to match the corrected implementation exactly):

1. Create a GitHub fine-grained personal access token scoped to read-only "Contents" access on this one private repository (guide step 1) — needed by both Render and, implicitly, already handled automatically for CI via the built-in `github.token`.
2. `git push origin main` (after reviewing this commit).
3. `make data && make audit && make data-manifest && uv run python scripts/publish_data_artifact.py --publish` to produce and publish the first real data artifact (requires `gh auth login`).
4. Create the Render Web Service (via the provided `render.yaml` Blueprint, or the manual dashboard steps — guide step 4), including the persistent disk (paid plan required) and the token from step 1.
5. Create the Vercel project (guide step 5), confirming "Include source files outside of the Root Directory" is enabled.
6. Go back and set `CORS_ALLOWED_ORIGINS`/`TRUSTED_HOSTS` on Render now that both real URLs exist (guide step 6).
7. Add the GitHub Actions repo secrets/variables (guide step 7, full table in `docs/deployment/environment-variables.md`).
8. Verify with `scripts/smoke_test.py` and `e2e/production-smoke.spec.ts` against the real deployed URLs (both were only run against localhost/simulated infrastructure this session, per RISK-033).

Only after that real deployment is live and smoke-tested does it make sense to consider what a genuine "Phase 10" would cover — none of that scope should be assumed or started without the repository owner's explicit direction.

## Current running processes

None. All dev/API servers started during this session were stopped cleanly.

## Notes for continuation

- **Second-pass note:** dev servers (`uvicorn` on :8000, `next dev` on :3000) were left running at the end of this pass. **Always start/restart the backend from the repository root**, never from `apps/web` or another subdirectory — `.env.local`'s `SCC_HEALTH_WAREHOUSE_PATH` is a relative path, and starting `uvicorn` from the wrong cwd makes it silently (and correctly, per its own truthful-fallback design) fall back to the demo warehouse, which lacks Phase-4 analytics tables, producing real 503s on every analytics-dependent endpoint. Diagnose with `curl http://localhost:8000/api/v1/warehouse-status` (`"data_mode"` should read `"live"`, not `"demo"`) if analytics endpoints ever start 503ing unexpectedly. `make dev` (`Makefile`'s `dev-api`/`dev-web` targets) always runs from the repo root correctly and is the preferred way to start both servers.
- Toolchain: node@22 via Homebrew (`/usr/local/opt/node@22`), not on default PATH — `export PATH="/usr/local/opt/node@22/bin:$PATH"` before any pnpm/node command. **New this pass:** forgetting this causes `make lint`/etc. to run under the system's default Node (v20), which fails opaquely with `ERR_UNKNOWN_BUILTIN_MODULE` inside pnpm's own internals — not an informative error; if you see that, check `node --version` first.
- `actionlint` and `shellcheck` are now installed via Homebrew on this machine (not a project dependency, a local dev tool) — re-run `actionlint .github/workflows/*.yml` after any future workflow-file edit.
- `scripts/tests/` is a new pytest directory (alongside `apps/api/tests` and `pipelines/tests`) for standalone `scripts/*.py` modules that aren't part of either installable package — `scripts/tests/conftest.py` puts `scripts/` on `sys.path` so `import fetch_data_artifact` works directly. `make test-unit` now runs all three directories.
- **New pattern this pass, worth reusing:** when a script's core logic needs to be both a CLI entrypoint and independently testable/simulatable, keep `main()` thin (env var parsing, printing, exit codes) and put the actual logic in a separate function (`fetch_artifact()`) that takes its inputs as real parameters — this is what let `scripts/simulate_private_deployment.py` reuse the exact same download/verify code path as the real CLI without needing to spawn a subprocess or fake `sys.argv`.
- **New pattern this pass:** for any code that touches the network via `urllib`, put the single point of network contact behind one small function (`_open_url` here) that tests monkeypatch directly — far more reliable than trying to mock `urllib.request` internals, and it's what made 18 real, meaningful tests possible without any actual HTTP calls.
- Clean-room boundary reminder (unchanged all sessions, DEC-001): never inspect/reference the sibling project directory this repository's spec calls out, or any other sibling repository outside this project root.
