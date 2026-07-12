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

---

*New decisions are appended here as they are made in each subsequent phase, never inserted out of order.*
