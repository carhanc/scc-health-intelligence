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

*New decisions are appended here as they are made in each subsequent phase, never inserted out of order.*
