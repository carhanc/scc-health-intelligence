# TASKS.md — Phase Checklist and Acceptance-Criterion Mapping

Rules: a checkbox may only be marked `[x]` when test, audit, or browser evidence exists (recorded inline or referenced by file/command). Nothing is marked complete on the basis of "the code was written." This file is updated at the start and end of every phase per `docs/07_BUILD_PHASES.md`.

Legend: **AC-ref** = acceptance-criterion section in `docs/06_ACCEPTANCE_TESTS.md`.

---

## Phase 0 — Discovery, source verification, architecture approval

- [x] Read `CLAUDE.md` and `docs/00`–`09` in order. Evidence: full read-through this session.
- [x] Verify current official source pages for all Tier 1/2 sources (16 sources). Evidence: `docs/data/source-verification.md`, three parallel research-agent passes, 2026-07-11.
- [x] Confirm clean-room boundary (no sibling-repo access). Evidence: `DECISIONS.md` DEC-001; no tool call in this session referenced `scc-caregap-atlas`.
- [x] Produce `PLAN.md`, `TASKS.md`, `DECISIONS.md`, `RISK_REGISTER.md`, `docs/data/source-verification.md`. Evidence: this commit.
- [ ] Produce `STATE.md`, `DATA_DICTIONARY.md` skeleton, `MODEL_CARD.md` skeleton, `docs/design/information-architecture.md`, `docs/design/user-flows.md`, `docs/architecture/*.mmd`. **In progress this session.**
- [x] User approval of plan. Evidence: plan approved 2026-07-11 via ExitPlanMode.

**Gate 0: PASS** once the remaining artifacts above are committed.

---

## Phase 1 — Repository foundation and reproducible developer experience

- [x] Monorepo structure created per `PLAN.md` §3 (AC-ref §3 repository acceptance). Evidence: `apps/`, `packages/`, `pipelines/`, `config/`, `tests/`, `.github/workflows/` scaffolded and committed.
- [x] `.nvmrc` (Node 22), `.python-version` (3.12), `pnpm-workspace.yaml`, root `pyproject.toml`/`uv.lock`, `package.json`/`pnpm-lock.yaml` committed and pinned. Evidence: `uv sync` and `pnpm install` both resolve cleanly from these files.
- [x] `scripts/bootstrap_macos.sh` — idempotent, explains changes before making them, installs Homebrew/uv/Corepack-pnpm as needed. Evidence: ran twice on this machine (which started at Node 20.16/Python 3.9, no uv/pnpm — a genuine fresh-clone-equivalent test); installed node@22.23.1, pnpm 11.12.0, uv 0.11.28, Python 3.12.13; second run was a clean no-op confirming idempotency. See STATE.md and DEC-011/RISK-011 for the Rosetta/x86_64-Homebrew finding.
- [x] `scripts/check_clean_room.py` — CI guard against sibling-repo path references (DEC-001). Evidence: `uv run python scripts/check_clean_room.py` passes; wired into `make audit` and `.github/workflows/ci.yml`.
- [x] `Makefile` with `bootstrap/data/demo/dev/test/audit/export-demo` targets. Evidence: all seven targets exist and run without error; `bootstrap`/`dev`/`test`/`audit` are fully functional for Phase 1 scope, `data`/`demo`/`export-demo` truthfully report "not implemented until Phase N" rather than silently no-op-ing.
- [x] Minimal vertical slice: Next.js shell, FastAPI `/api/v1/health` route, DuckDB connectivity check, one typed API request rendered in the shell. Evidence: `apps/web/app/page.tsx` + `system-status.tsx` + `lib/api.ts`; `apps/api/src/scc_health_api/routes/system.py` + `db.py`; verified end-to-end via curl with both dev servers running together (`make dev`) — API returns correct/truthful JSON including an honest "warehouse not connected yet" state, web page renders with the system-status component present.
- [x] Ruff, mypy/pyright, ESLint, Prettier configured and passing on the scaffold. Evidence: `make lint` and `make typecheck` both clean (`All checks passed!` / `Success: no issues found in 20 source files` / `tsc --noEmit` clean / `eslint .` clean).
- [x] GitHub Actions workflow written: lint, types, unit tests, build. Evidence: `.github/workflows/ci.yml` mirrors the exact local commands verified above. **Not yet proven on a real Actions runner** — no GitHub remote configured this session; flagged as an open item in STATE.md, not silently claimed as fully done.
- [x] `.env.example` with credential names only, no values. Evidence: committed, contains six optional credential names (all blank) plus non-secret local path/port defaults.
- [x] No secrets, no absolute user paths committed. AC-ref §3. Evidence: `git status`/`git diff` reviewed before commit; the one file with an absolute machine-specific path (`.claude/dev_web_local_preview.sh`, used only to work around a local Preview-tool sandboxing issue) is gitignored and was never staged.

**Gate 1 status: PASS**, with one open sub-item (CI not yet run on a real GitHub Actions runner — locally-equivalent-verified only) and one deferred item (full in-browser visual walkthrough — not a Phase 1 requirement; Phase 1 explicitly says "do not build final visual components yet," and no browser tool was available in this session's environment anyway). `make bootstrap && make dev` succeeds; `STATE.md` has exact next steps.

---

## Phase 2 — Geography spine, provenance system, data contracts

- [x] Canonical tract/ZCTA/place/supervisor-district dimensions built from TIGER2020 (DEC-004). AC-ref §5. Evidence: `geo.tracts` (408 rows), `geo.places` (30), `geo.zctas` (70), `geo.county` (1), `geo.supervisor_districts` (5) loaded and audited. State/federal legislative districts deferred — not required by Phase 2 scope (optional per `docs/00_PRODUCT_CHARTER.md` §8.2).
- [x] All GEOIDs stored as 11-char strings; leading-zero preservation tested. AC-ref §5. Evidence: `geography_audits.py::_audit_leading_zeros_and_duplicates` passes (408/408, length range [11,11]); verified across Parquet → DuckDB → JSON API response chain via `test_geography_routes.py`.
- [x] Census ZCTA-to-tract relationship crosswalk (default) implemented and weight-sum-checked (DEC-005). Evidence: `geo.crosswalk_zip_tract` (638 rows), `crosswalk_weight_sums` audit passes (0 out-of-range). HUD optional crosswalk path explicitly deferred (DEC-014) pending a `HUD_USER_TOKEN`.
- [x] Source-adapter base protocol (`discover/fetch/validate_raw/normalize/quality_checks`) implemented. Evidence: `pipelines/src/scc_health_pipeline/sources/base.py` + 6 concrete adapters, each with a fixture-based contract test (`test_source_adapters_contract.py`, 11 tests passing) built from real (not fabricated) subsets of live-fetched data.
- [x] `DATA_MANIFEST.json` schema implemented and populated for geography sources. Evidence: 6 entries with publisher/landing_page/checksum/license/status, served via `/api/v1/sources`.
- [x] Deterministic demo snapshot built from real retrieved public data (not fabricated), clearly labeled. Evidence: `data/demo/geography/*.parquet` (3.2MB, real Phase 2 output frozen at snapshot time, DEC-016), `make demo` builds a separate `scc_health_demo.duckdb` with zero network access, every API response carries `data_mode: "live"|"demo"`.
- [x] Internal data explorer or CLI showing source status/freshness/row counts. Evidence: `/api/v1/sources` (manifest-backed) + `make audit`'s printed summary + `/api/v1/geographies/*` responses.
- [x] Geography API endpoints + frontend selector (beyond original Phase 2 scope list, added per this session's explicit instructions). Evidence: `/api/v1/geographies/{search,tract,place,supervisor_district,.../boundary}`, `apps/web/app/explore` search UI with URL-persisted selection, truthful loading/error/empty states, 9 API integration tests passing.

**Gate 2 status: PASS.** Geometry/coverage audits pass (18/18 checks green, 100% spatial-join coverage); every tract has a canonical 11-digit GEOID; crosswalk weights sum within tolerance (accounting for cross-county ZCTAs, documented in `docs/methods/geography.md`); demo snapshot runs offline with zero network access (verified). One caveat: no in-browser visual verification was possible this session (DEC-017/RISK-012) — HTTP-level and automated-test verification was used instead; a true visual pass is deferred to Phase 5's gate, which is where the build-phases document first requires it.

---

## Phase 3 — Core data ingestion (17 adapters)

- [ ] TIGER/Line 2020 boundaries
- [ ] Census ZCTA-tract relationship file
- [ ] ACS 5-year 2020–2024 (keyless bulk path default, `CENSUS_API_KEY` optional — DEC-003)
- [ ] CDC PLACES 2025 (tract dataset `cwsq-ngmh`, discovery-based ID resolution)
- [ ] CDC/ATSDR SVI 2022
- [ ] California Healthy Places Index 3.0
- [ ] CalEnviroScreen 5.0 final (non-draft — DEC-007)
- [ ] HCAI facility attributes (CC-BY)
- [ ] HCAI Emergency Department encounters (OPA terms)
- [ ] HCAI patient-origin/market-share pivot profiles (OPA terms)
- [ ] HRSA health center service-delivery sites
- [ ] HRSA HPSA / MUA/P shortage designations
- [ ] VTA static GTFS
- [ ] Santa Clara County GIS Hub (supervisor districts + facility layers)
- [ ] USDA SNAP retailer locator (FNS→FNA transition)
- [ ] HUD USPS ZIP crosswalk (optional enhancement)
- [ ] OpenStreetMap/Overpass supplemental layer (clearly labeled, never sole source)

Each adapter: [ ] contract test, [ ] offline fixture, [ ] manifest entry, [ ] retry/backoff, [ ] content-type validation, [ ] last-known-good cache behavior tested. AC-ref §4.

**Gate 3 evidence required:** every metric has unit/directionality/denominator/source/vintage/uncertainty where available; ACS MOEs and PLACES CIs retained; HCAI suppression preserved; data explorer accurately reports failures; no production metric from mock data.

---

## Phase 4 — Analytics foundation, uncertainty, explainability

- [ ] `config/metrics.yml` metric registry populated for all initial metric families. AC-ref §6.
- [ ] Domain scores (health burden, access barriers, resource accessibility, environmental burden, ED utilization pressure, workforce shortage, data confidence) implemented with subdomain equal-weighting. AC-ref §7.
- [ ] ACS MOE→SE and PLACES CI→SE conversions implemented and unit-tested against hand-calculated fixtures. AC-ref §8.
- [ ] Monte Carlo uncertainty propagation, deterministic seed, reproducibility test (same seed → identical output).
- [ ] Sensitivity: 5 named weight presets + Dirichlet random-weight sampling, rank-stability labels. AC-ref §9.
- [ ] Explainability: score decomposition (raw value, percentile, contribution, uncertainty, missing components, formula version) for every domain/scenario score. AC-ref §7.
- [ ] Tautology guard: automated audit flags any validation whose "independent" outcome is also a score input. AC-ref §12.
- [ ] `MODEL_CARD.md` populated with intended/prohibited uses (skeleton → full).

**Gate 4 evidence required:** analytics unit tests pass against hand-calculated fixtures; uncertainty simulation reproducible; score decomposition sums correctly; missing inputs never silently become zero.

---

## Phase 5 — Design system and first complete vertical slice (Overview + Explore)

- [ ] Design tokens, accessible component library, app shell/navigation.
- [ ] Overview page: task cards, freshness indicator, county snapshot, guided examples, saved-workspace reopen. AC-ref §13 Overview.
- [ ] Explore page: map + table alternative, geography search, lens selector, layer panel, geography profile drawer, driver explanation, compare mode, shareable URL state. AC-ref §13 Explore.
- [ ] Empty/loading/stale/unavailable/error states designed and implemented.
- [ ] Mobile/tablet/desktop responsive behavior verified in-browser.
- [ ] Keyboard-only navigation verified; axe accessibility tests passing with zero serious/critical violations.
- [ ] Nav IA decision finalized (DEC-008) with browser-review evidence.
- [ ] Decision on Utilization Lab nav placement recorded.

**Gate 5 evidence required (UX release-gate tasks 1–2 from `docs/01_UX_UI_SPEC.md` §20):** first-time-user task ("search an address and understand the tract profile," "compare two tracts") completed in-browser with screenshots recorded in `UX_REVIEW.md`.

---

## Phase 6 — Access Lab, routing, catchments, intervention placement

- [ ] Resource deduplication (facilities/resources by coordinates/name/address/source priority).
- [ ] Straight-line baseline + OSM-network walking/driving travel times, with explicit method labeling (never silently substituted). AC-ref §10.
- [ ] VTA GTFS-based transit accessibility (scheduled-service proxy, labeled as such given no confirmed realtime feed).
- [ ] E2SFCA implementation where capacity proxies exist, documented assumptions.
- [ ] OR-Tools mobile-clinic/site-placement optimizer: solver status, objective, selected sites, reach, overlap, alternatives, sensitivity.
- [ ] Access Lab UI: resource browser, travel-mode selector, mobile-clinic optimizer, accessible map alternative. AC-ref §13 Access Lab.

**Gate 6 evidence required:** routing results pass sampled manual checks; optimization outputs reproducible and constraint-satisfying; UI distinguishes observed/modeled/scenario data; no exact health-benefit or cost-savings claim without a validated causal model.

---

## Phase 7 — Utilization Lab and independent validation

- [ ] HCAI normalization: ED encounters, facility profiles, patient-origin/market-share, payer, language, diagnosis groups, masking/suppression preserved. AC-ref §11.
- [ ] Native-geography display with allocated-tract-estimate labeling and crosswalk-uncertainty disclosure. AC-ref §13 Utilization Lab.
- [ ] Pre-registered validation hypotheses using independent HCAI/external outcomes (never a score's own input). AC-ref §12.
- [ ] Spearman/Pearson with bootstrap CIs; spatial autocorrelation diagnostics (Moran's I / Getis-Ord Gi*).
- [ ] Validation Lab UI: hypothesis, outcome, method, result+uncertainty, spatial check, "what this does not prove," downloadable table. Null/weak findings shown with equal weight.

**Gate 7 evidence required:** HCAI status truthful and recent; suppressed values remain suppressed; validation outcomes independent of score inputs (tautology guard green); spatial dependence assessed; null/weak findings visible, not hidden.

---

## Phase 8 — Advocate workspace, Document Intelligence, optional Copilot

- [ ] Deterministic advocacy workspace: evidence selection, templated brief/staff-questions/public-comment/scenario-brief generation, zero-key. AC-ref §13 Advocate.
- [ ] Document ingestion: PDF/DOCX/TXT/pasted text, PHI warning + acknowledgement, page/section-cited extraction, prompt-injection isolation, deletion controls. AC-ref §13 Copilot (document upload).
- [ ] Structured agenda-item/action/vote/money/geography/population extraction.
- [ ] Optional Copilot: provider abstraction, `ANTHROPIC_API_KEY`-gated grounded mode, typed read-only tools, numeric-integrity validator, trace panel, abstention behavior.
- [ ] Golden evaluation set (≥50 questions) run with results recorded. AC-ref §19.
- [ ] Prompt-injection adversarial test suite passing (zero tolerance for compliance with injected instructions).
- [ ] Granicus/IQM2 connector spike (DEC-010) — attempted, outcome documented either way.

**Gate 8 evidence required:** deterministic mode completes core advocacy workflows with zero API key; AI answers (when configured) contain valid citations and tool traces; unsupported prompts abstain/clarify; uploaded document instructions cannot override system behavior; no PHI accepted or persisted.

---

## Phase 9 — Reporting, export, sharing

- [ ] All required export types generated and inspected: one-page brief, geography profile, intervention scenario brief, staff-question packet, public-comment outline, validation summary, evidence packet, CSV/GeoJSON, accessible PDF/HTML. AC-ref §20.
- [ ] Every export includes title/scope/date/geography/period/values+units/source+vintage/uncertainty/methods version/limitations/reproducibility ID.
- [ ] Shareable URLs restore analytical state exactly.
- [ ] Automated content lints: causal-language detector, missing-citation detector, percentile/percentage-confusion detector, suppressed-value-as-zero detector. AC-ref content checks (`docs/08` §Required automated content checks).

**Gate 9 evidence required:** exports render correctly and accessibly; printed output legible without interactive controls; export values match API/warehouse values exactly; reopening a share link restores state.

---

## Phase 10 — Performance, accessibility, security, operational hardening

- [ ] Performance budgets measured against `PLAN.md` §19 targets and recorded (not assumed).
- [ ] Full WCAG 2.2 AA audit: axe automated + manual keyboard/screen-reader/zoom-200%/reduced-motion passes across all primary pages.
- [ ] `docs/security/THREAT_MODEL.md` (STRIDE) and `docs/security/INCIDENT_RESPONSE.md` completed.
- [ ] Dependency/secret scanning in CI; no unresolved high-severity findings without documented mitigation.
- [ ] Rate limiting, CSP, CORS, upload safety (size/MIME/magic-byte/decompression-bomb) verified with tests.
- [ ] Source refresh/rollback tested: a simulated bad refresh does not corrupt the last-known-good curated snapshot.

**Gate 10 evidence required:** performance budgets pass on representative hardware; axe + manual a11y checks pass; threat model complete; deployment/rollback tested; data-refresh failure does not corrupt last-known-good snapshot.

---

## Phase 11 — Adversarial product review and final delivery

- [ ] Ten adversarial role reviews completed (epidemiologist, health-equity researcher, GIS analyst, non-technical commissioner, accessibility tester, privacy/security reviewer, community advocate, data engineer, statistician, product designer) — five strongest objections each, severity classified, high/feasible-medium fixed.
- [ ] Clean-state run of `make bootstrap && make data && make demo && make test && make audit && make export-demo` — all pass or fail only for clearly identified, non-fabricated reasons.
- [ ] Every required page/workflow inspected in-browser; Playwright + axe suites run in full.
- [ ] `DELIVERY_REPORT.md` completed: architecture summary, setup commands, source status, build results, method summary, validation results, test results, accessibility results, performance results, screenshots, known limitations, unresolved risks, deployment instructions, demo script, full acceptance-criterion → evidence table.
- [ ] `MODEL_CARD.md`, `DATA_DICTIONARY.md`, `DATA_MANIFEST.json`, `RISK_REGISTER.md`, `DECISIONS.md`, `CHANGELOG.md` finalized.

**Gate 11 (final definition of done):** acceptance criteria have evidence, not assertions; no all-null/placeholder production fields; every score explainable and uncertainty-aware; independent validation present and honestly interpreted; major workflows intuitive and accessible; copilot grounded or abstains; exports preserve evidence and limitations; clean-room reproducibility demonstrated; delivery report lists remaining weaknesses plainly.

---

## Cross-cutting acceptance items (apply across phases, tracked here for visibility)

- [ ] No all-null production metric column at any point after Phase 3.
- [ ] No silent zero-fill or median-imputation of missing/suppressed data at any point.
- [ ] No causal-impact language for any heuristic/association/optimization/correlation output, checked continuously via the Phase 9 content lint once it exists, and manually before then.
- [ ] Every geographic identifier remains a string with leading zeros preserved at every boundary, checked continuously starting Phase 2.
- [ ] Every numeric answer from the copilot originates from a tested analytics tool or read-only query, never freehand model arithmetic — checked from Phase 8 onward.
