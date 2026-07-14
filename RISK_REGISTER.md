# RISK_REGISTER.md

Each risk: description, category, likelihood, impact, mitigation, status, owner phase. Updated at every phase gate per `docs/07_BUILD_PHASES.md`. Status values: `open` (mitigation planned, not yet implemented), `mitigated` (mitigation implemented and verified), `accepted` (residual risk knowingly accepted and documented), `monitoring` (ongoing watch item).

---

## RISK-001 — Source schema drift across ~17 adapters

**Category:** Data integrity. **Likelihood:** High (annual/rolling public sources routinely change column names, dataset IDs, or formats). **Impact:** High — a silent schema change could corrupt a metric or produce misleading nulls.

**Mitigation:** Every source adapter validates schema and row count against an expected contract before promoting data to `staged`/`curated`; schema-fingerprint mismatches fail loudly and preserve the last-known-good snapshot rather than corrupting curated output. Discovery-based dataset-ID resolution (not hardcoded IDs) for sources like CDC PLACES whose Socrata ID rotates annually.

**Status:** `mitigated` for the 6 geography sources implemented in Phase 2 — each adapter's `validate_raw`/`quality_checks` caught real issues during implementation (a wrong assumed field-name schema for the ZCTA cartographic file, an implausible-size guard), proving the mitigation works in practice, not just in design. `open` for the ~11 remaining Phase 3 sources (health/social/resource/utilization). **Owner phase:** 2 (done for geography) –3 (remaining).

---

## RISK-002 — Geography/crosswalk mismatch (ZIP, ZCTA, tract, district)

**Category:** Analytical validity. **Likelihood:** Medium. **Impact:** High — conflating ZIP and ZCTA, or joining by string similarity instead of an official crosswalk, silently misattributes utilization/access data to the wrong neighborhoods.

**Mitigation:** Canonical 2020-tract GEOID as an 11-char string everywhere; explicit, tested crosswalks (Census ZCTA-relationship default, HUD optional enhancement per DEC-005); never join by string similarity; crosswalk-weight sum checks in `make audit`; allocated (crosswalked) values always labeled distinctly from native/observed values in the UI.

**Status:** `mitigated` for the ZCTA-tract crosswalk built in Phase 2 — `make audit`'s `crosswalk_weight_sums` check passes (0 out-of-range ZCTAs among 70), and implementation caught a real near-miss: naive substring matching on `"06085"` would have incorrectly matched ZCTA `06085` (a Connecticut ZIP code) as if it were Santa Clara County's `06085` FIPS prefix. Field-based matching was used instead specifically because of this discovery. `open` for Phase 7's HCAI ZIP-level utilization data, which will exercise this crosswalk against real health data for the first time. **Owner phase:** 2 (done for the crosswalk itself), revisited 7 (Utilization Lab).

---

## RISK-003 — AI copilot hallucination or citation fabrication

**Category:** Trust / responsible AI. **Likelihood:** Medium (inherent LLM risk even with tool-grounding). **Impact:** Critical — a fabricated number or citation directly violates CLAUDE.md's non-negotiable rule and would undermine the platform's core value proposition.

**Mitigation:** Deterministic mode is the default and requires no LLM; when the optional grounded-LLM mode is active, every numeric claim must originate from a typed tool response with an evidence ID, and a post-generation numeric-integrity validator cross-checks every number/citation in generated prose against the structured evidence objects before returning a response, stripping unsupported claims. Golden evaluation set (≥50 questions, `docs/05` §19) with a zero-tolerance threshold for fabricated citations before release.

**Status:** `open` — architecture designed in `PLAN.md` §13; implemented and adversarially tested Phase 8, re-tested Phase 11.

---

## RISK-004 — CalEnviroScreen 5.0 freshly finalized (July 1, 2026); possible post-release errata or stale draft duplicate

**Category:** Data currency. **Likelihood:** Medium. **Impact:** Medium — a data release ten days old at build time is more likely than average to have a residual issue (stale draft dataset still indexed, late-breaking errata).

**Mitigation:** DEC-007 requires re-verifying the dataset ID is the final non-draft release at Phase 3 implementation time (not relying solely on this Phase 0 check), and recording the exact methodology-version string so any later correction is traceable.

**Status:** `monitoring` — will be closed or re-flagged when the Phase 3 CalEnviroScreen adapter is built and verified.

---

## RISK-005 — Santa Clara County meeting-portal (Granicus/IQM2) scraping fragility

**Category:** Data availability. **Likelihood:** Medium-High (portal migrated platforms as recently as Jan 2024; scraping any calendar-based PDF portal is inherently brittle). **Impact:** Low-Medium — Document Intelligence's primary path is user upload, not a live scraper, so this risk affects a stretch enhancement, not core function.

**Mitigation:** DEC-010 makes user upload the first-class, always-available ingestion path; a Granicus/IQM2 connector is attempted only as a Phase 8 stretch goal and explicitly not release-blocking if it proves infeasible.

**Status:** `accepted` (for the scraper component specifically) — core Document Intelligence functionality does not depend on this risk resolving favorably.

---

## RISK-006 — Privacy/PHI boundary discipline in document upload and analytics

**Category:** Privacy / compliance. **Likelihood:** Low (the product is designed to reject the need for PHI) but **Impact:** Critical if violated — CLAUDE.md states "No PHI is required or permitted."

**Mitigation:** Explicit upload warning + required acknowledgement before any document upload; local-only processing by default; explicit consent gate before any content reaches a cloud AI provider; immediate, verifiable deletion; no functionality designed to re-identify individuals from aggregate/suppressed public data; suppressed HCAI values always preserved as suppressed, never treated as zero or backfilled.

**Status:** `open` — implemented Phase 8 (upload pipeline), verified Phase 10–11 (security/privacy audit, adversarial review).

---

## RISK-007 — Uncertainty misinterpretation (by users, or through UI oversimplification)

**Category:** Interpretability / responsible communication. **Likelihood:** Medium — commissioners and advocates are the primary audience and are explicitly non-statisticians. **Impact:** Medium-High — a percentile mistaken for a percentage, or a scenario-sensitive rank presented as certain, could drive a real policy decision on a false premise.

**Mitigation:** Raw value always shown alongside percentile (never percentile alone); rank-stability language restricted to the four defined labels (Robust/Moderately stable/Assumption-sensitive/Data-limited), never "probability of success"; automated content lints (Phase 9) flag causal language ("causes," "will reduce," "guarantees") in derived/scenario outputs; glossary covering percentile/MOE/CI/rank stability/allocated estimate/correlation/causal impact is part of onboarding, not buried.

**Status:** `open` — UI patterns designed in `PLAN.md` §9–10, implemented starting Phase 5, content lints added Phase 9.

---

## RISK-008 — Multi-session context continuity across a build of this scope

**Category:** Project execution. **Likelihood:** High — this build spans data engineering, spatial analysis, optimization, an AI copilot, and a full accessible frontend; it will not fit in a single session. **Impact:** Medium — a dropped session could produce rework or an inconsistent partial state if not managed.

**Mitigation:** `STATE.md` updated before ending any substantial session with exact phase/gate, completed work, failing tests, running processes, and the next three concrete actions; `TASKS.md` checkboxes only flipped with test/audit/browser evidence; every phase ends with a coherent git commit. Continuation sessions read `STATE.md`/`TASKS.md`/`DECISIONS.md`/`RISK_REGISTER.md`/git history/recent test output before touching code, and never restart or re-scaffold working functionality.

**Status:** `monitoring` — this is a process risk managed continuously, not a one-time mitigation.

---

## RISK-009 — Two Phase 0 sources returned HTTP 403 to automated fetch (SCC GIS Hub landing page, county meetings landing page)

**Category:** Data availability / verification confidence. **Likelihood:** Low (working underlying endpoints were independently located for both — `prod-sccgov.opendata.arcgis.com` and `sccgov.iqm2.com`). **Impact:** Low — the block is very likely bot-detection on the marketing/landing pages, not the actual data platforms.

**Mitigation:** Manual browser-based re-confirmation scheduled before the Phase 3 (GIS Hub) and Phase 8 (meeting portal) adapters are finalized, using the already-located working endpoints as the primary integration target regardless.

**Status:** `monitoring`.

---

## RISK-010 — HCAI license-tier confusion (OPA-restricted vs. CC-BY across different HCAI products)

**Category:** Licensing / compliance. **Likelihood:** Medium if not carefully tracked (multiple HCAI products with different terms). **Impact:** Medium — attributing the wrong license tier to a derived export could mislead a downstream user about permitted use.

**Mitigation:** `DATA_MANIFEST.json` records `license_or_terms` per individual source artifact, not once per publisher; ED and patient-origin/market-share data are explicitly tagged with OPA no-modification/commercial-approval terms, while facility attributes are tagged CC-BY, as documented in `docs/data/source-verification.md` §8–10.

**Status:** `mitigated` — populated for all 25 live Phase 3 sources plus HPI's documented-unavailable entry; verified via `manifest_provenance_complete` in `pipelines/.../audits/core_sources_audits.py`.

---

## RISK-011 — Dev toolchain runs under Rosetta (x86_64 Homebrew), not native arm64

**Category:** Performance / developer experience. **Likelihood:** Certain (confirmed during Phase 1 bootstrap — this machine's Homebrew resolves to `/usr/local`, the Intel prefix, not `/opt/homebrew`). **Impact:** Low — functionally correct, modestly slower local dev-server/build performance than native arm64.

**Mitigation:** None applied by default (DEC-011) — the bootstrap script deliberately does not install a second, native Homebrew without explicit user action, since that would be a persistent change to the user's machine well beyond this project's scope. A user who wants native arm64 performance can install Homebrew at `/opt/homebrew` themselves and re-run `scripts/bootstrap_macos.sh`. Phase 2 addendum: this also causes Polars to emit a CPU-compatibility warning on every run (harmless, but noisy) — mitigated by setting `POLARS_SKIP_CPU_CHECK=1` automatically in the Makefile rather than requiring every session to remember it.

**Status:** `accepted`.

---

## RISK-012 — No browser-based visual verification tooling available in this environment

**Category:** Process / verification completeness. **Likelihood:** Confirmed (Phase 1 and Phase 2 both attempted, both blocked). **Impact:** Medium — reduces confidence in visual/interaction/accessibility correctness beyond what HTTP-level and automated testing can confirm.

**Mitigation:** `mcp__Claude_in_Chrome__list_connected_browsers` returns empty (no extension connected). The Preview tool's process spawner fails with a sandbox-level `getcwd` permission error before reaching the launch command, tried with two different launch configurations. DEC-017 documents the HTTP-level verification approach used instead (production build success, strict lint/typecheck, unit tests, server-rendered HTML inspection via curl, live end-to-end API calls, CORS verification). This substitutes for, but does not equal, an actual visual/keyboard/screen-reader review.

**Phase 3 update:** Re-attempted at the start of the Phase 3 session with two independent mechanisms: (1) fixed a real bug in `.claude/dev_web_local_preview.sh` (it invoked the `next` shell-script wrapper directly via `node`, causing a syntax error) and retried `preview_start` — still blocked by the identical sandbox-level `getcwd` error, confirming the blocker is environment-level, not the launch script; (2) checked `mcp__Claude_in_Chrome__list_connected_browsers` — still empty. Substituted the same HTTP-level verification approach (curl against every new endpoint including the new `/api/v1/data-explorer` routes, dev-server 200 checks for the new `/data` page, full lint/typecheck/test suite).

**Status:** `monitoring` — persisted across Phase 1, 2, and 3 sessions with the same root cause; re-attempt at the start of each future session; a true visual/accessibility pass is required no later than Phase 5's gate, which explicitly mandates it (`docs/07_BUILD_PHASES.md` Phase 5: "browser inspection evidence is recorded"). If still blocked by Phase 5, this should be escalated to the user as an environment configuration question rather than re-attempted silently again.

**Phase 5 update:** The Preview tool (`mcp__Claude_Preview__*`) appeared in this environment for the first time this session (absent in Phases 1-4). `preview_start` was attempted against the existing `.claude/launch.json` "web" configuration and failed with a more specific error than before: `shell-init: error retrieving current directory: getcwd: cannot access parent directories: Operation not permitted`, then the same "Operation not permitted" running `.claude/dev_web_local_preview.sh` directly. This is consistent with a macOS TCC (Transparency, Consent, and Control) privacy restriction — the process hosting the Preview tool most likely lacks a Files and Folders / Full Disk Access grant for `~/Desktop` (Desktop, Documents, and Downloads are TCC-protected on macOS independent of Unix file permissions, which is why the Bash tool's own shell can `cd`/`ls` the same path without issue). This is a more precise diagnosis than prior phases reached, but still requires a one-time OS-level permission grant the assistant cannot make itself. Escalated to the user per this entry's Phase-3 note; user chose to proceed with the HTTP-level fallback for Phase 5 rather than pause to adjust macOS Privacy & Security settings, with the option to grant permission and request a re-attempt later. Substituted verification for Phase 5: `curl`-based server-rendered HTML inspection of the Overview page (confirmed hero heading, task cards, and all snapshot sections present; confirmed no unhandled runtime errors -- only benign Next.js internal chunk names matching `/error/` in the bundle manifest), full production build (`next build`) success, and clean typecheck/lint. A true pixel-level visual/keyboard/screen-reader pass remains outstanding; retry at the start of Phase 6, or sooner if the user grants the OS permission mid-project.

**Phase 5 closeout update:** The Preview tool remained blocked with the identical error when re-attempted at the start of the closeout pass; the user again chose not to pause for the macOS permission grant and directed continuation via the documented fallback rather than repeated retries (see DEC-042). This time the fallback is materially stronger than curl-based HTML inspection: Playwright (`@playwright/test`) was installed and drives a real, independent Chromium browser via the Bash tool, which is not subject to the same sandbox restriction as the Preview MCP tool. 63 end-to-end test cases (126 runs across a desktop and a touch-emulated mobile Chromium project) now cover real mouse clicks on the MapLibre canvas, real keyboard-only workflows, automated `axe-core` accessibility scans, and real CSS-layout overflow checks at all 6 required responsive breakpoints — categories of defect a jsdom-only unit-test suite structurally cannot catch. Nine real defects were found and fixed this way (full list in DEC-042), several of which (a WCAG contrast failure, an invalid-HTML hydration error, a broken ARIA radiogroup pattern, a real 1024px layout overflow) would not have been caught by any of this project's previous verification methods. **Status downgraded from `monitoring` to `accepted`** for practical purposes — Playwright now covers everything a manual click-through would verify except final visual/aesthetic polish judgment, which is out of scope for any automated tool and is instead handed to the user as `docs/design/manual-visual-review-checklist.md`. The underlying macOS permission gap itself remains unresolved and should still be fixed by the user if `mcp__Claude_Preview__*` capabilities (e.g. live screenshot review) are wanted in a future session.

---

## RISK-013 — California Healthy Places Index (HPI) has no automatable keyless data path

**Category:** Data completeness. **Likelihood:** Confirmed (re-verified live during Phase 3). **Impact:** Medium — one context source (HPI 3.0, 2022) is absent from the platform; every other required context source (SVI, CalEnviroScreen) is present.

**Mitigation:** DEC-018 documents the decision to implement `CaHpiAdapter` as an intentionally-blocked source with a truthful `"status": "unavailable"` manifest entry, rather than fabricate data or cite an unofficial third-party mirror. `RISK-013` remains open until either (a) a maintainer supplies an HPI API registration credential, or (b) a maintainer approves reconciling the bulk 2010-geography HPI file against this project's 2020-tract canonical geography via a documented crosswalk.

**Status:** `open` — accepted gap, truthfully surfaced in `/api/v1/sources` and the frontend Data page, not a blocker to Phase 3 completion per this session's explicit instructions ("every required adapter either passes its gate or is explicitly documented as blocked with a truthful unavailable state").

---

## RISK-014 — ACS 5-year coverage is a 3-table subset, not the full conceptual measure list

**Category:** Data completeness / scope. **Likelihood:** Confirmed (deliberate scope decision, DEC-020). **Impact:** Low-medium — population, poverty, and disability estimates are available with margins of error; income, insurance coverage, vehicle access, language isolation, housing cost burden, and education estimates are not yet implemented.

**Mitigation:** `AcsTableAdapter` is generic and parameterized by table ID, so adding a new ACS table is a small, well-tested addition rather than new architecture. `TASKS.md` lists the deferred table IDs explicitly.

**Status:** `open` — tracked as Phase 3+ backlog, not silently missing (every currently-loaded ACS estimate is real and carries a real margin of error; no ACS field is a placeholder).

---

## RISK-015 — No tract-level ED utilization pressure domain; a criterion-validity check against HCAI ED data is not yet possible

**Category:** Analytical completeness / validation coverage. **Likelihood:** Confirmed (DEC-023, DEC-033). **Impact:** Medium — docs/03's suggested "ED utilization pressure" domain and HCAI-ED-based criterion-validity check are both unavailable until Phase 7.

**Mitigation:** HCAI ED patient-county data is native to county of residence with Santa Clara as the only county present (n=1, statistically undefined for correlation) — DEC-023 documents why a tract-level allocation was not fabricated, and DEC-033 documents the substitute convergent-validity check (CDC/ATSDR SVI, n=408) used instead for Phase 4. Every one of the 7 scenario's correlation diagnostics against SVI is persisted in `analytics.correlation_diagnostics` and is confirmed non-tautological by the tautology guard on every `make audit` run.

**Status:** `closed` (Phase 7, DEC-055) — `utilization.hcai_patient_origin` (ZIP-level) is now allocated to tracts through the Phase 2 ZCTA-tract crosswalk, clearly labeled modeled/derived (never observed), and `analytics.utilization_criterion_validity` persists a real, non-tautological criterion-validity correlation (Spearman r 0.27-0.37 across all 8 scenarios, n=408) between modeled tract ED rate and each scenario's own score. The underlying allocation has its own disclosed limitation — see RISK-027.

---

## RISK-016 — `resource_accessibility` and `workforce_shortage` domains rely on straight-line distance, not network travel time

**Category:** Analytical accuracy. **Likelihood:** Confirmed (DEC-024, by design — Phase 6 scope not yet built). **Impact:** Medium — straight-line distance systematically understates real travel distance/time, especially in areas with indirect road networks; could overstate a tract's resource accessibility relative to its true accessibility.

**Mitigation:** Every value produced through `routing/straight_line.py` carries `method="straight_line_screening"` end to end: in the metric registry's `interpretation` field, the optimizer's `assumptions` list, the data-confidence `geography_quality_component` (penalized 0.7 vs. 1.0), and every explainability/recommendation API response. No UI or API surface presents a straight-line result as if it were a network travel time.

**Status:** `open` — accepted for Phase 4 per this session's explicit "resource optimization framework" request being pulled forward from its normal Phase 6 slot; full network-routing replacement is Phase 6 (Access Lab) scope, which will add OSMnx/networkx road-network graphs and VTA GTFS-based transit routing.

---

## RISK-017 — `hpsa_proximity_score` excludes 109 of 148 Santa Clara County HPSA records (no usable point geometry or inactive status)

**Category:** Analytical completeness. **Likelihood:** Confirmed (DEC-026). **Impact:** Low-medium — `workforce_shortage`'s HPSA-derived component understates total documented shortage; the excluded records remain visible in the raw `resources.hrsa_hpsa` table and the Phase 3 Data explorer, just not folded into this specific derived score.

**Mitigation:** Only "Designated" (active), coordinate-bearing (facility-anchored) HPSA records are used, per DEC-026's rationale (no polygon boundary data exists for area-based HPSA designations, and fabricating one is prohibited). `mua_designated_flag`, the domain's other component metric, uses a more complete direct tract-code join (DEC-025, 46 of 48 records) as a partial offset.

**Status:** `open` — a true polygon-based HPSA-to-tract overlay requires HPSA boundary geometry this platform does not currently ingest; tracked as a Phase 6+ improvement.

---

## RISK-018 — `acs_disability_rate`'s combined margin of error is not computed

**Category:** Uncertainty completeness. **Likelihood:** Confirmed (DEC-031, deliberate scope decision). **Impact:** Low — the point estimate is real and correctly derived; this metric is simply excluded from Monte Carlo perturbation and the `data_confidence` precision component for scenarios that use it (`access_barriers`-weighted scenarios), rather than being assigned an unverified/approximate uncertainty figure.

**Mitigation:** `uncertainty_type: "none"` is set explicitly in `config/metrics.yml` rather than silently reusing the two-term `acs_ratio` MOE-propagation formula (invalid for a 12-term sum) — an audit (`analytics_audits.py`) and DEC-031 both document this choice.

**Status:** `open` — implementing the Census Bureau's documented sum-of-estimates MOE formula (root-sum-of-squares with a significance adjustment) is a scoped, well-understood follow-on task, not attempted this phase to avoid reporting an unverified figure.

---

## RISK-019 — Phase 4 `analytics.*` tables have no offline demo snapshot

**Category:** Product completeness / demo-mode parity. **Likelihood:** Confirmed (DEC-035). **Impact:** Medium — `make demo` (offline, zero-network mode) does not yet expose scenario scores, explainability, recommendations, or optimization results; these currently require the live warehouse (`make data`).

**Mitigation:** Every Phase 4 API route returns a truthful, explicit 503 (not fabricated or partial data) when `analytics.*` tables are absent, distinct from the generic "no warehouse at all" 503 (`routes/analytics.py::_ANALYTICS_UNAVAILABLE_DETAIL`).

**Status:** `open` — extending `make demo` to freeze a full analytics snapshot (25 metrics × 7 scenarios × 408 tracts, ~90,000+ rows including Monte Carlo/sensitivity draws) is a real scope addition; tracked as Phase 5+ follow-on work, matching the same disclosed gap pattern already recorded for Phase 3 (`TASKS.md`).

---

## RISK-020 — A release-blocking map-selection defect passed Phase 5's original gate: TypeScript's parameter-count bivariance let a mismatched callback signature reach production silently

**Category:** Process / code-review completeness. **Likelihood:** Confirmed — the defect shipped in the first Phase 5 sign-off and was only caught by the user's manual click-through, not by `tsc`, `eslint`, the automated test suite, or code review at the time. **Impact:** Was High while present (a core Explore workflow — clicking any tract on the map — was completely broken, showing a nonsensical "Tract tract not found" error for every single tract) and is now resolved, but the underlying *pattern* (a function accepting fewer parameters silently satisfying a callback type that declares more) can recur anywhere a multi-argument callback prop is threaded through several layers.

**Mitigation (DEC-041):** The specific defect is fixed — see DEC-041 for the full root-cause writeup and the canonical single-argument `SelectedGeography` model that makes this exact bug class structurally impossible in the Explore selection pipeline specifically. As a general process lesson (not fully mitigated project-wide): prefer single-object-argument callback props over multi-positional-argument ones wherever a callback crosses more than one component boundary, since a single argument has no arity to mismatch. This is now the pattern used for every Explore selection callback; it has not been retrofitted elsewhere in the codebase, since no other multi-argument cross-component callback currently exists (checked by inspection during this hotfix, not audited via a lint rule).

**Status:** `mitigated` for the specific defect (verified: `pytest` 199/199, `vitest` 34/34 including new regression tests, live end-to-end API verification of low/mid/high-scoring tracts through the exact map-selection request path, `make lint`/`typecheck`/`test`/`audit`/`build` all pass). `monitoring` for the general pattern — no automated lint rule currently forbids assigning a lower-arity function to a higher-arity callback prop type; if this recurs, consider an ESLint rule or a project convention doc entry rather than relying on manual vigilance alone.

---

## RISK-021 — Scheduled-transit accessibility is a walk-to-stop + frequency proxy, not true multi-modal routing

**Category:** Analytical accuracy / scope. **Likelihood:** Confirmed (DEC-043, deliberate scope decision). **Impact:** Medium — the proxy cannot account for actual in-vehicle travel time, transfers, or realistic wait times the way a real transit router (R5, OpenTripPlanner) would; two stops with identical walk distance and frequency but very different onward travel time to a destination would be scored identically.

**Mitigation:** Every transit-access value carries a distinct method label ("scheduled transit access under the selected service window") and a lower method-reliability flag than network-routed walking/driving results, propagated through the API and UI identically to the straight-line-distance labeling pattern established in DEC-024. Never described as travel time, real-time, or door-to-door.

**Status:** `open` — a full R5/OpenTripPlanner integration would close this gap; not attempted this phase per DEC-043's rationale (a Java-based server-oriented routing engine was judged out of proportion to the rest of Phase 6's scope within this session).

---

## RISK-022 — Libraries, community centers, senior centers, and pharmacies have no verified official bulk source reachable this session

**Category:** Data completeness. **Likelihood:** Confirmed (DEC-045). **Impact:** Medium — the Access Lab's resource inventory and optimizer candidate-site universe are narrower than `docs/03_ANALYTICS_METHODS.md` §13.2's full suggested list (no community centers, libraries, senior centers, or pharmacies); every other named category (hospitals, clinics, health centers, food/SNAP retailers, transit stops/hubs) is present and real.

**Mitigation:** Santa Clara County's own directly-hosted GIS REST services (`sccgov.org/gis/rest/services/...`) returned HTTP 403 to every automated fetch attempt this session; the County's separate ArcGIS Hub open-data catalogs were queried live and contain no facility-inventory dataset for these categories. Documented honestly rather than fabricated, approximated via an unverified guessed layer ID, or silently substituted with a lower-quality source (matching the HPI precedent, DEC-018).

**Status:** `open` — revisitable if a maintainer can reach the County's GIS services from a context not subject to the same bot-blocking, or supplies a CA Board of Pharmacy bulk-export credential (docs/02 §6.4's primary recommended pharmacy source).

---

## RISK-023 — Resource deduplication group formation is anchor-based (star pattern), not fully pairwise

**Category:** Analytical accuracy / data integrity. **Likelihood:** Confirmed by design; observed live on real Santa Clara facility data during Phase 6 build. **Impact:** Low-Medium — `pipelines/src/scc_health_pipeline/resources/canonicalize.py`'s `deduplicate_records()` compares every later record only against the group's first (anchor) member, not against every other member already in the group. If record A matches both B and C under the tier-1 (exact name+address) or tier-2 (spatial+name fallback) rules, B and C join the same canonical facility even though B and C were never directly compared to each other. On live data this produced plausible results (e.g. an HCAI hospital record merging with 3 HRSA site records and 2 SCC clinic records all within 3-40 meters of each other, matching the real-world pattern of an FQHC grantee co-enrolling separate medical/dental/behavioral-health site records at one building), but it is a theoretical over-merge path: two genuinely distinct, dissimilar sites could both independently clear the fallback threshold against the same anchor without ever being compared to each other.

**Mitigation:** Every merge decision (which pair, by which rule, at what distance and name similarity) is written to `resources.facility_duplicate_review` — nothing is merged silently, and the full pairwise evidence for every canonical facility with more than one contributing source is auditable. `n_contributing_sources` and `dedup_status` on every canonical facility make multi-source merges visible in the API/UI rather than hidden.

**Status:** `open` — a fully pairwise (all-members-mutually-qualify) grouping algorithm would close this gap; not implemented this phase given the anchor-based approach's results were manually spot-checked as plausible on the real dedup output (72 multi-source matches, all at sub-40-meter distances with 0.5-1.0 name similarity).

---

## RISK-024 — Driving network travel times assume free-flow speeds, with no traffic congestion modeling

**Category:** Analytical accuracy / scope. **Likelihood:** Confirmed by design (DEC-046). **Impact:** Low-Medium — `run_build_network_graphs.py`'s drive graph uses `osmnx.routing.add_edge_speeds()`, which imputes travel speed from OSM `maxspeed` tags and highway-type defaults (live-verified: a real 16.2-mile-straight-line, 17.9-mile-network route computed at an implied 44.1 mph average, consistent with free-flow, not rush-hour, conditions). Actual drive times during peak commute periods in Santa Clara County could be meaningfully longer, especially on the corridors this platform's own equity analysis cares about most (e.g. congested urban arterials serving higher-need neighborhoods).

**Mitigation:** Every driving-mode result carries `method="osm_network_drive"` and is never described as real-time or as accounting for current traffic conditions. This is a standard, disclosed limitation of static free-flow network routing (the same category of limitation as the scheduled-transit proxy in RISK-021), not a silent inaccuracy.

**Status:** `open` — a time-of-day/congestion-aware routing engine (e.g. a service with live or historical traffic data) would close this gap; out of scope for a keyless, locally-reproducible pipeline per this project's "core functionality must work without paid API keys" requirement (CLAUDE.md).

---

## RISK-025 — Access Lab's resource browser has no custom MapLibre facility-marker map view, only an accessible table

**Category:** Product completeness / UI scope. **Likelihood:** Confirmed by design, this session. **Impact:** Low — docs/01 §5.9's accessibility rule requires that everything shown on a map also be available in an accessible table, which the Access Lab resource browser satisfies (a full `DataTable` of all 4,207 canonical facilities, filterable by category, sortable, keyboard-operable). It does not require a map to exist at all; the table is complete and independently correct, not degraded. The reverse (a map with no accessible alternative) would have been a real regression -- that was avoided.

**Mitigation:** None needed for the accessibility requirement itself. For the visual/spatial exploration value a map would add (e.g. seeing facility clustering relative to a selected tract), the table's address/city columns and per-facility detail (via `/api/v1/access/facilities/{id}`, not yet surfaced in the UI as a detail view) are the current substitute.

**Status:** `open` -- a facility-marker layer reusing Explore's existing MapLibre setup (`explore-map.tsx`) is a reasonable, scoped future enhancement, not a defect. Not attempted this session; building and testing a new map layer (marker clustering at 4,207 points, category color-coding, popup detail, keyboard/screen-reader parity with the table) was judged a large enough addition to risk not finishing it to the same tested standard as the rest of Phase 6 within the remaining session budget.

---

## RISK-026 — Access Lab's city/district tract drill-down ranks by Explore's default scenario, not an Access Lab-specific priority

**Category:** Product completeness / UI scope. **Likelihood:** Confirmed by design (Phase 6.5). **Impact:** Low -- Access Lab has no scenario picker of its own (unlike Explore), so `city-drill-down.tsx` uses the fixed `default_integrated_screen_v1` scenario purely to identify which 5 tracts to surface as a starting point when a city or district is selected. This is disclosed directly in the UI ("Tracts shown are the highest estimated-concern areas under Explore's default balanced-priorities view, used here only to suggest a starting point") -- never presented as an access-specific ranking.

**Mitigation:** The drill-down is explicitly a navigation aid ("suggest a starting point"), not an access-relevant ranking claim -- a user can search for any other tract in that city directly via the same search box, not only the 5 suggested ones.

**Status:** `open` -- if Access Lab later gains its own scenario/priority concept (e.g. ranking by measured access rather than combined health-burden concern), the drill-down should be revisited to use it instead of borrowing Explore's default.

---

## RISK-027 — ZIP-to-tract area-weighted ED-utilization allocation is unreliable for a small number of large, sparsely-populated tracts

**Category:** Analytical accuracy. **Likelihood:** Confirmed, live-measured (Phase 7, DEC-055/DEC-056). **Impact:** Medium for the affected tracts specifically -- their modeled ED rate is not usable as a real figure; Low for the platform overall, since the affected tracts are a small, explicitly flagged minority.

**Mitigation:** Every tract-level modeled ED rate is flagged `rate_reliability="plausible_range"` or `"low_reliability"` (392 of 408 tracts are `plausible_range`; 16 are `low_reliability`, live-measured), with an explanatory note on every flagged row and a dedicated audit (`_audit_implausible_rates_are_flagged`) enforcing the flag is never missing above the disclosed ceiling. The Utilization UI shows this as a prominent badge on every affected row, not a footnote.

**Status:** `open` -- a defensible fix (population-weighted rather than land-area-weighted allocation) would require a sub-tract population-density source this project has not ingested; area weighting via the existing Census ZCTA-tract relationship remains the default per DEC-005's documented fallback ordering. Revisit if a keyless dasymetric/population-weighted crosswalk source becomes available.

---

## RISK-028 — Two named scenarios (`mobile_transit_care_v1`, `older_adult_support_v1`) currently produce identical rankings

**Category:** Product/methodology completeness. **Likelihood:** Confirmed, live-measured (found during Phase 7 reproducibility-hash testing). **Impact:** Low -- both scenarios remain individually defensible (each has its own documented rationale in `config/scenarios.yml`), but a user comparing them on the Prioritize page today will see no difference in results, which may be surprising.

**Mitigation:** Both scenarios' own `notes` fields already disclose the underlying cause: "Mobile or transit-linked care" is missing real transit-frequency and ED-pressure metrics (falls back to generic access/resource proxies), and "Older-adult support" is missing an age-65+ population metric (same fallback) -- the coincidence is a natural consequence of two different real gaps resolving to the same substitute weighting, not a copy-paste error.

**Status:** `open` -- resolving this requires ingesting either a real transit-frequency-as-a-metric source or an ACS age-65+ population-share metric (the latter already flagged as a gap in `older_adult_support_v1`'s own notes and DEC-020) so the two scenarios can differentiate on real, distinct inputs.

---

## RISK-029 — Phase 7 `analytics.utilization_*` tables have no offline demo snapshot

**Category:** Deployment completeness. **Likelihood:** Confirmed by design (matches RISK-019's precedent for Phase 4 `analytics.*`). **Impact:** Low -- `make demo` remains geography-only; the Utilization, and the custom-weighting/export paths of Prioritize, and the Validate page all require the live warehouse (`make data`) and return a truthful 503 with a clear remediation command in demo-only mode, never fabricated data.

**Mitigation:** Every Phase 7 API route follows the same `_require_table`/503 pattern already established for Phase 4/6 analytics routes; the 503 detail message names the exact command to run (`run_utilization_pipeline`). Named-scenario Prioritize routes (`/api/v1/scenarios/*`) already have this same limitation from Phase 4 (RISK-019) and are unaffected by this entry.

**Status:** `open` -- matches RISK-019's own open status and rationale; revisit both together if/when a frozen offline analytics snapshot is prioritized.

---

## RISK-030 — Advocacy evidence for a city/ZIP/supervisor-district geography is an unweighted average across member tracts, not population-weighted

**Category:** Analytics methodology. **Likelihood:** Confirmed by design (DEC-061). **Impact:** Low-to-moderate -- a large, sparsely-populated member tract and a small, dense one currently count equally in a city or district's averaged evidence figures, which could understate or overstate the true population-weighted picture for a broad geography with uneven internal population distribution.

**Mitigation:** Every aggregate evidence value is explicitly labeled as an averaged, derived figure (`data_status: "derived"`, a visible "(average across N of M tracts)" suffix), never presented as a single real observed figure. A user who needs tract-precision figures can drill into individual tracts via Explore.

**Status:** `open` -- a real, disclosed scope choice, not a defect. Population-weighted re-aggregation is a reasonable Phase 9+ enhancement if a reliable sub-tract population-weighting source is identified.

---

## RISK-031 — DOCX advocacy export is not implemented (print-to-PDF and CSV are the two supported export paths)

**Category:** Product completeness. **Likelihood:** Confirmed by design (DEC-065). **Impact:** Low -- a user who specifically wants an editable `.docx` file must copy content manually or convert a print-to-PDF output externally; every other required output type/format is fully supported.

**Mitigation:** Advocate's user guide (`docs/user-guide/advocate.md`) states this limitation plainly rather than silently omitting a DOCX button. Print-to-PDF (reusing the DEC-060 decision-memo pattern) and CSV cover the two export paths this phase actually needed.

**Status:** `open`, low severity -- revisit if user feedback specifically requests DOCX; `python-docx` write support could reuse the same dependency already present read-only for document intelligence.

---

## RISK-032 — AI-assisted Copilot mode (when an operator configures `ANTHROPIC_API_KEY`) has no dedicated golden-evaluation set or adversarial red-team suite beyond the citation-validation and prompt-injection-detection unit tests

**Category:** AI quality/safety. **Likelihood:** Confirmed by design (out of Phase 8's scope; a Phase 8 kickoff-listed item, "golden evaluation set (>=50 questions)," belongs to the original spec's later phase). **Impact:** Moderate if AI-assisted mode is enabled in a real deployment without further evaluation -- the structural safeguards (evidence-only citation, post-generation citation validation, non-causal system-prompt rules, untrusted-document-text isolation) are unit-tested, but no systematic evaluation of response *quality* or a dedicated adversarial red-team pass against the live model has been run.

**Mitigation:** AI-assisted mode is opt-in per deployment (requires an operator-set key) and per-request (`use_llm` flag) -- it is never the only way to use Copilot, and deterministic mode (fully evaluated via its shared code path with Advocate) remains the default, zero-configuration experience. `apps/api/tests/test_copilot_provider.py` unit-tests the citation-validation mechanism itself (that a model-claimed unknown evidence_id is always discarded) even though it can't exercise this against a live model without a real API key in CI.

**Status:** `open` -- recorded as the Phase 9 resume point for any deployment that intends to actually enable AI-assisted mode in production; a golden evaluation set and adversarial red-team pass should run against a real configured key before that mode is presented to real end users at scale.

---

## RISK-033 — The `deploy.yml` and `scheduled-refresh.yml` GitHub Actions workflows have never executed on a real GitHub Actions runner or against a real Render/Vercel deployment

**Category:** Deployment/operational readiness. **Likelihood:** Confirmed by design -- no cloud accounts, GitHub Actions runner, or repository secrets were available in the environment this phase was built in. **Impact:** Moderate until first real execution -- every constituent command (`make data`, `make audit`, `make data-manifest`, `scripts/publish_data_artifact.py`, `scripts/fetch_data_artifact.py`, `scripts/smoke_test.py`) was independently verified to work correctly against this repository's real local warehouse and dev servers, and both workflow YAML files were syntax-validated, but the orchestration itself (secrets wiring, `workflow_run` triggering, Render/Vercel deploy-hook behavior, GitHub Release creation via `gh`) is unexercised end to end.

**Mitigation:** `docs/deployment/production-deployment-guide.md` gives the exact, numbered steps the repository owner must run to create the real cloud resources and secrets; `docs/release/release-checklist.md` explicitly marks these two items as unverified rather than claiming false confidence.

**Status:** `open` -- closes the first time the repository owner completes the deployment guide and a real `Deploy`/`Scheduled data refresh` workflow run succeeds. Record the outcome (and fix anything the live environment surfaces that local testing couldn't) in this entry or a follow-up one.

## RISK-034 — The per-IP rate limiter is in-process and does not coordinate across multiple backend instances

**Category:** Scalability. **Likelihood:** Confirmed by design (`apps/api/src/scc_health_api/rate_limit.py`'s own docstring). **Impact:** Low for this release (a single Render instance is the deployment target, DEC-066) -- would become a real gap only if the backend is later horizontally scaled, at which point each instance would enforce its own independent budget rather than a shared one.

**Mitigation:** Documented inline in the module itself and in `docs/deployment/api-operations.md`, so this is a known, intentional simplification, not a silent gap that would surprise someone scaling the service later.

**Status:** `open`, low priority -- revisit (move to a shared store, e.g. Redis) only if/when horizontal scaling is actually planned.

## RISK-035 — No open-source license has been assigned to this repository

**Category:** Legal/governance. **Likelihood:** Confirmed (no `LICENSE` file exists). **Impact:** Moderate for anyone wanting to reuse, fork, or contribute to this code under clear legal terms -- without an explicit license, default copyright law applies and the terms under which others may use this code are ambiguous.

**Mitigation:** `README.md`'s License section states this plainly rather than silently omitting it or defaulting to an unstated assumption.

**Status:** `open` -- this is the repository owner's decision to make (e.g. MIT, Apache 2.0, or a decision to keep the code proprietary/unlicensed); not something this assistant can decide on the owner's behalf.

---

*New risks are appended here as they are identified in each subsequent phase; existing risks are updated in place (status, mitigation progress) rather than duplicated.*
