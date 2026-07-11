# STATE.md — Session Continuity Resume Point

**Last updated:** 2026-07-11 (end of Phase 1 session)

## Current phase and gate

**Phase 1 (Repository foundation and reproducible developer experience) — complete and verified.** Gate 1 evidence recorded below. Ready to begin Phase 2 (geography spine, provenance system, data contracts) in the next session.

## Completed this session

**Phase 0 (carried over from earlier in this session):** all governance artifacts committed (`PLAN.md`, `TASKS.md`, `DECISIONS.md`, `RISK_REGISTER.md`, `docs/data/source-verification.md`, `DATA_DICTIONARY.md`, `MODEL_CARD.md`, design/architecture docs). Commit `439d011`.

**Phase 1:**
- Scaffolded the full monorepo structure (`apps/web`, `apps/api`, `packages/{ui,shared-types,eslint-config,tsconfig}`, `pipelines/src/scc_health_pipeline/{sources,geography,normalization,metrics,scoring,uncertainty,validation,routing,optimization,exports,audits}`, `config/`, `tests/{unit,integration,e2e,accessibility,contract,visual}`, `.github/workflows/`).
- Pinned toolchain: `.nvmrc` (22), `.python-version` (3.12), `pnpm-workspace.yaml`, root `pyproject.toml` (uv workspace, `package = false`), `apps/api/pyproject.toml`, `pipelines/pyproject.toml`.
- Wrote and **ran successfully** `scripts/bootstrap_macos.sh` — installed `node@22` (22.23.1), pnpm (11.12.0 via Corepack), `uv` (0.11.28), Python 3.12.13 on this machine (which started at Node 20.16/Python 3.9 with no `uv`/`pnpm`, i.e. a genuine fresh-clone-equivalent test).
- **Discovered and recorded DEC-011/RISK-011:** this machine's Homebrew is the x86_64 build running under Rosetta at `/usr/local`, not native arm64 at `/opt/homebrew`. Bootstrap deliberately does not install a second Homebrew (would modify unrelated system state); documented as an accepted, non-blocking risk.
- Wrote `scripts/check_clean_room.py` (DEC-001 enforcement) — passes.
- Built the Phase-1 minimal vertical slice: FastAPI `/api/v1/health`, `/api/v1/version`, `/api/v1/warehouse-status` routes (the last one truthfully reports "not connected — warehouse file does not exist yet" rather than faking success, since `make data` hasn't run); Next.js shell page with a `SystemStatus` client component making one real typed `fetch` to the API via TanStack Query.
- **Verified end-to-end with running dev servers**, not just static review: started both `uvicorn` and `next dev` in the background, `curl`-verified all three API endpoints return correct/truthful JSON, and `curl`-verified the Next.js page renders the expected title/content/component shell.
- Attempted full in-browser visual verification: no Chrome extension connected (`list_connected_browsers` returned empty); the Preview tool's sandboxed process spawner rejected every `runtimeExecutable` variant tried (`Operation not permitted` on `getcwd`). This is recorded as a known environment limitation, not a product defect — full browser/UX review is a Phase 5 gate requirement in `docs/07_BUILD_PHASES.md`, not Phase 1, since Phase 1 explicitly says "do not build final visual components yet."
- Added a Vitest smoke test (`apps/web/lib/api.test.ts`) and confirmed `make test` exercises both the Python (pytest) and TypeScript (Vitest) suites successfully — initially failed because Vitest exits nonzero with zero test files; fixed by adding a real test rather than suppressing the check.
- Ran the full command surface via the actual `Makefile` targets (not just direct `pnpm`/`uv` calls) and confirmed all green: `make lint`, `make typecheck`, `make test`, `make audit` (clean-room check only — data/analytics audits are Phase 2+), `make build`.
- Fixed incidental issues found along the way: `TASKS.md` needed adding to the clean-room allowlist (it legitimately documents *not* referencing the sibling repo); `tool.uv.dev-dependencies` deprecation → switched to `[dependency-groups] dev`; `@scc-health/eslint-config` needed `"type": "module"`; ruff `B008` needed a per-file ignore for FastAPI's `Depends()`-in-defaults pattern; pnpm's new build-script allowlist needed explicit approval for `esbuild`/`sharp`/`unrs-resolver` (all legitimate Next.js/Vitest/ESLint build-time tools).
- Confirmed no generated artifacts (`node_modules`, `.venv`, `.next`, `.duckdb`) are staged — `.gitignore` verified working correctly.

## Gate 1 evidence

- [x] Effectively-fresh-clone bootstrap succeeds on this Apple Silicon Mac (`scripts/bootstrap_macos.sh` ran clean, idempotent on re-run).
- [x] `make dev` starts web and API together — verified directly (not just the sub-targets): ran `make dev`, confirmed both servers came up via the log output, and curl-verified both `http://localhost:8000/api/v1/health` (200, correct JSON) and `http://localhost:3000/` (200) while running together.
- [x] Health checks pass (`/api/v1/health`, `/api/v1/version`, `/api/v1/warehouse-status` all verified via curl with correct, truthful JSON).
- [x] Linters and type checks pass (`make lint`, `make typecheck` both clean for Python and TypeScript).
- [x] No secrets or absolute user paths committed (verified via `git status`/`git diff` review; the one local file with an absolute path, `.claude/dev_web_local_preview.sh`, is gitignored and was never staged).
- [ ] CI runs successfully — **not yet verified**, since there is no GitHub remote to push to and trigger Actions. The workflow file (`.github/workflows/ci.yml`) is written and mirrors the exact local commands that passed, but has not been executed by GitHub Actions itself. Flagged as an open item, not silently claimed as done.
- [x] `STATE.md` contains exact next steps (this section).

## Blockers

None release-blocking. Two environment-limitation notes only:
1. No real browser available for visual verification this session (see above) — not blocking Phase 1's actual gate, which doesn't require it.
2. CI has not been executed against a real GitHub Actions runner (no remote configured) — the workflow is written and locally-equivalent-verified, but not yet proven in CI itself.

## Last commands run

`git add -A && git status --short` (67 new/changed paths staged, none of them generated artifacts). Commit not yet made as of this STATE.md write — see "next actions."

## Next three actions (exact resume point)

1. Commit the Phase 1 checkpoint (all files currently staged), then update `TASKS.md` Phase 1 checkboxes with this evidence.
2. Start Phase 2 (geography spine): build canonical tract/ZCTA/place/supervisor-district dimensions from TIGER2020, the Census ZCTA-to-tract crosswalk (keyless default per DEC-005), and the source-adapter base protocol with data-contract validation — this is the first phase that will actually populate `warehouse/scc_health.duckdb`, which will flip the `/api/v1/warehouse-status` endpoint from "not connected" to "connected."
3. If a GitHub remote becomes available, push and confirm `.github/workflows/ci.yml` actually runs green on a real Actions runner — currently only locally-equivalent-verified.

## Current running processes

None. Both dev servers (uvicorn on :8000, next dev on :3000) were stopped cleanly at the end of this session (`lsof -ti:3000/:8000 | xargs kill -9`; confirmed both ports free).

## Notes for continuation

- Toolchain is now installed on this machine: node@22.23.1 (Homebrew, x86_64/Rosetta — see DEC-011), pnpm 11.12.0, uv 0.11.28, Python 3.12.13. A new session does **not** need to re-run bootstrap unless dependencies changed — `uv sync` / `pnpm install` are enough to pick up any new packages.
- To run dev servers in a new session: `export PATH="/usr/local/opt/node@22/bin:$PATH"` first (this machine's default `node` on PATH is still v20.16 unless a shell profile change is made — bootstrap deliberately does not touch shell profiles, see Phase 1 rules), then `make dev`.
- The three "changed from spec" findings from Phase 0 remain relevant for Phase 2/3 adapter work: ACS keyless-bulk-first (DEC-003), ZCTA-relationship-file-default crosswalk (DEC-005), CalEnviroScreen 5.0 final-dataset verification (DEC-007).
