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

**Status:** `open` — a real tract-level utilization metric requires crosswalking `utilization.hcai_patient_origin` (ZIP-level, Phase 3) through the Phase 2 ZCTA-tract relationship, explicitly reserved for Phase 7 (Utilization/Validation Lab) per `docs/07_BUILD_PHASES.md`.

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

*New risks are appended here as they are identified in each subsequent phase; existing risks are updated in place (status, mitigation progress) rather than duplicated.*
