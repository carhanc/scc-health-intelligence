# DECISIONS.md — Architecture and Methodology Decision Records

Each record: context, decision, rationale, alternatives considered, and consequences. Numbered sequentially; never renumbered or deleted — superseded decisions are marked, not removed.

---

### DEC-001 — Clean-room boundary

**Context:** CLAUDE.md and the master build prompt mandate that this repository be built without inspecting, copying, or referencing `~/Desktop/scc-caregap-atlas` or any sibling project.

**Decision:** All planning and implementation work is confined to `/Users/arhan/Desktop/scc-health-intelligence` plus verified official public web sources. No sibling-repository path is ever listed, read, or imported.

**Rationale:** Explicit non-negotiable instruction; also produces a cleaner architecture unencumbered by legacy compromises.

**Consequences:** `scripts/check_clean_room.py` (Phase 1) enforces this programmatically in CI by failing on any pipeline/script reference to a path outside the project root or approved cache locations (`data/`, `warehouse/`, OS temp).

---

### DEC-002 — Node.js version: 22 LTS over 24 LTS

**Context:** As of July 2026, Node 24 is the Active LTS line and Node 22 is in Maintenance LTS. The spec's explicit baseline names "Node.js 22 LTS or the current compatible LTS verified at build time," leaving discretion.

**Decision:** Pin to **Node 22 LTS** via `.nvmrc`.

**Alternatives considered:** Node 24 LTS (newer, longer remaining support window).

**Rationale:** Node 22 Maintenance LTS remains fully supported through this build's expected multi-session timeline, matches the spec's literal baseline, and minimizes the chance of encountering less-mature ecosystem compatibility issues with Next.js 16/pnpm 11 tooling during a long build. This is a reversible, low-cost decision — revisit if Node 22 approaches end-of-maintenance before ship.

**Consequences:** `.nvmrc` pins `22`; bootstrap script checks/installs this version specifically.

---

### DEC-003 — ACS ingestion defaults to keyless bulk download, not the live Census API

**Context:** Source verification (`docs/data/source-verification.md` §2) found that the Census Data API now requires `CENSUS_API_KEY` for *all* calls (a policy change from ~May 2026), not just high-volume queries as the spec's acquisition-order language implied.

**Decision:** The ACS adapter's default (no-key) path is the official `data.census.gov` bulk Download Center / summary-file download, promoted from "fallback of last resort" to "default no-key path." `CENSUS_API_KEY` remains supported as an optional enhancement for faster, more targeted queries when configured.

**Rationale:** Preserves CLAUDE.md's non-negotiable rule that "core functionality must work without paid API keys" (the Census key itself is free, but still a credential-acquisition step a user should not be forced through for baseline function). This is exactly the acquisition order `docs/02_DATA_SOURCE_REGISTRY.md` §4.2 already specified — the change is only in which branch is "primary" versus "rare fallback."

**Consequences:** Bulk-download parsing (fixed-width or CSV summary files) must be built and tested in Phase 3 as a first-class adapter path, not a rarely-exercised branch.

---

### DEC-004 — Pin TIGER/Line boundaries to the 2020 vintage

**Context:** TIGER/Line 2025 boundary files exist (legal boundaries as of Jan 1, 2025), but ACS 5-year, PLACES, and SVI are all published against 2020 Census tract numbering.

**Decision:** Use **TIGER2020** tract/ZCTA/place boundaries as the canonical geometry, not the newer 2025 legal-boundary release.

**Rationale:** GEOID alignment across all health/demographic sources requires a consistent tract vintage; mixing a 2025 boundary file with 2020-numbered data would silently corrupt joins. `docs/02_DATA_SOURCE_REGISTRY.md` §3 explicitly requires using 2020 tract boundaries and documenting any 2010-based source.

**Consequences:** Any future re-basing to a newer decennial tract vintage (post-2030 Census) requires a full crosswalk migration, documented as a new decision when it happens.

---

### DEC-005 — ZIP-to-tract crosswalk defaults to the Census ZCTA relationship file, not the HUD USPS crosswalk

**Context:** Source verification found the HUD USPS ZIP-tract crosswalk now requires free account registration and a bearer token — no longer anonymous. `docs/02_DATA_SOURCE_REGISTRY.md` §4.4 already anticipated this exact scenario: "If HUD access requires authentication or is unavailable, use the Census 2020 ZCTA-to-tract relationship file... and label the result lower confidence."

**Decision:** Default (no-key) crosswalk path is the keyless Census 2020 ZCTA-to-tract relationship file, area/population-weighted. HUD's residential-address-weighted crosswalk is used as an optional higher-confidence enhancement when `HUD_USER_TOKEN` is configured, and results built from it are labeled `high_confidence_crosswalk` versus the ZCTA-relationship path's `moderate_confidence_crosswalk` per the allocation-quality field defined in `docs/03_ANALYTICS_METHODS.md` §2.3.

**Rationale:** Preserves no-key core functionality while still offering the better-quality crosswalk as an enhancement.

**Consequences:** Utilization Lab crosswalk-uncertainty displays must expose which crosswalk method was used per query, not assume HUD uniformly.

---

### DEC-006 — DuckDB 1.5.x with built-in GEOMETRY type

**Context:** DuckDB 1.5.0 ("Variegata," May 2026) made `GEOMETRY` a core built-in type rather than something the `spatial` extension had to introduce; the `spatial` extension (1.5.3) still supplies the associated functions (distance, area, intersection, etc.).

**Decision:** Use DuckDB 1.5.x as the analytical warehouse, loading `spatial` for functions.

**Rationale:** Simplifies setup versus pre-1.5 DuckDB while remaining the spec's named default warehouse technology.

**Consequences:** None material; standard `INSTALL spatial; LOAD spatial;` bootstrap step still required for spatial functions even though the type itself is now core.

---

### DEC-007 — CalEnviroScreen: target the final 5.0 dataset explicitly, guard against the stale draft

**Context:** CalEnviroScreen 5.0 was finalized July 1, 2026, ten days before this build started, superseding a draft-5.0 dataset that persists on data.ca.gov from the public-comment period.

**Decision:** The Phase 3 adapter must resolve and pin the **final, non-draft** CalEnviroScreen 5.0 dataset ID, verified again at implementation time (not merely at this Phase 0 check), and record the methodology-version string explicitly since 5.0 is not directly comparable to 4.0 (new indicators, updated tract vintage).

**Rationale:** A dataset finalized ten days before build start is exactly the kind of source most likely to have a stale duplicate lingering in a portal; verifying twice (Phase 0 + Phase 3) costs little and prevents building against superseded draft values.

**Consequences:** `RISK_REGISTER.md` carries this as an active watch item until the Phase 3 adapter is built and its dataset ID is confirmed non-draft.

---

### DEC-008 — Frontend navigation: defer the Utilization Lab placement decision to Phase 5

**Context:** `docs/01_UX_UI_SPEC.md` §3 lists eight primary nav items and explicitly permits combining Access Lab and Utilization Lab into seven if eight feels excessive during implementation, while the Product Charter (`docs/00`) lists nine required modules including Utilization Lab as its own item.

**Decision:** Build all module capabilities as required; decide the exact top-level-nav grouping (separate Utilization Lab tab vs. a sub-tab under Access Lab or Explore) during Phase 5's in-browser UX review with real data, based on observed usability, not guessed in advance.

**Rationale:** The spec itself defers this exact choice to implementation-time usability testing ("Page names can improve if usability testing supports it, but every capability must exist" — `BOOTSTRAP_PROMPT.txt`). Validate and Data remain always visible regardless of the outcome, per the explicit instruction not to bury trust features.

**Consequences:** This entry will be updated (not superseded, since it's genuinely provisional) once Phase 5 produces a concrete answer with browser-review evidence.

---

### DEC-009 — No live hosted deployment provisioned during this build; architecture documented, not deployed

**Context:** `docs/04_ARCHITECTURE_IMPLEMENTATION.md` §18 requires designing for both a local/research mode and a hosted public mode, and choosing/documenting a deployment target. No cloud account, hosting credentials, or deployment target were provided or requested by the user.

**Decision:** Fully build and verify the **local/research mode** (one-command `make dev` startup, DuckDB + local files, no account, all public data cached locally) as the primary deliverable. Document the hosted-mode architecture (containerized FastAPI + worker, object storage, CDN for PMTiles, background refresh schedule) in `docs/architecture/deployment.mmd` and `PLAN.md` §6/§16, including a Docker Compose reference setup for CI, but do not provision or verify an actual live cloud deployment.

**Rationale:** No deployment credentials exist; provisioning cloud infrastructure without explicit user request and account access would be out of scope and potentially costly/irreversible. The spec requires the *architecture* to support hosted deployment, not that this build session actually deploys it.

**Consequences:** `DELIVERY_REPORT.md` will record hosted deployment as "architecture documented and Docker-buildable, not live-deployed" rather than claiming a deployed URL. If the user wants an actual hosted deployment later, that is a distinct follow-on request requiring their cloud credentials/target.

---

### DEC-010 — County meeting-portal ingestion: user upload first-class, scraper connector deferred to a Phase 8 spike

**Context:** Source verification found Santa Clara County's meeting system migrated to Granicus/IQM2 (`sccgov.iqm2.com`) in January 2024, distinct from Legistar (used by the City of Santa Clara, a different jurisdiction) or the legacy MinuteTraq system.

**Decision:** Document Intelligence (Phase 8) is built so that **user-uploaded PDF/DOCX/TXT is the first-class, always-available ingestion path**, exactly as `docs/02_DATA_SOURCE_REGISTRY.md` §8.1 specifies ("Support user-uploaded files first. Build connectors/scrapers only when permitted and stable."). A Granicus/IQM2-specific scraper/connector is attempted as a Phase 8 stretch enhancement, not a release-blocking requirement.

**Rationale:** Matches the spec's own priority ordering and avoids over-investing in a scraper against a portal whose scraping feasibility (formal API vs. PDF-only calendar) was not fully confirmed during Phase 0 verification.

**Consequences:** If the Phase 8 scraper spike fails or is deprioritized, Document Intelligence still fully satisfies its acceptance criteria via upload alone — recorded as an explicit scope note in `RISK_REGISTER.md`, not a silent gap.

---

### DEC-011 — Accept the existing x86_64 Homebrew (Rosetta) rather than installing a parallel arm64 Homebrew

**Context:** During Phase 1 bootstrap, `brew --prefix` resolved to `/usr/local` rather than the native Apple Silicon path `/opt/homebrew`. This machine's Homebrew installation is the Intel build running under Rosetta 2; `node@22`, `uv`, and the Python 3.12 interpreter it installed are all x86_64 binaries, not arm64-native.

**Decision:** `scripts/bootstrap_macos.sh` uses whatever Homebrew is already on `PATH` (currently the x86_64/Rosetta one at `/usr/local`) rather than installing a second, native arm64 Homebrew at `/opt/homebrew`.

**Alternatives considered:** Installing a parallel arm64 Homebrew at `/opt/homebrew` and directing this project's tooling there for native performance.

**Rationale:** The bootstrap script explicitly promises not to modify unrelated system/shell configuration without explicit permission (`docs/07_BUILD_PHASES.md` Phase 1: "avoid modifying unrelated shell configuration without permission"). Installing a second Homebrew prefix is a significant, persistent change to the user's machine that affects far more than this project and was not requested. Everything installs and runs correctly under Rosetta — this is a performance tradeoff, not a correctness one, and it is reversible by the user at any time by installing Homebrew natively at `/opt/homebrew` themselves and re-running the bootstrap script (which will then pick up whichever `brew` resolves first on `PATH`).

**Consequences:** Local dev-server performance (Node/Python process startup, native module compilation) may be modestly slower than a fully native arm64 toolchain. This is recorded, not treated as a blocker, per `docs/00_PRODUCT_CHARTER.md`'s priority ordering (architecture/cosmetic preferences rank below data integrity, acceptance criteria, and methodology). See `RISK_REGISTER.md` RISK-011.

---

### DEC-012 — Supervisor district source: reject the OBJECTID-only 2021 layer, use the labeled Planning Office layer

**Context:** Phase 2 needed a canonical Santa Clara County supervisor district boundary source. Two official candidates were found on ArcGIS Online, both owned by `SCC.Planning.Office`:
1. Item `5cae68d4bb2c47fd89d62dac2856e989` ("Santa Clara County Supervisorial District Boundaries 2021", service `Supervisorial_Districts_2021`, layer 24) — 5 polygon features, but the **only attributes are `OBJECTID`, `Shape__Area`, `Shape__Length`**. There is no field identifying which OBJECTID corresponds to official District 1–5.
2. Item `eb0277c396494f98b71d8781e417464d` ("Supervisorial Districts", service `PlanningOfficeDataService2`, layer 5, last modified 2025-09-25) — 5 polygon features with explicit `DISTRICT` (integer 1–5) and `SUPERVISOR` (name) fields, matching current officeholders (Sylvia Arenas–D1, Betty Duong–D2, Otto Lee–D3, Susan Ellenberg–D4, Margaret Abe-Koga–D5).

**Decision:** Use source 2 (`PlanningOfficeDataService2`/layer 5) as the canonical supervisor-district boundary. Do not use source 1.

**Rationale:** A geometry-only layer with an arbitrary `OBJECTID` cannot be safely matched to real district numbers without an unverifiable guess — assigning "OBJECTID 1 = District 1" would be exactly the kind of silent, unverified assumption CLAUDE.md prohibits ("Never fabricate... source data"). Source 2 carries the district identity directly from the publisher and is also more recently maintained.

**Consequences:** `DATA_MANIFEST.json` records both items were evaluated; source 1 is not ingested. If source 2 ever becomes unavailable, the correct fallback is to re-verify a labeled source rather than falling back to the unlabeled one.

### DEC-013 — Cartographic (generalized) boundaries for county and ZCTA; full-resolution TIGER for tract and place

**Context:** Raw TIGER/Line boundary files are only published nationally for county and ZCTA layers (no per-state partition), making them large (80MB county, and ZCTA is larger still) for a build that only needs Santa Clara County's single county boundary and a handful of ZCTAs. Census also publishes cartographic (generalized) boundary files from the same TIGER/Line program at 1:500,000 scale, which are official Census Bureau products, just simplified.

**Decision:** Use the cartographic 500k boundary files for **county** (`cb_2020_us_county_500k.zip`, 12.6MB vs. 80.6MB raw) and **ZCTA** (`cb_2020_us_zcta520_500k.zip`, 66.7MB, still filtered down to Santa Clara-relevant ZCTAs after fetch). Use full-resolution state-partitioned TIGER/Line for **tract** (`tl_2020_06_tract.zip`, the canonical analytical unit, where precision matters most) and **place** (`tl_2020_06_place.zip`).

**Rationale:** `docs/02_DATA_SOURCE_REGISTRY.md` §4.3 explicitly permits storing "original and simplified geometries" and requires recording simplification tolerance — this is exactly that tradeoff, applied only to the two layers where a single county's worth of full-resolution national data would be disproportionately expensive relative to their use (county boundary is a coarse containment reference; ZCTA is a crosswalk/utilization-context layer, not the canonical analytical unit).

**Consequences:** `geo.county` and `geo.zctas` geometries are recorded with `geometry_precision = "cartographic_500k"` in their provenance metadata; `geo.tracts` and `geo.places` are recorded as `geometry_precision = "full_resolution"`. If a future phase needs full-resolution county/ZCTA geometry (e.g., precise ZCTA-based routing), re-ingest from the raw national TIGER file at that time with a new decision record.

### DEC-014 — HUD USPS crosswalk enhancement path deferred past Phase 2

**Context:** DEC-005 already established that the Census ZCTA-to-tract relationship file is the default (keyless) crosswalk and the HUD USPS crosswalk is an optional higher-confidence enhancement gated on a free `HUD_USER_TOKEN`. Phase 2 scope is the geography spine; no `HUD_USER_TOKEN` was requested or provided this session.

**Decision:** Phase 2 implements the Census ZCTA-relationship crosswalk fully (weights computed, audited, loaded). The HUD-crosswalk enhancement path is stubbed with a typed "not configured" adapter result rather than implemented end-to-end, since it requires a credential this session does not have.

**Rationale:** Matches the "no all-null production columns... but truthful unavailable state" principle — the enhancement is clearly absent, not silently faked or partially built against guessed API responses.

**Consequences:** `RISK_REGISTER.md` records this as an open enhancement, not a defect. Any future session with a `HUD_USER_TOKEN` can complete the adapter using the already-documented API pattern in `docs/data/source-verification.md` §5.

---

### DEC-015 — Demo warehouse is a separate file from the live warehouse

**Context:** `make demo` must produce a deterministic offline snapshot without ever risking corruption of a live `make data` build, per `docs/04_ARCHITECTURE_IMPLEMENTATION.md` §22.

**Decision:** `make demo` writes to `warehouse/scc_health_demo.duckdb`, entirely separate from `warehouse/scc_health.duckdb` (live). The API's `resolve_warehouse_path()` prefers the live warehouse if present, falls back to the demo warehouse, and otherwise reports a truthful `unavailable` state — every geography API response carries an explicit `data_mode: "live" | "demo"` field so the frontend can label demo data as such rather than presenting it as current.

**Rationale:** Directly satisfies the "demo mode must be visibly labeled and must not be confused with live/current data" requirement without any risk of one build overwriting the other.

**Consequences:** `data/demo/geography/*.parquet` (the checked-in snapshot `make demo` reads from) must be regenerated via `scripts/build_demo_geography_snapshot.py` whenever the live geography pipeline's schema changes materially.

### DEC-016 — Demo snapshot is a frozen copy of real Phase 2 data, not synthetic data

**Context:** `docs/04_ARCHITECTURE_IMPLEMENTATION.md` §22 requires demo mode to use "small checked-in source fixtures... never invented production values."

**Decision:** `data/demo/geography/*.parquet` is a direct, unmodified copy of the real curated Phase 2 output (408 real tracts, 30 real places, 5 real supervisor districts, etc.), frozen at the time `scripts/build_demo_geography_snapshot.py` was run, not a synthetic or reduced subset.

**Rationale:** Santa Clara County's full geography spine is small enough (3.2MB across all curated tables) to check into git in full; there is no need to fabricate or down-sample data, and doing so would violate the "never invented production values" rule in spirit even for demo purposes.

**Consequences:** Every number a user sees in demo mode is a real, sourced number — the only thing distinguishing demo from live is freshness (frozen at snapshot time vs. current), which is exactly the honest distinction the `data_mode` field is designed to communicate.

### DEC-017 — No browser-based visual verification tooling available this session; relied on HTTP-level verification instead

**Context:** `docs/07_BUILD_PHASES.md` calls for using "the built-in browser" to visually inspect each phase's UI. In this environment, `mcp__Claude_in_Chrome__list_connected_browsers` returned empty (no extension connected) both in Phase 1 and Phase 2, and the Preview tool's process spawner failed with a sandbox-level `getcwd: cannot access parent directories: Operation not permitted` error before even reaching the launch command, in both a plain `pnpm dev` invocation and a wrapper-script invocation.

**Decision:** Verified the Phase 2 frontend work (geography search page) via: production build success (`next build`), ESLint/TypeScript strict-mode cleanliness, Vitest unit tests, direct HTTP inspection of server-rendered HTML output (`curl` against the dev server, confirming expected headings/labels/input IDs appear), live end-to-end API calls confirmed via `curl` returning correct real data, and a CORS preflight-equivalent check confirming the browser-origin request pattern is permitted.

**Rationale:** This is the most rigorous verification achievable without functioning browser tooling in this specific environment. It is not equivalent to an actual visual/interaction review and is not claimed as such.

**Consequences:** A true in-browser visual/accessibility/interaction walkthrough (screenshots, keyboard navigation, screen-reader checks) remains outstanding and is explicitly deferred to Phase 5, which is where `docs/07_BUILD_PHASES.md` itself first requires browser-based UX review evidence (Phase 2's gate does not). If browser tooling becomes available in a future session, a retroactive visual check of the Phase 2 Explore scaffold would be a reasonable first action.

### DEC-018 — California Healthy Places Index (HPI) is a documented-blocked source, not a fabricated or third-party-mirrored one

**Context:** `docs/02_DATA_SOURCE_REGISTRY.md` requires HPI as a core context source, but re-verification at Phase 3 implementation time confirmed there is no official keyless bulk-download path: the HPI API requires registration, the only stable bulk artifact ships 2010-vintage census geography (misaligned with this project's 2020-tract canonical geography), and third-party CSV mirrors are not authoritative sources this project is willing to cite.

**Decision:** `pipelines/src/scc_health_pipeline/sources/ca_hpi.py::CaHpiAdapter` is implemented as an intentionally-blocked adapter: `discover()` returns an empty resource list, `fetch()` raises `NotImplementedError` if ever called, and `quality_checks()` always fails. `blocked_manifest_entry()` writes a `DATA_MANIFEST.json` entry with `"status": "unavailable"` and an explanatory `notes` field, so the source is visibly and truthfully absent rather than silently missing or invented.

**Rationale:** CLAUDE.md is explicit that a failed source must produce "a visible unavailable state, a logged reason, and a documented fallback" rather than fabricated or silently-substituted data. Registering for API access, or manually reconciling 2010-vintage HPI geography against this project's 2020-tract canonical geography, is out of scope for an unattended keyless build; both remain a documented option for a future session with a maintainer-provided credential and a geography-crosswalk exercise, not a blocker to declaring Phase 3 otherwise complete.

**Consequences:** Every UI/API surface that would show HPI must render a truthful "data unavailable" state (see `/api/v1/sources`, which reports `ca_hpi_3_0` with `freshness_state: "unavailable"`) rather than an empty chart or a zero. `RISK_REGISTER.md` carries this as an open, accepted gap, not a silent one.

### DEC-019 — All-null warehouse columns must be explained against the raw source file, not merely tolerated or silently dropped

**Context:** The Phase 3 data-quality audit (`pipelines/src/scc_health_pipeline/audits/core_sources_audits.py`) flagged four columns as entirely null across every Santa Clara County row: `health.places_observations.suppression_flag`, `resources.transit_stops.stop_url`, `resources.hrsa_mua_p.designation_population`, and `utilization.hcai_ed_facility_profile.RURAL_HOSPITAL_DESC`. Each was manually re-verified against the *raw* source file (not just the warehouse) before being accepted: CDC PLACES applied zero footnote/suppression codes to any of 16,320 Santa Clara County rows in this release; VTA's GTFS feed leaves `stop_url` blank for all 3,345 stops; HRSA's national MUA_DET.csv leaves the designation-population field blank for all 48 Santa Clara County MUA/P rows; and `RURAL_HOSPITAL_DESC` is populated statewide only for facilities HCAI itself labels `SMALL/RURAL` — a category Santa Clara County, being fully urban, has none of.

**Decision:** Rather than dropping these columns (which would lose real source-schema fidelity and silently discard a field that could become populated in a future release) or treating them as a permanent audit failure, `core_sources_audits.py::_EXPLAINED_ALL_NULL_COLUMNS` records the verified reason per column, and the audit reports them informationally rather than failing the gate.

**Rationale:** CLAUDE.md prohibits "unexplained... all-null production columns" — the operative word is *unexplained*. A column confirmed, against the raw file, to be genuinely inapplicable to every row in this specific county/data slice is a true fact about the source, not a pipeline defect; collapsing that distinction (either by deleting the column or by permanently red-flagging it) would itself be a form of data-transparency loss.

**Consequences:** Any future all-null column not already in `_EXPLAINED_ALL_NULL_COLUMNS` still fails the audit gate by default — this decision only exempts columns that were individually hand-verified, not a blanket allowance.

### DEC-020 — ACS 5-year adapter scope narrowed to 3 representative tables (total population, poverty, disability), not the full ~20-measure conceptual list

**Context:** `docs/02_DATA_SOURCE_REGISTRY.md` describes a broad set of ACS-derived measures (income, insurance coverage, vehicle access, language isolation, housing cost burden, education, etc.). Each additional ACS table requires downloading a separate national-scope Summary File `.dat` artifact (18-120MB each) and building its own estimate/MOE column mapping.

**Decision:** Phase 3 implements `AcsTableAdapter` generically (parameterized by table ID) and wires up 3 tables — B01003 (total population), B17001 (poverty status by sex by age), B18101 (disability status by sex by age) — as a representative, real, fully-tested slice, rather than fabricating or stubbing the remaining ~17 tables.

**Rationale:** CLAUDE.md prohibits placeholder/fabricated metrics; implementing all ~20 tables with real data inside this session was not achievable given per-table download and validation cost, so the honest choice is a documented, narrower real subset plus a clear "not yet implemented" list, rather than a wider surface with fake or missing data behind it.

**Consequences:** `social.acs_observations` currently covers population, poverty, and disability only. `TASKS.md` and `DATA_DICTIONARY.md` list the deferred ACS tables explicitly as a Phase 3+ backlog item, not a silently-missing feature — adding a new table is a one-line addition to `AcsTableAdapter`'s call sites in `run_core_sources_pipeline.py`, since the adapter itself is already generic.

### DEC-021 — Additional Santa Clara County GIS layers (Parks, Community Service Districts) verified available but deferred past Phase 3

**Context:** Beyond the supervisor-district boundaries already implemented in Phase 2, the SCC GIS Hub (`prod-sccgov.opendata.arcgis.com`) hosts other ArcGIS FeatureServer layers (e.g. a `Community_Service_Districts` layer, confirmed live and queryable during Phase 3). `docs/02_DATA_SOURCE_REGISTRY.md` does not name a specific required list of additional county GIS layers beyond supervisor districts.

**Decision:** Confirmed these additional layers are live and queryable (spot-checked via a `?f=json` FeatureServer metadata request) but did not build adapters for them in Phase 3, prioritizing the explicitly-required core health/social/resource/utilization sources, the audit suite, and the API/frontend transparency surfaces instead.

**Rationale:** No specification document names these specific layers as required for Phase 3; they are better scoped alongside the analytics/access-lab work in a later phase where their actual use (e.g. a park-proximity access metric) is defined, rather than ingested speculatively now.

**Consequences:** `TASKS.md` records these as a verified-available, not-yet-implemented backlog item with the confirmed FeatureServer endpoint pattern, so a future session does not need to re-discover them.

### DEC-022 — The API layer reimplements a lightweight freshness classifier rather than importing `scc_health_pipeline`

**Context:** The Phase 3 freshness/vintage-transparency audit (`pipelines/.../audits/vintage_audits.py`) classifies each source into states like `newest_verified`/`lagged`/`stale`/`intentional_older`. The API's new `/api/v1/sources` endpoint needs the same classification to display a freshness badge per source.

**Decision:** Rather than adding `scc-health-pipeline` as a dependency of `scc-health-api` (which would pull geopandas/polars/PySAL and the rest of the analytics dependency chain into a request-serving process), `apps/api/src/scc_health_api/services/freshness.py` is a small, self-contained reimplementation of the same cadence-window classification logic.

**Rationale:** `docs/04_ARCHITECTURE_IMPLEMENTATION.md` treats the API as a lightweight, read-only-warehouse-querying process; importing the full pipeline package for date arithmetic over `DATA_MANIFEST.json` would meaningfully bloat its dependency footprint and startup cost for no functional benefit.

**Consequences:** The two classifiers' rule tables (`_CADENCE_DAYS`, `_INTENTIONALLY_FIXED_VINTAGE`) must be kept in sync manually; both files carry a comment cross-referencing the other. A future refactor could extract just this pure-logic module into a shared, dependency-free `packages/` module if drift becomes a problem.

### DEC-023 — Phase 4 domain scope: 5 tract-level scored domains; ED utilization pressure is not built as a tract-level domain

**Context:** `docs/03_ANALYTICS_METHODS.md` §4 lists 7 candidate domains including "ED utilization pressure." HCAI's ED patient-county data (Phase 3) is native to *patient county of residence*, not tract, and Santa Clara County is the only county present in this dataset — there is no real tract-level allocation basis for it (a ZIP-to-tract crosswalk exists, but HCAI's patient-county file is aggregated by county, not ZIP, so the crosswalk cannot be applied here).

**Decision:** Phase 4 builds 5 tract-level scored domains (health_burden, access_barriers, environmental_burden, resource_accessibility, workforce_shortage) plus the cross-cutting data_confidence domain computed alongside every score. ED utilization pressure is **not** built as a scored domain; HCAI county-level ED data is instead used exclusively as an independent convergent/criterion-validation input candidate (see DEC-033).

**Rationale:** Fabricating a tract-level ED-pressure value from a single county total would require either inventing an allocation with no defensible basis or silently treating the county total as if it applied uniformly to every tract — both violate CLAUDE.md's prohibition on fabricating or backfilling unavailable data. A genuine tract-level utilization metric requires the ZIP-level patient-origin data (`utilization.hcai_patient_origin`) crosswalked through the Phase 2 ZCTA-tract relationship, which is explicitly reserved for Phase 7 (Utilization Lab), the phase docs/07 assigns this exact "native-geography display with allocated-tract-estimate labeling and crosswalk-uncertainty disclosure" work to.

**Consequences:** Scenario weight configs in `config/scenarios.yml` reference only the 5 available domains; docs/03 §7.2's suggested scenarios that lean on "ED pressure" are adapted with a `notes` field explaining the substitution. `MODEL_CARD.md` and `DATA_DICTIONARY.md` record this gap explicitly rather than silently.

### DEC-024 — `resource_accessibility` and `workforce_shortage` domains use straight-line distance, not network travel time

**Context:** `docs/03_ANALYTICS_METHODS.md` §12.3 requires network travel time (OSM/OSMnx routing) as the preferred method, explicitly permitting straight-line distance only as a clearly-labeled fallback. Full network routing requires an OSM road-network graph and routing engine, which is `docs/07_BUILD_PHASES.md` Phase 6 (Access Lab) scope, not yet built.

**Decision:** `pipelines/src/scc_health_pipeline/routing/straight_line.py` implements haversine great-circle distance as the Phase 4 baseline for both `resource_accessibility` (nearest clinical-care site) and `workforce_shortage` (HPSA proximity) metrics, and for the location-allocation optimizer's demand-to-site coverage matrix. Every value/result produced through this module carries `method="straight_line_screening"`, propagated into the metric registry's `interpretation` field, the optimizer's `assumptions` list, and the data-confidence `geography_quality_component` (scored 0.7 vs. 1.0 for native/direct metrics).

**Rationale:** Matches docs' explicit fallback-labeling requirement exactly ("If only straight-line distance is available, label it explicitly") rather than either fabricating network results or leaving these domains unbuilt until Phase 6.

**Consequences:** Every explainability/recommendation response surfaces this limitation verbatim so a user never mistakes a straight-line proxy for a real travel time. Phase 6 will add true network routing and can then either replace these metrics or add a second, more accurate metric alongside them (a versioning decision to be made then, per `MODEL_CARD.md`'s "Update process").

### DEC-025 — HRSA MUA/P workforce-shortage assignment uses a direct tract-code join via the source's own `census_tract_raw` field, not a distance proxy

**Context:** Unlike HPSA records, HRSA's national `MUA_DET.csv` carries a `census_tract_raw` field (format e.g. `"5043.21"`) for each Santa Clara County MUA/P designation. Converting this to the standard 6-digit TIGER tract code (`"504321"`, via `str.replace(".", "") + zero-pad`) and joining against `geo.tracts.tract_code` matched 46 of 48 Santa Clara County MUA/P records to a real, current 2020 tract.

**Decision:** `metrics/precomputed_geospatial.py::compute_workforce_shortage_inputs` uses this direct join (not a straight-line proximity proxy) for the `mua_designated_flag` metric. The 2 unmatched records (`5044.17`, `5016.00` — likely referencing a since-renumbered or non-current tract) are excluded and logged in `WorkforceShortageDiagnostics`, not silently dropped.

**Rationale:** A genuine source-provided tract identifier is strictly more accurate than any distance-based proxy this platform could construct; using it where available, and being honest about the 2 unmatched records, is more defensible than applying a uniform straight-line method to every workforce-shortage input regardless of whether better data exists.

**Consequences:** `workforce_shortage`'s two component metrics use two different methods (`mua_designated_flag`: direct match; `hpsa_proximity_score`: straight-line proxy, DEC-026) — both documented individually in `config/metrics.yml`'s `interpretation` field so neither is silently assumed to share the other's accuracy characteristics.

### DEC-026 — HPSA-based workforce-shortage signal limited to "Designated," coordinate-bearing (facility-anchored) records only

**Context:** Of 148 Santa Clara County HPSA records in `resources.hrsa_hpsa` (Phase 3), only 39 are both status="Designated" (currently active) and carry real point coordinates (facility-anchored auto-HPSA designations, e.g. a specific clinic). The remaining 109 are either area-based designations without point geometry (which would require HPSA polygon boundaries this platform does not ingest) or are Withdrawn/Proposed-for-Withdrawal (no longer active).

**Decision:** `hpsa_proximity_score` sums `hpsa_score / (1 + distance_miles)` over only these 39 Designated, coordinate-bearing records within a 10-mile radius of each tract's internal point. The excluded 109 records remain fully visible in the raw `resources.hrsa_hpsa` table (Phase 3) and in the API's `/api/v1/data-explorer` — they are absent only from this specific derived tract-level score.

**Rationale:** Including inactive (Withdrawn) designations would overstate current shortage; including area-based designations without their real polygon geometry would require guessing a boundary, which CLAUDE.md prohibits. Restricting to verified-active, verified-located records is the honest subset.

**Consequences:** `hpsa_proximity_score` understates total HPSA-documented shortage (109 records excluded) — disclosed in the metric's `limitations` field. A true polygon-based HPSA-to-tract overlay is a documented future improvement, not attempted here without the underlying boundary data.

### DEC-027 — `access_barriers` has no `language_navigation` subdomain in Phase 4 (documented gap, not a silent one)

**Context:** `docs/03_ANALYTICS_METHODS.md` §4.2 lists "limited English proficiency" and a "language/navigation" subdomain among access_barriers' candidate components. No ACS language-isolation table (e.g. C16002) was ingested in Phase 3 (DEC-020's narrowed 3-table ACS scope), and no PLACES measure covers language proficiency.

**Decision:** `access_barriers` is scored across 4 subdomains only (affordability_coverage, mobility, functional_access, material_hardship) — the domain-coverage-threshold mechanism (`scoring/domain_scores.py`, docs §6.2) correctly treats this as a permanently-absent 5th subdomain for every tract, not a per-tract missing value, and every `access_barriers` score's coverage_fraction and explainability response discloses exactly which subdomains contributed.

**Rationale:** CLAUDE.md prohibits fabricating a value for a genuinely unavailable measure; the correct response to missing source data is an honest, documented gap, which the coverage-threshold mechanism already models correctly without new code.

**Consequences:** Adding a language-isolation ACS table (e.g. C16002) in a future session would only require registering new metrics under a `language_navigation` subdomain in `config/metrics.yml` — no scoring-engine change, since equal-subdomain-weighting and coverage-threshold handling are already generic.

### DEC-028 — The "utilization-first" sensitivity preset is renamed "systemic-pressure-first"

**Context:** `docs/03_ANALYTICS_METHODS.md` §9.1 names 5 standard sensitivity presets including "utilization-first," implicitly assuming a tract-level ED-utilization domain to weight heavily. DEC-023 establishes that no such domain exists in Phase 4.

**Decision:** `config/scenarios.yml`'s 5th named preset is `systemic_pressure_first`, weighting `resource_accessibility` and `workforce_shortage` most heavily (0.30 each) as the closest available proxies for systemic care-seeking friction, with a `notes` field cross-referencing this decision.

**Rationale:** Silently repurposing the "utilization-first" label for a preset that doesn't actually weight utilization would be misleading; renaming it to describe what it actually weights is more honest. The preset can be renamed back (or a true utilization-first preset added alongside it) once Phase 7 builds a real tract-level utilization metric.

**Consequences:** `MODEL_CARD.md`'s sensitivity section documents this substitution explicitly so a future reviewer does not mistake it for docs' literal utilization-first preset.

### DEC-029 — Monte Carlo and Dirichlet weight-sensitivity reproducibility relies on a single global seed plus deterministic sorted iteration order, not per-cell hashed seeds

**Context:** `docs/03_ANALYTICS_METHODS.md` §8.3 requires "a deterministic seed" such that repeated runs produce identical output (verified directly in `pipelines/tests/test_monte_carlo.py::test_monte_carlo_reproducible_under_fixed_seed`).

**Decision:** `uncertainty/monte_carlo.py` and `scoring/sensitivity.py` each construct one `numpy.random.default_rng(seed)` generator per call and consume it sequentially, iterating tracts and metrics in a fixed sorted order (`sorted(all_tract_geoids)`, metric-registry declaration order) — never Python's built-in `hash()` (which is randomized per-process via `PYTHONHASHSEED` unless explicitly disabled) and never a per-cell seed derived from tract/metric identity.

**Rationale:** A single sequentially-consumed generator with deterministic iteration order is simpler than per-cell hashed seeding and is sufficient to guarantee bit-identical output for a fixed (seed, input-data) pair, which is the actual requirement — the draws for different tracts/metrics are not required to be mutually independent across re-runs, only for the *whole simulation* to be reproducible end to end.

**Consequences:** Changing the order metrics are registered in `config/metrics.yml`, or the seed itself, changes the exact simulated values (though not their statistical properties) — `analytics.monte_carlo_results` and `analytics.weight_sensitivity_results` both persist `seed` and `n_draws` per row precisely so this is always inspectable, matching docs §18's reproducibility-metadata requirement.

### DEC-030 — The API reads precomputed `analytics.*` warehouse tables rather than re-deriving scoring/explainability logic

**Context:** Unlike Phase 3's freshness classifier (DEC-022, simple date arithmetic, safely duplicable), Phase 4's scoring/explainability/recommendation logic (equal-subdomain-weighting cascade, coverage-threshold suppression, Monte Carlo propagation, Dirichlet sensitivity, tautology-guarded correlation) is intricate enough that reimplementing it independently in the API would risk drift and silent inconsistency between what the pipeline computes and what the API reports.

**Decision:** `run_analytics_pipeline.py` persists every score, explanation component, confidence breakdown, uncertainty interval, sensitivity result, and recommendation-supporting metric contribution into `analytics.*` warehouse tables. `apps/api/src/scc_health_api/routes/analytics.py` only queries and assembles these tables (joins, formatting) — it contains no scoring formulas, percentile logic, or weighting math of its own.

**Rationale:** This is a stronger, not weaker, form of DEC-022's principle: instead of choosing between "duplicate the logic" and "import the heavy pipeline package," precomputing and persisting the *output* of that logic lets the API stay dependency-light while guaranteeing every number it serves was produced by the exact same tested code path (`pipelines/tests/test_domain_scores.py`, `test_scenario_scores.py`, `test_explainability.py`, etc.) — directly satisfying CLAUDE.md's "every numeric answer from the copilot [and, by the same logic, the API] must come from tested analytics tools... not freehand model arithmetic."

**Consequences:** `analytics.metric_contributions` (66,504 rows for 7 scenarios × 408 tracts × ~5-10 relevant metrics each) is materialized in full rather than computed on demand — a real storage/pipeline-runtime cost, accepted because it eliminates an entire class of API/pipeline drift bugs. `pipelines/src/scc_health_pipeline/audits/analytics_audits.py::_audit_contributions_sum_to_scenario_score` cross-checks this identity against the live warehouse on every `make audit` run, and `apps/api/tests/test_analytics_routes.py::test_explain_score_for_top_ranked_tract` re-verifies it through the live API response.

### DEC-031 — ACS `acs_disability_rate`'s combined margin of error across its 12-line sum is not computed (uncertainty_type: none, not a fabricated approximation)

**Context:** `acs_disability_rate` (ACS table B18101) sums 12 separate "with a disability" lines across age/sex breakdowns, each individually carrying its own ACS margin of error in `social.acs_observations`. Correctly propagating a combined MOE across a 12-term sum requires the Census Bureau's documented sum-of-estimates MOE formula (root-sum-of-squares of component MOEs, with an adjustment when more than one component's MOE is not significant relative to its estimate) applied consistently across all 12 lines.

**Decision:** `metrics/registry.py::_evaluate_acs_sum_ratio` computes the point estimate (the sum-then-ratio) but explicitly marks this metric `uncertainty_type: "none"` in `config/metrics.yml`, rather than approximating the combined MOE incorrectly (e.g. by naively reusing the single-ratio propagation formula built for `acs_ratio`, which is not valid for a 12-term sum).

**Rationale:** `metrics/registry.py::_evaluate_acs_ratio` already documents (per docs §8.1) that its two-term ratio MOE is "an approximation... recorded" — extending that same approximation to a 12-term sum without verifying it against the Census Bureau's actual sum-of-estimates formula would risk silently reporting a materially wrong uncertainty figure, which is worse than honestly reporting none.

**Consequences:** `acs_disability_rate` is excluded from Monte Carlo perturbation (no standard_error to sample from) and does not contribute to the `precision_component` of `data_confidence` for scenarios that use it. This is recorded as a real, disclosed limitation in the metric's own `limitations` field, not silently absorbed into the domain score's apparent precision. A future session implementing the Census Bureau's exact sum-of-estimates MOE formula can flip this to `acs_moe` without any other code change.

### DEC-032 — CalEnviroScreen's statewide percentile is used only as a raw input value, then re-ranked county-relative like every other metric

**Context:** CalEnviroScreen 5.0's `PollutionP`/`PopCharP` fields are *statewide* percentiles (rank among all California tracts). `docs/03_ANALYTICS_METHODS.md` §2.3/§5.4 explicitly warns: "Never mix county and state percentiles without labeling."

**Decision:** `ces_pollution_burden`/`ces_population_vulnerability` metrics treat the CES statewide percentile as this metric's *raw value* (like any other metric's raw value), which then goes through the same `county_relative_percentile()` re-ranking as every other metric in the registry — producing a Santa-Clara-County-relative percentile, never displayed as-is alongside a literal county percentile without the distinction being labeled.

**Rationale:** Keeps every domain score's internal percentile semantics uniform (always "rank among the 408 Santa Clara County tracts") rather than having environmental_burden silently mean something different ("rank among all of California") from every other domain — the exact confusion docs §5.4 warns against.

**Consequences:** A tract's `environmental_burden` domain score reflects its pollution/vulnerability burden *relative to other Santa Clara County tracts*, not relative to all of California — documented in each metric's `interpretation` field in `config/metrics.yml` and surfaced through the explainability API's per-metric detail.

### DEC-033 — Phase 4 correlation diagnostics use CDC/ATSDR SVI as a convergent-validity check; a criterion-validity check against HCAI ED utilization is not computed

**Context:** `docs/03_ANALYTICS_METHODS.md` §15.2 lists both "external established indices... as convergent validity" (e.g. SVI) and "HCAI ED utilization... independent outcome" as valid independent-criteria categories. Santa Clara County is the *only* county present in `utilization.hcai_ed_patient_county` (Phase 3) — there is exactly one county-level data point, which makes a Spearman/Pearson correlation (which requires N>1 independent observations) statistically undefined, not merely imprecise.

**Decision:** `run_analytics_pipeline.py` computes and persists a convergent-validity correlation (Spearman + bootstrap 95% CI, guarded by `validation/tautology_guard.py`) between every scenario's score and CDC/ATSDR SVI's overall percentile (`RPL_THEMES`, n=408 tracts) for all 7 scenarios. No criterion-validity check against HCAI ED data is attempted or fabricated with an invented multi-point comparison.

**Rationale:** Attempting a "correlation" against a single county-level data point would either silently fail or require inventing a fake multi-point series — both violate CLAUDE.md's data-integrity rules. SVI is a genuine, real, tract-level (n=408) independent index never used as a metric-registry input (confirmed by the tautology guard on every run), making it a statistically valid and honest choice for Phase 4's diagnostic.

**Consequences:** A true criterion-validity check against ED utilization requires a genuine tract-level utilization metric, which DEC-023 defers to Phase 7 (via the ZIP-level `utilization.hcai_patient_origin` crosswalked through the ZCTA-tract relationship). `RISK_REGISTER.md` records this as an open item, not a completed validation.

### DEC-034 — Location-allocation optimizer candidate sites are VTA high-frequency transit stops, not community centers/libraries

**Context:** `docs/03_ANALYTICS_METHODS.md` §13.2 lists community centers, libraries, public clinics, transit hubs, and schools as valid mobile-clinic candidate-site categories. This platform has not ingested a community-center or library point layer (not in the Phase 3 source registry); VTA GTFS stops (`resources.transit_stop_frequency_summary`, Phase 3) are real, available, and explicitly named as a valid category ("transit hubs").

**Decision:** `run_analytics_pipeline.py`'s location-allocation demonstration run uses the top 50 VTA stops by `distinct_trips_serving_stop` (a real ridership-frequency proxy) as candidate sites, `health_burden` domain score (÷100) as the per-tract need weight, and ACS `B01003` total population as the demand weight.

**Rationale:** Using a real, available, explicitly-sanctioned candidate category is preferable to fabricating a community-center/library dataset or leaving the optimizer entirely unexercised against real Santa Clara County geography.

**Consequences:** `optimization/location_allocation.py`'s `assumptions` field explicitly discloses the candidate-site limitation on every result. `analytics.optimization_runs` persists 3 real solved scenarios (k=5/2mi: OPTIMAL; k=10/2mi: OPTIMAL; k=10/1mi: correctly INFEASIBLE given the 50%-high-need equity constraint at that tighter radius) — the INFEASIBLE result is retained and surfaced, not hidden, since a transparent infeasibility is itself meaningful decision-support information.

### DEC-035 — Phase 4 `analytics.*` tables exist only in the live warehouse; no offline demo snapshot yet

**Context:** `make demo` (Phase 2's offline geography snapshot mechanism, DEC-015/DEC-016) has not been extended to cover Phase 3 or Phase 4 tables (a gap already disclosed for Phase 3 in `TASKS.md`).

**Decision:** `apps/api/src/scc_health_api/routes/analytics.py` returns a truthful 503 with an explicit explanatory message when `analytics.*` tables are absent from whichever warehouse is resolved, distinct from the generic "no warehouse at all" 503 — rather than silently falling back to a partial or fabricated response.

**Rationale:** Consistent with the same honest-unavailable-state principle applied throughout this build; extending `make demo` to freeze a full analytics snapshot (25 metrics × 7 scenarios × 408 tracts, including Monte Carlo/sensitivity draws) is a nontrivial scope addition better scheduled deliberately than squeezed into Phase 4's already-large surface.

**Consequences:** `RISK_REGISTER.md` records this as an open, disclosed gap. A future session extending `make demo` should freeze the `analytics.*` tables the same way `data/demo/geography/*.parquet` freezes Phase 2 output (DEC-016's pattern).

### DEC-036 — Navigation resolved to 9 primary items, updating (not superseding) DEC-008

**Context:** DEC-008 deferred the exact nav grouping to Phase 5's UX review. This session's explicit instructions list 9 required nav destinations by name (Overview, Explore, Prioritize, Access Lab, Utilization, Validate, Advocate, Copilot, Data), matching `docs/00_PRODUCT_CHARTER.md` §8.1's 9 required modules exactly, rather than `docs/01_UX_UI_SPEC.md` §3's suggested 7-8-item collapse.

**Decision:** The nav shell implements all 9 items as distinct top-level destinations, `Validate` and `Data` always visible per the explicit "do not bury trust features" instruction.

**Rationale:** Resolves DEC-008's open question with a direct instruction from the user rather than a guessed usability judgment — the more authoritative source for this specific build session.

**Consequences:** DEC-008 is updated in place (its own text says this entry would be updated once Phase 5 produces a concrete answer) rather than duplicated. Only Overview and Explore are fully built this phase; the remaining 7 are truthful "coming in a later phase" shells (DEC-037), never broken links or fabricated content.

### DEC-037 — Six of nine nav destinations are truthful, informative shells in Phase 5

**Context:** This session's explicit scope is "Only Overview and Explore need to be complete in this phase," while all 9 nav destinations must exist and be reachable.

**Decision:** `Prioritize`, `Access Lab`, `Utilization`, `Validate`, `Advocate`, and `Copilot` each render a real page (not a 404 or a stub route) stating plainly what the section will contain, which phase builds it (per `docs/07_BUILD_PHASES.md`), and — where real Phase 3/4 data already partially supports the underlying capability (e.g., Validate could show today's audit-suite pass/fail counts) — a small honest preview rather than an empty page. `Data` (built in Phase 3) is restyled into the new design system and nav shell but its functional scope is unchanged this phase.

**Rationale:** Directly satisfies "all navigation destinations must exist as truthful 'coming in later phase' shells rather than broken links" without pretending unbuilt functionality exists.

**Consequences:** `docs/06_ACCEPTANCE_TESTS.md` §13's Prioritize/Access Lab/Utilization/Advocate/Copilot functional-acceptance items (scenario wizard, resource filters, brief builder, etc.) remain explicitly deferred and are not claimed as passing.

### DEC-038 — New `/api/v1/geographies/tracts/boundaries` endpoint for the Explore map choropleth

**Context:** The Explore map needs all 408 tract geometries plus each tract's current-scenario score in one response to render a choropleth; the existing single-tract boundary endpoint (`/api/v1/geographies/{type}/{id}/boundary`, Phase 2) only returns one geometry at a time, and no endpoint joins geometry to `analytics.scenario_scores`.

**Decision:** `apps/api/src/scc_health_api/routes/geography.py` gains `GET /api/v1/geographies/tracts/boundaries?scenario_id=<id>` returning a GeoJSON `FeatureCollection` (one feature per tract, geometry + identity always present; score/coverage_fraction/stability_label present only when `scenario_id` is supplied and `analytics.*` tables exist). Implemented as a SQL join within the same read-only DuckDB connection (`geo.tracts` × `analytics.scenario_scores`) — no scoring logic is computed in the endpoint, only assembled from already-persisted tables (same principle as DEC-030).

**Rationale:** A genuinely new, small, read-only, warehouse-native endpoint is the correct way to satisfy "use the real Phase 4 API and warehouse outputs, do not duplicate scoring logic in frontend code" for a capability (bulk choropleth data) that Phase 2's per-tract endpoint was never designed for.

**Consequences:** Response size is nontrivial (408 full-resolution TIGER tract polygons, DEC-004/DEC-013 — full resolution, not cartographic-simplified, since tract is the canonical analytical unit). If this proves a real performance problem in Phase 10's budget review, a follow-up decision can add server-side simplification (`ST_SimplifyPreserveTopology`) or vector tiles; not attempted here to avoid premature optimization ahead of measurement.

### DEC-039 — `packages/ui` is transpiled TypeScript source, not a separately built package

**Context:** `packages/ui` existed only as an empty placeholder (`export {}`). Building a full design-system component library requires deciding whether it ships as a compiled/published package (its own `tsc`/`tsup` build step, `dist/` output, `exports` map) or as raw TypeScript source consumed directly by the Next.js app.

**Decision:** `packages/ui` ships raw `.tsx`/`.ts` source; `apps/web/next.config.ts` adds `transpilePackages: ["@scc-health/ui"]` so Next.js's own build pipeline compiles it alongside the app, with no separate build step, `dist/` directory, or publish process.

**Rationale:** This is a private, single-consumer workspace package (only `apps/web` imports it) inside one monorepo — a compiled-package boundary adds real build-step complexity (watch mode, stale-dist bugs, an extra `pnpm build` step in CI) with no corresponding benefit at this stage, since there is no external consumer and no need to version or publish it independently.

**Consequences:** If a second consumer (e.g. a future marketing site or Storybook instance) needs `@scc-health/ui` outside the Next.js build pipeline, revisit this decision then — `transpilePackages` only works within a Next.js build.

### DEC-040 — Explore map renders only Santa Clara County's own tract/place geometry, with no external basemap tile provider

**Context:** MapLibre GL typically pairs vector/raster polygon data with a basemap tile layer (streets, satellite, or a stylized reference map) for geographic context. CLAUDE.md requires core functionality to work without paid API keys, and most quality basemap tile providers (Mapbox, Google, most commercial vector-tile services) require a key or have restrictive free-tier rate limits that would make the map unreliable for other users of this codebase.

**Decision:** The Explore map renders exactly two data layers sourced entirely from this platform's own API: (1) the tract choropleth (`/api/v1/geographies/tracts/boundaries`) and (2) place-name labels (from `geo.places`, already available via the existing geography search/boundary endpoints) — no external raster or vector basemap tiles are loaded.

**Rationale:** Fully keyless and fully reliable (no dependency on a third-party tile service's uptime or rate limits — a real risk for a public-interest civic tool meant to keep working "without paid API keys," CLAUDE.md's own non-negotiable rule). `docs/01_UX_UI_SPEC.md` §2 also explicitly asks for maps "without visual noise" — a plain choropleth against a neutral background, with the county boundary and place labels for orientation, satisfies the map's actual analytical purpose (comparing tracts) without street-level clutter that isn't relevant to a tract-level health-equity screen.

**Consequences:** Users lose street/landmark-level geographic orientation (e.g., "is this tract near the airport") that a basemap would provide. If a future session adds a keyless basemap option (e.g., a self-hosted PMTiles basemap, matching `PLAN.md` §2's originally documented MapLibre + PMTiles stack choice), this decision should be revisited — it is a scope/reliability tradeoff for Phase 5, not a permanent architectural rule.

### DEC-041 — Phase 5 hotfix: a single canonical `SelectedGeography` model replaces ad hoc per-component selection callbacks, after a parameter-count bug silently substituted the geography-type literal for a tract's GEOID

**Context:** A release-blocking defect was reported after Phase 5 was believed complete: clicking a tract on the Explore map showed a correct hover popup ("Census Tract 5033.21 — Score: 53/100") but the detail panel then showed "Couldn't load this tract" / "Tract tract not found." Table-row selection worked correctly, isolating the defect to the map's click path.

**Root cause (confirmed by static trace, not guessed):** `ExploreMap`'s `onSelect` prop was typed `(type: "tract", id: string) => void` — a two-argument function. The parent (`explore-client.tsx`) passed it `handleSelectTract`, a *one*-argument function `(tractGeoid: string) => void`. TypeScript's structural typing allows a function that accepts *fewer* parameters to satisfy a type requiring *more* (safe in general, since JS silently ignores extra call-site arguments), so this passed `tsc --noEmit` with zero errors. At runtime, the map's click handler called `onSelect("tract", geoid)` — two arguments — but the receiving function's single parameter bound positionally to the *first* argument, the literal string `"tract"`, silently discarding the real GEOID (the second argument). This produced a URL of `/explore?geography=tract&id=tract`, which flowed into `api.getTractProfile("tract")` → `GET /api/v1/geographies/tract/tract` → a genuine backend 404 with the literal (and confusing) message `"Tract tract not found."`. Table selection was unaffected because `ExploreTable` always called its callback with exactly one argument, which happened to bind correctly.

**Decision:** Introduced one canonical selection model (`apps/web/app/explore/selection.ts`) used by every selection entry point — map, table, search, comparison, and URL state:
```ts
interface SelectedGeography {
  geographyType: GeographyType;
  geoid: string;        // canonical identifier, never a display label or the type itself
  displayName: string;
  source: "map" | "table" | "search" | "comparison" | "url";
}
```
Every selection callback across `explore-map.tsx`, `explore-table.tsx`, `search-panel.tsx`, `comparison-panel.tsx`, and `explore-client.tsx` now takes exactly one `SelectedGeography` argument — the class of bug that comes from mismatched call-site arity is no longer structurally possible, because there is only ever one argument to mismatch. Added `isValidGeographyId(geographyType, id)` (regex + Santa-Clara-prefix / in-range validation per geography type) as a boundary guard: the map's click handler, the table's row-select handler, the search-result buttons, and the URL-parsing function (`parseSelectedGeographyFromParams`) all reject a malformed or missing identifier *before* it can reach an API call, rather than after. Also gave FastAPI's geography-lookup 404s a structured body (`error_code`, `geography_type`, `requested_id`, plain-language `message`) instead of an interpolated string, and gave the frontend detail panels a truthful primary error message ("We couldn't load census tract 06085503321") with Retry and Clear-selection actions, pushing the raw technical detail behind a `<details>` disclosure.

**Rationale:** The bug was invisible to `tsc` because parameter-count contravariance is a deliberate, generally-safe TypeScript rule — the fix is not "annotate more carefully" (an easy thing to get wrong again) but "make the mismatch impossible by construction": one shared type, one argument, used everywhere. Runtime validation at the boundary (map click, table select, search select, URL parse) is the second, independent layer — even if a future refactor reintroduces a shape bug upstream, a malformed identifier still cannot reach `fetch()`.

**Consequences:** `StateMessageProps.secondaryAction` (`packages/ui/src/StateMessage.tsx`) was widened to accept either `{ href }` (real navigation) or `{ onClick }` (a non-navigating action like "Clear selection"), a small, generally useful design-system change. Regression coverage added: `apps/web/test/selection.test.ts` (validation + URL round-trip, including the exact `"tract"`-as-id case), `apps/web/test/explore-table.test.tsx` (table selection produces the correct canonical shape via click and keyboard), and `apps/api/tests/test_geography_routes.py` (structured 404 body, literal-type-as-id, short-display-label, leading-zero preservation). Phase 5's gate, which had been signed off before this defect was reported, is **not** considered valid until this hotfix's own verification (below) passes.

### DEC-042 — Phase 5 closeout: Playwright adopted as the primary automated browser-verification path; nine real defects found and fixed via real-browser testing

**Context:** Phase 5's gate required in-browser visual/keyboard/accessibility/responsive verification. The Claude Preview MCP tool remained blocked all session (RISK-012: a macOS TCC permission gap prevents it from launching a dev server under `~/Desktop`). Rather than substitute a weaker HTTP-level check again, Playwright (`@playwright/test` + `@axe-core/playwright`) was installed and used directly via the Bash tool, which is not subject to the same sandbox restriction — Playwright downloads and drives its own Chromium independent of the blocked MCP tool.

**Decision:** Playwright is now the primary automated browser-verification mechanism for this project (`apps/web/playwright.config.ts`, `apps/web/e2e/*.spec.ts`, `make test-e2e`). It runs against the real API and the real live warehouse (no mocking), across two projects (`desktop-chromium` at 1440×900, `mobile-chromium` emulating a Pixel 7 with touch input), covering: search, map click-to-select, table click/keyboard-select, GEOID search, scenario switching, URL persistence, browser back/forward, invalid-input error handling, tract comparison, evidence-drawer keyboard operation, map/table view switching, missing-data-never-zero, truthful coming-soon routing, all 8 required usability tasks, automated `axe-core` accessibility scans (zero serious/critical violations across Overview/Explore/Data/a coming-soon shell), and responsive behavior at all 6 required breakpoints (1440/1280/1024/768/390/320) with zero page-level horizontal overflow at any of them. 63 distinct test cases × 2 projects = 126 runs, 124 passing and 2 honest skips (documented, not fabricated passes) as of this decision.

**Real defects found and fixed through this real-browser testing** (none of these were caught by `tsc`, `eslint`, or the jsdom-based unit-test suite, since jsdom doesn't render CSS layout, doesn't validate HTML nesting, and has no WebGL/canvas support):
1. **CORS origin mismatch** — Playwright's default `127.0.0.1` baseURL silently failed every API call because the API's CORS policy only allows `http://localhost:3000`; browsers treat the two as different origins. Fixed by standardizing the test baseURL on `localhost`.
2. **Selecting a place did nothing to the map** — a user could search "Sunnyvale" but had no way to see where it was or get to a scoreable tract inside it (this would have failed usability Task 1 outright). Fixed by fetching the place's real boundary and panning/outlining it on the map.
3. **`--color-text-tertiary` failed WCAG AA contrast** (4.29:1 against the page background, 3.86:1 against a tinted nav background; needs 4.5:1) — found by automated `axe-core` scanning, affecting the Overview footer and every "Soon" nav badge. Darkened to a value verified ≥4.88:1 against every surface in the app.
4. **Evidence drawer's scrollable region wasn't keyboard-focusable** (`axe-core` `scrollable-region-focusable`) — added `tabIndex={0}`.
5. **Duplicate `id="geo-search"`** broke the second `SearchPanel` instance's label association the moment the comparison panel rendered a second copy on the same page — replaced with `useId()` in both `SearchPanel` and `Dialog`.
6. **Invalid HTML nesting → real hydration error** — a `<details>` disclosure nested inside `StateMessageBase`'s `<p>` wrapper is invalid HTML; a real browser rejected it (jsdom does not validate this). Changed the wrapper to a `<div>`.
7. **`SegmentedControl` violated its own `role="radiogroup"` contract** — every option was independently tabbable with no arrow-key support, the opposite of the WAI-ARIA radiogroup pattern a screen-reader user is told to expect. Rebuilt with roving tabindex and Arrow/Home/End handling, matching the pattern `Tabs` already used correctly.
8. **Explore's 3-column grid overflowed at exactly 1024px** — the fixed 320px + 380px columns plus gaps do not fit once the 240px nav sidebar is subtracted from a 1024px (`lg`) viewport, a required responsive breakpoint. The 3-column layout now activates at `xl` (1280px); 1024-1279px uses the same stacked layout as tablet/mobile.
9. **User-facing citations and one metric's limitations text leaked internal references** (`DATA_MANIFEST.json source_id=...`, raw `schema.table` names) across all 25 metrics — found while verifying usability Task 6 by hand, not by an automated scan. Cleaned up in `config/metrics.yml`; since metric citations are precomputed into `analytics.metric_contributions` at pipeline-run time rather than read live, the analytics pipeline was re-run to bake in the correction, and all data-quality audits re-verified green against the new run.

**Rationale:** A test suite that only exercises jsdom (as the pre-existing Vitest suite did) cannot catch CSS-layout overflow, real contrast ratios, HTML-validity errors, or anything that depends on an actual rendering engine — these nine defects are exactly the class of bug that category of testing structurally cannot find. Real-browser automation closes that gap without depending on the blocked Preview MCP tool.

**Consequences:** `make test-e2e` (previously a placeholder echo) now runs the full Playwright suite; `make test` remains unit-only and points to it. Two items remain that no automated tool can verify — visual polish and map-rendering quality — handed to the user as `docs/design/manual-visual-review-checklist.md`, not claimed as passed. RISK-012 (Preview tool blocked) is downgraded in practical impact but not resolved; see `RISK_REGISTER.md`.

### DEC-043 — Phase 6 routing engine: OSMnx + NetworkX for walking/driving, a scheduled-service proxy (not R5/OpenTripPlanner) for transit

**Context:** `docs/03_ANALYTICS_METHODS.md` §12.3 and `docs/04_ARCHITECTURE_IMPLEMENTATION.md` §11 name OSMnx/networkx (or "a reproducible routing engine") as the preferred walking/driving method, and "VTA GTFS plus R5/OpenTripPlanner when feasible" for transit, explicitly permitting a lesser scheduled-service measure "if full transit routing is not computationally feasible."

**Decision:** Walking and driving accessibility use a real OSMnx-downloaded, NetworkX-routed road network for Santa Clara County, cached to disk (graphml, checksummed, versioned by OSM extract date) — genuine shortest-path computation, not a proxy. Transit accessibility uses a scheduled-service proxy (walk-to-nearest-stop distance/time, weighted by that stop's scheduled trip frequency from the already-ingested `resources.transit_stop_frequency_summary`), explicitly labeled "Scheduled transit access under the selected service window" everywhere it appears — never "transit travel time," never implying door-to-door routing.

**Rationale:** R5 and OpenTripPlanner are Java-based, server-oriented routing engines requiring a compiled network build step and ongoing process; standing one up reproducibly within this session's scope is not a defensible use of the remaining Phase 6 time budget relative to the rest of the required build (resource inventory, real walking/driving routing, E2SFCA, optimizer extension, full API/UI). OSMnx + NetworkX runs locally, in-process, from a plain `pip`/`uv` dependency with no server, and produces a real, reproducible, checksummed artifact — matching the doc's explicit "reproducible routing engine" alternative for the walking/driving case exactly. The doc's own text anticipates and permits the transit shortfall ("the strongest defensible scheduled-service accessibility measure possible ... clearly distinguish it from door-to-door travel time").

**Consequences:** Transit results carry a distinct, lower method-reliability flag than network-routed walking/driving results throughout the API and UI. If a future session adds R5/OTP, transit results can be upgraded without changing the walking/driving path. Recorded as RISK-021.

### DEC-044 — Population-weighted origins use the Census Bureau's 2020 Mean Center of Population file, not a self-computed block-group weighting

**Context:** `docs/03_ANALYTICS_METHODS.md` §2.5 (referenced from Access Lab scope) prefers block-/block-group-population-weighted origins over tract geometric centroids. Building this from scratch would normally require ingesting TIGER block-group boundary geometry, a separate block-group population table, and computing an area/population-weighted interior point per tract.

**Decision:** Use the Census Bureau's own pre-computed `CenPop2020_Mean_BG06.txt` file (`https://www2.census.gov/geo/docs/reference/cenpop2020/blkgrp/`, verified live this session, 1.1MB, keyless) directly. It already provides, per block group: state/county/tract/block-group FIPS codes (concatenating to the canonical 11-character tract GEOID plus a block-group suffix), a `POPULATION` count, and a `LATITUDE`/`LONGITUDE` mean center of population — 1,173 block groups for Santa Clara County (06085), verified live.

**Rationale:** This *is* the population-weighted origin the docs ask for, published by the same authoritative agency as every other population figure this platform uses, requiring no geometry ingestion or weighting computation of our own to get right (and no way to get the weighting subtly wrong). It sits at the top of the docs' own preference hierarchy ("block- or block-group-population-weighted representative origins"), not a fallback.

**Consequences:** Multiple origins per tract (2-4 block groups per tract typically), each carrying its own population weight — analytics that need a single tract-level number sum/average across a tract's origins, population-weighted. A residual/unassigned-population audit is required since a small number of block groups may have zero or near-zero reported population (e.g. non-residential/industrial areas) — documented as a known, expected, non-error case, not silently dropped.

### DEC-045 — Libraries, community centers, senior centers, and pharmacies are documented as an unavailable/deferred source category for Phase 6, not fabricated or approximated

**Context:** `docs/02_DATA_SOURCE_REGISTRY.md` §6.2 names Santa Clara County's ArcGIS-hosted GIS layers as the source for community centers/libraries/hospitals, and §6.4 names the CA Board of Pharmacy (or HCAI/NPPES fallback) for pharmacies.

**Decision:** Direct automated access to `sccgov.org`'s own ArcGIS REST services (e.g. `sccgov.org/gis/rest/services/...`) returned HTTP 403 to every fetch attempt this session (matching the same bot-blocking behavior recorded for this domain in Phase 3's source verification). The County's separate ArcGIS Hub open-data catalogs (`prod-sccgov.opendata.arcgis.com`, `data-sccphd.opendata.arcgis.com`) were queried live via their DCAT feeds; no library, community-center, or senior-center point-location dataset was found in either (the Public Health portal's 199 datasets are almost entirely epidemiological indicators, not facility inventories). One usable, verified, real point-location layer was found and is added: SCC Public Health's "Health clinics" `FeatureServer` (`services2.arcgis.com/RiZWfy7B1r76pKTz/.../Health_clinics/FeatureServer/0`), used as a supplemental clinical-care candidate source alongside the existing HCAI/HRSA facility data. Hospitals do not need a separate source — HCAI's "General Acute Care Hospital" license category, already ingested in Phase 3, is the authoritative hospital list. Pharmacies were not added: no stable CA Board of Pharmacy bulk source was found, HCAI's licensed-facility categories do not cover retail pharmacies, and a full NPPES national bulk-file ingestion (multi-gigabyte) filtered to CA pharmacy taxonomy codes was judged out of proportion to this phase's remaining time budget against the rest of the required build.

**Rationale:** Per this project's non-negotiable rule, a failed or unavailable source produces a visible unavailable state and a documented reason, never a silent substitution or a fabricated point layer — the same standard already applied to HPI in Phase 3 (DEC-018).

**Consequences:** The Access Lab's resource-category list and candidate-site universe for Phase 6 are: hospitals and clinics (HCAI + HRSA health centers + the new SCC Health Clinics layer), food/SNAP retailers, and transit stops/hubs — not libraries, community centers, senior centers, or pharmacies. Recorded as RISK-022, `open`, revisitable if a maintainer can reach the County's directly-hosted GIS services (e.g. from an IP/context not subject to the same bot-blocking) or supplies a CA Board of Pharmacy bulk-export credential.

---

### DEC-046 — OSM network routing built as full-county live extracts (not a bounding-box or sampled subset), with a corrected constant walking speed

**Context:** DEC-043 chose OSMnx+NetworkX for real walking/driving network routing. Before committing to that scope, this session live-tested the actual cost of a full Santa Clara County graph download via the Overpass API, since a naive assumption that "the whole county is too large to route on in one session" would have forced an unjustified narrower scope (a bounding box around only the facilities/origins already loaded, or a sampled sub-region).

**Decision:** Download and cache the full-county graph for both modes rather than narrowing scope. Live-measured: drive network 45,836 nodes / 109,872 edges, 38-148s; walk network 277,444 nodes / 788,154 edges, 171-194s (`pipelines/src/scc_health_pipeline/run_build_network_graphs.py`, cached to `data/raw/osm_network/{mode}_graph.graphml` with a sha256-checksummed `DATA_MANIFEST.json` entry, `source_id=osm_overpass_network`). Both are well within this session's time budget and reused (not re-downloaded) on subsequent runs.

A real correctness bug was found and fixed during live verification: `osmnx.routing.add_edge_speeds()` imputes free-flow speed from OSM `maxspeed` tags / highway-type defaults, which are vehicle speed limits — applying it to the walk graph produced an implied walking pace of ~22 mph. OSMnx's own docstring for that function says explicitly to set a constant speed via `nx.set_edge_attributes()` for a walking network instead. Fixed by assigning a constant 5 km/h (~3.1 mph, the standard pedestrian-accessibility-research default) to every walk-graph edge before computing travel times; re-verified live afterward (a real 4.03-mile-straight-line, 5.05-mile-network route now computes to 97.5 minutes, an implied 3.11 mph pace). The drive graph correctly keeps OSMnx's maxspeed-based imputation.

**Rationale:** Testing the real cost before assuming a scope-narrowing was necessary avoided an unjustified reduction in analytical coverage (per CLAUDE.md's "verify current official source pages before coding adapters" and "explore first" build-behavior requirements, extended here to infrastructure sizing). Catching the walking-speed bug via a live end-to-end sanity check (implied speed in mph, a number a human can immediately judge as absurd) rather than trusting the library's default is the same "verify against real data, not assumption" discipline used throughout this phase.

**Consequences:** `routing/network_osm.py`'s `route_between_points()`/`shortest_distances_from_origin()` return real network distances and durations for the entire county, not a bounded sub-region — no additional scope-narrowing risk entry needed. The drive graph's free-flow speed assumption (no traffic congestion modeling) is recorded as RISK-024. `make data` now includes `run_build_network_graphs` as an explicit step (idempotent: skips re-download if the cache files already exist).

---

### DEC-047 — Scheduled-transit access uses real GTFS-derived weekday-daytime headway, walk-linked via the real OSM network, with batched node-snapping required for county-scale evaluation

**Context:** DEC-043 scoped scheduled-transit access as a "walk-to-stop + frequency proxy." The warehouse already has full real VTA GTFS tables (`resources.transit_{stops,stop_times,trips,calendar}`, 427,720 stop-time rows, 3,345 stops), richer than the single-column `transit_stop_frequency_summary` table loaded in Phase 3.

**Decision:** `pipelines/src/scc_health_pipeline/routing/transit_access.py` computes, per stop, real scheduled trip counts and headway (window length ÷ trip count) during a fixed weekday daytime window (07:00-19:00 Monday, a standard disclosed accessibility-research convention, not tailored to a specific rider), using `transit_calendar`'s weekday flag (no `calendar_dates.txt` exceptions exist in this feed, so none are applied). Categorizes into plain-language service levels (frequent/regular/infrequent/minimal/none) using conventional transit-planning headway bands. `nearest_transit_access()` finds, among stops within a real OSM walk-network distance, the one with the best (not merely nearest) scheduled service. Live-verified against real data: 3,214 of 3,241 stops have some weekday-daytime service; the busiest downtown San Jose stops show ~1.6-2.5 minute headways; five real population-weighted origins each resolved to a real nearby stop with plausible walk distances (0.16-0.44 mi) and headways (5.5-15 min).

A real performance defect was found and fixed during this live verification: evaluating one origin against all 3,214 candidate stops by calling OSMnx's single-point `nearest_nodes()` once per stop rebuilds its spatial index on every call and did not complete in a reasonable time against the 277k-node walk graph (looked identical to a hang). Fixed two ways: (1) `network_osm.shortest_distances_from_origin()` gained a `nearest_nodes_batch_fn` parameter that snaps all destinations in one vectorized call; (2) `nearest_transit_access()` pre-filters candidate stops by straight-line distance (always <= network distance, so this can only remove stops that could never have been within the network cutoff) before any node-snapping is attempted. Post-fix: ~1.2-1.5s per origin against the real full stop inventory.

**Rationale:** Using the full GTFS schedule (not just a pre-aggregated trip count) produces an interpretable, defensible headway figure rather than a raw count a reader can't judge the meaning of. Fixing the discovered performance defect via batching/pre-filtering (rather than reducing the candidate stop set, which would silently narrow analytical coverage) preserves full-county evaluation, consistent with DEC-046's same live-tested-not-assumed approach to the OSM graphs themselves.

**Consequences:** `run_analytics_pipeline`-scale computation (evaluating ~1,173 real population origins) is estimated at roughly 20-25 minutes at ~1.3s/origin — acceptable for a batch pipeline step, not for a synchronous API request; the future Access Lab API must precompute and cache these results in the warehouse rather than computing on demand per request. Every result still carries `method="scheduled_transit_access_proxy"` and its exact service window, per RISK-021.

---

### DEC-048 — E2SFCA catchment radius/sigma and capacity-source policy fixed and disclosed, not tuned to produce a particular result

**Context:** docs/03 §12.5 requires an E2SFCA implementation with a documented distance-decay function and a real-vs-count-proxy capacity policy, never inferred capacity from facility type alone.

**Decision:** `analytics/e2sfca.py` uses a Gaussian decay kernel with a hard cutoff at the catchment radius (standard in the accessibility literature, e.g. Dai 2010). Parameters, chosen once and disclosed rather than tuned per result: walk catchment 2.0 mi / sigma 1.0 mi (a conventional walkable-care catchment), drive catchment 15.0 mi / sigma 7.5 mi (~20-30 min suburban/rural drive). Capacity: HCAI's `licensed_beds` field (real, live-verified populated for all 15 Santa Clara hospitals) is used as `S_j` for the `hospital` category (`capacity_type="real_capacity"`); every clinic (no comparable real capacity field in any ingested source) gets `S_j=1` (`capacity_type="count_proxy"`). The two are computed as fully separate category rows and audited to never mix within a category (`audits/access_metrics_audits.py::e2sfca_capacity_type_consistent_within_category`).

**Rationale:** A facility-count proxy is the standard, disclosed fallback in the accessibility literature when true capacity is unavailable -- inferring capacity from facility type (e.g. assuming all "Community Clinic" records have similar throughput) would be exactly the kind of fabrication this project's non-negotiable rules prohibit.

**Consequences:** Live result: 4,692 `analytics.e2sfca_accessibility` rows, all non-negative, all correctly labeled. Walk-mode hospital accessibility is 0.0 for 903 of 1,173 origins (77%) -- a real finding given only 15 hospitals exist county-wide and a 2-mile walk catchment is tight, not a bug (drive-mode hospital accessibility is 0.0 for only 2 origins, consistent with the much larger 15-mile catchment).

---

### DEC-049 — Location-allocation optimizer extended with population-weighted demand, pluggable/precomputed network distance, and explicitly-labeled abstract candidate sites, while remaining backward-compatible

**Context:** The Phase 4 optimizer (`optimization/location_allocation.py`) shipped with four disclosed limitations (`_ASSUMPTIONS`): straight-line-only distance, VTA-transit-stops-only candidates, tract-level (not population-weighted) demand, and a scenario-only (not causal) framing. Phase 6's population origins, canonical facility inventory, and network routing infrastructure make three of these addressable.

**Decision:** `DemandPoint` gained an optional `block_group_geoid` field (real population-weighted origins now flow straight into the optimizer's existing `population`/`need_weight` fields with no change to the objective function). Coverage distance is now layered: an optional `precomputed_distances: dict[(origin_id, site_id), float]` (exact, e.g. from `run_access_metrics_pipeline.py`'s output) takes priority; an optional `distance_fn` callable is the next fallback; haversine straight-line screening (DEC-024) remains the default, so the function still works standalone for arbitrary/hypothetical candidate sites with no precomputed route. `CandidateSite` gained `site_type: Literal["transit_hub", "abstract_analytical"]` (default `"transit_hub"`, preserving the existing VTA-stops call site's behavior unchanged) so a population-weighted origin used as a candidate point for "what if a site existed here" scenario exploration is never confusable with a real, buildable location. The result's `method` and `assumptions` fields always reflect which distance method was actually used for that specific run.

**Rationale:** Per this project's explicit rule that abstract candidate points must be clearly labeled, never presented as real deployment sites, and that a straight-line result must never be silently presented as network-routed -- both are enforced by construction here (the `method` field is derived from which distance source was actually supplied, not a caller-asserted label).

**Consequences:** `run_analytics_pipeline.py`'s existing mobile-clinic optimizer call is unchanged (all positional/keyword args it uses still resolve to the same defaults) -- live-reverified: the full analytics pipeline re-run produces identical `k=5`/`k=10` OPTIMAL results and the same `k=10,threshold=1.0mi` INFEASIBLE result as before this change. 14 tests total (6 original + 8 new), including a genuinely infeasible equity-constrained scenario (two disjoint high-need points, each coverable by only one distinct site, `k_sites=1`) verified to return a typed `INFEASIBLE` status rather than raising or silently returning a partial solution.

---

### DEC-050 — Resource-gap classification is a disclosed tercile-overlap method, computed on demand rather than materialized as its own batch table

**Context:** The Phase 6 spec asks where high estimated need and weak measured access overlap, and which overlaps are stable vs. assumption-sensitive.

**Decision:** `analytics/resource_gap.py` computes a four-way classification (`priority_gap`/`need_met`/`low_priority`/`well_served`) from county-relative percentile ranks of any (need, access) pair, using a disclosed tercile threshold (top/bottom third) with a median-split fallback for the middle third. `assess_gap_stability()` compares the same geography's classification across several method variants (e.g. walk- vs. drive-mode E2SFCA) and labels it `stable` or `assumption_sensitive`. Deliberately not materialized as its own warehouse table this session -- the classification is cheap (pure percentile-rank arithmetic over already-computed `analytics.domain_scores` and `analytics.e2sfca_accessibility` columns) and will be computed on demand by the Access Lab API, joining the two existing tables rather than duplicating their data into a third.

**Rationale:** Materializing a third table that is a deterministic function of two already-materialized tables would create a staleness/consistency risk (the gap table could drift out of sync if either source table is regenerated independently) for no performance benefit at this data volume (408 tracts / 1,173 block groups).

**Consequences:** The Access Lab API's resource-gap endpoint must compute this classification at request time from `analytics.domain_scores` (health_burden) joined to `analytics.e2sfca_accessibility`, not read a precomputed table. 11 unit tests against hand-calculated examples cover both functions.

---

### DEC-051 — Access Lab API stays within DEC-022's dependency boundary: no live OR-Tools solve, a duplicated lightweight resource-gap classifier

**Context:** While building `/api/v1/access/*`, an initial draft imported `scc_health_pipeline.optimization.location_allocation` (for a live ad hoc solver endpoint) and `scc_health_pipeline.analytics.resource_gap` directly into the API. This was caught before landing: DEC-022 already established that the API deliberately does not import the pipeline package, specifically to avoid pulling in OR-Tools/GeoPandas/OSMnx into the API's runtime (`services/analytics_config.py`'s docstring).

**Decision:** `/api/v1/access/optimize/scenarios` is a GET reading the precomputed sensitivity sweep from `analytics.optimization_runs` (extended from 3 to 6 real scenarios this session -- varying k_sites, distance_threshold, and equity constraint on/off, a genuine "Sensitivity and Robustness" evidence set per the Phase 6 spec), not a POST that solves live. `services/resource_gap.py` is a small, dependency-free (stdlib-only) local copy of the same percentile-rank + tercile-classification logic as the pipeline's `analytics/resource_gap.py` -- not an import, since duplicating ~80 lines of pure math is cheaper and more architecturally consistent than special-casing an exception to DEC-022 for one lightweight module.

**Rationale:** Consistency with an already-established, deliberate boundary is worth more than saving ~80 lines of duplicated pure-math code. The optimizer genuinely cannot avoid OR-Tools if run live, so the only clean options were "violate the boundary" or "don't run it live" -- the latter was chosen, and it also better matches how this platform's own non-negotiable rules treat optimizer output (a disclosed scenario configuration meant to be explored across a few pre-vetted parameter sets, not an interactively-tunable live tool).

**Consequences:** If the two resource-gap implementations (`pipelines/.../analytics/resource_gap.py` and `apps/api/.../services/resource_gap.py`) ever need a method change, both must be updated in the same commit -- there is no single source of truth for this logic, by design (documented in both modules' docstrings). Both are separately unit-tested against the same hand-calculated examples (`pipelines/tests/test_resource_gap.py`, `apps/api/tests/test_resource_gap_service.py`) so a future drift would be caught by a *difference* in test results, not silently.

---

### DEC-052 — Geography search ranked and widened to every native type (place/ZCTA/district/tract), with tract results deprioritized rather than removed

**Context:** Phase 5's `search_geographies()` queried tracts, places, and supervisor districts each with their own `LIMIT` and concatenated the results before a final truncation -- a query matching many tracts could fill the entire result budget before places/districts were ever considered, and there was no ZCTA (ZIP code) search at all. Users should never need to already know a census tract ID to find a place.

**Decision:** Rewrote `search_geographies()` (`apps/api/src/scc_health_api/repositories/geography.py`) to fetch the full contents of every geography table (tract 408, place 30, zcta 70, supervisor_district 5) and rank candidates in Python: exact match, then starts-with, then substring, each tier further ordered by a geography-type priority that puts place/zcta/supervisor_district ahead of tract -- unless the query itself is shaped like an 11-digit tract GEOID, in which case tracts are promoted back to the front (a user who already has a tract number must not have it buried). ZCTA search was added as a new category. A real bug was found and fixed during this work: an earlier draft pre-filtered candidates via a SQL `LIKE` clause before Python-side ranking, which silently dropped queries that only matched a *synthetic* candidate string (e.g. "district 3" against the Python-only candidate `f"district {number}"`, never a real column value) -- fetching every candidate row removes this entire class of bug.

**Rationale:** Tracts remain fully searchable (never removed, matching the spec's own requirement that tract IDs stay available), just no longer able to crowd out every other geography type for a typical city/ZIP/district-shaped query.

**Consequences:** `search_geographies()` now does a full Python-side ranking pass over ~513 rows per query instead of a database-side `LIKE` filter -- negligible at this data volume, revisit if the candidate pool grows by an order of magnitude. Search UI in both Explore and Access Lab (which share the same `SearchPanel` component and this same API endpoint) inherited the fix automatically.

### DEC-053 — Tract-to-place assignment uses the same audited majority-land-area-overlap method as tract-to-supervisor-district assignment

**Context:** Building city-level drill-down (highest-concern tracts within a selected place) required a way to determine which tracts belong to which city. An initial implementation used `ST_Contains(place.geometry, tract.internal_point)` (point-in-polygon against the tract's representative point) as a lighter-weight alternative to a full persisted crosswalk table.

**Decision:** Built `geo.tract_place_assignment` (`pipelines/src/scc_health_pipeline/geography/harmonize.py`) using the identical method already established for `geo.tract_supervisor_district_assignment`: reproject to EPSG:3310 (equal-area), compute each tract's land-area intersection with every place it touches, assign the majority-share place as primary, and flag `is_clean_assignment=false` when that share is below 95% (retaining every overlapping place's share in `all_place_shares`, never silently dropped). The API layer (`get_place_profile`/`get_place_top_concern_tracts`) was switched from the point-in-polygon join to this table.

**Rationale:** Live-verified the two methods actually disagree for 35 of 408 tracts -- a real, non-trivial difference, not a cosmetic one. Using one consistent, audited method for both city and district assignment (rather than a rigorous method for one relationship and a casual one for the analogous relationship) avoids a real class of confusion: a tract could otherwise show as "in San Jose" by one method and a different city by the other, depending on which part of the UI computed it.

**Consequences:** Every place gained a `tract_count` field and a live-auditable assignment table (`audits/geography_audits.py::_audit_place_assignment`, 4 new checks, all passing: no orphan tract/place references, disclosed coverage, disclosed boundary-crossing count). Live result: 408/408 tracts assigned to a place (Santa Clara County has no tract with zero place overlap at all, though many tracts have only a marginal overlap with their assigned "primary" place -- 106 tracts are boundary-crossing at the <95% threshold, honestly disclosed via `is_clean_assignment`, not hidden). The demo warehouse snapshot (`data/demo/geography/`, `scripts/build_demo_geography_snapshot.py`, `run_demo_pipeline.py`) was updated to include this new table so demo-mode tests and `make demo` stay in sync with `make data`.

### DEC-054 — City/district selection resolves its display name from the profile API, never from `SelectedGeography.displayName` after a URL round-trip

**Context:** While verifying Phase 6.5's city drill-down feature, a real, systematic (not edge-case) defect was found: `SelectedGeography.displayName` is only ever a genuine name for the single render immediately following an in-app search click. Every selection is re-derived from URL search params on render (`parseSelectedGeographyFromParams`), which has no name available and falls back to the raw GEOID -- meaning the Explore map's "The dashed outline shows {name}" caption, and the new Access Lab drill-down guidance text, showed a raw place GEOID (e.g. "0668000") instead of "San Jose city" on essentially every place/district selection, not just URL-shared links. This is exactly the kind of defect CLAUDE.md requires fixing before declaring a phase complete, not deferring.

**Decision:** `explore-map.tsx`'s outline caption and `access-lab/city-drill-down.tsx` now resolve the real name via a dedicated query against `api.getPlaceProfile`/`api.getSupervisorDistrictProfile` (the same profile endpoints `PlaceDetail`/`DistrictDetail` already call for their own content), falling back to `selected.displayName` only while that query is loading or for geography types with no profile endpoint (ZCTA, county).

**Rationale:** This is the same pattern `PlaceDetail`/`DistrictDetail`/`TractDetail` already use for their own primary content (they never trusted `selected.displayName` either) -- extending it to every remaining consumer of the field closes the gap with no change to the URL/selection model itself, which does not carry a name by design (only `geography` + `id`).

**Consequences:** Verified live across reload, browser back, and browser forward navigation: the resolved name persists correctly in all cases (`e2e/explore-core.spec.ts`'s new Phase 6.5 regression test asserts this exactly, including that the raw GEOID string never appears in the caption). `SelectedGeography.displayName` itself is unchanged and still legitimately reflects a fresh in-app selection's label for the one render where it's accurate (e.g. `aria-current` highlighting in `SearchPanel`) -- this decision does not deprecate the field, only stops relying on it past its one accurate frame.

---

### DEC-055 — ED-utilization tract-level allocation uses ZIP-to-tract area weighting, closing RISK-015 with a disclosed modeled quantity, never presented as observed

**Context:** RISK-015 (open since Phase 4) recorded that no tract-level ED-utilization outcome existed to validate scenario scores against — HCAI's ED patient-county data is native to county of residence with Santa Clara as the only row (n=1), statistically ungrounded for correlation. Phase 7 needed a genuine, independent, tract-level outcome to finally run this check.

**Decision:** `utilization/zip_to_tract_allocation.py` allocates real, observed ZIP-level ED-encounter counts (from `utilization.hcai_patient_origin`, filtered to Santa Clara County residents, `pattype IN ('ED Only', 'Inpatient from ED')`) down to tracts using the already-audited `geo.crosswalk_zip_tract` area weights (Phase 2, DEC-005) — never a new or invented crosswalk. Every result carries `method="zip_to_tract_area_weighted_allocation"` and the crosswalk's own `allocation_quality` label, and `analytics.utilization_ed_tract_modeled`/`utilization_access_vs_utilization` are separate tables from the real ZIP-level and county-level observed tables (`utilization_ed_zip_observed`, `utilization_ed_county_trends`), each carrying a `data_status` of `observed`, `modeled`, or `suppressed` — never merged or visually indistinguishable.

**Rationale:** Reusing the existing, audited crosswalk rather than building a new one keeps a single source of truth for ZIP/ZCTA-to-tract allocation across the whole platform. Area-weighting is a real, disclosed approximation (assumes ED use is spread proportionally to land area within a ZIP) — the correct response per CLAUDE.md's data-integrity rules is disclosure, not fabricating a more precise-looking method this project has no population-weighted alternative for.

**Consequences:** `run_utilization_pipeline.py::_build_criterion_validity` reuses the existing `validation/correlation_diagnostics.py::run_correlation_diagnostic` (Phase 4) and its tautology guard unchanged — RISK-015 is closed with a real, non-tautological, moderate positive correlation (Spearman r 0.27-0.37 across the 8 scenarios, n=408, live-verified) between modeled tract ED rate and each scenario's own priority score, consistent with what a defensible screening tool should show. 2.3% of observed ZIP-level encounters could not be allocated (ZIPs with no crosswalk entry) — disclosed via `AllocationDiagnostics.unmatched_zip_codes`, not silently dropped from totals. See DEC-056 for the outlier-tract reliability flag this allocation method required.

### DEC-056 — Tract-level modeled ED rates above a plausibility ceiling are flagged `low_reliability`, not silently trusted

**Context:** Live verification of DEC-055's allocation surfaced a real methodological artifact: a small number of large, sparsely-populated tracts (confirmed: tract 06085513500, holding a >=0.9 area-weight share of several ZCTAs whose real population and ED volume are concentrated elsewhere in the same ZCTA) produced nonsensical rates — one tract computed at 37,378 modeled ED visits per 1,000 residents, roughly 100x the real countywide rate (~320 per 1,000, computed directly from `total_observed_encounters / total_population`).

**Decision:** `run_utilization_pipeline.py` flags any tract whose modeled rate exceeds `IMPLAUSIBLE_RATE_CEILING_PER_1000 = 1000` (a rate ceiling calibrated against the live distribution: median 235, 95th percentile 855, and generous headroom above real-world ED utilization ceilings) as `rate_reliability="low_reliability"` with an explanatory note, versus `"plausible_range"` for the remaining 392 of 408 tracts. Both the API (`/api/v1/utilization/tracts*`) and the Utilization UI surface this flag prominently (a red badge, not a footnote) rather than silently trusting or hiding the number.

**Rationale:** CLAUDE.md prohibits fabricating or silently presenting a misleading number; a wildly implausible allocation artifact presented as an ordinary modeled value would violate that even though the underlying arithmetic is "correct" given the area-weighting assumption. Excluding these tracts from the table entirely would also violate "never conceal unavailable or unreachable results" — flagging, not hiding, is the correct middle path.

**Consequences:** A new audit (`audits/utilization_audits.py::_audit_implausible_rates_are_flagged`) enforces that every rate above the ceiling carries the flag and note, live-verified passing. 16 of 408 tracts (3.9%) are currently flagged. This is a real, disclosed limitation of ZIP-to-tract area weighting for large/sparse tracts, recorded in RISK_REGISTER.md and surfaced on the Validate page's Known Limitations tab.

### DEC-057 — Added a real "Environmental burden" scenario; "Language access" is shown as a genuinely unavailable option, not faked

**Context:** The Phase 7 spec's requested Prioritize scenario list (Balanced overview, Chronic disease, Healthcare access, Food insecurity, Older adults, Language access, Environmental burden, Custom) does not match the 7 scenarios `config/scenarios.yml` actually scores — none of the 7 weighted `environmental_burden` above 0.20, and no tract-level language-barrier metric feeds any scored domain at all (DEC-027).

**Decision:** Added `environmental_burden_priority_v1` (weights: environmental_burden 0.50, health_burden 0.25, access_barriers 0.25) to `config/scenarios.yml`, using the same already-scored `environmental_burden` domain (CalEnviroScreen-based) and the same aggregation engine as every other scenario — a legitimate new weighting preset, not a new metric or method. "Language access" was deliberately NOT built as a scenario, since doing so would require reweighting the same 5 generic domains under a label implying they measure language barriers, which they do not. The Prioritize UI shows it as a visible, explained "Not available yet" option instead.

**Rationale:** CLAUDE.md's "never fabricate... in production outputs" rule applies to silently mislabeling a generic reweighting as something it is not, just as much as it applies to inventing data. A real gap disclosed with a documented reason is the required response, per "a failed source must produce a visible unavailable state, a logged reason, and a documented fallback."

**Consequences:** `run_analytics_pipeline.py` was re-run in full to score the 8th scenario (Monte Carlo, weight sensitivity, correlation diagnostics, optimizer all regenerated) — live-verified non-tautological (`is_tautological=false`) against both CDC/ATSDR SVI and the new modeled-ED-rate criterion outcome. A real, incidental finding surfaced during this re-run and Phase 7's reproducibility-hash testing: `mobile_transit_care_v1` and `older_adult_support_v1` already shared an identical weight vector before this change (both scenarios' own `notes` fields disclose falling back to the same generic access/resource proxies) — recorded in RISK_REGISTER.md as a minor, pre-existing product-design note, not a Phase 7 defect.

### DEC-058 — Custom domain-weighting in Prioritize reuses the Phase 4 aggregation formula via a dependency-isolated duplicate, following the DEC-022/DEC-051 pattern

**Context:** Prioritize's "Custom scenario" requires computing a combined score for an arbitrary, user-supplied weight vector the batch pipeline never precomputes (it cannot enumerate every possible weighting in advance). The real aggregation formula (`scoring/scenario_scores.py::compute_scenario_score` — weighted mean of present domain scores, renormalized over present domains, `coverage_fraction` disclosed) lives in the pipeline package, which the API deliberately does not import (DEC-022).

**Decision:** `apps/api/.../services/custom_scenario_scoring.py` is a small, dependency-free duplicate of the same formula, operating only on already-computed `analytics.domain_scores` rows (never raw metrics) — the same "small local copy, separately tested" pattern already established for `services/resource_gap.py` (DEC-051). `apps/api/tests/test_custom_scenario_scoring.py` asserts identical output to the pipeline's own hand-calculated cases in `pipelines/tests/test_scenario_scores.py`, and a live API integration test confirms a custom request using the exact "Balanced overview" weight vector reproduces that named scenario's real, precomputed ranking exactly.

**Rationale:** Consistency with the already-established boundary is worth more than importing ~15 lines of aggregation logic — the same tradeoff DEC-051 already made for resource-gap classification.

**Consequences:** If the real aggregation formula's methodology ever changes, both copies must be updated in the same commit (documented in both modules' docstrings, same as DEC-051's resource-gap pair) — a future drift would be caught by a test-result difference, not silently.

### DEC-059 — Audit results are persisted to `meta.audit_runs` so the Validate page can show real audit status via a read-only query

**Context:** The Phase 7 spec requires the Validate page to show "audit status" as part of reproducibility. `make audit`'s 8 suites (258 checks) previously only printed to the CLI — there was no way for the API to report current audit status without either re-running the full audit suite inside an HTTP request handler (which imports the full pipeline dependency chain, violating DEC-022) or shelling out to a CLI command from the API process.

**Decision:** `run_audits.py` writes every check's `(suite, check_name, passed, message)` to a new `meta.audit_runs` table after all 8 suites complete, tagged with a single `run_at` timestamp per invocation (replacing the table on each run, not appending indefinitely). `GET /api/v1/validate/audit-status` reads this table read-only, the same pattern every other route in this project already follows.

**Rationale:** Persisting the already-computed result of a batch job the API doesn't need to re-run itself is the same "precomputed, read-only" boundary DEC-030 already established for `analytics.*` — audit status is exactly the same kind of artifact.

**Consequences:** Audit status on the Validate page reflects the most recent `make audit` run, not necessarily the current instant — acceptable, since the same is already true of every other precomputed analytics table this platform serves. Live-verified: 258/258 checks passing across all 8 suites as of the Phase 7 commit.

### DEC-060 — Prioritize's "constraints" and "explainability" reuse Phase 6 optimizer scenarios and Explore's evidence drawer rather than rebuilding either

**Context:** The Phase 7 spec's Prioritize page requires site/program constraints (site count, distance threshold, equity) and full explainability (why a place ranked highly, source data, uncertainty). Both already exist: Phase 6's `analytics.optimization_runs` (6 precomputed mobile-clinic sensitivity scenarios) and Explore's per-tract evidence drawer (`geography-detail.tsx`'s `EvidenceContent`, DEC-030-compliant, reading `/api/v1/scenarios/{id}/tracts/{tract}/explain`).

**Decision:** Prioritize's "Site & program constraints" tab renders the existing `access-lab/optimizer-scenarios.tsx` component directly (literal reuse, not a rebuild) with an introductory paragraph framing it for the Prioritize context. Prioritize's results table shows a compact, inline "why this ranked here" (top 3 domain contributions, computed from the same data the results query already returned) plus a "View full sources & evidence in Explore" link that deep-links to the same tract/scenario in Explore's full drawer, rather than re-implementing that drawer's UI a second time.

**Rationale:** CLAUDE.md's spec explicitly says "Do not expose live OR-Tools solving through the API... Precomputed, parameterized scenarios are acceptable when transparent" and "Reuse the Phase 4 scoring engine and Phase 6 optimization outputs. Do not create duplicate scoring logic in the frontend or API" — literal component/data reuse is the most direct compliance with both instructions.

**Consequences:** A named-scenario tract's inline explanation in Prioritize is a lighter summary than Explore's full per-metric evidence view (domain-level, not metric-level) — intentional, not a gap: the deep link exists specifically so a user who wants the exhaustive per-metric citations one click away gets the identical, already-tested drawer, not a second, potentially-divergent implementation of it.

---

### DEC-061 — Advocacy evidence for a city/ZIP/supervisor-district geography is a disclosed unweighted average across member tracts, not a population-weighted re-aggregation

**Context:** This platform's scores and most metrics are computed per census tract; there is no independently-computed score for a city, ZIP code, or supervisor district. Phase 8's Advocate workspace needs to show evidence for whichever geography a user picks, including these broader ones.

**Decision:** `advocacy_evidence.assemble_evidence()` resolves a broader geography to its member tracts (via the existing, already-audited `geo.tract_place_assignment` / `geo.tract_supervisor_district_assignment` / `geo.crosswalk_zip_tract` tables) and reports an **unweighted average** across them, always labeled as such (`data_status: "derived"`, method `unweighted_average_across_member_tracts`, and a value string disclosing both the averaging and any missing-tract coverage gap, e.g. "12.4% (average across 8 of 9 tracts)"). A full population-weighted re-aggregation, which would better reflect where within a city or district people actually live, was considered and scoped out.

**Rationale:** Population-weighted re-aggregation would require reliable sub-tract population weights and a defensible weighting methodology of its own — a real analytics project, not a Phase 8 evidence-assembly task. An honestly-labeled unweighted average ships now; a mislabeled or silently-approximated weighted figure would violate this platform's core truthfulness rules. This follows the same precedent as DEC-027/DEC-057/DEC-056: disclose the approximation, never hide it.

**Consequences:** A large, sparsely-populated tract and a small, dense one currently count equally toward a city's averaged evidence — a real, disclosed limitation (see `docs/methods/advocacy-evidence.md` §7). Population-weighted re-aggregation is a reasonable Phase 9+ enhancement if a reliable sub-tract population-weighting source is identified.

---

### DEC-062 — A geography that resolves to zero member tracts returns no evidence at all, never a county-wide fallback

**Context:** `build_resource_evidence()` (resource/facility counts) has a legitimate county-wide fallback for a *real* geography with no assigned city (e.g. some supervisor-district or ZCTA edge cases). Early in Phase 8 development, this fallback also fired for a geography ID that didn't exist at all (e.g. a malformed or made-up tract GEOID) — because an empty `tracts` list from `resolve_member_tracts()` fell through to the same code path, county-wide resource counts were returned for a place that isn't real.

**Decision:** `assemble_evidence()` now checks `if not tracts: return geography_label, []` immediately after resolving member tracts, before calling any evidence builder — a nonexistent or empty geography returns zero evidence, full stop. The county-wide fallback inside `build_resource_evidence()` only ever fires downstream of a real, resolved geography.

**Rationale:** Returning county-wide facility counts for a geography that doesn't exist would silently misattribute real county data to a fabricated place — exactly the kind of "silent fallback" `CLAUDE.md` prohibits. This bug was caught by a new regression test (`test_evidence_bundle_unknown_tract_is_404`) written specifically because assembling evidence for city/ZIP/district geographies (DEC-061) meant more code paths than a single-tract lookup, and each needed its own "does this actually exist" check.

**Consequences:** None beyond the fix itself — the API's evidence-bundle route already returns 404 for an unknown geography given empty evidence, so this fix makes that 404 the *only* possible outcome for a nonexistent geography, not a possible-county-wide-data outcome depending on which evidence category ran first.

---

### DEC-063 — Copilot's deterministic and LLM-backed modes share one provider interface and the same underlying generation functions, never two parallel implementations

**Context:** Phase 8 requires a Copilot that works fully with zero configuration (deterministic mode) and optionally drafts richer prose when a server-side AI provider key is configured. A naive implementation risks two independently-maintained "how do I summarize this evidence" code paths that drift apart over time.

**Decision:** `copilot_provider.py` defines one `LLMProvider` Protocol with two implementations: `DeterministicProvider` (routes by action to the exact same `advocacy_generation.py` functions the Advocate page's brief builder calls) and `AnthropicProvider` (drafts prose from the same evidence, server-side only, key read from `ANTHROPIC_API_KEY`). `get_provider()` picks between them based solely on whether a key is configured — the calling route code (`routes/copilot.py`) is identical either way.

**Rationale:** `docs/05_AI_COPILOT.md` §2.1 requires that deterministic mode "guarantees core usability and reproducibility" — sharing the exact generation functions with Advocate (not a parallel reimplementation) is what makes that guarantee mechanically true rather than aspirational: a bug fix or improvement to `advocacy_generation.py` automatically improves both Advocate and Copilot's deterministic mode, and there is no way for the two to silently diverge in what counts as "a good summary."

**Consequences:** `DeterministicProvider`'s output is template-shaped prose (never claims to be generative AI, per `docs/05` §2.1's explicit requirement), visibly different in style from `AnthropicProvider`'s drafted prose — this is intentional and disclosed, not something to visually unify, since the UI must always make plain which mode produced a given response.

---

### DEC-064 — Every AI-assisted Copilot response is validated post-generation against only the evidence it was actually given; a claimed citation to unknown evidence is silently dropped, never surfaced

**Context:** `docs/05_AI_COPILOT.md` requires that "every factual claim maps to evidence IDs" and that unsupported claims be "removed or labeled." An LLM can hallucinate a citation to an evidence_id that was never in its context, especially under adversarial or malformed input.

**Decision:** `AnthropicProvider.complete()` requires the system prompt to end every response with a `"Evidence used: [id1, id2, ...]"` line. `_validate_citations()` parses that line and intersects it against `{e.evidence_id for e in request.evidence}` — the actual set of evidence objects that were sent in this request. Any claimed ID not in that set is placed in `evidence_ids_unsupported` and never presented to the user as a valid citation.

**Rationale:** This makes citation validity a property the *platform* enforces mechanically, not a property that depends on the model's own honesty. It is the same principle as `CLAUDE.md`'s "never fabricate... in production outputs," applied specifically to AI-generated citations rather than platform-computed metrics.

**Consequences:** A response whose citations don't validate isn't blocked outright (the model's prose may still be useful even with one bad citation) — but the UI's evidence-used display only ever lists validated IDs, so a user never sees a citation pointing at evidence that doesn't exist. Tested in `apps/api/tests/test_copilot_provider.py`.

---

### DEC-065 — DOCX export deferred; print-to-PDF (reusing DEC-060's decision-memo pattern) and CSV are the two Phase 8 export paths

**Context:** The Phase 8 spec lists PDF, CSV, and DOCX as candidate advocacy-output export formats, with an explicit allowance to "document its deferral honestly" for any not "reliably implementable" or "tested/maintainable" this phase.

**Decision:** Advocate's exports are: browser print-to-PDF (`window.print()` on a print-friendly output view, reusing the exact pattern Prioritize's decision memo established in DEC-060 rather than adding a new server-side PDF-rendering dependency) and a CSV of selected evidence. DOCX generation was evaluated and deferred — no server-side DOCX-authoring dependency was added.

**Rationale:** `window.print()` requires zero new dependencies, is already tested and working (DEC-060), and every major browser's "Save as PDF" print target produces a real, shareable PDF — reusing it is a direct instance of `CLAUDE.md`'s "write small, testable... rather than monolithic" and this Phase 8 kickoff's explicit "reuse the existing decision-memo export pattern... rather than creating an unrelated export architecture." A DOCX exporter would need a new dependency (e.g. `python-docx` write support, already present read-only for document intelligence) plus new template/formatting logic and its own test surface — real scope, not a quick addition, and not worth rushing to avoid an honest deferral note.

**Consequences:** A user who specifically needs an editable `.docx` file must currently copy content from a generated brief manually, or convert a print-to-PDF output with an external tool. This is recorded as an open, low-severity limitation (see `RISK_REGISTER.md`), not a silent gap — the Advocate user guide states it plainly.

---

### DEC-066 — Production architecture: Vercel (frontend) + Render (backend) + GitHub Releases (data artifact), anonymous browser-local workspaces, AI-assisted Copilot left disabled in production

**Context:** Phase 9's kickoff explicitly required determining and documenting the real production architecture rather than assuming "Vercel alone" could host the whole application, and required an explicit, justified decision on authentication/workspace persistence and whether to enable AI-assisted Copilot mode in production, rather than defaulting either in without a product reason.

**Decision:**
- **Frontend:** Vercel. Next.js App Router deploys there natively; `NEXT_PUBLIC_API_BASE_URL` was already the correct seam from earlier phases.
- **Backend:** a Render Web Service (Python/FastAPI) with a persistent disk for the DuckDB warehouse file. Rejected alternatives: Vercel serverless functions (DuckDB's file-based model and a persistent warehouse don't fit a stateless serverless function well); Fly.io and Railway (viable alternatives, not chosen only because Render's dashboard-based disk/secret management was judged simplest for a first deployment with no existing account on any of the three).
- **Data artifact:** the DuckDB warehouse file is the *only* production data artifact the API needs at serve time (confirmed: the API never reads `data/raw|staged|curated` or `cache/` directly). Published as a versioned GitHub Release asset (not committed to git, keeping the repository small and every past version rollback-able) and fetched by the backend's build step (`scripts/fetch_data_artifact.py`), verified by SHA-256 before being trusted.
- **Auth / workspace persistence:** anonymous, browser-local only (Option A of three evaluated) — no account system, no server-side workspace store this release.
- **AI:** `ANTHROPIC_API_KEY` is deliberately left unset on the production Render service. Deterministic Copilot mode is the entire production AI surface for this release.

**Rationale:** Population-weighted or account-based alternatives were evaluated and rejected for concrete reasons, not by default: (1) this platform has no PHI and no confirmed multi-user collaboration requirement, so an anonymous, browser-local model matches its actual stated privacy posture (`CLAUDE.md` "No PHI is required or permitted") without building auth/tenancy/backup infrastructure speculatively; (2) AI-assisted mode has real, disclosed evaluation gaps (RISK-032) — enabling it in production before running a golden-evaluation/red-team pass against a live key would be exactly the kind of "claim production-ready without evidence" this phase's own instructions explicitly prohibited; (3) Render+Vercel+GitHub Releases requires zero new paid managed-database service for a warehouse that is a single ~50MB file, keeping cost and operational complexity proportional to actual need.

**Consequences:** No user can currently save a workspace that survives clearing browser data or moving devices without manually exporting/importing JSON — a real, disclosed limitation (`docs/user-guide/advocate.md`). Enabling AI-assisted mode in production requires deliberately revisiting this decision after running `scripts/copilot_golden_eval.py` with a real key (`docs/security/ai-production-readiness.md`). The full requirements for a future server-side-persistence phase are recorded in `docs/architecture/phase9-production-requirements.md` (written in Phase 8) and remain accurate.

---

### DEC-067 — The production data artifact is fetched via a `Settings`-driven path, not a second hardcoded path, so the API and the fetch script can never disagree about where the warehouse lives

**Context:** `scripts/fetch_data_artifact.py` downloads the warehouse onto a hosted deployment's persistent disk. An early version hardcoded `REPO_ROOT / "warehouse" / "scc_health.duckdb"`, the same default the API's `Settings` class uses locally — but a Render persistent disk is mounted outside the repository checkout, at an operator-chosen path, so a hardcoded path in the fetch script could silently diverge from `SCC_HEALTH_WAREHOUSE_PATH`, the actual env var the API reads.

**Decision:** `fetch_data_artifact.py` imports `scc_health_api.settings.get_settings()` and writes to `settings.scc_health_warehouse_path`/`settings.data_manifest_path` directly — the exact same object the API process itself constructs from the same environment variables. There is only one source of truth for these paths, not two independently-maintained ones.

**Rationale:** Two hardcoded copies of the same path is exactly the kind of thing that silently drifts apart over time (one gets updated, the other doesn't) and fails in a confusing way (the fetch script "succeeds" while the API can't find what it downloaded). Deriving both from the same `Settings` class makes this structurally impossible to desync.

**Consequences:** `fetch_data_artifact.py` now has a real (small) import-time dependency on `apps/api/src` being on its Python path — handled via a `sys.path.insert` at the top of the script, documented inline.

---

### DEC-068 — GitHub Actions dependencies are pinned to verified commit SHAs, looked up live via the GitHub API rather than guessed

**Context:** Phase 9's kickoff required pinning `uses:` actions to exact commit SHAs for supply-chain safety. A first draft of `ci.yml` used a plausible-looking but unverified SHA for `actions/upload-artifact`, which turned out to be wrong when checked.

**Decision:** Every `uses:` action in `.github/workflows/*.yml` was pinned only after fetching its real tag→commit mapping via `https://api.github.com/repos/<owner>/<repo>/git/refs/tags/<tag>` and confirming the `object.type` is `"commit"` (i.e. a lightweight tag, not an annotated tag object requiring a further dereference) — see `docs/security/dependency-audit.md`'s table of exact versions/SHAs used.

**Rationale:** A wrong or fabricated commit SHA in a security-pinning context is worse than no pinning at all — it creates false confidence that a specific, audited commit is running when actually a mismatched or nonexistent one is (which would simply fail the workflow, or worse, silently resolve to something unintended depending on GitHub's own fallback behavior). Since this assistant has no ability to verify a guessed SHA is correct without checking, every pin was looked up, not guessed, and the one guess that slipped through was caught and corrected before being trusted.

**Consequences:** None beyond the verification overhead already paid this session. Future action version bumps must follow the same lookup-don't-guess process, noted inline in `docs/security/dependency-audit.md`.

---

### DEC-069 — A repository audit surfaced and fixed two real, live user-facing bugs unrelated to Phase 9's original scope (a mis-wired footer link and a wrong-repository contact link), rather than deferring them

**Context:** Phase 9's kickoff required a repository audit pass (dead code, broken links, stale references). That audit found the homepage footer's "Accessibility" and "Privacy" links both pointed at `/validate` (an unrelated methodology page, not any accessibility/privacy content), and "Contact / report an issue" linked to `https://github.com/anthropics/claude-code/issues` — Anthropic's own developer-tool repository, not this project's.

**Decision:** Fixed immediately rather than only flagging for a future phase: built real `/privacy` and `/accessibility` pages with accurate, implementation-matching content, corrected all three footer links, and added `e2e/overview.spec.ts` coverage for all four footer links (the existing test only ever checked "Data & methods," which is exactly why this shipped unnoticed).

**Rationale:** A live link sending a real user's issue report to the wrong company's repository is a genuine, currently-live defect with real user impact, not a stylistic nitpick appropriate to defer — `CLAUDE.md`'s general instruction to fix defects found in the course of other work, and Phase 9's own "do not reopen completed work unless a verified defect... requires it" explicitly carves out exactly this case (a verified defect).

**Consequences:** None negative. Two new real pages plus one closed test-coverage gap.

---

### DEC-070 — The private repository's data artifact is fetched via GitHub's authenticated release-asset API, with automatic fallback to unauthenticated public downloads, rather than assuming public access

**Context:** `carhanc/scc-health-intelligence` is and remains a **private** repository (an explicit, non-negotiable constraint for this pre-deployment correction pass). The original Phase 9 `scripts/fetch_data_artifact.py` used unauthenticated `github.com/.../releases/download/...` URLs, which return 404 for any private repository regardless of whether the release/asset actually exists — this would have made the entire production data-delivery pipeline non-functional the moment real deployment was attempted.

**Decision:** `fetch_data_artifact.py` now resolves release metadata via the GitHub REST API (`/repos/{repo}/releases/tags/{tag}` or `/repos/{repo}/releases` for `latest`) and downloads each asset through the authenticated `Accept: application/octet-stream` asset-download endpoint when `DATA_ARTIFACT_GITHUB_TOKEN` is set, falling back to each asset's plain `browser_download_url` when no token is configured (preserving support for a genuinely public repository/fork with zero configuration). A custom `HTTPRedirectHandler` strips the `Authorization` header whenever GitHub's authenticated endpoint redirects to a different host (its actual behavior — a temporary, pre-signed cloud-storage URL), so the token is never sent anywhere but `api.github.com`.

**Rationale:** The repository's privacy is a fixed requirement, not something to work around by assuming public access "for now" — a production data pipeline that silently only works once the repository becomes public would be a landmine for whoever runs it first. The redirect-header-stripping behavior specifically follows GitHub's own documented guidance for its asset-download API (the endpoint is explicitly designed to redirect to short-lived storage URLs that must not receive the caller's token).

**Consequences:** A GitHub fine-grained personal access token (`docs/deployment/production-deployment-guide.md` step 1, "Contents: Read-only" scoped to this one repository) is now a required production secret on Render and in CI, where it wasn't before. Token expiration/rotation is a new, real operational responsibility (documented in the deployment guide and `docs/observability/runbook.md`). 18 mocked tests (`scripts/tests/test_fetch_data_artifact.py`) cover authenticated/unauthenticated paths, `latest`/exact-tag resolution, every documented failure mode, atomic preservation of a known-good warehouse, and — specifically — that the token is never present in any printed output.

---

### DEC-071 — The data artifact is fetched at Render runtime start, not build time; a checked-in start script (`scripts/render_start.sh`) and Blueprint (`render.yaml`) encode this explicitly

**Context:** Render's persistent disk is mounted only when a service instance actually starts running — it does not exist yet during the build step. The original Phase 9 deployment guide's Build Command included fetching the data artifact, which would have written the downloaded warehouse into the build's ephemeral filesystem, not onto the persistent disk — every fresh deploy would silently lose it and need to fetch it again per boot in the wrong location, defeating the entire purpose of using a persistent disk.

**Decision:** The Build Command now only installs the serving package's dependencies (`uv sync --package scc-health-api` — the API never imports the pipeline package at runtime, DEC-022/DEC-030, so this stays fast and light). `scripts/render_start.sh` (the Start Command) fetches/verifies the data artifact first, refuses to start if that fails **and** no existing warehouse is already present on the disk from a previous successful fetch, and only then `exec`s uvicorn — replacing the shell process rather than spawning a child, so Render's process supervision and signal handling target uvicorn directly. `render.yaml` (a Render Blueprint, optional but provided to reduce manual dashboard-entry risk) encodes this exact topology, with every secret marked `sync: false` (Render prompts for the real value at Blueprint-creation time; no secret value is ever in the file or in git).

**Rationale:** Render's disk-mount timing is a real, well-documented platform constraint, not a design preference — getting this wrong would have produced a service that silently re-downloaded a ~50MB file on every restart while still functioning (only under load/cost, not correctness), or worse, one that behaved inconsistently depending on exactly when a boot happened to fail. Preferring to start with a stale-but-real existing warehouse over refusing to start at all (when a fetch fails but a prior warehouse is present) follows the same "fail loud only when there is truly nothing usable" principle as the API's own production startup validation (`main.py`'s `validate_production_readiness()`), which remains the final, authoritative gate regardless of what this shell script decides.

**Consequences:** `docs/deployment/production-deployment-guide.md` was rewritten to reflect the corrected Build/Start Command split; a persistent disk requires a paid Render plan (verified against Render's own documentation this session, not assumed) — documented explicitly rather than silently implied.

---

---

### DEC-072 — The Explore map's choropleth moves from a single-hue teal sequential scale to an explicit red→orange→neutral→teal/green "concern" gradient, reversing the earlier "never red/green" rule

**Context:** `packages/ui/src/tokens.ts` and `docs/design/design-system.md` previously encoded a deliberate rule that the map's sequential scale must never use red or green, reasoned as: "a red '90th percentile' implies a fire alarm, not a screening signal" (`design-system.md:68`). The health-equity UX redesign (`docs/design/health-equity-ux-redesign.md` §6) was given an explicit, detailed specification for a concern-oriented color system (dark red/red-orange highest concern → orange → warm neutral → muted teal/green lower concern → gray/hatching for missing data), modeled on established civic-data-map conventions for communicating relative urgency at a glance.

**Decision:** Adopt the new five-stop concern gradient for the map choropleth (and any other place-level "combined concern" color indicator), replacing `MAP_SEQUENTIAL_SCALE`. The guardrails that motivated the original rule are preserved by other means rather than dropped: every score-adjacent view keeps its existing non-causal disclosure sentence (unchanged, `content-style-guide.md` §6); every legend explicitly reads "Higher concern / Lower concern," never "danger," "critical," or "alarm"; color is never the sole cue (every colored map region or badge pairs with a visible score, rank, or text label); missing data gets a structurally distinct gray-plus-hatch treatment, never a shade that could read as "low concern"; and the new concern-scale red is a separate, distinctly-named token from `--color-alert` (the pre-existing system/data-freshness alert color on Validate), so the two are never visually or semantically merged.

**Rationale:** The original rule addressed a real risk (a bare red number reading as a medical/safety alarm rather than a relative-ranking signal) but was one specific mechanism toward a broader goal that this redesign satisfies through several redundant means at once — explicit disclosure text, non-color redundant cues, and careful token separation — rather than through color restraint alone. A concern-oriented gradient also directly serves this redesign's comprehension goal (§5 of the redesign doc): a reader should be able to glance at the map and read "more concern here" without first learning that darker teal means "higher," which a single-hue scale requires and a familiar warm/cool gradient does not.

**Consequences:** `docs/design/design-system.md` §8/§18 and `packages/ui/src/tokens.ts`'s `MAP_SEQUENTIAL_SCALE` comment are updated to describe the new rule in place of the old one, not left contradicting the shipped code. Any future surface that wants a "concern" indicator must use the new dedicated tokens, not repurpose `--color-alert` or any other existing semantic color. Colorblind-simulation and contrast verification for the new scale is a release gate for the redesign (`health-equity-ux-redesign.md` §11), not assumed safe by inheritance from the old scale's own prior verification.

---

*New decisions are appended here as they are made in each subsequent phase, never inserted out of order.*
