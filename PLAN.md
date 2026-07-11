# PLAN.md — Santa Clara Health Intelligence

Status: **Phase 0 approved (2026-07-11).** This document is the authoritative architecture and implementation plan. It is updated at the start and end of every phase per `docs/07_BUILD_PHASES.md`. See `STATE.md` for the current resume point and `TASKS.md` for the phase-by-phase checklist.

## 0. Clean-room boundary

This is a new repository. I have not inspected, listed, read, imported, copied, or referenced `~/Desktop/scc-caregap-atlas` or any sibling repository, and will not at any point in this build. All work is grounded in the specification pack in this repository (`CLAUDE.md`, `docs/00`–`09`, `MASTER_BUILD_PROMPT.md`) and verified official public sources. `scripts/check_clean_room.py` (added in Phase 1) fails CI if any pipeline/script path resolves outside the project root or the approved cache locations (`data/`, `warehouse/`, OS temp for downloads-in-progress).

## 1. Mission recap

Build a production-quality, open-data public-health intelligence, advocacy, and decision-support platform for Santa Clara County that helps commissioners, staff, advocates, researchers, and community partners understand neighborhood conditions, prioritize investigation, compare transparent intervention scenarios, validate the prioritization framework against independent outcomes, and produce evidence-backed advocacy materials — without fabricating data, hiding uncertainty, or making causal claims the evidence doesn't support. Full detail: `docs/00_PRODUCT_CHARTER.md`.

## 2. Technology stack (verified current stable, July 2026)

| Layer | Choice | Rationale |
|---|---|---|
| Node.js | **22 LTS** (Maintenance), pinned via `.nvmrc` | Spec baseline; Node 24 is now Active LTS and remains a documented alternative (`DEC-002`) but 22 LTS trades a slightly older runtime for maximum stability across a long multi-session build. |
| Package manager | pnpm 11.x via Corepack | Current stable (11.9–11.11 confirmed July 2026). |
| Frontend | Next.js 16.2 LTS, App Router, React 19, strict TypeScript | Current stable; App Router matches spec. |
| Styling/components | Tailwind CSS + Radix primitives, project-owned design tokens | Accessible primitives, customized rather than left generic per UX spec. |
| Map | MapLibre GL JS + PMTiles | Keyless basemap required; no Mapbox token dependency for core function. |
| Data/state | TanStack Query + TanStack Table, React Hook Form + Zod, URL state before global store | Per architecture spec §4. |
| Charts | Observable Plot | Declarative, pairs well with accessible data-table equivalents. |
| Python | 3.12 via `uv` | Spec-pinned. |
| API | FastAPI 0.136.x, Pydantic v2.13.x, pydantic-settings, Uvicorn | Current stable. |
| Warehouse | DuckDB 1.5.x — spatial `GEOMETRY` now a built-in core type; `spatial` extension 1.5.3 for functions | Current stable; simplifies spatial setup vs. pre-1.5 DuckDB. |
| Data libs | Polars, GeoPandas, Shapely, PyArrow, PySAL/esda/libpysal, scikit-learn, statsmodels, OR-Tools | Per architecture spec §5. |
| Testing | pytest, Vitest, Playwright, axe-core, Ruff, mypy/pyright, ESLint, Prettier | Full test pyramid, §11 below. |
| Deployment | Docker for CI/hosted mode only — not required for local Mac dev | Per spec. |

**Local environment gap (recorded, not blocking):** the dev machine currently has Node v20.16 and Python 3.9 with no `uv`/`pnpm` installed. `scripts/bootstrap_macos.sh` (Phase 1) installs/upgrades these idempotently via Homebrew + Corepack + `uv`, explaining every change before making it, consistent with the "do not modify unrelated shell configuration without permission" requirement in `docs/07_BUILD_PHASES.md` Phase 1.

## 3. Monorepo structure

```text
scc-health-intelligence/
├── apps/
│   ├── web/                      # Next.js App Router frontend
│   └── api/src/scc_health_api/   # FastAPI: routes/services/schemas/repositories/settings.py
├── packages/
│   ├── ui/                       # shared design-system components
│   ├── shared-types/             # generated/shared TS types (from Pydantic schemas)
│   ├── eslint-config/
│   └── tsconfig/
├── pipelines/src/scc_health_pipeline/
│   ├── sources/        # one adapter per source (Section 5)
│   ├── geography/      # canonical dimensions + crosswalks
│   ├── normalization/  # bronze -> silver transforms
│   ├── metrics/         # metric registry evaluation
│   ├── scoring/         # domain + scenario scores
│   ├── uncertainty/     # MOE/CI handling, Monte Carlo
│   ├── validation/      # independent validation checks
│   ├── routing/         # travel-time providers
│   ├── optimization/    # OR-Tools location-allocation
│   ├── exports/         # report/export generation
│   └── audits/          # make audit checks
├── data/{raw,staged,curated,cache,exports,demo}/   # already scaffolded (raw/staged/curated exist)
├── warehouse/scc_health.duckdb
├── config/{sources.yml,metrics.yml,scenarios.yml,geographies.yml,freshness.yml}
├── docs/{00-09 spec files, adr/, methods/, data/, design/, architecture/, security/, user-guide/}
├── scripts/{bootstrap_macos.sh,dev.sh,build_data.sh,audit.sh,release.sh,check_clean_room.py}
├── tests/{unit,integration,e2e,accessibility,contract,visual}
├── .github/workflows/
├── Makefile, pyproject.toml, uv.lock, package.json, pnpm-lock.yaml, pnpm-workspace.yaml, .nvmrc, .python-version, .env.example
└── PLAN.md, TASKS.md, STATE.md, DECISIONS.md, RISK_REGISTER.md, DATA_MANIFEST.json, DATA_DICTIONARY.md, MODEL_CARD.md, DELIVERY_REPORT.md
```

## 4. Data ingestion and provenance model

- **Canonical geography:** 2020 Census tract, GEOID stored as an 11-character string everywhere (config, warehouse, API, exports). County prefix `06085`. Native source geography (ZIP, ZCTA, facility point, county) is always retained alongside any canonical crosswalk — never overwritten or discarded.
- **Medallion layers:** `data/raw` (immutable, checksummed, one subfolder per source + retrieval timestamp) → `data/staged` (normalized per-source Parquet/GeoParquet) → `data/curated` (harmonized analytics-ready tables, joined to canonical geography) → `data/exports` (user-facing CSV/GeoParquet/PMTiles/report artifacts).
- **Source adapter protocol** (`pipelines/src/scc_health_pipeline/sources/base.py`): every adapter implements `discover() -> list[RemoteResource]`, `fetch(resource, context) -> RawArtifact`, `validate_raw(artifact) -> ValidationReport`, `normalize(artifact) -> list[Path]`, `quality_checks(paths) -> ValidationReport`, matching `docs/04_ARCHITECTURE_IMPLEMENTATION.md` §7. Each adapter ships with an offline fixture and a contract test so `make test` never depends on live network access.
- **Discovery over hardcoding:** dataset IDs that rotate (e.g., CDC PLACES' annual Socrata ID) are resolved via a discovery step with a last-verified pinned fallback recorded in `config/sources.yml`, not hardcoded permanently.
- **Provenance:** every curated record traces to raw artifact, source URL, retrieval timestamp, checksum (SHA-256), byte/row counts, schema fingerprint, parser version, and transformation lineage, persisted in warehouse `meta.sources`/`meta.builds` tables and mirrored into `DATA_MANIFEST.json` (schema per `docs/02_DATA_SOURCE_REGISTRY.md` §11).
- **Failure behavior:** on source failure, the pipeline preserves the last-known-good curated snapshot, logs the exact failure, and surfaces a visible unavailable/stale state through the API's `/api/v1/sources/{source_id}` endpoint — it never emits an empty "successful" table or zero-fills a metric.
- **Freshness policy:** `config/freshness.yml` defines per-source expected cadence, warning threshold, and stale threshold, interpreted relative to each source's own publication cycle (annual HCAI data is not "stale" merely because it isn't real-time; a daily HRSA feed gets a tight window).

## 5. Source registry (Phase 3 adapters)

Full verification detail: `docs/data/source-verification.md`. Sixteen adapters, in priority order for Phase 3:

1. Census TIGER/Line (2020 tract/ZCTA/place boundaries) — geometry backbone, build first.
2. Census 2020 ZCTA-to-tract relationship file — keyless crosswalk default.
3. ACS 5-year (2020–2024) — keyless bulk-download path primary, `CENSUS_API_KEY` optional enhancement.
4. CDC PLACES (2025 release, tract-level).
5. CDC/ATSDR SVI (2022).
6. California Healthy Places Index 3.0.
7. CalEnviroScreen 5.0 (final, non-draft dataset).
8. HCAI licensed facility attributes (CC-BY).
9. HCAI Emergency Department encounters (OPA terms).
10. HCAI patient-origin/market-share pivot profiles (OPA terms).
11. HRSA health center service-delivery sites.
12. HRSA HPSA / MUA/P shortage designations.
13. VTA static GTFS.
14. Santa Clara County GIS Hub (ArcGIS) — supervisor districts + public facility layers.
15. USDA SNAP retailer locator (FNS→FNA transition).
16. HUD USPS ZIP crosswalk — optional enhancement, requires `HUD_USER_TOKEN`.
17. Santa Clara County meeting portal (Granicus/IQM2) — user-upload-first per spec; scraper connector is a Phase 8 stretch goal, not a Phase 3 requirement.

OpenStreetMap/Overpass is used only as a supplemental, visibly labeled layer for clinics/pharmacies/grocery, never as the sole source for an essential category, per `docs/02` §6.5.

## 6. Data warehouse design

DuckDB (`warehouse/scc_health.duckdb`) with the schema families specified in `docs/04_ARCHITECTURE_IMPLEMENTATION.md` §6: `meta.*`, `geo.*`, `health.*`, `social.*`, `context.*`, `resources.*`, `access.*`, `utilization.*`, `analytics.*`, `documents.*`. API requests use a read-only connection; heavy pipeline writes happen only through `make data` jobs, never inside HTTP request handling. Frequently used profiles/rankings are precomputed; map geometry is served as simplified GeoJSON for small layers or PMTiles for tract-scale layers.

## 7. API design

Versioned under `/api/v1` exactly as specified in `docs/04_ARCHITECTURE_IMPLEMENTATION.md` §9 (health/version/sources, geography search/profile/compare, metrics/scores/scenarios, access/resources/optimize, utilization/validation, documents/copilot/reports, exports). Every response includes source/vintage/uncertainty metadata alongside values — the API is the single source of truth for numbers; the frontend never computes a score client-side.

## 8. Frontend information architecture

Eight-to-nine primary sections: Overview, Explore, Prioritize, Access Lab, Utilization Lab, Validate, Advocate, Copilot, Data. Whether Utilization Lab remains a top-level nav item or becomes a tab under Access Lab/Explore is decided concretely during Phase 5's UX review (in-browser testing with real data) and recorded as an ADR either way — Validate and Data stay visible regardless of that outcome, per the UX spec's explicit instruction not to bury trust features. Persistent context bar (geography, lens, period, comparison, freshness, share/export) on every analytical page. Progressive disclosure: plain-language conclusion → raw value/unit/percentile → drivers → uncertainty → full methods drawer. Every map view has an accessible table/list equivalent. Full detail: `docs/design/information-architecture.md`, `docs/design/user-flows.md`.

## 9. Design-system strategy

Tailwind + Radix primitives, customized into a project-owned token set (warm-gray/navy/blue-teal/amber, colorblind-safe sequential/diverging map palettes, Inter or Source Sans 3 via `next/font`). No dark mode by default (spec: "dark mode as the default" is explicitly discouraged; will not add a light/dark toggle unless it earns its complexity later). WCAG 2.2 AA is enforced from Phase 5 onward via axe in CI, not deferred to Phase 10.

## 10. Analytics and uncertainty strategy

- Metric registry (`config/metrics.yml`) drives every score and UI label — no formula duplicated in TypeScript.
- Domains: health burden, access barriers, resource accessibility, environmental/contextual burden, ED utilization pressure (independent context), workforce shortage, data confidence. Subdomain equal-weighting prevents redundant-metric domains from dominating (`docs/03` §4–6).
- Uncertainty: ACS MOE→SE conversion (`SE = MOE / 1.645`), PLACES CI handling (`SE ≈ (upper - lower) / (2 * 1.96)`), Monte Carlo propagation with a **deterministic seed** (500–1000 draws) producing score/rank intervals and top-decile-inclusion probability.
- Sensitivity: five named weight presets (balanced/need-first/access-first/resource-first/utilization-first) plus Dirichlet-sampled random-weight perturbation (≥1000 draws for final builds) producing rank-stability labels (Robust / Moderately stable / Assumption-sensitive / Data-limited) — never described as intervention-success probability.
- Explainability: every score decomposes to raw values, county percentiles, domain/metric contribution shares, missing components, uncertainty, sensitivity, and an exact formula/version string.

## 11. Independent validation strategy

Pre-registered hypotheses (before results are viewed) using outcomes that are **not inputs to the score being validated** — e.g., HCAI ED/ambulatory-care-sensitive burden validating a diabetes-prevention priority screen, never diabetes prevalence validating itself. A `make audit` check (`pipelines/src/scc_health_pipeline/audits/tautology_guard.py`) programmatically flags any validation record whose outcome metric ID also appears as a scenario input. Spearman/Pearson with bootstrap CIs, spatial autocorrelation diagnostics (Moran's I / Getis-Ord Gi* via PySAL), temporal/out-of-sample checks where feasible. Null and contradictory findings are stored and displayed with equal visual weight to positive findings — no cherry-picking.

## 12. Access, routing, and intervention-optimization strategy

Provider interface (`StraightLineScreeningProvider` → `OSMNetworkProvider` → `TransitR5Provider` optional) with every result tagged by the exact method used; the UI never silently substitutes straight-line distance for a network result. Population-weighted origins (block-group centroids weighted by relevant population, preferred over raw geometric centroids). E2SFCA implemented where a capacity proxy exists, clearly labeled when the "supply" side is a facility-count proxy rather than true capacity. OR-Tools maximal-covering location model for mobile-clinic/site-placement scenarios with equity constraints (minimum coverage of limited-English/low-income populations, maximum travel-time inequality), explicitly labeled "modeled scenario, not a forecast of health outcomes or savings," per `docs/03` §13 and the terminology table in `docs/08` §Terminology.

## 13. Deterministic report generator and optional AI copilot architecture

- **Claim/evidence/citation object model** (`docs/08_CONTENT_REPORTING.md` schema) underlies every generated brief — a report sentence is not exportable unless its evidence references resolve to a structured object with source/vintage/uncertainty.
- **Deterministic mode is the default and fully functional with zero API keys**: guided question templates, rule-based query builder, local SQLite-FTS5 document search, templated one-page briefs/staff-question packets/public-comment outlines/evidence packets built directly from claim objects.
- **Optional grounded-LLM mode** behind an `LLMProvider` protocol (Anthropic / local-Ollama / deterministic), selected only when `ANTHROPIC_API_KEY` (or a local endpoint) is configured. The model selects among typed, read-only, schema-constrained tools (`docs/05` §5) — it never executes arbitrary SQL, shell commands, or fetches arbitrary URLs, and never becomes the source of a number: a post-generation numeric-integrity validator cross-checks every figure in the prose against the structured evidence object that produced it and strips unsupported claims before the response is returned.
- **Document ingestion:** PDF/DOCX/TXT/HTML/CSV/XLSX with page/section-cited chunking; uploaded and retrieved content is treated strictly as untrusted data — embedded instructions are never followed (prompt-injection isolation, adversarially tested in Phase 8). Local-only processing by default; explicit consent gate before any content leaves the machine to a cloud provider; immediate, verifiable deletion.

## 14. Document-ingestion and prompt-injection defenses

System-level rules enforced in the tool layer, not just the prompt (per `docs/09_SECURITY_PRIVACY_GOVERNANCE.md`): ignore instructions embedded in documents/citations/data cells; never reveal system prompts, secrets, or internal paths; never run shell commands or write files from document text; call only approved typed read-only tools; never fetch arbitrary URLs found inside documents; abstain when evidence is missing; log injection-attempt detections. Adversarial test fixtures include "ignore previous instructions," hidden/white-on-white text, malformed PDFs, and fabricated-causal-claim injection attempts, exercised in Phase 8's release gate.

## 15. Source refresh and last-known-good behavior

Each source has an independent refresh job (`make refresh SOURCE=<id>`) that never overwrites the curated last-known-good snapshot with an incomplete or invalid refresh — new data is validated (schema, row count, checksum, expected-geography coverage) before being promoted, and a failed promotion leaves the prior snapshot untouched while flipping the source's UI status to unavailable/stale with a logged reason.

## 16. Security and privacy model

No PHI accepted or required anywhere in the product. Server-side-only secrets (`.env.local`, never committed; `.env.example` documents names only); no key ever reaches the browser bundle. Read-only DuckDB connection for all API and copilot request handling. Upload pipeline: extension/MIME/magic-byte checks, size/page limits, decompression-bomb protection, quarantine directory, safe parser libraries, path sanitization, deletion controls. CSP/CORS/rate-limiting on all endpoints. Dependency and secret scanning wired into CI. `docs/security/THREAT_MODEL.md` (STRIDE) and `docs/security/INCIDENT_RESPONSE.md` produced in Phase 10, revisited in Phase 11's adversarial review.

## 17. Test pyramid

pytest (unit + source-adapter contract tests with offline fixtures) and Vitest (component tests) at the base; geography/crosswalk audits and analytics hand-check fixtures (values computed by hand against small known inputs) as data-correctness gates; Monte Carlo reproducibility tests (same seed → identical output); API integration tests; Playwright end-to-end tests covering every required workflow in `docs/06_ACCEPTANCE_TESTS.md` §13; axe accessibility tests on every primary page; export-consistency tests (exported numbers must exactly match API/warehouse output); prompt-injection adversarial tests; performance budget tests. All wired into `make test` / `make audit` and GitHub Actions (lint, types, unit, contract smoke, build, e2e smoke — live-source refresh jobs kept separate from PR CI per `docs/04` §17).

## 18. Accessibility plan

WCAG 2.2 AA is a release gate starting at Phase 5, not a Phase 10 retrofit: full keyboard navigation, visible focus states, semantic landmarks/headings, accessible names for map controls, table equivalents for every map view, no color-only meaning, sufficient contrast, motion reduction, screen-reader announcements for filter/selection changes, chart data-table equivalents, skip links, minimum touch-target sizing, accessible PDF exports. Automated axe checks plus manual keyboard/screen-reader passes at each phase gate that touches the frontend.

## 19. Performance budgets

Per `docs/04_ARCHITECTURE_IMPLEMENTATION.md` §19: shell interactive within 2.5s locally; map pan/zoom ≥45 FPS for tract layers; selection response <250ms after data load; profile API response <500ms; scenario evaluation <2s for precomputed metrics; report generation <30s; no multi-megabyte JSON payload where tiles/summaries suffice. Measured and recorded in `DELIVERY_REPORT.md`, not assumed.

## 20. Phase-by-phase implementation sequence and acceptance gates

Executing `docs/07_BUILD_PHASES.md` verbatim, Phases 0–11. Each phase follows the 11-step operating protocol (re-read spec → inspect current repo/test state → plan in `TASKS.md` → implement a complete vertical slice → test while implementing → run the phase-specific tests/audits → start the app and visually inspect in-browser → fix defects found → update `DECISIONS.md`/`RISK_REGISTER.md`/`DATA_DICTIONARY.md`/`DATA_MANIFEST.json`/`MODEL_CARD.md` → commit a coherent checkpoint → update `STATE.md`). No phase advances past a red gate; a blocked capability is narrowed with a documented decision and a truthful unavailable state, never faked.

| Phase | Scope | Gate evidence |
|---|---|---|
| 0 | Discovery, source verification, architecture approval | This plan + `docs/data/source-verification.md`, user approval (done) |
| 1 | Repo foundation: scaffold, tooling pins, `make bootstrap/dev/test`, minimal vertical slice (shell + API health + DuckDB check), CI | Clean-clone bootstrap + `make dev` succeeds; CI green |
| 2 | Geography spine: canonical dimensions, crosswalks, provenance, data contracts, demo snapshot | Geometry/coverage audits pass; crosswalk weights sum-check passes |
| 3 | Core source ingestion: all 16–17 adapters live/cached, internal data-explorer | Every adapter has a passing contract test + fixture; no all-null production column |
| 4 | Analytics foundation: metric registry, domain scores, uncertainty, sensitivity, explainability, tautology guard | Hand-check fixtures pass; Monte Carlo reproducible under fixed seed |
| 5 | Design system + first complete vertical slice (Overview + Explore) | In-browser UX walkthrough at desktop/mobile/keyboard; axe clean |
| 6 | Access Lab: routing, E2SFCA, mobile-clinic optimizer | Routing method labels correct; optimizer reproducible with solver status |
| 7 | Utilization Lab + Validation Lab | HCAI suppression preserved; validation independence check passes; null findings visible |
| 8 | Advocate workspace + Document Intelligence + optional Copilot | Deterministic mode works with zero keys; injection tests pass |
| 9 | Reporting/export/sharing | Exported numbers match API exactly; share links restore state |
| 10 | Performance/accessibility/security hardening | Performance budgets met; axe + manual a11y pass; no unresolved high-severity dependency findings |
| 11 | Adversarial multi-role review + `DELIVERY_REPORT.md` | Full clean run of all `make` targets; acceptance matrix complete |

## 21. Optional credentials and keyless fallbacks

| Credential | Optional? | Keyless fallback |
|---|---|---|
| `CENSUS_API_KEY` | Yes | `data.census.gov` bulk Download Center (now the default path since Census requires a key for live API calls) |
| `HUD_USER_TOKEN` | Yes | Census 2020 ZCTA-to-tract relationship file (default) |
| `ANTHROPIC_API_KEY` | Yes | Deterministic templated Copilot mode (default) |
| `MAPBOX_TOKEN` | Yes | Keyless MapLibre basemap style |
| `OPENROUTESERVICE_API_KEY` | Yes | Local OSM-network routing (OSMnx/networkx) |
| `SENTRY_DSN` | Yes | No telemetry in local mode by default |

Core functionality (data pipeline, analytics, Explore/Prioritize/Access Lab/Validate/Advocate/Data pages, deterministic Copilot) works with **zero** credentials.

## 22. Risks

Tracked in full in `RISK_REGISTER.md`; headline items: source schema drift across ~17 adapters, geography/crosswalk mismatch, AI hallucination or citation fabrication if the copilot's numeric-integrity validator has a gap, CalEnviroScreen 5.0 being freshly finalized (watch for post-release errata), county meeting-portal (Granicus/IQM2) scraping fragility, privacy/PHI boundary discipline in document upload, uncertainty being misread as false precision or vice versa, and multi-session context continuity across a build this large.

## 23. Required top-level commands

`make bootstrap`, `make data`, `make demo`, `make dev`, `make test`, `make audit`, `make export-demo` — implemented in Phase 1, exercised at every subsequent phase gate, and re-verified end to end in Phase 11.
