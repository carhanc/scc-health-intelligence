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

**Status:** `open` — manifest schema designed; populated starting Phase 3.

---

## RISK-011 — Dev toolchain runs under Rosetta (x86_64 Homebrew), not native arm64

**Category:** Performance / developer experience. **Likelihood:** Certain (confirmed during Phase 1 bootstrap — this machine's Homebrew resolves to `/usr/local`, the Intel prefix, not `/opt/homebrew`). **Impact:** Low — functionally correct, modestly slower local dev-server/build performance than native arm64.

**Mitigation:** None applied by default (DEC-011) — the bootstrap script deliberately does not install a second, native Homebrew without explicit user action, since that would be a persistent change to the user's machine well beyond this project's scope. A user who wants native arm64 performance can install Homebrew at `/opt/homebrew` themselves and re-run `scripts/bootstrap_macos.sh`. Phase 2 addendum: this also causes Polars to emit a CPU-compatibility warning on every run (harmless, but noisy) — mitigated by setting `POLARS_SKIP_CPU_CHECK=1` automatically in the Makefile rather than requiring every session to remember it.

**Status:** `accepted`.

---

## RISK-012 — No browser-based visual verification tooling available in this environment

**Category:** Process / verification completeness. **Likelihood:** Confirmed (Phase 1 and Phase 2 both attempted, both blocked). **Impact:** Medium — reduces confidence in visual/interaction/accessibility correctness beyond what HTTP-level and automated testing can confirm.

**Mitigation:** `mcp__Claude_in_Chrome__list_connected_browsers` returns empty (no extension connected). The Preview tool's process spawner fails with a sandbox-level `getcwd` permission error before reaching the launch command, tried with two different launch configurations. DEC-017 documents the HTTP-level verification approach used instead (production build success, strict lint/typecheck, unit tests, server-rendered HTML inspection via curl, live end-to-end API calls, CORS verification). This substitutes for, but does not equal, an actual visual/keyboard/screen-reader review.

**Status:** `monitoring` — re-attempt browser tooling at the start of each future session; a true visual/accessibility pass is required no later than Phase 5's gate, which explicitly mandates it (`docs/07_BUILD_PHASES.md` Phase 5: "browser inspection evidence is recorded").

---

*New risks are appended here as they are identified in each subsequent phase; existing risks are updated in place (status, mitigation progress) rather than duplicated.*
