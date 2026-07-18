# STATE.md — Session Continuity Resume Point

**Last updated:** 2026-07-18 (Final score, map-context, and product-intuitiveness pass — fourth pass on branch `ux/health-equity-redesign`, not merged to `main`)

## Most recent work: Final score, map-context, and product-intuitiveness pass (fourth pass, same branch, not on `main`)

Triggered by stakeholder feedback on the third pass's redesign: three fundamental problems remained --
(1) the product had deemphasized the 0-100 composite score too far for a tool whose job is screening and
prioritization; (2) the map had no real geographic context, making it read as abstract colored polygons
rather than a recognizable map; (3) hover/selection still felt visually separate from the main comprehension
flow. Adds **6 new commits** on top of the third pass's `a10a76f`, plus this governance-update commit:

1. `78af17d` -- canonical `ScreeningScore` component + `docs/methods/screening-score-interpretation.md` (the
   required scientific trace, written before the score was elevated anywhere).
2. `c053677` -- real map basemap (OpenFreeMap, free/keyless) + redesigned hover/selection interaction model.
3. `a5f6bec` -- headline score re-elevated as the dominant visual element; visual tracks added to top factors.
4. `33c68c7` -- score consistency applied across Prioritize, Compare, Advocate, Validate.
5. `0e57810` -- e2e/unit test fixes for the score/map/hover changes.
6. `76104ff` -- blind usability review (3 independent subagents) + visual verification doc.

**What changed, concretely:** traced the score's exact formula/bounds/direction/scenario-dependence/
comparison-universe/missing-data/uncertainty/rank-percentile treatment before touching any presentation
(`docs/methods/screening-score-interpretation.md`); centralized every score display (Explore headline, mobile
collapsed bar, map hover/selection callouts, Prioritize table, Explore's tract comparison, Advocate's backend
evidence service) through one shared `packages/ui/src/ScreeningScore.tsx` component, replacing 5 previously
independent, inconsistently-rounded formatting call sites; re-elevated the 0-100 number as the selected-tract
profile's dominant visual (reversing the third pass's deliberate deemphasis, DEC-078); discovered the map had
**no basemap at all** (not just hidden labels -- `style: {sources: {}, layers: [background]}`) and added
OpenFreeMap's free, keyless vector basemap with every tract layer inserted below the basemap's own label
layers so city/road/water names render correctly (DEC-080); redesigned hover to a sidebar "Quick preview"
when nothing is selected (map stays fully unobscured) and a small non-blocking map callout when hovering a
different tract while one is already selected.

**Two real bugs found and fixed during implementation** (not usability-review findings): (1) a React Strict
Mode + remote-map-style-URL bug where `mapReady` never became `true` despite tiles rendering correctly,
fixed by adding `idle` and `isStyleLoaded()` as redundant readiness signals alongside `load`; (2) a `aria-label`
substring collision where the score component's accessible name accidentally contained the literal text
"screening view," colliding with the actual "Screening view" `<select>` control's own label -- caught by the
e2e suite, fixed by not appending redundant text to the scenario label passed to the component.

**Two real bugs found by independent blind usability review** (3 cold subagents, screenshots only, no
implementation context) and fixed: (1) three Prioritize rows all displaying "75/100" but two different
concern-band labels, because the band was computed from the raw unrounded score while the number shown was
rounded -- fixed by computing the band from the same rounded value everywhere (DEC-079); (2) "higher than
100% of tracts" reading as a literal claim of beating every tract including itself, especially next to a tied
rank #1 -- reworded the ceiling case without changing the underlying statistic.

**Full research:** map-context and hover-model alternatives evaluated and documented in
`docs/design/final-score-map-and-intuitiveness-review.md`. **Full verification evidence:** same document.
**Key decisions:** `DECISIONS.md` DEC-078 through DEC-080.

**Verification, all live-run this session:** frontend unit 98/98 (17 files); frontend lint/typecheck clean;
backend+pipeline+scripts pytest 470/470; backend ruff/mypy clean; production build clean (zero new runtime
dependencies -- confirmed via `git diff` on every `package.json`/`pnpm-lock.yaml`, none changed); full
Playwright suite (`desktop-chromium` + `mobile-chromium`) **456 total, 426 passed, 30 skipped, 0 failed**,
exit code 0 on the final confirmation run (reflecting every fix, including the 3 usability-review-driven
ones made after the previous full run). One axe `document-title` failure was isolated and re-run 3 times in
a row cleanly before being confirmed a genuine flake (parallel-worker resource contention against a manually
started dev server, not a real defect) and excluded from the failure count, per this project's "do not call a
failure a flake without isolated reproduction and evidence" rule. Secret scan and oversized-file scan both
clean; `DATA_MANIFEST.json`'s working-tree diff reconfirmed as pure `retrieved_at` timestamp churn (0
non-timestamp fields changed) and excluded from every commit; `next-env.d.ts` had no diff at all this pass.

**Known limitations, disclosed not hidden** (full list in the visual-review doc §7): the 5 domain percentile
bars have no visible numeric scale/endpoints beyond their text sentence; the mobile bottom sheet covers most
of the map so a selected tract's city isn't nameable from the sheet view alone (an inherent tradeoff of the
already-validated two-state sheet pattern, not new); an unrelated, pre-existing floating "N" UI element
partially overlaps content at some mobile scroll positions (predates this pass, out of scope); Prioritize's
"Data coverage"/"Stability" column headers have no inline tooltip; tied scores still produce strict ordinal
ranks (a pre-existing, disclosed backend tie-break inconsistency across 3 different API routes, documented in
the methods doc, not changed this pass since it is a backend methodology question outside this UX pass's
scope).

**Not pushed, not merged, not deployed** -- branch remains `ux/health-equity-redesign`, 7 commits ahead of
the third pass's `a10a76f` (6 implementation commits plus this governance-update commit).

**Next action for this thread:** the branch is complete and ready for review. Nothing further is planned
unless the repository owner requests changes, wants it merged, or wants any of the disclosed limitations
addressed as a follow-up.

**Current running processes (supersedes the third-pass note below):** `next dev` on :3000 was restarted
manually mid-pass after the previous session's process was found stale (`preview_start` failed with a
sandbox `getcwd` permission error unrelated to the app itself; worked around by starting `next dev` directly
via Bash with `PATH="/usr/local/opt/node@22/bin:$PATH"`, since `preview_start`'s own wrapper script could not
be invoked). `uvicorn` on :8000 was left running from the prior session and remained healthy throughout.
Both are left running at the end of this pass.

---

## Prior work: Product-wide health-equity UX consolidation and visual polish (third pass, same branch, not on `main`)

Triggered by stakeholder review (Tara Sreekrishnan) finding the product still read as a technical
analytics dashboard rather than an intuitive public-interest mapping product, referencing Tree
Equity Score's National Explorer as an interaction/hierarchy reference only (not for branding, code,
icons, or layout). Adds **5 new commits** on top of the second pass's `2279b60`/`902cedb`:

1. `c6474c3` — terminology consolidation core (default scenario label/description, domain labels).
2. `76253d9` — Explore rebuilt as a map-dominant sidebar layout; selected profile simplified.
3. `a40109b` — remaining pages (Overview, Prioritize, Access Lab, Utilization, Validate, Advocate,
   Copilot, Data) reframed with plain-language purpose sentences.
4. `3af3b3a` — e2e suite fixed for the consolidated terminology/layout/disclosure structure.
5. `8e253c7` — research doc, visual-review doc, and refreshed screenshots.

**What changed, concretely:** the default scenario's user-facing name went from "Balanced overview"
to "Health equity overview" (presentation-layer rename only — `scenario_id`/weights untouched,
DEC-076); domain display labels renamed centrally in `labels.ts`; Explore's 3-column dashboard
became a 2-surface map-dominant layout (~380px sidebar + map filling ~72% of content width, up from
~26%); a collision-aware quadrant-positioned hover inspector and a minimal selected-tract map
callout replaced the old dense hover tooltip; the selected-tract profile now shows only geography,
headline concern band, county comparison, an always-visible non-causal disclaimer (DEC-077), a
5-domain summary, and the top-3 plain-language drivers above the fold, with all raw contributions,
uncertainty, stability methodology, and full sources moved behind labeled, collapsed disclosures
(not removed); the mobile bottom sheet inherited this hierarchy for free via the shared component
tree.

**Two independent cold usability-review subagents** (screenshots + purpose + 8 comprehension
questions only, no implementation explanation) drove two real fixes: a two-different-percentile-
numbers trust problem between the map callout and the sidebar (resolved by dropping the redundant
number from the map UI) and an ambiguous "near the county middle" comparison phrase. **One
self-caught issue**, found via a failing test rather than proactive re-review: the mandatory
non-causal disclaimer (CLAUDE.md's priority-1 truthfulness rule) became non-always-visible when
`ScoreSummary` moved behind a disclosure — fixed by adding a permanently visible line to the
headline block (DEC-077).

**Full research:** `docs/design/health-equity-product-consolidation.md`. **Full verification
evidence:** `docs/design/health-equity-product-visual-review.md`. **Key decisions:** `DECISIONS.md`
DEC-076/DEC-077.

**Verification, all live-run this session:** frontend unit 98/98 (17 files); frontend lint/typecheck
clean; backend+pipeline+scripts pytest 470/470; backend ruff/mypy clean; production build clean
(Node 22 required — see Notes below — zero new runtime dependencies, largest client chunk is the
pre-existing MapLibre GL bundle at ~1.0MB); full Playwright suite (`desktop-chromium` +
`mobile-chromium`) **456 total, 426 passed, 30 skipped, 0 failed**, exit code 0 — this includes axe
accessibility checks across every route/state and the 6-breakpoint responsive suite
(`e2e/responsive.spec.ts`), not run as separate ad-hoc checks; secret scan and oversized-file scan
both clean; `DATA_MANIFEST.json`'s working-tree diff confirmed as pure `retrieved_at` timestamp
churn (60 changed lines, zero non-timestamp fields) and excluded from every commit this pass.

**Known limitation, disclosed not hidden:** the Claude Browser pane's synthetic `hover` action could
not reliably reproduce the map's hover-card behavior against the MapLibre WebGL canvas (a tooling
limitation — canvas feature-hover state depends on real incremental `mousemove` events a single
teleported synthetic hover doesn't always produce). Relied on the existing real-Chromium Playwright
coverage (`e2e/usability-tasks.spec.ts`, passing) as the authoritative check instead, consistent with
this project's established jsdom/real-browser divergence pattern.

**Not pushed, not merged, not deployed** — branch remains `ux/health-equity-redesign`, 5 commits
ahead of the second pass's `902cedb`.

**Next action for this thread:** the branch is complete and ready for review. Nothing further is
planned unless the repository owner requests changes, wants it merged, or wants any of the disclosed
limitations (§7 of the visual-review doc) addressed as a follow-up.

---

## Prior work: Explore health-equity comprehension pass (second pass, same branch, not on `main`)

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

`next dev` on :3000 and `uvicorn` on :8000 are left running at the end of this third pass (both
started by Playwright's own `webServer` config during the verification gate). Restart cleanly from
the repository root with `make dev` if either is stopped, per the caution in the second-pass note
below.

## Notes for continuation

- **Third-pass note:** Node version — this machine's default `node` is v20.16 (too old; the repo
  requires `>=22`, per `.nvmrc`/`package.json`). No `nvm`/`fnm`/`volta` is on PATH; Homebrew's
  `node@22` is installed but not linked. Prefix any `pnpm`/`node` command with
  `PATH="/usr/local/opt/node@22/bin:$PATH"` (same fix as the second-pass note below, confirmed still
  necessary this pass).
- **Second-pass note:** dev servers (`uvicorn` on :8000, `next dev` on :3000) were left running at the end of this pass. **Always start/restart the backend from the repository root**, never from `apps/web` or another subdirectory — `.env.local`'s `SCC_HEALTH_WAREHOUSE_PATH` is a relative path, and starting `uvicorn` from the wrong cwd makes it silently (and correctly, per its own truthful-fallback design) fall back to the demo warehouse, which lacks Phase-4 analytics tables, producing real 503s on every analytics-dependent endpoint. Diagnose with `curl http://localhost:8000/api/v1/warehouse-status` (`"data_mode"` should read `"live"`, not `"demo"`) if analytics endpoints ever start 503ing unexpectedly. `make dev` (`Makefile`'s `dev-api`/`dev-web` targets) always runs from the repo root correctly and is the preferred way to start both servers.
- Toolchain: node@22 via Homebrew (`/usr/local/opt/node@22`), not on default PATH — `export PATH="/usr/local/opt/node@22/bin:$PATH"` before any pnpm/node command. **New this pass:** forgetting this causes `make lint`/etc. to run under the system's default Node (v20), which fails opaquely with `ERR_UNKNOWN_BUILTIN_MODULE` inside pnpm's own internals — not an informative error; if you see that, check `node --version` first.
- `actionlint` and `shellcheck` are now installed via Homebrew on this machine (not a project dependency, a local dev tool) — re-run `actionlint .github/workflows/*.yml` after any future workflow-file edit.
- `scripts/tests/` is a new pytest directory (alongside `apps/api/tests` and `pipelines/tests`) for standalone `scripts/*.py` modules that aren't part of either installable package — `scripts/tests/conftest.py` puts `scripts/` on `sys.path` so `import fetch_data_artifact` works directly. `make test-unit` now runs all three directories.
- **New pattern this pass, worth reusing:** when a script's core logic needs to be both a CLI entrypoint and independently testable/simulatable, keep `main()` thin (env var parsing, printing, exit codes) and put the actual logic in a separate function (`fetch_artifact()`) that takes its inputs as real parameters — this is what let `scripts/simulate_private_deployment.py` reuse the exact same download/verify code path as the real CLI without needing to spawn a subprocess or fake `sys.argv`.
- **New pattern this pass:** for any code that touches the network via `urllib`, put the single point of network contact behind one small function (`_open_url` here) that tests monkeypatch directly — far more reliable than trying to mock `urllib.request` internals, and it's what made 18 real, meaningful tests possible without any actual HTTP calls.
- Clean-room boundary reminder (unchanged all sessions, DEC-001): never inspect/reference the sibling project directory this repository's spec calls out, or any other sibling repository outside this project root.
