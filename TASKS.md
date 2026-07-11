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

- [ ] Monorepo structure created per `PLAN.md` §3 (AC-ref §3 repository acceptance).
- [ ] `.nvmrc` (Node 22), `.python-version` (3.12), `pnpm-workspace.yaml`, root `pyproject.toml`/`uv.lock`, `package.json`/`pnpm-lock.yaml` committed and pinned.
- [ ] `scripts/bootstrap_macos.sh` — idempotent, explains changes before making them, installs Homebrew/uv/Corepack-pnpm as needed.
- [ ] `scripts/check_clean_room.py` — CI guard against sibling-repo path references (DEC-001).
- [ ] `Makefile` with `bootstrap/data/demo/dev/test/audit/export-demo` targets (may be stub/no-op for targets not yet implemented, but must exist and not error).
- [ ] Minimal vertical slice: Next.js shell, FastAPI `/api/v1/health` route, DuckDB connectivity check, one typed API request rendered in the shell.
- [ ] Ruff, mypy/pyright, ESLint, Prettier configured and passing on the scaffold.
- [ ] GitHub Actions workflow: lint, types, unit tests, build.
- [ ] `.env.example` with credential names only, no values.
- [ ] No secrets, no absolute user paths committed. AC-ref §3.

**Gate 1 evidence required:** clean-clone `make bootstrap && make dev` succeeds; CI green; `STATE.md` has exact next steps.

---

## Phase 2 — Geography spine, provenance system, data contracts

- [ ] Canonical tract/ZCTA/place/supervisor-district/legislative-district dimensions built from TIGER2020 (DEC-004). AC-ref §5.
- [ ] All GEOIDs stored as 11-char strings; leading-zero preservation tested across CSV/Parquet/JSON/API boundaries. AC-ref §5.
- [ ] Census ZCTA-to-tract relationship crosswalk (default) + optional HUD crosswalk path (DEC-005) implemented and weight-sum-checked.
- [ ] Source-adapter base protocol (`discover/fetch/validate_raw/normalize/quality_checks`) implemented with data-contract validation (Pandera/Pydantic).
- [ ] `DATA_MANIFEST.json` schema implemented and populated for geography sources.
- [ ] Deterministic demo snapshot built from real retrieved public data (not fabricated), clearly labeled as a cached snapshot.
- [ ] Internal data explorer or CLI showing source status/freshness/row counts.

**Gate 2 evidence required:** geometry/coverage audits pass; every tract has a canonical 11-digit GEOID; crosswalk weights sum within tolerance; demo snapshot runs offline.

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
